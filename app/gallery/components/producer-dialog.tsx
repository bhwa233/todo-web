import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  updateProducer,
  createProducer,
  deleteProducer,
} from '@/api/gallery/producer';
import { useState } from 'react';
import { Plus, Pencil, Trash2, AlertCircle } from 'lucide-react';
import { Producer, ProducerType, ProducerTag } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { PRODUCER_TYPE_NAMES } from '@/api/gallery/type';
import { useThrottleFn } from 'ahooks';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { ProducerFormDialog } from './producer-form-dialog';
import useConfigStore from '../../../store/config';

interface ProducerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  producers: (Producer & { tags: ProducerTag[] })[];
  onSuccess?: () => void;
}

interface ProducerFormData {
  name: string;
  producerId: string;
  type: ProducerType;
  tags: ProducerTag[];
}

const TAG_COLORS = [
  {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
  },
  {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-300',
    border: 'border-green-200 dark:border-green-800',
  },
  {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800',
  },
  {
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-700 dark:text-yellow-300',
    border: 'border-yellow-200 dark:border-yellow-800',
  },
  {
    bg: 'bg-pink-100 dark:bg-pink-900/30',
    text: 'text-pink-700 dark:text-pink-300',
    border: 'border-pink-200 dark:border-pink-800',
  },
  {
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-700 dark:text-orange-300',
    border: 'border-orange-200 dark:border-orange-800',
  },
  {
    bg: 'bg-teal-100 dark:bg-teal-900/30',
    text: 'text-teal-700 dark:text-teal-300',
    border: 'border-teal-200 dark:border-teal-800',
  },
  {
    bg: 'bg-indigo-100 dark:bg-indigo-900/30',
    text: 'text-indigo-700 dark:text-indigo-300',
    border: 'border-indigo-200 dark:border-indigo-800',
  },
];

const getTagColor = (tagId: string) => {
  const index =
    [...tagId].reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    TAG_COLORS.length;
  return TAG_COLORS[index];
};

const calculateTagSimilarity = (tags1: ProducerTag[], tags2: ProducerTag[]) => {
  const set1 = new Set(tags1.map((t) => t.id));
  const set2 = new Set(tags2.map((t) => t.id));
  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size; // Jaccard similarity
};

const sortProducersByTags = (
  producers: (Producer & { tags: ProducerTag[] })[],
) => {
  // First sort by name to ensure consistent ordering for items with same tag similarity
  const sortedProducers = [...producers].sort((a, b) =>
    (a.name || '').localeCompare(b.name || ''),
  );

  // If no producers have tags, return alphabetically sorted array
  if (!sortedProducers.some((p) => p.tags.length > 0)) {
    return sortedProducers;
  }

  const result: (Producer & { tags: ProducerTag[] })[] = [];
  const used = new Set<string>();

  // Start with producers that have tags
  for (let i = 0; i < sortedProducers.length; i++) {
    if (used.has(sortedProducers[i].id) || sortedProducers[i].tags.length === 0)
      continue;

    const current = sortedProducers[i];
    result.push(current);
    used.add(current.id);

    // Find similar producers
    const similar = sortedProducers
      .filter((p) => !used.has(p.id) && p.tags.length > 0)
      .map((p) => ({
        producer: p,
        similarity: calculateTagSimilarity(current.tags, p.tags),
      }))
      .filter(({ similarity }) => similarity > 0)
      .sort((a, b) => b.similarity - a.similarity);

    // Add similar producers
    for (const { producer } of similar) {
      result.push(producer);
      used.add(producer.id);
    }
  }

  // Add remaining producers (those without tags)
  sortedProducers.filter((p) => !used.has(p.id)).forEach((p) => result.push(p));

  return result;
};

