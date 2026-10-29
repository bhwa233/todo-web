/// <reference path="../worker-configuration.d.ts" />
import { randomMediaPage } from './media';
import { aiCommand, publishAi, consumeAi } from './ai';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import superjson from 'superjson';
import {
  DataServiceError,
  type ServiceResponse,
} from '../../src/data/protocol';
import { GalleryConfigError } from '../../src/api/gallery/configErrors';
import { createDatabase } from './db';
import { queryDatabase } from './query';
import { galleryCommand } from './gallery';
import { taskCommand } from './tasks';
import { recordCommand } from './records';
import { spiderCommand, spiderReads } from './spider';
import { spiderSnapshot } from './spider-monitor';

function matches(token: string, secret: string | undefined) {
  if (!secret || !token) return false;
  return timingSafeEqual(
    createHash('sha256').update(token).digest(),
    createHash('sha256').update(secret).digest(),
  );
}

async function inputBody(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new DataServiceError('VALIDATION_ERROR', 'Expected application/json');
  if (!request.body)
    throw new DataServiceError('VALIDATION_ERROR', 'Request body required');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256 * 1024) {
        await reader.cancel();
        throw new DataServiceError(
          'PAYLOAD_TOO_LARGE',
          'Request exceeds 256 KiB',
        );
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    try {
      return superjson.parse<unknown>(chunks.join(''));
    } catch {
      throw new DataServiceError('VALIDATION_ERROR', 'Invalid request JSON');
    }
  } finally {
    reader.releaseLock();
  }
}

function reply(payload: ServiceResponse<unknown>, status = 200) {
  const body = superjson.stringify(payload);
  if (new TextEncoder().encode(body).byteLength > 16 * 1024 * 1024)
    throw new DataServiceError(
      'PAYLOAD_TOO_LARGE',
      'Result exceeds 16 MiB; use pagination',
    );
  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function handleRequest(
  request: Request,
  env: TodoDataEnv,
  internal = false,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const authorization = request.headers.get('authorization') ?? '';
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';
    if (token.length > 4096)
      throw new DataServiceError('UNAUTHORIZED', 'Unauthorized');
    const localWeb =
      env.ALLOW_LOCAL_HTTP_WEB_API === 'true' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(
        new URL(request.url).hostname,
      );
    const web = internal || (localWeb && matches(token, env.WEB_API_TOKEN));
    const spider = !web && matches(token, env.SPIDER_API_TOKEN);
    if (!web && !spider)
      throw new DataServiceError('UNAUTHORIZED', 'Unauthorized');
    const path = new URL(request.url).pathname;
    if (path === '/health' && request.method === 'GET')
      return reply({
        result: { status: 'ok', readOnly: env.READ_ONLY !== 'false' },
      });
    if (request.method !== 'POST' || !path.startsWith('/v1/'))
      throw new DataServiceError('NOT_FOUND', 'Not found');
    const input = await inputBody(request);
    const operation = path.slice(4);
    const readOnly = env.READ_ONLY !== 'false';
    if (spider && !operation.startsWith('spider/'))
      throw new DataServiceError('FORBIDDEN', 'Forbidden');
    const prisma = createDatabase(env.DB);
    try {
      if (operation === 'query')
        return reply({
          result: await queryDatabase(prisma, input, spider, readOnly),
        });
      const read =
        [
          'task/summary',
          'task/page',
          'ai/status',
          'gallery/mediaPage',
        ].includes(operation) ||
        (operation.startsWith('spider/') &&
          spiderReads.has(operation.slice(7)));
      if (readOnly && !read)
        throw new DataServiceError('READ_ONLY', '数据库维护中，暂时禁止写入。');
      if (operation.startsWith('ai/'))
        return reply({
          result: await aiCommand(env, prisma, operation.slice(3), input),
        });
      if (operation === 'gallery/mediaPage')
        return reply({ result: await randomMediaPage(env.DB, prisma, input) });
      if (operation.startsWith('gallery/'))
        return reply({
          result: await galleryCommand(
            env.DB,
            prisma,
            operation.slice(8),
            input,
          ),
        });
      if (operation.startsWith('task/'))
        return reply({
          result: await taskCommand(env.DB, prisma, operation.slice(5), input),
        });
      if (operation.startsWith('record/'))
        return reply({
          result: await recordCommand(
            env.DB,
            prisma,
            operation.slice(7),
            input,
          ),
        });
      if (operation.startsWith('spider/'))
        return reply({
          result: await spiderCommand(
            env.DB,
            prisma,
            operation.slice(7),
            input,
          ),
        });
      throw new DataServiceError('NOT_FOUND', 'Not found');
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    if (error instanceof z.ZodError)
      return reply(
        { error: { code: 'VALIDATION_ERROR', message: '请求参数无效。' } },
        400,
      );
    if (
      error instanceof DataServiceError ||
      error instanceof GalleryConfigError
    ) {
      const status =
        error.code === 'UNAUTHORIZED'
          ? 401
          : error.code === 'FORBIDDEN'
            ? 403
            : error.code === 'NOT_FOUND'
              ? 404
              : error.code === 'READ_ONLY'
                ? 503
                : error.code === 'PAYLOAD_TOO_LARGE'
                  ? 413
                  : error.code === 'CONFLICT'
                    ? 409
                    : 400;
      return reply(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        },
        status,
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(JSON.stringify({ requestId, code: error.code }));
      return reply(
        { error: { code: error.code, message: '数据库操作失败。' } },
        error.code === 'P2002' ? 409 : error.code === 'P2025' ? 404 : 500,
      );
    }
    console.error(
      JSON.stringify({
        requestId,
        code: 'DATABASE_ERROR',
        type: error instanceof Error ? error.name : 'Unknown',
      }),
    );
    return reply(
      {
        error: {
          code: 'DATABASE_ERROR',
          message: '数据库服务暂时不可用。',
          details: { requestId },
        },
      },
      500,
    );
  }
}

export class TodoDataService extends WorkerEntrypoint<TodoDataEnv> {
  async call(operation: string, input: string): Promise<string> {
    if (!/^[a-zA-Z]+(?:\/[a-zA-Z]+)?$/.test(operation))
      throw new Error('Invalid operation');
    const response = await handleRequest(
      new Request(`https://todo-data.internal/v1/${operation}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: input,
      }),
      this.env,
      true,
    );
    return response.text();
  }
}

// Available only through an explicit service binding. This entrypoint exposes
// no crawler writes, arbitrary queries, or credentials to the admin API.
export class WeiboMonitor extends WorkerEntrypoint<TodoDataEnv> {
  async fetch(request: Request): Promise<Response> {
    if (
      request.method !== 'GET' ||
      new URL(request.url).pathname !== '/snapshot'
    )
      return new Response(null, { status: 404 });
    try {
      const version = new URL(request.url).searchParams.get(
        'credentialVersion',
      );
      if (version && !z.string().uuid().safeParse(version).success)
        return new Response(null, { status: 400 });
      return Response.json(
        await spiderSnapshot(this.env.DB, version ?? undefined),
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch {
      return Response.json(
        { error: 'weibo_monitor_unavailable' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  }
}

export default {
  fetch: (request: Request, env: TodoDataEnv) => handleRequest(request, env),
  scheduled: (_event: ScheduledController, env: TodoDataEnv) => publishAi(env),
  queue: (batch: MessageBatch<{ jobId: string }>, env: TodoDataEnv) =>
    consumeAi(batch, env),
} satisfies ExportedHandler<TodoDataEnv, { jobId: string }>;
