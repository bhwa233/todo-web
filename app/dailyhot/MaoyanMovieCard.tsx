import Image from 'next/image';
import React from 'react';
import dayjs from 'dayjs';
import { Card } from '../../src/components/ui/card';
import { ScrollArea } from '../../src/components/ui/scroll-area';

// 猫眼专业版实时票房接口原始数据类型
interface MaoyanSplitUnit {
  num: string;
  unit: string;
}

interface MaoyanRawMovieItem {
  avgSeatView: string;
  boxRate: string;
  boxSplitUnit: MaoyanSplitUnit;
  movieInfo: {
    movieId: number;
    movieName: string;
    releaseInfo: string;
  };
  showCountRate: string;
  sumBoxDesc: string;
}

interface MaoyanRawResponse {
  movieList: {
    list: MaoyanRawMovieItem[];
    nationBoxInfo: {
      nationBoxSplitUnit: MaoyanSplitUnit;
      showCountDesc: string;
      viewCountDesc: string;
    };
    updateInfo: {
      updateTimestamp: number;
    };
  };
}

// 组件使用的猫眼电影数据类型
interface MaoyanMovieItem {
  movie_id: number;
  movie_name: string;
  release_info: string;
  box_office: string;
  box_office_unit: string;
  box_office_rate: string;
  show_count_rate: string;
  avg_seat_view: string;
  sum_box_desc: string;
}

interface MaoyanMovieData {
  data: {
    show_count_desc: string;
    view_count_desc: string;
    box_office: string;
    box_office_unit: string;
    updated_at: number;
    list: MaoyanMovieItem[];
  };
}

export const formatTime = (timestamp?: string | number) => {
  if (!timestamp) return '';
  const date = dayjs(timestamp);
  const now = dayjs();

  const diffInSeconds = now.diff(date, 'second');
  const diffInMinutes = now.diff(date, 'minute');
  const diffInHours = now.diff(date, 'hour');
  if (diffInSeconds < 60) {
    return "刚刚更新";
  } else if (diffInMinutes < 60) {
    const minutes = Math.floor(diffInMinutes);
    return `${minutes}分钟前更新`;
  } else if (diffInHours < 24) {
    const hours = Math.floor(diffInHours);
    return `${hours}小时前更新`;
  } else {
    return date.format('M月D日');
  }
};