export function ProducerDialog({
  open,
  onOpenChange,
  producers = [],
  onSuccess,
}: ProducerDialogProps) {
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingProducer, setEditingProducer] = useState<
    (Producer & { tags: ProducerTag[] }) | null
  >(null);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const { config } = useConfigStore();
  const editCode = config.codeConfig.editCode;

  const { run: handleDelete } = useThrottleFn(
    async (id: string, name: string) => {
      if (!confirm(`确定要删除制作者 "${name || '未命名'}" 吗？`)) return;
      try {
        await deleteProducer(id, editCode);
        onSuccess?.();
        toast({
          title: '删除成功',
          description: `制作者 "${name || '未命名'}" 已删除`,
        });
      } catch (error) {
        console.error('删除失败:', error);
        toast({
          title: '删除失败',
          description: error instanceof Error ? error.message : '请重试',
          variant: 'destructive',
        });
      }
    },
    { wait: 1000 },
  );

  const handleAdd = () => {
    setFormMode('create');
    setEditingProducer(null);
    setFormDialogOpen(true);
  };

  const handleEdit = (producer: Producer & { tags: ProducerTag[] }) => {
    setFormMode('edit');
    setEditingProducer(producer);
    setFormDialogOpen(true);
  };

  const handleFormSubmit = async (data: ProducerFormData) => {
    try {
      if (formMode === 'create') {
        await createProducer({
          name: data.name,
          type: data.type,
          producerId: data.producerId,
          editCode,
          tagIds: data.tags.map((tag) => tag.id),
        });
      } else {
        // Edit mode
        await updateProducer({
          id: editingProducer!.id,
          name: data.name,
          type: data.type,
          producerId: data.producerId,
          editCode,
          tagIds: data.tags.map((tag) => tag.id),
        });
      }

      onSuccess?.();
      toast({
        title: '操作成功',
        description: formMode === 'create' ? '制作者已创建' : '制作者已更新',
      });
    } catch (error) {
      console.error('操作失败:', error);
      toast({
        title: '操作失败',
        description: error instanceof Error ? error.message : '请重试',
        variant: 'destructive',
      });
      throw error; // 重新抛出错误，让表单组件处理
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-[90vw] max-h-[90vh] md:h-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              制作者管理
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                {producers.length} 个制作者
              </div>
              <Button
                onClick={handleAdd}
                size="sm"
                className="bg-primary/10 hover:bg-primary/20 text-primary hover:text-primary"
                variant="ghost"
              >
                <Plus className="mr-2 h-4 w-4" />
                添加制作者
              </Button>
            </div>

            <ScrollArea className="h-[60vh] w-full rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[40px]">状态</TableHead>
                    <TableHead className="w-[150px]">名称</TableHead>
                    <TableHead className="w-[120px]">ID</TableHead>
                    <TableHead className="w-[100px]">类型</TableHead>
                    <TableHead className="w-[200px]">标签</TableHead>
                    <TableHead className="w-[100px] text-center">
                      操作
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {producers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-8"
                      >
                        暂无制作者，请添加新制作者
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortProducersByTags(producers).map((producer) => (
                      <TableRow
                        key={producer.id}
                        className="hover:bg-muted/50 transition-colors"
                      >
                        {/* 状态列 */}
                        <TableCell>
                          {!producer.producerId ? (
                            <div title="缺少ID，不可用">
                              <AlertCircle className="h-4 w-4 text-destructive" />
                            </div>
                          ) : (
                            <div title="正常">
                              <div className="h-4 w-4 rounded-full bg-green-500" />
                            </div>
                          )}
                        </TableCell>

                        {/* 名称列 */}
                        <TableCell>
                          <span
                            className={cn(
                              !producer.producerId && 'text-muted-foreground',
                            )}
                          >
                            {producer.name || '未命名'}
                          </span>
                        </TableCell>

                        {/* ID列 */}
                        <TableCell>
                          <span
                            className={cn(
                              'font-mono text-sm',
                              !producer.producerId && 'text-destructive',
                            )}
                            title={producer.producerId || '缺少ID'}
                          >
                            {producer.producerId || '未设置'}
                          </span>
                        </TableCell>

                        {/* 类型列 */}
                        <TableCell>
                          <span>{PRODUCER_TYPE_NAMES[producer.type]}</span>
                        </TableCell>

                        {/* 标签列 */}
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {producer.tags.slice(0, 2).map((tag) => {
                              const color = getTagColor(tag.id);
                              return (
                                <Badge
                                  key={tag.id}
                                  variant="outline"
                                  className={cn(
                                    'text-xs px-1.5 py-0.5',
                                    color.bg,
                                    color.text,
                                    color.border,
                                  )}
                                >
                                  {tag.name}
                                </Badge>
                              );
                            })}
                            {producer.tags.length > 2 && (
                              <Badge
                                variant="outline"
                                className="text-xs px-1.5 py-0.5"
                              >
                                +{producer.tags.length - 2}
                              </Badge>
                            )}
                            {producer.tags.length === 0 && (
                              <span className="text-xs text-muted-foreground">
                                无标签
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* 操作列 */}
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            <Button
                              onClick={() => handleEdit(producer)}
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs hover:bg-background/80"
                              title="编辑制作者"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              onClick={() =>
                                handleDelete(producer.id, producer.name || '')
                              }
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs hover:bg-destructive/10 text-destructive hover:text-destructive"
                              title="删除制作者"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* 表单弹窗 */}
      <ProducerFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        producer={editingProducer}
        mode={formMode}
        onSubmit={handleFormSubmit}
      />
    </>
  );
}
