import { z } from 'zod';
import { DataServiceError } from '../../src/data/protocol';

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const summary = z
  .object({
    processedSources: count,
    processedPosts: count,
    completedPosts: count,
    failedPosts: count,
    deferredPosts: count,
    uploadedMedia: count,
    skippedMedia: count,
    failedMedia: count,
  })
  .strict();
const loginStatus = z.enum(['pending', 'verified', 'rejected']);
const status = z.enum([
  'running',
  'completed',
  'partial',
  'bounded',
  'failed',
  'interrupted',
]);
const errorCode = z
  .enum([
    'weibo_login_required',
    'weibo_request_blocked',
    'weibo_response_invalid',
    'credential_unavailable',
    'data_service_error',
    'runtime_error',
    'interrupted',
  ])
  .nullable();
const LEASE_MS = 5 * 60_000;

export async function spiderRunCommand(
  db: D1Database,
  operation: string,
  input: unknown,
) {
  const now = new Date().toISOString();
  const lease = new Date(Date.now() + LEASE_MS).toISOString();
  if (operation === 'runStart') {
    const data = z
      .object({
        id: z.string().uuid(),
        kind: z.enum(['producer', 'consumer']),
        githubRunId: z.string().regex(/^\d+$/).nullable(),
        githubRunAttempt: z.number().int().positive().nullable(),
      })
      .strict()
      .parse(input);
    await db
      .prepare(
        `INSERT INTO spider_runs (id,kind,status,started_at,updated_at,lease_expires_at,github_run_id,github_run_attempt)
      VALUES (?,?,'running',?,?,?,?,?)`,
      )
      .bind(
        data.id,
        data.kind,
        now,
        now,
        lease,
        data.githubRunId,
        data.githubRunAttempt,
      )
      .run();
    return { id: data.id };
  }
  const data = z
    .object({
      id: z.string().uuid(),
      status,
      credentialVersion: z.string().uuid().nullable(),
      loginStatus,
      summary,
      errorCode,
    })
    .strict()
    .parse(input);
  // A late heartbeat cannot overwrite a terminal result or change the pinned credential.
  const result = await db
    .prepare(
      `UPDATE spider_runs SET status=?,updated_at=?,completed_at=?,lease_expires_at=?,
    credential_version=?,login_status=?,summary_json=?,error_code=?
    WHERE id=? AND status='running' AND (credential_version IS NULL OR credential_version IS ?)`,
    )
    .bind(
      data.status,
      now,
      data.status === 'running' ? null : now,
      lease,
      data.credentialVersion,
      data.loginStatus,
      JSON.stringify(data.summary),
      data.errorCode,
      data.id,
      data.credentialVersion,
    )
    .run();
  if (!result.meta.changes)
    throw new DataServiceError('CONFLICT', '采集任务已结束或凭证版本不匹配。');
  return { id: data.id };
}

export async function spiderSnapshot(
  db: D1Database,
  credentialVersion?: string,
) {
  // The monitor entrypoint is deliberately SELECT-only. An expired heartbeat is
  // displayed as interrupted without inventing a successful completion.
  const now = new Date().toISOString();
  const results = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT type,COUNT(*) AS count FROM producer WHERE deletedAt IS NULL
      AND type IN ('WEIBO_PERSONAL','WEIBO_SUPER_TOPIC') GROUP BY type`),
    db.prepare(
      `SELECT status,COUNT(*) AS count FROM Post WHERE deletedAt IS NULL AND platform='WEIBO' GROUP BY status`,
    ),
    db.prepare(`SELECT COUNT(*) AS count FROM Media m JOIN Post p ON p.id=m.postId
      WHERE m.deletedAt IS NULL AND p.deletedAt IS NULL AND p.platform='WEIBO'
      AND m.status='UPLOADED' AND m.galleryMediaUrl IS NOT NULL`),
    db.prepare(`SELECT id,kind,status,started_at AS startedAt,updated_at AS updatedAt,completed_at AS completedAt,
      lease_expires_at AS leaseExpiresAt,credential_version AS credentialVersion,login_status AS loginStatus,
      summary_json AS summaryJson,error_code AS errorCode,github_run_id AS githubRunId,github_run_attempt AS githubRunAttempt
      FROM spider_runs ORDER BY started_at DESC,id DESC LIMIT 20`),
    db
      .prepare(
        `SELECT login_status AS loginStatus,updated_at AS updatedAt,error_code AS errorCode
      FROM spider_runs WHERE credential_version=? AND login_status IN ('verified','rejected')
      ORDER BY updated_at DESC,id DESC LIMIT 1`,
      )
      .bind(credentialVersion ?? null),
  ]);
  return {
    credentialVersion: credentialVersion ?? null,
    sources: results[0].results,
    posts: results[1].results,
    uploadedMedia: Number(results[2].results[0]?.count ?? 0),
    verification: results[4].results[0] ?? null,
    runs: results[3].results.map((row) => ({
      id: row.id,
      kind: row.kind,
      status:
        row.status === 'running' && String(row.leaseExpiresAt) < now
          ? 'interrupted'
          : row.status,
      startedAt: row.startedAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt,
      credentialVersion: row.credentialVersion,
      loginStatus: row.loginStatus,
      summary: Object.keys(JSON.parse(String(row.summaryJson))).length
        ? summary.parse(JSON.parse(String(row.summaryJson)))
        : null,
      errorCode: row.errorCode,
      githubUrl: row.githubRunId
        ? `https://github.com/bhwa233/galaxy-spider/actions/runs/${row.githubRunId}/attempts/${row.githubRunAttempt ?? 1}`
        : null,
    })),
  };
}