// 服务端获取猫眼电影数据
async function getMaoyanMovieData(): Promise<MaoyanMovieData | null> {
  try {
    const response = await fetch('https://piaofang.maoyan.com/dashboard-ajax/movie?orderType=0', {
      headers: {
        referer: 'https://piaofang.maoyan.com/dashboard',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      },
      next: { revalidate: 300 } // 5分钟重新验证
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const { movieList }: MaoyanRawResponse = await response.json();
    const { nationBoxInfo } = movieList;
    return {
      data: {
        show_count_desc: nationBoxInfo.showCountDesc,
        view_count_desc: nationBoxInfo.viewCountDesc,
        box_office: nationBoxInfo.nationBoxSplitUnit.num,
        box_office_unit: nationBoxInfo.nationBoxSplitUnit.unit,
        updated_at: movieList.updateInfo.updateTimestamp,
        list: movieList.list.map((item) => ({
          movie_id: item.movieInfo.movieId,
          movie_name: item.movieInfo.movieName,
          release_info: item.movieInfo.releaseInfo,
          box_office: item.boxSplitUnit.num,
          box_office_unit: item.boxSplitUnit.unit,
          box_office_rate: item.boxRate,
          show_count_rate: item.showCountRate,
          avg_seat_view: item.avgSeatView,
          sum_box_desc: item.sumBoxDesc,
        })),
      },
    };
  } catch (error) {
    console.error('获取猫眼电影数据失败:', error);
    return null;
  }
}

const MaoyanMovieCard = async ({ label, name }: { label: string; name: string }) => {
  const movieData = await getMaoyanMovieData();

  if (!movieData || !movieData.data) {
    return (
      <Card className="w-full max-w-2xl bg-zinc-900 text-white">
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
            <span className="font-bold">{label}</span>
          </div>
        </div>
        <div className="h-[410px] flex items-center justify-center">
          <div className="text-center text-red-500">
            <p>数据加载失败</p>
          </div>
        </div>
      </Card>
    );
  }

  // 只取前20条数据
  const topMovies = movieData.data.list.slice(0, 20);
  const date = formatTime(movieData.data.updated_at);

  return (
    <Card className="w-full max-w-2xl bg-zinc-900 text-white">
      <div className="p-2 border-b border-zinc-800">
        <div className="flex items-center justify-between gap-2">
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
            <span className="font-bold">{label}</span>
          </div>
          <div className="hidden md:flex items-center gap-4 text-xs">
            <div className="text-center">
              <div className="text-zinc-400">总票房</div>
              <div className="text-yellow-400 font-bold">{movieData.data.box_office}{movieData.data.box_office_unit}</div>
            </div>
            <div className="text-center">
              <div className="text-zinc-400">排片</div>
              <div className="text-cyan-400">{movieData.data.show_count_desc}</div>
            </div>
            <div className="text-center">
              <div className="text-zinc-400">人次</div>
              <div className="text-green-400">{movieData.data.view_count_desc}</div>
            </div>
          </div>
        </div>
        {/* 移动端显示的总体票房信息 */}
        <div className="md:hidden grid grid-cols-3 gap-2 mt-2 text-xs">
          <div className="text-center">
            <div className="text-zinc-400">总票房</div>
            <div className="text-yellow-400 font-bold">{movieData.data.box_office}{movieData.data.box_office_unit}</div>
          </div>
          <div className="text-center">
            <div className="text-zinc-400">排片</div>
            <div className="text-cyan-400">{movieData.data.show_count_desc}</div>
          </div>
          <div className="text-center">
            <div className="text-zinc-400">人次</div>
            <div className="text-green-400">{movieData.data.view_count_desc}</div>
          </div>
        </div>
      </div>
      <ScrollArea className="h-[410px]">
        <div className="divide-y divide-zinc-800">
          {topMovies.map((movie, index) => (
            <div key={movie.movie_id} className="flex items-start gap-4 p-2 hover:bg-zinc-800/50 transition-colors">
              <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-1">
                <span className="text-xs font-medium text-zinc-400">{index + 1}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-base min-w-0 truncate w-[60%]">{movie.movie_name}</h3>
                  <div className="text-right">
                    <span className="text-yellow-400 font-bold">
                      <span className="text-zinc-500">总票房：</span>
                      {movie.sum_box_desc}
                    </span>
                  </div>
                </div>

                {/* 详细票房和观影信息 - 自适应换行布局 */}
                <div className="mt-2 space-y-1">
                  <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
                    <div className="flex items-center space-x-1 px-2 py-1 bg-zinc-800/50 rounded">
                      <span className="text-white">{movie.release_info}</span>
                    </div>
                    <div className="flex items-center space-x-1 px-2 py-1 bg-zinc-800/50 rounded">
                      <span className="text-zinc-500">票房占比:</span>
                      <span className="text-green-400">{movie.box_office_rate}</span>
                    </div>
                    <div className="flex items-center space-x-1 px-2 py-1 bg-zinc-800/50 rounded">
                      <span className="text-zinc-500">场次占比:</span>
                      <span className="text-cyan-400">{movie.show_count_rate}</span>
                    </div>
                    <div className="flex items-center space-x-1 px-2 py-1 bg-zinc-800/50 rounded">
                      <span className="text-zinc-500">上座率:</span>
                      <span className="text-pink-400">{movie.avg_seat_view}</span>
                    </div>
                    <div className="flex items-center space-x-1 px-2 py-1 bg-zinc-800/50 rounded">
                      <span className="text-zinc-500">今日票房:</span>
                      <span className="text-blue-400"> {movie.box_office}{movie.box_office_unit} </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="p-2 border-t border-zinc-800">
        <p className="text-sm text-zinc-400 text-right">更新时间: {date}</p>
      </div>
    </Card>
  );
};

export default MaoyanMovieCard;