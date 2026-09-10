'use client';

import { useRef, useState } from 'react';
import { Priority } from '@prisma/client';
import { Loader2, Plus, Save } from 'lucide-react';
import { createTask, type Task } from '@/api/task/taskActions';
import TaskTagInput from './TaskTagInput';
import { normalizeTaskTagNames } from '@/api/task/taskTagNames';
import { Textarea } from '@/components/ui/textarea';
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
  type UpdateTask,
  taskPriority,
  taskStatus,
} from '../task-model';

export default function TaskComposer({
  defaults,
  task,
  tags,
  onSave,
  onCreated,
  onClose,
  onRestoreFocus,
  disabled,
}: {
  defaults: TaskCreationDefaults;
  task?: Task;
  tags: { name: string }[];
  onSave: UpdateTask;
  onCreated: (task: Task) => void;
  onClose: () => void;
  onRestoreFocus: () => void;
  disabled: boolean;
}) {
  const [name, setName] = useState(task?.name ?? '');
  const [priority, setPriority] = useState(
    task
      ? taskPriority(task)
      : (defaults.priority ?? Priority.NOT_IMPORTANT_NOT_URGENT),
  );
  const [status, setStatus] = useState<TaskStatus>(
    task ? taskStatus(task) : (defaults.status ?? TASK_STATUS.TODO),
  );
  const [remark, setRemark] = useState(task?.remark ?? '');
  const [tagNames, setTagNames] = useState(
    task?.tags.filter((tag) => !tag.deletedAt).map((tag) => tag.name) ?? [],
  );
  const [tagSearch, setTagSearch] = useState('');
  const [tagsTouched, setTagsTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const createLock = useRef(false);
  const { toast } = useToast();
  async function addTask() {
    if (!name.trim() || disabled || createLock.current) return;
    createLock.current = true;
    setCreating(true);
    try {
      const names = normalizeTaskTagNames([...tagNames, tagSearch]);
      const manualNames =
        task || tagsTouched || tagSearch.trim() ? names : undefined;
      const values = {
        name: name.trim(),
        remark: remark.trim(),
        priority,
        status,
      };
      if (task) {
        const saved = await onSave(task.id, {
          ...values,
          tagNames: manualNames,
        });
        if (!saved) return;
      } else {
        const created = await createTask(values, manualNames);
        onCreated(created);
      }
      onClose();
    } catch {
      toast({
        title: task ? '保存失败' : '添加失败',
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
          <DialogTitle>{task ? '编辑任务' : '新增任务'}</DialogTitle>
          <DialogDescription>
            {task
              ? '修改内容和标签，保存后统一生效。'
              : '记下要做的事，手动选择标签，或留空由 AI 生成。'}
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
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="task-remark" className="text-sm font-medium">
              备注
            </label>
            <Textarea
              id="task-remark"
              value={remark}
              disabled={creating}
              onChange={(event) => setRemark(event.target.value)}
              placeholder="补充说明（可选）"
              rows={2}
            />
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
                <SelectTrigger id="new-task-priority" aria-label="任务优先级">
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
                <SelectTrigger id="new-task-status" aria-label="任务状态">
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
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">标签</legend>
            <TaskTagInput
              value={tagNames}
              options={tags.map((tag) => tag.name)}
              search={tagSearch}
              onSearchChange={setTagSearch}
              disabled={creating}
              onChange={(names) => {
                setTagNames(names);
                setTagsTouched(true);
              }}
            />
          </fieldset>
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
              {creating ? (
                <Loader2 className="animate-spin" />
              ) : task ? (
                <Save />
              ) : (
                <Plus />
              )}
              {task ? '保存修改' : '添加任务'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
