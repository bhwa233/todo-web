import React from 'react';
import DailyHotCard from './DailyHotCard';
import MaoyanMovieCard from './MaoyanMovieCard';
import BoxOfficeMojoWeekendCard from './BoxOfficeMojoWeekendCard';
import HackerNewsCard from './HackerNewsCard';
import { news } from './dailyhotConfig';
import {
  IData,
  IRootObject,
  getHotLists as getOriginalHotLists,
  getZhihuTopics,
  getDailyNews,
  getAiNews,
} from '@/api/dailyhot';
import axios from 'axios';

export interface HotType {
  label: string;
  name: string;
  show?: boolean;
  subtitle?: string;
  updateTime?: string;
  children: IData[];
  // 为猫眼电影卡添加额外信息
  totalBoxOffice?: string;
  showCount?: string;
  viewCount?: string;
}

export interface IWeiboResponse {
  code: number;
  message: string;
  data: Array<{
    title: string;
    hot_value: number;
    link: string;
  }>;
}

// 数据适配器：将新API返回的微博数据转换为当前应用期望的格式
const adaptWeiboData = (weiboData: IWeiboResponse): IRootObject => {
  const adaptedData: IData[] = weiboData.data.map((item) => ({
    title: item.title,
    desc: '', // 微博API未提供描述信息，使用空字符串
    hot: item.hot_value,
    url: item.link,
  }));

  return {
    code: weiboData.code,
    message: weiboData.message,
    name: 'weibo',
    title: '微博热搜',
    subtitle: '实时微博热搜榜',
    from: 'weibo',
    total: adaptedData.length,
    updateTime: Date.now().toString(),
    data: adaptedData,
  };
};

export const dynamic = 'force-dynamic';
// 猫眼接口可能屏蔽海外 IP，优先部署到香港区域
export const preferredRegion = 'hkg1';

// 根据类型获取数据的函数
const getHotListByType = async (type: string) => {
  // 特殊处理微博热搜，使用新的API端点和适配器
  if (type === 'weibo') {
    try {
      const response = await axios.get('https://60s.viki.moe/v2/weibo');
      const weiboData: IWeiboResponse = response.data;
      return adaptWeiboData(weiboData);
    } catch (error) {
      console.error('获取微博热搜数据失败:', error);
      return {
        code: -1,
        message: '获取数据失败',
        name: 'weibo',
        title: '微博热搜',
        subtitle: '实时微博热搜榜',
        from: 'weibo',
        total: 0,
        updateTime: Date.now().toString(),
        data: [],
      };
    }
  }
  // 处理知乎话题
  else if (type === 'zhihu') {
    return getZhihuTopics();
  }
  // 处理猫眼电影、北美周末票房 - 返回一个空的数据结构，因为实际数据由专用卡片组件获取
  else if (type === 'maoyan-movie' || type === 'boxoffice-weekend') {
    return {
      code: 200,
      message: '获取数据成功',
      name: type,
      title: type === 'maoyan-movie' ? '猫眼电影' : '北美周末票房',
      subtitle: type === 'maoyan-movie' ? '实时票房' : 'Box Office Mojo 北美周末票房',
      from: type,
      total: 0,
      updateTime: Date.now().toString(),
      data: [],
    };
  }
  // 处理每日新闻
  else if (type === 'daily-news') {
    return getDailyNews();
  }
  // 处理AI资讯
  else if (type === 'ai-news') {
    return getAiNews();
  }
  // 其他类型的热搜继续使用原来的API
  else {
    return getOriginalHotLists(type);
  }
};

const DailyHot = async () => {
  // 使用 Promise.allSettled 确保即使某些请求失败，其他请求仍能成功
  const results = await Promise.allSettled(
    news.map(async (item) => {
      try {
        const res = await getHotListByType(item.name);
        return {
          ...item,
          subtitle: res?.subtitle ?? '',
          updateTime: res?.updateTime ?? Date.now().toString(),
          children: res?.data ?? [],
        };
      } catch (error) {
        console.error(`获取 ${item.label}(${item.name}) 数据失败:`, error);
        // 返回一个默认结构，确保页面能继续渲染
        return {
          ...item,
          subtitle: '获取数据失败',
          updateTime: Date.now().toString(),
          children: [],
        };
      }
    }),
  );

  // 过滤成功的请求，或者包含失败的请求但有默认值
  const hotLists: HotType[] = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      // 如果请求失败，返回一个默认结构
      const item = news[index];
      console.error(
        `获取 ${item.label}(${item.name}) 数据失败:`,
        result.reason,
      );
      return {
        ...item,
        subtitle: '获取数据失败',
        updateTime: Date.now().toString(),
        children: [],
      };
    }
  });

  return (
    <div className="m-6">
      <div className="grid md:grid-cols-3 gap-6">
        {hotLists.map((item) => {
          // 对于猫眼电影，使用特殊的卡片组件
          if (item.name === 'maoyan-movie') {
            return (
              <div className="w-full overflow-auto" key={item.name}>
                <MaoyanMovieCard label={item.label} name={item.name} />
              </div>
            );
          }

          // 对于北美周末票房，使用专用的卡片组件
          if (item.name === 'boxoffice-weekend') {
            return (
              <div className="w-full overflow-auto" key={item.name}>
                <BoxOfficeMojoWeekendCard label={item.label} name={item.name} />
              </div>
            );
          }

          // 对于 Hacker News，使用专用的卡片组件
          if (item.name === 'hackernews') {
            return (
              <div className="w-full overflow-auto" key={item.name}>
                <HackerNewsCard label={item.label} name={item.name} />
              </div>
            );
          }

          // 其他类型的热点使用默认卡片
          return (
            <div className="w-full overflow-auto" key={item.name}>
              <DailyHotCard data={item} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default DailyHot;
