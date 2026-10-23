'use client'
import { getAiJobStatus } from '@/api/ai/jobActions';
import { useState } from "react"
import { Search, X } from 'lucide-react'
import { Input } from "@/components/ui/input"
import { BookmarkCard } from "./BookmarkCard"
import NewBookmarkCard from "./NewBookMarkCard"
import { useMemoizedFn } from "ahooks"
import { BookmarkTagWithCount, getAllBookmarks, getSingleBookmark } from "../../src/api/bookmark"
import { Bookmark } from "@prisma/client"
import { produce } from "immer"
import BookmarkSidebar from "./bookmark-sidebar"
import { useSidebar } from "../../src/components/ui/sidebar"
import { Label } from "../../src/components/ui/label"
import { Button } from "../../src/components/ui/button"
import { isBrowser } from "@/lib/utils"
import useLocalStorageRequest from "../../src/hooks/useLocalStorageRequest"
import { useToast } from "../../src/hooks/use-toast"
const cacheKey = 'bookmarks'

export default function BookmarkManager() {
    const [searchQuery, setSearchQuery] = useState("")
    const { toast } = useToast()
    const [selectedTag, setSelectedTag] = useState<BookmarkTagWithCount | null>(null)
    const { data: bookmarks = [], mutate } = useLocalStorageRequest(() => getAllBookmarks(
        {
            keyword: searchQuery,
            tagId: selectedTag?.id
        }
    ), {
        debounceWait: 500,
        cacheKey,
        setCache: (data) => localStorage.setItem(cacheKey, JSON.stringify(data)),
        getCache: () => JSON.parse(isBrowser() && localStorage.getItem(cacheKey) || '{}'),
        refreshDeps: [searchQuery, selectedTag],
    });
    const {
        state,
    } = useSidebar()
    const onSubmit = useMemoizedFn(async (newBookmark: Bookmark) => {
        mutate(produce(bookmarks, draft => {
            draft.unshift({ ...newBookmark, tags: [] });
        }));
        let updatedBookmark = await getSingleBookmark(newBookmark.id);
        for (let attempt = 0; updatedBookmark?.loading && attempt < 45; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 4000));
            updatedBookmark = await getSingleBookmark(newBookmark.id);
        }
        if (updatedBookmark && !updatedBookmark.loading) {
            mutate(bookmarks => {
                return bookmarks?.map(bookmark => {
                    if (bookmark.id === updatedBookmark.id) {
                        return updatedBookmark;
                    }
                    return bookmark;
                });
            });
            const job = await getAiJobStatus(newBookmark.id);
            toast({ title: job?.status === 'FAILED' ? 'AI 摘要生成失败，可在书签中重试' : job?.status === 'DONE' ? 'AI 摘要生成成功' : '书签已保存', variant: job?.status === 'FAILED' ? 'destructive' : 'default' });
        } else {
            toast({ title: '摘要仍在处理中', description: '稍后刷新书签查看结果。' });
        }
    })
    console.log()
    return (
        <div className="relative  w-full ">
            <div className={`h-full p-4 ${state === 'expanded' ? 'md:ml-64' : ''} duration-200 space-y-4`} >
                <div className="flex items-center gap-4 ">
                    <div className="flex-1">
                        <div className="relative flex items-center gap-2">
                            <BookmarkSidebar selectedTag={selectedTag} onSelectTag={setSelectedTag} />
                            <div className="relative flex-1">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="搜索"
                                    className="pl-8"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>
                {(searchQuery || selectedTag) && (
                    <div className="flex items-center gap-2">
                        {searchQuery && (
                            <>
                                <Label className="text-muted-foreground">搜索关键字：</Label>
                                <Button
                                    size="sm"
                                    className="h-6"
                                    onClick={() => setSearchQuery('')}
                                >{searchQuery}
                                    <X className="w-4 h-4 ml-1" />
                                </Button>
                            </>
                        )}
                        {selectedTag && (
                            <>
                                <Label className="text-muted-foreground">筛选标签：</Label>
                                <Button
                                    size="sm"
                                    className="h-6"
                                    onClick={() => setSelectedTag(null)}
                                >
                                    {selectedTag.name}
                                    <X className="w-4 h-4 ml-1" />
                                </Button>
                            </>
                        )}
                    </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4  gap-4">
                    <NewBookmarkCard onSubmit={onSubmit} />
                    {bookmarks.map((bookmark) => (
                        <BookmarkCard key={bookmark.id} bookmark={bookmark}
                            setBookmarks={mutate}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}