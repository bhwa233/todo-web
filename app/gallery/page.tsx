import { Suspense } from 'react'
import { getProducersWithCount, getProducerTags } from "@/api/gallery/producer"
import { getPics, getPicsCount } from "@/api/gallery/media"
import { getPostCount } from "@/api/gallery/post"
import { UploadStatus } from "@prisma/client"
import { MediaType } from "@/api/gallery/type"
import { GalleryClient } from './components/gallery-client'
import { GalleryFilters } from './components/gallery-filters'
import { Skeleton } from "@/components/ui/skeleton"

export const dynamic = 'force-dynamic';

const INITIAL_PAGE_SIZE = 100
const LOAD_MORE_PAGE_SIZE = 40

interface SearchParams {
  producer?: string
  sort?: 'asc' | 'desc' | 'random'
  type?: MediaType
  tags?: string
}
interface GalleryPageProps {
  searchParams: Promise<SearchParams>
}

// 加载骨架屏组件
function GalleryLoadingSkeleton() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="p-4 border-b bg-background">
        <div className="max-w-screen-2xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48 sm:ml-auto" />
          </div>
        </div>
      </div>
      <div className="flex-1 p-2">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {Array.from({ length: 24 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}

export default async function GalleryPage({ searchParams }: GalleryPageProps) {
  // 解析查询参数
  const params = await searchParams
  const producer = params.producer || null
  const sort = (params.sort || 'desc') as 'asc' | 'desc' | 'random'
  const type = params.type || MediaType.image
  const tags = params.tags ? [params.tags] : null

  // Generate a random seed for consistent pagination during this session
  // This seed is generated on the server for the initial render and passed to the client
  const seed = sort === 'random' ? Math.floor(Math.random() * 1000000) : undefined

  // 并行获取所有初始数据
  const [
    producers,
    tagsList,
    initialImages,
    total,
    stats
  ] = await Promise.all([
    getProducersWithCount(),
    getProducerTags(),
    getPics(1, INITIAL_PAGE_SIZE, producer, sort, type, tags, seed),
    getPicsCount(producer, type, tags),
    Promise.all([
      getPostCount({ status: UploadStatus.UPLOADED, producerId: producer || undefined }),
      getPostCount({ status: UploadStatus.PENDING, producerId: producer || undefined })
    ]).then(([uploaded, pending]) => ({ uploaded, pending }))
  ])

  const initialState = {
    producer,
    sort,
    type,
    tags
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* 服务端渲染的筛选器 */}
      <Suspense fallback={<Skeleton className="h-32 border-b" />}>
        <GalleryFilters 
          producers={producers}
          tags={tagsList}
          stats={stats}
          total={total}
          initialState={initialState}
        />
      </Suspense>

      {/* 客户端渲染的图片网格 */}
      <Suspense fallback={<GalleryLoadingSkeleton />}>
        <GalleryClient 
          key={JSON.stringify([producer, sort, type, tags, seed])}
          initialImages={initialImages}
          initialState={initialState}
          total={total}
          pageSize={LOAD_MORE_PAGE_SIZE}
          initialSeed={seed}
        />
      </Suspense>
    </div>
  )
}



export async function generateStaticParams() {
  try {
    const [producers, tags] = await Promise.all([
      getProducersWithCount(),
      getProducerTags()
    ])
    
    const params = []
    
    // 默认页面
    params.push({})
    
    // 热门生产者的页面
    const topProducers = producers
      .sort((a, b) => b.mediaCount - a.mediaCount)
      .slice(0, 10)
    
    for (const producer of topProducers) {
      params.push({ producer: producer.id })
      params.push({ producer: producer.id, type: 'video' })
    }
    
    // 不同媒体类型的页面
    params.push({ type: 'video' })
    params.push({ type: 'livephoto' })
    
    return params
  } catch (error) {
    console.error('Error generating static params:', error)
    return [{}]
  }
}