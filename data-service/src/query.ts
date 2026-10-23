import metadata from '../../src/data/schema.generated.json';
import { querySchema, reads, DataServiceError } from '../../src/data/protocol';
import type { Database } from './db';

export async function queryDatabase(
  prisma: Database,
  input: unknown,
  spider: boolean,
  readOnly: boolean,
) {
  const query = querySchema.parse(input);
  const read = (reads as readonly string[]).includes(query.operation);
  if (readOnly && !read)
    throw new DataServiceError('READ_ONLY', '数据库维护中，暂时禁止写入。');
  if (spider)
    throw new DataServiceError('FORBIDDEN', '爬虫凭据只能调用爬虫业务接口。');
  const relations = new Set(metadata.relations[query.model]);
  for (const key of ['data', 'create', 'update']) {
    const value = query.args[key];
    const records = Array.isArray(value) ? value : [value];
    if (
      records.some(
        (record) =>
          record &&
          typeof record === 'object' &&
          Object.keys(record).some((field) => relations.has(field)),
      )
    ) {
      throw new DataServiceError(
        'INVALID_OPERATION',
        '关联写入必须使用原子业务接口。',
      );
    }
  }
  const delegate = prisma[query.model];
  const method: unknown = Reflect.get(delegate, query.operation);
  if (typeof method !== 'function')
    throw new DataServiceError('INVALID_OPERATION', '不支持的数据库操作。');
  const result: unknown = await Reflect.apply(method, delegate, [query.args]);
  return result;
}
