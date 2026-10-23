import { z } from 'zod';
import { bookmarkPrompt, taskPrompt } from '../../src/api/ai/prompts';
import { DataServiceError } from '../../src/data/protocol';
import { atomic, guard, update } from './atomic';
import { dateValue, nextVersion, type Database } from './db';

export async function aiCompletion(
  env: TodoDataEnv,
  prompt: string,
  json = false,
): Promise<unknown> {
  if (!env.AI_BASE_URL || !env.AI_API_KEY || !env.AI_MODEL)
    throw new Error('AI provider is not configured');
  const endpoint = new URL(
    'chat/completions',
    `${env.AI_BASE_URL.replace(/\/$/, '')}/`,
  );
  if (endpoint.protocol !== 'https:')
    throw new Error('AI provider must use HTTPS');
  const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(90000),
    headers: {
      authorization: `Bearer ${env.AI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.AI_MODEL,
      messages: [
        { role: 'system', content: env.AI_PROMPT || '' },
        { role: 'user', content: prompt },
      ],
      stream: false,
    }),
  });
  if (!response.ok || !response.body)
    throw new Error(`AI upstream HTTP ${response.status}`);
  const reader = response.body.getReader();
  let length = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 512 * 1024) {
        await reader.cancel();
        throw new Error('AI response too large');
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  const body = z
    .object({
      choices: z
        .array(z.object({ message: z.object({ content: z.string().min(1) }) }))
        .min(1),
    })
    .parse(JSON.parse(new TextDecoder().decode(bytes)));
  const content = body.choices[0].message.content.trim();
  return json
    ? JSON.parse(
        content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''),
      )
    : content;
}

export function enqueueAi(
  db: D1Database,
  kind: string,
  targetId: string,
  version: Date,
  content: string,
) {
  return db
    .prepare(
      'INSERT INTO _AiJob (id,kind,targetId,expectedVersion,payload,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)',
    )
    .bind(
      crypto.randomUUID(),
      kind,
      targetId,
      dateValue(version),
      content,
      Date.now(),
      Date.now(),
    );
}

type Job = {
  id: string;
  kind: string;
  targetId: string;
  expectedVersion: string;
  payload: string;
  status: string;
  leaseToken: string;
  attempts: number;
};

export async function aiCommand(
  env: TodoDataEnv,
  prisma: Database,
  operation: string,
  input: unknown,
) {
  if (operation === 'generate') {
    const data = z
      .object({
        prompt: z.string().min(1).max(100000),
        json: z.boolean().default(false),
      })
      .parse(input);
    return aiCompletion(env, data.prompt, data.json);
  }
  if (operation === 'status') {
    const { targetId } = z.object({ targetId: z.string().min(1) }).parse(input);
    return env.DB.prepare(
      'SELECT id,kind,status,attempts,error,createdAt,updatedAt FROM _AiJob WHERE targetId=? ORDER BY createdAt DESC LIMIT 1',
    )
      .bind(targetId)
      .first();
  }
  if (operation === 'retry') {
    const { id } = z.object({ id: z.string().min(1) }).parse(input);
    return env.DB.prepare(
      "UPDATE _AiJob SET status='PENDING',publishedAt=NULL,attempts=0,error=NULL,updatedAt=? WHERE id=? AND status='FAILED' RETURNING id",
    )
      .bind(Date.now(), id)
      .first();
  }
  if (operation === 'bookmark') {
    const data = z
      .object({
        id: z.string().min(1),
        content: z.string().trim().min(1).max(60000),
      })
      .parse(input);
    return atomic(env.DB, async () => {
      const row = await prisma.bookmark.findUniqueOrThrow({
        where: { id: data.id },
      });
      const now = nextVersion(row.updateTime);
      return {
        statements: [
          guard(
            env.DB,
            'EXISTS (SELECT 1 FROM Bookmark WHERE id=? AND updateTime=?)',
            row.id,
            dateValue(row.updateTime),
          ),
          update(env.DB, 'Bookmark', row.id, {
            loading: true,
            updateTime: now,
          }),
          enqueueAi(env.DB, 'bookmark-summary', row.id, now, data.content),
        ],
        result: () =>
          prisma.bookmark.findUniqueOrThrow({
            where: { id: row.id },
            include: { tags: true },
          }),
      };
    });
  }
  throw new DataServiceError('NOT_FOUND', 'Unknown AI operation');
}

export async function publishAi(env: TodoDataEnv) {
  if (env.READ_ONLY !== 'false') return;
  const now = Date.now();
  const jobs = await env.DB.prepare(
    "SELECT id FROM _AiJob WHERE (status IN ('PENDING','PUBLISHED') AND (publishedAt IS NULL OR publishedAt<?)) OR (status='RUNNING' AND leaseUntil<?) LIMIT 40",
  )
    .bind(now - 300000, now)
    .all<{ id: string }>();
  for (const job of jobs.results) {
    await env.AI_JOBS.send({ jobId: job.id });
    await env.DB.prepare(
      "UPDATE _AiJob SET publishedAt=?,status=CASE WHEN status='PENDING' THEN 'PUBLISHED' ELSE status END WHERE id=? AND status IN ('PENDING','PUBLISHED','RUNNING')",
    )
      .bind(now, job.id)
      .run();
  }
}

async function processJob(
  env: TodoDataEnv,
  message: Message<{ jobId: string }>,
) {
  const now = Date.now();
  const lease = crypto.randomUUID();
  const job = await env.DB.prepare(
    "UPDATE _AiJob SET status='RUNNING',leaseToken=?,leaseUntil=?,attempts=attempts+1,updatedAt=? WHERE id=? AND (status IN ('PENDING','PUBLISHED') OR (status='RUNNING' AND leaseUntil<?)) RETURNING *",
  )
    .bind(lease, now + 180000, now, message.body.jobId, now)
    .first<Job>();
  if (!job) {
    const running = await env.DB.prepare(
      "SELECT id FROM _AiJob WHERE id=? AND status='RUNNING'",
    )
      .bind(message.body.jobId)
      .first();
    if (running) message.retry({ delaySeconds: 180 });
    else message.ack();
    return;
  }
  try {
    const table = job.kind === 'task-tags' ? 'Task' : 'Bookmark';
    const target = await env.DB.prepare(
      `SELECT updateTime,deletedAt FROM ${table} WHERE id=?`,
    )
      .bind(job.targetId)
      .first<{ updateTime: string; deletedAt: string | null }>();
    if (
      !target ||
      target.deletedAt ||
      dateValue(new Date(target.updateTime)) !== job.expectedVersion
    ) {
      await env.DB.prepare(
        "UPDATE _AiJob SET status='SUPERSEDED',updatedAt=? WHERE id=? AND leaseToken=?",
      )
        .bind(Date.now(), job.id, lease)
        .run();
      message.ack();
      return;
    }
    const tagTable = job.kind === 'task-tags' ? 'TaskTag' : 'BookmarkTag';
    const linkTable =
      job.kind === 'task-tags' ? '_TaskToTaskTag' : '_BookmarkToBookmarkTag';
    const existing = await env.DB.prepare(
      `SELECT name FROM ${tagTable} WHERE deletedAt IS NULL LIMIT 500`,
    ).all<{ name: string }>();
    const prompt =
      job.kind === 'task-tags'
        ? taskPrompt(
            job.payload,
            existing.results.map((t) => t.name),
          )
        : bookmarkPrompt(
            job.payload,
            existing.results.map((t) => t.name),
          );
    const response = await aiCompletion(env, prompt, true);
    const names = z.array(z.string().trim().min(1).max(200)).max(50);
    const result =
      job.kind === 'task-tags'
        ? z.object({ tagNames: names }).parse(response)
        : z
            .object({
              tags: names,
              title: z.string().max(10000),
              summary: z.string().max(100000),
            })
            .parse(response);
    const tags = [
      ...new Set('tagNames' in result ? result.tagNames : result.tags),
    ];
    const version = dateValue(nextVersion(new Date(job.expectedVersion)));
    const statements = [
      guard(
        env.DB,
        `EXISTS (SELECT 1 FROM ${table} WHERE id=? AND updateTime=? AND deletedAt IS NULL) AND EXISTS (SELECT 1 FROM _AiJob WHERE id=? AND status='RUNNING' AND leaseToken=?)`,
        job.targetId,
        job.expectedVersion,
        job.id,
        lease,
      ),
    ];
    for (const name of tags)
      statements.push(
        env.DB.prepare(
          `INSERT INTO ${tagTable} (id,name,createTime,updateTime) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM ${tagTable} WHERE name=?)`,
        ).bind(crypto.randomUUID(), name, version, version, name),
      );
    statements.push(
      env.DB.prepare(`DELETE FROM "${linkTable}" WHERE A=?`).bind(job.targetId),
    );
    for (const name of tags)
      statements.push(
        env.DB.prepare(
          `INSERT INTO "${linkTable}" (A,B) SELECT ?,id FROM ${tagTable} WHERE name=? AND deletedAt IS NULL LIMIT 1`,
        ).bind(job.targetId, name),
      );
    statements.push(
      'summary' in result
        ? env.DB.prepare(
            'UPDATE Bookmark SET title=?,summary=?,loading=0,updateTime=? WHERE id=?',
          ).bind(result.title, result.summary, version, job.targetId)
        : env.DB.prepare('UPDATE Task SET updateTime=? WHERE id=?').bind(
            version,
            job.targetId,
          ),
    );
    statements.push(
      env.DB.prepare(
        "UPDATE _AiJob SET status='DONE',error=NULL,leaseUntil=NULL,updatedAt=? WHERE id=? AND leaseToken=?",
      ).bind(Date.now(), job.id, lease),
    );
    statements.push(env.DB.prepare('DELETE FROM "_MutationGuard"'));
    await env.DB.batch(statements);
    message.ack();
  } catch (error) {
    // Log a bounded category only: never include prompts, model output or keys.
    const safeMessages = [
      'AI provider is not configured',
      'AI provider must use HTTPS',
      'AI response too large',
    ];
    const reason =
      error instanceof z.ZodError
        ? 'INVALID_MODEL_SCHEMA'
        : error instanceof SyntaxError
          ? 'INVALID_MODEL_JSON'
          : error instanceof Error &&
              (safeMessages.includes(error.message) ||
                /^AI upstream HTTP \d+$/.test(error.message))
            ? error.message
            : error instanceof Error &&
                /D1|SQLITE|constraint/i.test(error.message)
              ? 'DATABASE_WRITE_FAILED'
              : `AI_REQUEST_FAILED:${error instanceof Error ? error.name : 'Unknown'}`;
    console.error(
      JSON.stringify({
        event: 'ai_job_failed',
        jobId: job.id,
        attempt: job.attempts,
        reason,
        frames:
          error instanceof Error ? error.stack?.split('\n').slice(1, 3) : [],
      }),
    );
    const targetTable = job.kind === 'task-tags' ? 'Task' : 'Bookmark';
    const stale = await env.DB.prepare(
      `SELECT id FROM ${targetTable} WHERE id=? AND updateTime=? AND deletedAt IS NULL`,
    )
      .bind(job.targetId, job.expectedVersion)
      .first();
    if (!stale) {
      await env.DB.prepare(
        "UPDATE _AiJob SET status='SUPERSEDED',updatedAt=? WHERE id=? AND leaseToken=?",
      )
        .bind(Date.now(), job.id, lease)
        .run();
      message.ack();
      return;
    }
    const failed = job.attempts >= 4;
    await env.DB.prepare(
      'UPDATE _AiJob SET status=?,leaseUntil=NULL,error=?,updatedAt=? WHERE id=? AND leaseToken=?',
    )
      .bind(
        failed ? 'FAILED' : 'PUBLISHED',
        'AI_PROCESSING_FAILED',
        Date.now(),
        job.id,
        lease,
      )
      .run();
    if (failed) {
      await env.AI_FAILURES.send({ jobId: job.id });
      if (job.kind === 'bookmark-summary')
        await env.DB.prepare(
          'UPDATE Bookmark SET loading=0 WHERE id=? AND updateTime=?',
        )
          .bind(job.targetId, job.expectedVersion)
          .run();
      message.ack();
    } else message.retry({ delaySeconds: 60 });
  }
}

export async function consumeAi(
  batch: MessageBatch<{ jobId: string }>,
  env: TodoDataEnv,
) {
  if (env.READ_ONLY !== 'false') {
    batch.retryAll({ delaySeconds: 300 });
    return;
  }
  for (const message of batch.messages) await processJob(env, message);
}
