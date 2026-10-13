'use client'

import { useState, useCallback, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import useConfigStore from '../../../store/config'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MediaType } from "@/api/gallery/type"
import { ProducerTag } from '@prisma/client';
import { Producer } from "@prisma/client"

// 定义ProducerWithCount类型
type ProducerWithCount = Producer & {
  tags: ProducerTag[]
  mediaCount: number
  postCount: number
}
import { ProducerDialog } from './producer-dialog'

interface FilterControlsProps {
  producers: ProducerWithCount[]
  tags: ProducerTag[]
  stats: {
    uploaded: number
    pending: number
  }
  total: number
  initialState: {
    producer: string | null
    sort: 'asc' | 'desc' | 'random'
    type: MediaType
    tags: string[] | null
  }
}

export function FilterControls({
  producers,
  tags,
  stats,
  total,
  initialState
}: FilterControlsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const searchParams = useSearchParams()
  const [isProducerDialogOpen, setIsProducerDialogOpen] = useState(false)
  const { role } = useConfigStore()

  // 更新URL参数的通用函数
  const updateSearchParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '' || value === 'all') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })

    const newUrl = params.toString() ? `?${params.toString()}` : '/gallery'
    startTransition(() => {
      router.push(newUrl, { scroll: false })
    })
  }, [router, searchParams, startTransition])

  // 获取当前选中的生产者信息
  const selectedProducer = initialState.producer
    ? producers.find(p => p.id === initialState.producer)
    : null

  // 获取当前选中的标签信息
  const selectedTag = initialState.tags?.[0]
    ? tags.find(t => t.id === initialState?.tags?.[0])
    : null

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4" aria-busy={isPending}>
        {/* 生产者筛选 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">生产者</label>
          <Select
            disabled={isPending}
            value={initialState.producer || 'all'}
            onValueChange={(value) => updateSearchParams({ producer: value === 'all' ? null : value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择生产者" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部生产者</SelectItem>
              {producers.map((producer) => (
                <SelectItem key={producer.id} value={producer.id}>
                  {producer.name} ({producer.mediaCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 排序方式 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">排序</label>
          <Select
            disabled={isPending}
            value={initialState.sort}
            onValueChange={(value) => updateSearchParams({ sort: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">最新优先</SelectItem>
              <SelectItem value="asc">最早优先</SelectItem>
              <SelectItem value="random">随机排序</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 媒体类型 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">类型</label>
          <Select
            disabled={isPending}
            value={initialState.type}
            onValueChange={(value) => updateSearchParams({ type: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={MediaType.image}>图片</SelectItem>
              <SelectItem value={MediaType.video}>视频</SelectItem>
              <SelectItem value={MediaType.livephoto}>实况照片</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 标签筛选 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">标签</label>
          <Select
            disabled={isPending}
            value={initialState.tags?.[0] || 'all'}
            onValueChange={(value) => updateSearchParams({ tags: value === 'all' ? null : value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择标签" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部标签</SelectItem>
              {tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 操作按钮 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">操作</label>
          <div className="flex gap-2">
            {(role === 'admin' || role === 'gallery') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsProducerDialogOpen(true)}
              >
                管理生产者
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => startTransition(() => router.push('/gallery'))}
            >
              重置
            </Button>
          </div>
        </div>
      </div>

      {/* 筛选条件和状态信息 */}
      <div className="flex flex-col lg:flex-row gap-4 mt-4">
        {/* 左侧：当前筛选条件 */}
        <div className="flex flex-wrap gap-2">
          {selectedProducer && (
            <Badge variant="secondary">
              {selectedProducer.name}
            </Badge>
          )}
          {selectedTag && (
            <Badge variant="secondary">
              标签: {selectedTag.name}
            </Badge>
          )}
          {initialState.type !== MediaType.image && (
            <Badge variant="secondary">
              类型: {initialState.type === MediaType.video ? '视频' : '实况照片'}
            </Badge>
          )}
          {initialState.sort !== 'desc' && (
            <Badge variant="secondary">
              排序: {initialState.sort === 'asc' ? '最早优先' : '随机'}
            </Badge>
          )}
        </div>

        {/* 右侧：状态信息 */}
        <div className="flex gap-4 text-sm text-muted-foreground lg:ml-auto">
          <span role="status" aria-live="polite">{isPending ? '正在加载…' : `共 ${total} 项`}</span>
          <span>已上传: {stats.uploaded}</span>
          <span>待处理: {stats.pending}</span>
        </div>
      </div>

      {/* 生产者管理对话框 */}
      <ProducerDialog
        open={isProducerDialogOpen}
        onOpenChange={setIsProducerDialogOpen}
        producers={producers}
      />
    </>
  )
}
