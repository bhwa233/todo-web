'use server';
import { requireAdmin } from '../lib/auth';
import { TrackMeta, TrackItem } from '@prisma/client';
import prisma from './prisma';
import { callDataService } from '../data/client';

// TrackMeta CRUD
interface CreateTrackMetaParams {
  name: string;
  type: string;
}

export async function createTrackMeta({
  name,
  type,
}: CreateTrackMetaParams): Promise<TrackMeta> {
  await requireAdmin();
  return prisma.trackMeta.create({
    data: {
      name,
      type,
    },
  });
}

export async function fetchTrackMetas() {
  await requireAdmin();
  return prisma.trackMeta.findMany({
    include: {
      countItems: {
        orderBy: {
          createTime: 'desc', // 根据 createTime 倒序排列
        },
      },
    },
    orderBy: {
      createTime: 'desc', // 根据 createTime 倒序排列
    },
  });
}

interface UpdateTrackMetaParams {
  id: string;
  name?: string;
  type?: string;
  remark?: string;
}

export async function queryTrackMetaById(
  id: string,
): Promise<TrackMeta | null> {
  await requireAdmin();
  return prisma.trackMeta.findUnique({
    where: { id },
    include: {
      countItems: {
        orderBy: {
          createTime: 'desc', // 根据 createTime 倒序排列
        },
      },
    },
  });
}

export async function updateTrackMeta({
  id,
  name,
  type,
  remark,
}: UpdateTrackMetaParams): Promise<TrackMeta> {
  await requireAdmin();
  return prisma.trackMeta.update({
    where: { id },
    data: {
      name,
      type,
      remark,
    },
  });
}

export async function deleteTrackMeta(id: string): Promise<TrackMeta> {
  await requireAdmin();
  return prisma.trackMeta.delete({
    where: { id },
  });
}

export async function createTrackItem(
  countMetaId: string,
  createTime: Date = new Date(),
  remark: string = '',
): Promise<TrackMeta> {
  await requireAdmin();
  return callDataService<TrackMeta>('record/createTrackItem', {
    countMetaId,
    createTime,
    remark,
  });
}

export async function fetchTrackItems(): Promise<TrackItem[]> {
  await requireAdmin();
  return prisma.trackItem.findMany();
}

export async function fetchTrackItemById(
  id: string,
): Promise<TrackItem | null> {
  await requireAdmin();
  return prisma.trackItem.findUnique({
    where: { id },
  });
}

interface UpdateTrackItemParams {
  id: string;
  remark: string;
  countMetaId?: string;
}

export async function updateTrackItem({
  id,
  remark,
  countMetaId,
}: UpdateTrackItemParams): Promise<TrackItem> {
  await requireAdmin();
  return prisma.trackItem.update({
    where: { id },
    data: {
      remark,
      countMetaId,
    },
  });
}

export async function deleteTrackItem(id: string): Promise<TrackItem> {
  await requireAdmin();
  return callDataService<TrackItem>('record/deleteTrackItem', { id });
}
