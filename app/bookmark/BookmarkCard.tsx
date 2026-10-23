import { AiJobControl } from '@/components/ai-job-control';
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { CompleteBookmark, deleteBookmark } from "../../src/api/bookmark"
import { Ellipsis } from "lucide-react";
import { Button } from "../../src/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../src/components/ui/dropdown-menu";
import { useToast } from "../../src/hooks/use-toast";
import dayjs from "dayjs";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../../src/components/ui/hover-card";
import { useState } from "react";
import Image from "next/image"

interface BookmarkCardProps {
    bookmark: CompleteBookmark
    setBookmarks: (bookmarks?: CompleteBookmark[] | ((bookmarks?: CompleteBookmark[]) => CompleteBookmark[])) => void
}

export function BookmarkCard({ bookmark, setBookmarks }: BookmarkCardProps) {
    const { toast } = useToast()
    const [isConfirming, setIsConfirming] = useState(false);

    const handleDelete = async (e: React.MouseEvent) => {
        if (!isConfirming) {
            e.preventDefault();
            setIsConfirming(true);
            return;
        } await deleteBookmark(bookmark.id);
        toast({
            title: '删除成功',
            description: `书签 ${bookmark.title} 删除成功`
        });
        setBookmarks(bookmarks => (bookmarks ? bookmarks.filter(item => item.id !== bookmark.id) : []));
    };

    return (
        <Card className="hover:bg-accent/50 transition-colors "
        >
            <CardHeader className="p-0">
                <div className="w-full">
                    <HoverCard>
                        <HoverCardTrigger asChild>
                            <Image
                                src={bookmark?.image || `https://placehold.co/600x400`}
                                alt={bookmark.title ?? 'Bookmark Image'}
                                width={400}
                                height={600}
                                className="object-cover h-48 w-full  cursor-pointer"
                                onClick={() => window.open(bookmark.url, '_blank')}
                            />
                        </HoverCardTrigger>
                        <HoverCardContent>
                            <div >
                                <p className="text-sm text-muted-foreground">{bookmark?.summary ?? '加载中...'}</p>
                            </div>
                        </HoverCardContent>
                    </HoverCard>
                </div>
            </CardHeader>
            <CardContent className="p-2 space-y-2 relative border-t">
                <h3 className="font-semibold text-lg line-clamp-2" title={bookmark.title || ''}>{bookmark.title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-3" title={bookmark?.summary || bookmark.remark || ''}>{bookmark?.summary || bookmark.remark || '暂无描述'}</p>
                {bookmark.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                        {bookmark.tags.map(tag => (
                            <span key={tag.id} className="bg-gray-200 text-gray-800 text-xs px-2 py-1 rounded">
                                {tag.name}
                            </span>
                        ))}
                    </div>
                )}
                <div className="flex items-center text-sm text-muted-foreground">
                    <span>{bookmark.url ? new URL(bookmark.url).hostname : 'Invalid URL'}</span>
                    <span className="mx-2">•</span>
                    <span>{dayjs(bookmark.createTime).format('YYYY-MM-DD')}</span>
                    <AiJobControl targetId={bookmark.id} />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="ml-auto">
                                <Ellipsis className="w-6 mx-auto " />
                            </Button>
                        </DropdownMenuTrigger>                        <DropdownMenuContent>
                            <>
                                <DropdownMenuItem
                                    className={`cursor-pointer  text-red-500 dark:text-red-400`}
                                    onClick={handleDelete}
                                >
                                    {isConfirming ? '确认删除?' : '删除'}
                                </DropdownMenuItem>
                            </>
                        </DropdownMenuContent>
                    </DropdownMenu>                </div>
            </CardContent>
        </Card>
    )
}