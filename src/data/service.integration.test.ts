import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import type { Post, Task, TaskTag } from '@prisma/client';
import superjson from 'superjson';
import prisma from '../api/prisma';
import { callDataService } from './client';

const serviceUrl = process.env.TEST_DATA_SERVICE_URL;
if (
  serviceUrl &&
  !['localhost', '127.0.0.1', '[::1]'].includes(new URL(serviceUrl).hostname)
)
  throw new Error('Use a disposable local D1 instance');

describe.skipIf(!serviceUrl)('D1 data service invariants', () => {
  beforeAll(() => {
    vi.stubEnv('DATA_SERVICE_URL', serviceUrl!);
    vi.stubEnv('DATA_SERVICE_TOKEN', process.env.TEST_DATA_SERVICE_TOKEN!);
  });
  afterAll(() => vi.unstubAllEnvs());

  it('pins run credentials and prevents late heartbeats from overwriting terminal results', async () => {
    const id = crypto.randomUUID();
    const credentialVersion = crypto.randomUUID();
    async function command(operation: string, input: unknown) {
      return fetch(`${serviceUrl}/v1/spider/${operation}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.TEST_SPIDER_SERVICE_TOKEN}`,
        },
        body: superjson.stringify(input),
      });
    }
    expect(
      (
        await command('runStart', {
          id,
          kind: 'consumer',
          githubRunId: null,
          githubRunAttempt: null,
        })
      ).status,
    ).toBe(200);
    const progress = {
      id,
      status: 'running',
      credentialVersion,
      loginStatus: 'verified',
      errorCode: null,
      summary: {
        processedSources: 0,
        processedPosts: 2,
        completedPosts: 1,
        failedPosts: 1,
        deferredPosts: 0,
        uploadedMedia: 3,
        skippedMedia: 0,
        failedMedia: 1,
      },
    };
    expect((await command('runUpdate', progress)).status).toBe(200);
    expect(
      (
        await command('runUpdate', {
          ...progress,
          credentialVersion: crypto.randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await command('runUpdate', {
          ...progress,
          status: 'failed',
          loginStatus: 'rejected',
          errorCode: 'weibo_request_blocked',
        })
      ).status,
    ).toBe(200);
    expect((await command('runUpdate', progress)).status).toBe(409);
  });

  it('keeps seeded gallery pages stable and disjoint without returning other sources', async () => {
    const producer = await prisma.producer.create({
      data: { name: `random-${crypto.randomUUID()}` },
    });
    try {
      await prisma.media.createMany({
        data: Array.from({ length: 23 }, (_, i) => ({
          producerId: producer.id,
          status: 'UPLOADED' as const,
          galleryMediaUrl: `https://example.com/${i}.jpg`,
        })),
      });
      const input = {
        seed: 173,
        skip: 0,
        limit: 10,
        producerId: producer.id,
        type: 'image',
        tagIds: null,
      };
      const first = await callDataService<{ id: number; producerId: string }[]>(
        'gallery/mediaPage',
        input,
      );
      const again = await callDataService<{ id: number }[]>(
        'gallery/mediaPage',
        input,
      );
      const next = await callDataService<{ id: number }[]>(
        'gallery/mediaPage',
        { ...input, skip: 10 },
      );
      expect(again.map((row) => row.id)).toEqual(first.map((row) => row.id));
      expect(first.every((row) => row.producerId === producer.id)).toBe(true);
      expect(first).toHaveLength(10);
      expect(new Set([...first, ...next].map((row) => row.id)).size).toBe(20);
    } finally {
      await prisma.media.deleteMany({ where: { producerId: producer.id } });
      await prisma.producer.delete({ where: { id: producer.id } });
    }
  });

  it('durably queues automatic labels while an explicit empty manual selection suppresses AI', async () => {
    const automatic = await callDataService<Task>('task/save', {
      data: { name: 'automatic fixture' },
      autoTag: true,
    });
    const manual = await callDataService<Task>('task/save', {
      data: { name: 'manual fixture' },
      autoTag: true,
      tagIds: [],
    });
    try {
      expect(
        await callDataService('ai/status', { targetId: automatic.id }),
      ).toMatchObject({ status: 'PENDING' });
      expect(
        await callDataService('ai/status', { targetId: manual.id }),
      ).toBeNull();
    } finally {
      await prisma.task.deleteMany({
        where: { id: { in: [automatic.id, manual.id] } },
      });
    }
  });

  it('rejects missing credentials and prevents a crawler token from accessing website tables', async () => {
    const request = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: superjson.stringify({
        model: 'task',
        operation: 'findMany',
        args: {},
      }),
    };
    expect((await fetch(`${serviceUrl}/v1/query`, request)).status).toBe(401);
    const denied = await fetch(`${serviceUrl}/v1/query`, {
      ...request,
      headers: {
        ...request.headers,
        authorization: `Bearer ${process.env.TEST_SPIDER_SERVICE_TOKEN ?? 'local-spider-token-not-for-production'}`,
      },
    });
    expect(denied.status).toBe(403);
  });

  it('uses literal percent characters consistently in completed-task counts and pages', async () => {
    const task = await callDataService<Task>('task/save', {
      data: { name: 'completed 100% exact', status: '1' },
      tagNames: [],
    });
    const query = { search: '100%', tag: 'all', status: 'all' };
    expect(await callDataService('task/summary', query)).toMatchObject({
      matching: 1,
    });
    const page = await callDataService<{ items: Task[] }>('task/page', query);
    expect(page.items.map(({ id }) => id)).toEqual([task.id]);
    await prisma.task.delete({ where: { id: task.id } });
  });

  it('rolls back a bookmark update and its removed links when a new tag is missing', async () => {
    const bookmark = await prisma.bookmark.create({
      data: {
        url: `https://example.com/${crypto.randomUUID()}`,
        title: 'before',
      },
    });
    const tag = await prisma.bookmarkTag.create({ data: { name: 'existing' } });
    await callDataService('record/bookmark', {
      id: bookmark.id,
      data: {},
      tagIds: [tag.id],
    });
    await expect(
      callDataService('record/bookmark', {
        id: bookmark.id,
        data: { title: 'must roll back' },
        tagIds: ['missing'],
      }),
    ).rejects.toThrow();
    const saved = await prisma.bookmark.findUniqueOrThrow({
      where: { id: bookmark.id },
      include: { tags: true },
    });
    expect(saved.title).toBe('before');
    expect(saved.tags.map(({ id }) => id)).toEqual([tag.id]);
    await prisma.bookmark.delete({ where: { id: bookmark.id } });
    await prisma.bookmarkTag.delete({ where: { id: tag.id } });
  });

  it('does not reattach an old label when it is revived or let stale AI labels overwrite a manual selection', async () => {
    const name = `tag-${crypto.randomUUID()}`;
    const first = await callDataService<Task & { tags: TaskTag[] }>(
      'task/save',
      { data: { name: 'first' }, tagNames: [name] },
    );
    await prisma.taskTag.update({
      where: { id: first.tags[0].id },
      data: { deletedAt: new Date(), updateTime: new Date() },
    });
    const second = await callDataService<Task & { tags: TaskTag[] }>(
      'task/save',
      { data: { name: 'second' }, tagNames: [name] },
    );
    expect(second.tags[0].id).toBe(first.tags[0].id);
    expect(
      (
        await prisma.task.findUniqueOrThrow({
          where: { id: first.id },
          include: { tags: true },
        })
      ).tags,
    ).toEqual([]);
    await callDataService('task/tags', { id: second.id, tagIds: [] });
    await expect(
      callDataService('task/tags', {
        id: second.id,
        tagIds: [first.tags[0].id],
        expectedUpdateTime: second.updateTime,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(
      (
        await prisma.task.findUniqueOrThrow({
          where: { id: second.id },
          include: { tags: true },
        })
      ).tags,
    ).toEqual([]);
    await prisma.task.deleteMany({
      where: { id: { in: [first.id, second.id] } },
    });
    await prisma.taskTag.delete({ where: { id: first.tags[0].id } });
  });

  it('claims each crawler post once and preserves its timestamp when rediscovered during processing', async () => {
    const producer = await prisma.producer.create({
      data: { name: 'crawler-test', producerId: '123' },
    });
    const input = {
      platform: 'WEIBO',
      platformId: crypto.randomUUID(),
      userId: '123',
      producerId: producer.id,
      createTime: new Date('2020-01-02T03:04:05.006Z'),
    };
    const post = await callDataService<Post>('spider/upsertPost', input);
    const started = new Date();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        callDataService<Post | null>('spider/claimPost', {
          runStartedAt: started,
        }),
      ),
    );
    expect(results.filter((row) => row?.id === post.id)).toHaveLength(1);
    const claimed = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
    });
    await callDataService('spider/upsertPost', { ...input, userId: '456' });
    const rediscovered = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
    });
    expect(rediscovered.updateTime).toEqual(claimed.updateTime);
    expect(rediscovered.userId).toBe('123');
    const media = {
      producerId: producer.id,
      postId: post.id,
      userId: '123',
      originMediaUrl: 'https://example.com/original.jpg',
      galleryMediaUrl: 'https://example.com/saved.jpg',
    };
    await Promise.all([
      callDataService('spider/saveMedia', [media]),
      callDataService('spider/saveMedia', [media]),
    ]);
    expect(await prisma.media.count({ where: { postId: post.id } })).toBe(1);
    await prisma.media.deleteMany({ where: { postId: post.id } });
    await prisma.post.delete({ where: { id: post.id } });
    await prisma.producer.delete({ where: { id: producer.id } });
  });
});
