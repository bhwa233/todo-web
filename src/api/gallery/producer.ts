'use server';
import type { Producer } from '@prisma/client';
import { currentRole } from '../../lib/auth';
import { verifyAccessCode } from '../../lib/auth-session';
import { NewProducer, UpdateProducer } from './type';
import { GalleryConfigError } from './configErrors';
import {
  allGallerySources,
  allGalleryTags,
  getGallerySource,
  createGallerySource,
  updateGallerySource,
  deleteGallerySource,
  createGalleryTag,
  deleteGalleryTag,
} from './configService';

// 验证编辑密码
const verifyEditCode = async (editCode?: string): Promise<boolean> => {
  const role = editCode ? verifyAccessCode(editCode) : await currentRole();
  return role === 'admin' || role === 'gallery';
};

// Web actions authenticate with the existing gallery login; MCP authenticates
// independently. Both entry points use the same validated transaction service.
export const createProducer = async (
  data: NewProducer & { editCode?: string },
): Promise<Producer> => {
  if (!(await verifyEditCode(data.editCode))) throw new Error('无效的访问密码');
  const result = await createGallerySource({
    name: data.name ?? undefined,
    type: data.type,
    platformId: data.producerId,
    tagIds: data.tagIds,
  });
  if (result.outcome === 'deleted_exists')
    throw new Error('来源已删除，请先恢复已有配置。');
  return result.source;
};

export const getProducers = async () => allGallerySources();
export const getProducersWithCount = async () => allGallerySources('asc');
export const getProducerById = async (id: string) => {
  try {
    return await getGallerySource(id);
  } catch (error) {
    if (
      error instanceof GalleryConfigError &&
      error.code === 'SOURCE_NOT_FOUND'
    )
      return null;
    throw error;
  }
};

export const updateProducer = async (
  data: UpdateProducer & { editCode?: string },
) => {
  if (!(await verifyEditCode(data.editCode))) throw new Error('无效的访问密码');
  return updateGallerySource({
    id: data.id,
    ...(data.name !== undefined ? { name: data.name ?? '' } : {}),
    ...(data.type !== undefined ? { type: data.type } : {}),
    ...(data.producerId !== undefined
      ? { platformId: data.producerId ?? '' }
      : {}),
    ...(data.tagIds !== undefined ? { tagIds: data.tagIds } : {}),
  });
};

export const deleteProducer = async (id: string, editCode?: string) => {
  if (!(await verifyEditCode(editCode))) throw new Error('无效的访问密码');
  return deleteGallerySource(id);
};

export const getProducerTags = async () => allGalleryTags();
export const createProducerTag = async (data: {
  name: string;
  remark?: string;
  editCode?: string;
}) => {
  if (!(await verifyEditCode(data.editCode))) throw new Error('无效的访问密码');
  return createGalleryTag({ name: data.name, remark: data.remark });
};

export const deleteProducerTag = async (id: string, editCode?: string) => {
  if (!(await verifyEditCode(editCode))) throw new Error('无效的访问密码');
  return deleteGalleryTag(id);
};

export const updateProducerTags = async (
  producerId: string,
  tagIds: string[],
  editCode?: string,
) => {
  if (!(await verifyEditCode(editCode))) throw new Error('无效的访问密码');
  return updateGallerySource({ id: producerId, tagIds });
};
