import axios from 'axios';
import { unstable_cache } from 'next/cache';

export interface IData {
  title: string;
  desc: string;
  hot: number;
  url: string;
}

export interface IRootObject {
  code: number;
  message: string;
  name: string;
  title: string;
  subtitle: string;
  from: string;
  total: number;
  updateTime: string;
  data: IData[];
}

// 知乎话题API相关接口
export interface ZhihuTopicItem {
  title: string;
  detail: string;
  cover: string;
  hot_value_desc: string;
  answer_cnt: number;
  follower_cnt: number;
  comment_cnt: number;
  created_at: number;
  created: string;
  link: string;
}

export interface ZhihuTopicResponse {
  code: number;
  message: string;
  data: ZhihuTopicItem[];
}

// 每日新闻API相关接口
export interface DailyNewsItem {
  date: string;
  news: string[];
  image: string;
  tip: string;
  cover: string;
  audio: {
    music: string;
    news: string;
  };
  link: string;
  created: string;
  created_at: number;
  updated: string;
  updated_at: number;
  day_of_week: string;
  lunar_date: string;
  api_updated: string;
  api_updated_at: number;
}

export interface DailyNewsResponse {
  code: number;
  message: string;
  data: DailyNewsItem;
}

// AI资讯API相关接口
export interface AiNewsItem {
  title: string;
  detail: string;
  link: string;
  source: string;
  date: string;
}

export interface AiNewsResponse {
  code: number;
  message: string;
  data: {
    date: string;
    news: AiNewsItem[];
  };
}

// 通用获取API函数
const fetchFrom60sApi = async (endpoint: string) => {
  try {
    const response = await axios.get(`https://60s.viki.moe/v2/${endpoint}`);
    return response.data;
  } catch (error) {
    console.error(`获取${endpoint}数据失败:`, error);
    return {
      code: -1,
      message: '获取数据失败',
      data: [],
    };
  }
};

// 适配知乎话题数据为通用格式
const adaptZhihuTopicData = (zhihuData: ZhihuTopicResponse): IRootObject => {
  const adaptedData: IData[] = zhihuData.data.map((item, index) => ({
    title: item.title,
    desc: item.detail,
    hot: item.answer_cnt, // 使用回答数量作为热度值
    url: item.link,
  }));

  return {
    code: zhihuData.code,
    message: zhihuData.message,
    name: 'zhihu',
    title: '知乎话题',
    subtitle: '知乎实时热门话题榜',
    from: 'zhihu',
    total: adaptedData.length,
    updateTime: Date.now().toString(),
    data: adaptedData,
  };
};

// 适配每日新闻数据为通用格式
const adaptDailyNewsData = (newsData: DailyNewsResponse): IRootObject => {
  const adaptedData: IData[] = newsData.data.news.map((item, index) => ({
    title: item,
    desc: `第${index + 1}条新闻`,
    hot: index + 1, // 序号作为热度值
    url: newsData.data.link || '', // 如果有链接则使用
  }));

  return {
    code: newsData.code,
    message: newsData.message,
    name: 'daily-news',
    title: '每日新闻',
    subtitle: '每天60秒读懂世界',
    from: 'daily-news',
    total: adaptedData.length,
    updateTime: newsData.data.updated_at.toString(),
    data: adaptedData,
  };
};

// 适配AI资讯数据为通用格式
const adaptAiNewsData = (aiNewsData: AiNewsResponse): IRootObject => {
  const adaptedData: IData[] = aiNewsData.data.news.map((item) => ({
    title: item.title,
    desc: item.detail,
    hot: 0, // AI资讯可能没有热度
    url: item.link,
  }));

  return {
    code: aiNewsData.code,
    message: aiNewsData.message,
    name: 'ai-news',
    title: 'AI资讯',
    subtitle: 'AI资讯快报',
    from: 'ai-news',
    total: adaptedData.length,
    updateTime: Date.now().toString(),
    data: adaptedData,
  };
};

export const getHotLists = unstable_cache(
  (type: string) => {
    return axios
      .get(`https://hot-api-bhwa233.vercel.app/${type}`, {
        params: {
          cache: true,
        },
      })
      .then((res) => {
        return res.data;
      })
      .catch((res) => {
        console.error(res.message);
      });
  },
  ['hot'],
  { revalidate: 60 * 60 },
);

// 获取知乎话题数据
export const getZhihuTopics = unstable_cache(
  async () => {
    try {
      const response = await fetchFrom60sApi('zhihu');
      return adaptZhihuTopicData(response);
    } catch (error) {
      console.error('获取知乎话题数据失败:', error);
      return {
        code: -1,
        message: '获取数据失败',
        name: 'zhihu',
        title: '知乎话题',
        subtitle: '知乎实时热门话题榜',
        from: 'zhihu',
        total: 0,
        updateTime: Date.now().toString(),
        data: [],
      };
    }
  },
  ['zhihu-hot'],
  { revalidate: 60 * 30 }, // 每30分钟更新一次
);


// 获取每日新闻数据
export const getDailyNews = unstable_cache(
  async () => {
    try {
      const response = await fetchFrom60sApi('60s');
      return adaptDailyNewsData(response);
    } catch (error) {
      console.error('获取每日新闻数据失败:', error);
      return {
        code: -1,
        message: '获取数据失败',
        name: 'daily-news',
        title: '每日新闻',
        subtitle: '每天60秒读懂世界',
        from: 'daily-news',
        total: 0,
        updateTime: Date.now().toString(),
        data: [],
      };
    }
  },
  ['daily-news'],
  { revalidate: 60 * 60 * 24 }, // 每天更新一次
);

// 获取AI资讯数据
export const getAiNews = unstable_cache(
  async () => {
    try {
      const response = await fetchFrom60sApi('ai-news');
      return adaptAiNewsData(response);
    } catch (error) {
      console.error('获取AI资讯数据失败:', error);
      return {
        code: -1,
        message: '获取数据失败',
        name: 'ai-news',
        title: 'AI资讯',
        subtitle: 'AI资讯快报',
        from: 'ai-news',
        total: 0,
        updateTime: Date.now().toString(),
        data: [],
      };
    }
  },
  ['ai-news'],
  { revalidate: 60 * 60 }, // 每小时更新一次
);
