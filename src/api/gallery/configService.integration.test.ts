import remoteDb from '../prisma';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Run only against an isolated disposable local Worker with the real D1
// migrations applied. Never use application or remote Cloudflare credentials.
const serviceUrl = process.env.TEST_DATA_SERVICE_URL;
if (serviceUrl && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(serviceUrl).hostname)) {
  throw new Error('TEST_DATA_SERVICE_URL must name a disposable local Worker');
}

describe.skipIf(!serviceUrl)(
  'gallery config transactions (local D1)',
  () => {
    let db: typeof remoteDb;
    let service: typeof import('./configService');
    beforeAll(async () => {
      vi.stubEnv('DATA_SERVICE_URL', serviceUrl!);
      vi.stubEnv('DATA_SERVICE_TOKEN', process.env.TEST_DATA_SERVICE_TOKEN!);
      db = remoteDb;
      service = await import('./configService');
    });
    beforeEach(async () => {
      await db.producerToProducerTag.deleteMany();
      await db.media.deleteMany();
      await db.post.deleteMany();
      await db.producer.deleteMany();
      await db.producerTag.deleteMany();
    });
    afterAll(async () => {
      vi.unstubAllEnvs();
    });

    it('rolls back invalid labels and creates one source across concurrent retries', async () => {
      const input = {
        type: 'WEIBO_PERSONAL' as const,
        platformId: '123',
        name: '来源',
      };
      await expect(
        service.createGallerySource({ ...input, tagIds: ['missing'] }),
      ).rejects.toMatchObject({ code: 'TAG_NOT_FOUND' });
      expect(await db.producer.count()).toBe(0);
      const tag = await service.createGalleryTag({ name: '摄影' });
      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          service.createGallerySource({ ...input, tagIds: [tag.id] }),
        ),
      );
      expect(
        results.filter((result) => result.outcome === 'created'),
      ).toHaveLength(1);
      expect(new Set(results.map((result) => result.source.id)).size).toBe(1);
      expect(await db.producer.count()).toBe(1);
      const duplicate = await service.createGallerySource({
        ...input,
        name: '不应覆盖',
        tagIds: [],
      });
      expect(duplicate.source).toMatchObject({
        name: '来源',
        tags: [{ id: tag.id }],
      });
    });

    it('preserves unrelated changes, detects stale updates and preserves media through delete/restore', async () => {
      const { source } = await service.createGallerySource({
        type: 'WEIBO_PERSONAL',
        platformId: '123',
        name: '来源',
      });
      const a = await service.createGalleryTag({ name: '摄影' });
      const b = await service.createGalleryTag({ name: '旅行' });
      const legacy = await db.producer.create({
        data: { name: '旧配置', type: 'WEIBO_PERSONAL', producerId: null },
      });
      expect(
        await service.updateGallerySource({
          id: legacy.id,
          name: '旧配置改名',
          tagIds: [a.id],
        }),
      ).toMatchObject({ name: '旧配置改名', producerId: null });
      await service.deleteGallerySource(legacy.id);
      await Promise.all([
        service.changeGallerySourceTags({ id: source.id, addTagIds: [a.id] }),
        service.changeGallerySourceTags({ id: source.id, addTagIds: [b.id] }),
      ]);
      expect(
        new Set(
          (await service.getGallerySource(source.id)).tags.map((tag) => tag.id),
        ),
      ).toEqual(new Set([a.id, b.id]));
      const current = await service.getGallerySource(source.id);
      await service.updateGallerySource({
        id: source.id,
        name: '改名',
        expectedUpdateTime: current.updateTime.toISOString(),
      });
      await expect(
        service.updateGallerySource({
          id: source.id,
          name: '过期',
          expectedUpdateTime: '2000-01-01T00:00:00Z',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(
        service.updateGallerySource({
          id: source.id,
          name: '不应保存',
          tagIds: ['missing'],
        }),
      ).rejects.toMatchObject({ code: 'TAG_NOT_FOUND' });
      expect((await service.getGallerySource(source.id)).name).toBe('改名');
      await db.media.create({ data: { producerId: source.id } });
      await db.post.create({
        data: {
          producerId: source.id,
          userId: '123',
          platform: 'WEIBO',
          platformId: 'post-123',
        },
      });
      await service.deleteGallerySource(source.id);
      expect((await service.listGallerySources()).items).toEqual([]);
      expect(
        (
          await service.createGallerySource({
            type: 'WEIBO_PERSONAL',
            platformId: '123',
            name: '来源',
          })
        ).outcome,
      ).toBe('deleted_exists');
      const restored = await service.restoreGallerySource(source.id);
      expect(restored).toMatchObject({
        deletedAt: null,
        mediaCount: 1,
        postCount: 1,
      });
      const renamedTag = await service.updateGalleryTag({
        id: a.id,
        name: '照片',
        remark: '测试',
      });
      expect(renamedTag).toMatchObject({ name: '照片', remark: '测试' });
      await service.deleteGalleryTag(a.id);
      expect(
        (await service.getGallerySource(source.id)).tags.map((tag) => tag.id),
      ).toEqual([b.id]);
      const revived = await service.createGalleryTag({ name: '照片' });
      expect(revived.deletedAt).toBeNull();
      expect(
        (await service.getGallerySource(source.id)).tags.map((tag) => tag.id),
      ).toEqual([b.id]);
    });

    it('rejects duplicate identities on update or restore and resets the crawl watermark on identity changes', async () => {
      const first = (
        await service.createGallerySource({
          type: 'WEIBO_PERSONAL',
          platformId: '123',
          name: '一',
        })
      ).source;
      const second = (
        await service.createGallerySource({
          type: 'WEIBO_PERSONAL',
          platformId: '456',
          name: '二',
        })
      ).source;
      await expect(
        service.updateGallerySource({ id: second.id, platformId: '123' }),
      ).rejects.toMatchObject({ code: 'DUPLICATE_SOURCE' });
      await service.deleteGallerySource(first.id);
      await db.producer.update({
        where: { id: second.id },
        data: { lastPostTime: new Date() },
      });
      const updated = await service.updateGallerySource({
        id: second.id,
        platformId: '123',
      });
      expect(updated.lastPostTime).toBeNull();
      await expect(
        service.restoreGallerySource(first.id),
      ).rejects.toMatchObject({ code: 'DUPLICATE_SOURCE' });
    });
  },
);
