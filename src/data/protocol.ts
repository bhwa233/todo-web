import { z } from 'zod';

export const models = [
  'trackMeta',
  'trackItem',
  'task',
  'taskTag',
  'bookmark',
  'bookmarkTag',
  'anniversary',
  'media',
  'producer',
  'producerTag',
  'post',
  'producerToProducerTag',
  'asset',
] as const;
export const reads = [
  'findMany',
  'findFirst',
  'findUnique',
  'findUniqueOrThrow',
  'findFirstOrThrow',
  'count',
  'aggregate',
] as const;
export const writes = [
  'create',
  'update',
  'delete',
  'updateMany',
  'deleteMany',
  'upsert',
  'createMany',
] as const;
export const querySchema = z
  .object({
    model: z.enum(models),
    operation: z.enum([...reads, ...writes]),
    args: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type DataQuery = z.infer<typeof querySchema>;
export type ServiceError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};
export type ServiceResponse<T> = { result: T } | { error: ServiceError };

export class DataServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DataServiceError';
  }
}
