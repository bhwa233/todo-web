import Image from 'next/image';
import React from 'react';
import Link from 'next/link';
import { Card } from '../../src/components/ui/card';
import { ScrollArea } from '../../src/components/ui/scroll-area';
import { formatTime } from './MaoyanMovieCard';

const BOX_OFFICE_MOJO = 'https://www.boxofficemojo.com';

// Box Office Mojo 全球年度票房榜数据类型
interface GlobalBoxOfficeItem {
  rank: number;
  title: string;
  url: string;
  worldwide: number;
  domestic: number;
  domesticRate: string;
  foreign: number;
  foreignRate: string;
}

interface GlobalBoxOfficeData {
  year: string;
  fetchedAt: number;
  list: GlobalBoxOfficeItem[];
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

// 服务端抓取并解析 Box Office Mojo 全球年度榜页面
async function getGlobalBoxOfficeData(): Promise<GlobalBoxOfficeData | null> {
  try {
    const response = await fetch(`${BOX_OFFICE_MOJO}/year/world/`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      },
      next: { revalidate: 60 * 60 * 6 } // 6小时重新验证
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const year = /<h1[^>]*>(\d{4}) Worldwide Box Office/.exec(html)?.[1] ?? '';

    const list: GlobalBoxOfficeItem[] = [];
    for (const [row] of html.matchAll(/<tr><td[^>]*mojo-field-type-rank[\s\S]*?<\/tr>/g)) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
      const link = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(cells[1] ?? '');
      if (cells.length < 7 || !link) continue;

      list.push({
        rank: Number(cells[0]),
        title: decodeEntities(link[2].trim()),
        url: `${BOX_OFFICE_MOJO}${link[1].split('?')[0]}`,
        worldwide: parseMoney(cells[2]),
        domestic: parseMoney(cells[3]),
        domesticRate: cells[4],
        foreign: parseMoney(cells[5]),
        foreignRate: cells[6],
      });
    }

    if (list.length === 0) {
      throw new Error('解析结果为空，页面结构可能已变化');
    }

    return { year, fetchedAt: Date.now(), list };
  } catch (error) {
    console.error('获取全球票房数据失败:', error);
    return null;
  }
}

const GlobalBoxOfficeCard = async ({ label, name }: { label: string; name: string }) => {
  const boxOfficeData = await getGlobalBoxOfficeData();

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
          {label} {boxOfficeData?.year}
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
                  <span className="text-yellow-400 font-bold shrink-0">{formatUSD(movie.worldwide)}</span>
                </div>
                <div className="mt-1 text-xs text-zinc-400">
                  北美 {formatUSD(movie.domestic)} ({movie.domesticRate}) · 国际 {formatUSD(movie.foreign)} ({movie.foreignRate})
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

export default GlobalBoxOfficeCard;
