import Image from 'next/image';
import React from 'react';
import Link from 'next/link';
import { Card } from '../../src/components/ui/card';
import { ScrollArea } from '../../src/components/ui/scroll-area';
import { formatTime } from './MaoyanMovieCard';

const BOX_OFFICE_MOJO = 'https://www.boxofficemojo.com';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// Box Office Mojo 北美周末票房数据类型
interface WeekendBoxOfficeItem {
  rank: number;
  title: string;
  url: string;
  weekend: number;
  changeWeek: string;
  theaters: string;
  total: number;
  weeks: number;
  isNew: boolean;
  isEstimated: boolean;
}

interface WeekendBoxOfficeData {
  dates: string;
  fetchedAt: number;
  list: WeekendBoxOfficeItem[];
}

// "$1,234,567" -> 1234567，"-" 等无数据时为 0
const parseMoney = (text: string) => Number(text.replace(/[^\d]/g, '')) || 0;

// 美元金额格式化为亿/万美元
const formatUSD = (value: number) => {
  if (value >= 1e8) return `$${(value / 1e8).toFixed(2)}亿`;
  return `$${(value / 1e4).toFixed(0)}万`;
};

const decodeEntities = (text: string) =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const fetchHTML = async (url: string) => {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    next: { revalidate: 60 * 60 * 6 } // 6小时重新验证
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.text();
};

// 按表格行拆分单元格；新片、估算行的 <tr> 带 class（如 mojo-annotation-isNewThisWeek），需一并匹配
const parseTableRows = (html: string) =>
  [...html.matchAll(/<tr[^>]*><td[\s\S]*?<\/tr>/g)].map(([row]) =>
    [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].trim()),
  );

const parseLink = (cell = '') => /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(cell);

// 服务端抓取并解析 Box Office Mojo 最近一个周末的北美票房榜
async function getWeekendBoxOfficeData(): Promise<WeekendBoxOfficeData | null> {
  try {
    // 周末总览页顶部会列出尚未到来的周末（票房为 "-"），取第一个有票房数据的周末
    const indexHTML = await fetchHTML(`${BOX_OFFICE_MOJO}/weekend/`);
    const latest = parseTableRows(indexHTML).find((cells) => cells[1]?.startsWith('$'));
    const weekendLink = parseLink(latest?.[0]);
    if (!weekendLink) {
      throw new Error('未找到最新周末，页面结构可能已变化');
    }

    const html = await fetchHTML(`${BOX_OFFICE_MOJO}${weekendLink[1].split('?')[0]}`);

    // 列顺序：排名、上周排名、影片、周末票房、较上周、影院数、影院数变化、影院均值、累计、上映周数、发行方、是否新片、是否估算
    const list: WeekendBoxOfficeItem[] = [];
    for (const cells of parseTableRows(html)) {
      const link = parseLink(cells[2]);
      if (cells.length < 13 || !link) continue;

      list.push({
        rank: Number(cells[0]),
        title: decodeEntities(link[2].trim()),
        url: `${BOX_OFFICE_MOJO}${link[1].split('?')[0]}`,
        weekend: parseMoney(cells[3]),
        changeWeek: cells[4],
        theaters: cells[5],
        total: parseMoney(cells[8]),
        weeks: Number(cells[9]) || 0,
        isNew: cells[11] === 'true',
        isEstimated: cells[12] === 'true',
      });
    }

    if (list.length === 0) {
      throw new Error('解析结果为空，页面结构可能已变化');
    }

    return { dates: weekendLink[2].trim(), fetchedAt: Date.now(), list };
  } catch (error) {
    console.error('获取北美周末票房数据失败:', error);
    return null;
  }
}

// 涨跌幅着色，"-" 表示无对比数据
const ChangeText = ({ label, value }: { label: string; value: string }) => {
  if (!value || value === '-') return null;
  const color = value.startsWith('+') ? 'text-red-400' : 'text-green-400';
  return (
    <span>
      {label} <span className={color}>{value}</span>
    </span>
  );
};

const BoxOfficeMojoWeekendCard = async ({ label, name }: { label: string; name: string }) => {
  const boxOfficeData = await getWeekendBoxOfficeData();

  const header = (
    <div className="p-2 border-b border-zinc-800">
      <div className="flex items-center gap-2">
        <Image
          src={`/logo/${name}.png`}
          alt="avatar"
          loading="lazy"
          width={24}
          height={24}
          style={{
            height: 24
          }}
        />
        <span className="font-bold">
          {label} {boxOfficeData?.dates}
        </span>
      </div>
    </div>
  );

  if (!boxOfficeData) {
    return (
      <Card className="w-full max-w-2xl bg-zinc-900 text-white">
        {header}
        <div className="h-[410px] flex items-center justify-center">
          <div className="text-center text-red-500">
            <p>数据加载失败</p>
          </div>
        </div>
      </Card>
    );
  }

  // 只取前20条数据
  const topMovies = boxOfficeData.list.slice(0, 20);
  const date = formatTime(boxOfficeData.fetchedAt);

  return (
    <Card className="w-full max-w-2xl bg-zinc-900 text-white">
      {header}
      <ScrollArea className="h-[410px]">
        <div className="divide-y divide-zinc-800">
          {topMovies.map((movie) => (
            <div key={movie.url} className="flex items-start gap-4 p-2 hover:bg-zinc-800/50 transition-colors">
              <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-medium text-zinc-400">{movie.rank}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between items-start gap-2">
                  <Link
                    href={movie.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-base min-w-0 flex-1 w-32 hover:text-blue-400"
                    title={movie.title}
                  >
                    {movie.title}
                  </Link>
                  <span className="text-yellow-400 font-bold shrink-0">{formatUSD(movie.weekend)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-zinc-400">
                  {movie.isNew && (
                    <span className="px-1 rounded bg-green-500/20 text-green-400">新</span>
                  )}
                  {movie.isEstimated && (
                    <span className="px-1 rounded bg-zinc-700 text-zinc-300" title="估算数据">估</span>
                  )}
                  <span className="text-white">第{movie.weeks}周</span>
                  <span>累计 {formatUSD(movie.total)}</span>
                  <ChangeText label="较上周" value={movie.changeWeek} />
                  <span>{movie.theaters}家影院</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="p-2 border-t border-zinc-800 flex justify-between gap-2 text-sm text-zinc-400">
        <p>数据来源: Box Office Mojo</p>
        <p className="shrink-0">更新时间: {date}</p>
      </div>
    </Card>
  );
};

export default BoxOfficeMojoWeekendCard;
