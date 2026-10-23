'use server';
import { requireAdmin } from '../../lib/auth';
import { Bookmark, BookmarkTag } from '@prisma/client';
import prisma from '../prisma';
import { callDataService } from '../../data/client';


interface CreateBookmarkData {
  url: string;
  title?: string;
  image?: string;
  remark?: string;
  content?: string; // 页面内容，用于AI摘要
}

// 创建书签
export const createBookmark = async (
  data: CreateBookmarkData,
): Promise<CompleteBookmark | null> => {
  await requireAdmin();
  return callDataService<CompleteBookmark>('record/createBookmark', data);
};

export async function summarizeBookmarkByContent(id: string, content: string) {
  await requireAdmin();
  return callDataService<CompleteBookmark>('ai/bookmark', { id, content });
}

// 获取所有书签
export interface CompleteBookmark extends Bookmark {
  tags: BookmarkTag[];
}
interface GetAllBookmarksOptions {
  keyword?: string;
  tagId?: string | null;
}
export const getAllBookmarks = async (
  options: GetAllBookmarksOptions,
): Promise<CompleteBookmark[]> => {
  await requireAdmin();
  const { keyword, tagId } = options;
  return await prisma.bookmark.findMany({
    take: 100,
    where: {
      AND: [
        keyword
          ? {
            OR: [{ title: { contains: keyword } }],
          }
          : {},
        tagId
          ? {
            tags: {
              some: { id: tagId },
            },
          }
          : {},
      ],
    },
    orderBy: { createTime: 'desc' },
    include: { tags: true },
  });
};
// 获取单个书签，不断轮训直到书签加载完成
export const getSingleBookmark = async (
  id: string,
): Promise<CompleteBookmark | null> => {
  await requireAdmin();
  return prisma.bookmark.findUnique({ where: { id }, include: { tags: true } });
};

// 更新书签
export const updateBookmark = async (
  id: string,
  data: Bookmark,
): Promise<Bookmark> => {
  await requireAdmin();
  return callDataService<Bookmark>('record/bookmark', { id, data, tagIds: [] });
};

// 删除书签
export const deleteBookmark = async (id: string): Promise<Bookmark> => {
  await requireAdmin();
  return await prisma.bookmark.delete({
    where: { id },
  });
};

export interface BookmarkTagWithCount extends BookmarkTag {
  count: number;
}

export const getBookmarkTags = async (): Promise<BookmarkTag[]> => {
  await requireAdmin();
  return await prisma.bookmarkTag.findMany();
}

// 获取所有标签，并查询每个标签下的关联多少个书签
export const getAllBookmarkTags = async (): Promise<BookmarkTagWithCount[]> => {
  await requireAdmin();
  const data = await prisma.bookmarkTag.findMany({
    include: { bookmarks: true },
  });
  return data
    .map((item) => {
      return {
        ...item,
        count: item.bookmarks.length,
      };
    })
    .sort((a, b) => b.count - a.count);
};

// 通过 URL 获取书签
export const getBookmarkByUrl = async (url: string): Promise<CompleteBookmark | null> => {
  await requireAdmin();
  return await prisma.bookmark.findFirst({
    where: { url },
    include: { tags: true },
  });
};

// 通过 URL 删除书签
export const deleteBookmarkByUrl = async (url: string): Promise<Bookmark | null> => {
  await requireAdmin();
  const bookmark = await prisma.bookmark.findFirst({
    where: { url },
  });

  if (!bookmark) {
    return null;
  }

  return await prisma.bookmark.delete({
    where: { id: bookmark.id },
  });
};

// 更新标签
export const updateBookmarkTag = async (
  id: string,
  data: BookmarkTag,
): Promise<BookmarkTag> => {
  await requireAdmin();
  return await prisma.bookmarkTag.update({
    where: { id },
    data,
  });
};

// 删除标签
export const deleteBookmarkTag = async (id: string): Promise<BookmarkTag> => {
  await requireAdmin();
  return await prisma.bookmarkTag.delete({
    where: { id },
  });
};
