import { Producer, ProducerType } from '@prisma/client';

export type UpdateProducer = Pick<Producer, 'id'> &
  Partial<Pick<Producer, 'name' | 'type' | 'producerId'>> & {
    tagIds?: string[];
  };

export type NewProducer = {
  name: string | null;
  type: ProducerType;
  producerId: string;
  tagIds?: string[];
};

export const PRODUCER_TYPE_NAMES: Record<ProducerType, string> = {
  WEIBO_PERSONAL: '个人微博',
  WEIBO_SUPER_TOPIC: '微博超话',
  XIAOHONGSHU_PERSONAL: '个人小红书',
  XIAOHONGSHU_SUPER_TOPIC: '小红书超话',
  DOUYIN_PERSONAL: '个人抖音',
  DOUYIN_SUPER_TOPIC: '抖音超话',
};

export enum MediaType {
  image = 'image',
  video = 'video',
  livephoto = 'livephoto',
}
