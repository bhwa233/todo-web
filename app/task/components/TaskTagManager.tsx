'use client';

import { useState } from 'react';
import { Tag, X } from 'lucide-react';
import {
  createTaskTag,
  deleteTaskTag,
  type TaskTag,
} from '@/api/task/tagActions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn, getTagColor } from '@/lib/utils';

export default function TaskTagManager({
  tags,
  onTagCreated,
  onTagDeleted,
}: {
  tags: TaskTag[];
  onTagCreated: (tag: TaskTag) => void;
  onTagDeleted: (id: string) => void;
}) {
  const [tagName, setTagName] = useState('');
  const [tagBusy, setTagBusy] = useState(false);
  const { toast } = useToast();
  async function addTag() {
    if (!tagName.trim() || tagBusy) return;
    setTagBusy(true);
    try {
      onTagCreated(await createTaskTag({ name: tagName.trim() }));
      setTagName('');
    } catch {
      toast({
        title: '标签添加失败',
        description: '请检查名称是否重复后重试。',
        variant: 'destructive',
      });
    } finally {
      setTagBusy(false);
    }
  }
  async function removeTag(id: string) {
    setTagBusy(true);
    try {
      await deleteTaskTag(id);
      onTagDeleted(id);
    } catch {
      toast({ title: '标签删除失败，请重试', variant: 'destructive' });
    } finally {
      setTagBusy(false);
    }
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="管理标签"
          title="管理标签"
        >
          <Tag />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>管理标签</DialogTitle>
          <DialogDescription>
            整理任务标签，方便在所有视图中筛选。
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void addTag();
          }}
        >
          <Input
            aria-label="新标签名称"
            placeholder="新标签名称"
            value={tagName}
            onChange={(event) => setTagName(event.target.value)}
            disabled={tagBusy}
          />
          <Button type="submit" disabled={tagBusy || !tagName.trim()}>
            添加
          </Button>
        </form>
        <div className="flex max-h-72 flex-wrap gap-2 overflow-y-auto">
          {tags.length ? (
            tags.map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className={cn(
                  'max-w-full gap-1 break-all',
                  getTagColor(tag.name),
                )}
              >
                {tag.name}
                <button
                  type="button"
                  aria-label={`删除标签：${tag.name}`}
                  disabled={tagBusy}
                  onClick={() => void removeTag(tag.id)}
                  className="rounded p-1 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">还没有标签</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
