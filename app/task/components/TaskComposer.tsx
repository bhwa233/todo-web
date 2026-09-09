'use client';

import { useRef, useState } from 'react';
import { Priority } from '@prisma/client';
import { Loader2, Plus } from 'lucide-react';
import { createTask, type Task } from '@/api/task/taskActions';
import { AutosizeTextarea } from '@/components/ui/AutosizeTextarea';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  priorities,
  priorityConfig,
  statuses,
  statusConfig,
  TASK_STATUS,
  type TaskCreationDefaults,
  type TaskStatus,
} from '../task-model';

export default function TaskComposer({
  defaults,
  onCreated,
  onClose,
  onRestoreFocus,
  disabled,
}: {
  defaults: TaskCreationDefaults;
  onCreated: (task: Task) => void;
  onClose: () => void;
  onRestoreFocus: () => void;
  disabled: boolean;
}) {
  const [name, setName] = useState('');
  const [priority, setPriority] = useState(
    defaults.priority ?? Priority.NOT_IMPORTANT_NOT_URGENT,
  );
  const [status, setStatus] = useState<TaskStatus>(
    defaults.status ?? TASK_STATUS.TODO,
  );
  const [creating, setCreating] = useState(false);
  const createLock = useRef(false);
  const { toast } = useToast();
  async function addTask() {
    if (!name.trim() || disabled || createLock.current) return;
    createLock.current = true;
    setCreating(true);
    try {
      const task = await createTask({
        name: name.trim(),
        remark: '',
        priority,
        status,
      });
      onCreated(task);
      onClose();
    } catch {
      toast({
        title: '添加失败',
        description: '内容已保留，请重试。',
        variant: 'destructive',
      });
    } finally {
      createLock.current = false;
      setCreating(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !createLock.current) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
        onEscapeKeyDown={(event) => {
          if (createLock.current) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (createLock.current) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>新增任务</DialogTitle>
          <DialogDescription>
            记下要做的事，AI 将自动生成标签。
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void addTask();
          }}
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="new-task" className="text-sm font-medium">
              任务内容
            </label>
            <AutosizeTextarea
              id="new-task"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={creating}
              placeholder="准备做些什么？"
              minHeight={112}
              maxHeight={240}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void addTask();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Enter 添加 · Shift + Enter 换行
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-2">
              <label
                htmlFor="new-task-priority"
                className="text-sm font-medium"
              >
                优先级
              </label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as Priority)}
                disabled={creating}
              >
                <SelectTrigger id="new-task-priority" aria-label="新任务优先级">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {priorities.map((value) => (
                      <SelectItem key={value} value={value}>
                        {priorityConfig[value].label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor="new-task-status" className="text-sm font-medium">
                状态
              </label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as TaskStatus)}
                disabled={creating}
              >
                <SelectTrigger id="new-task-status" aria-label="新任务状态">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statuses.map((value) => (
                      <SelectItem key={value} value={value}>
                        {statusConfig[value].label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={creating}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={creating || disabled || !name.trim()}
            >
              {creating ? <Loader2 className="animate-spin" /> : <Plus />}
              添加任务
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
