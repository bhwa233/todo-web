'use client';

import { ChevronDown, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { normalizeTaskTagNames } from '@/api/task/taskTagNames';

// Compose the shared Command for keyboard search and selection. MultiSelect's
// uncontrolled selection and immediate-create callback cannot hold dialog drafts.
export default function TaskTagInput({
  value,
  onChange,
  options,
  search,
  onSearchChange,
  disabled,
}: {
  value: string[];
  onChange: (names: string[]) => void;
  options: string[];
  search: string;
  onSearchChange: (search: string) => void;
  disabled: boolean;
}) {
  const query = search.trim().toLocaleLowerCase();
  const known = normalizeTaskTagNames([...options, ...value]);
  const selected = new Set(value.map((name) => name.toLocaleLowerCase()));
  const matches = known.filter(
    (name) =>
      name.toLocaleLowerCase().includes(query) &&
      !selected.has(name.toLocaleLowerCase()),
  );
  const exact = known.some((name) => name.toLocaleLowerCase() === query);
  function add(name: string) {
    if (disabled) return;
    onChange(normalizeTaskTagNames([...value, name]));
    onSearchChange('');
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap gap-1.5" aria-label="已选标签">
        {value.map((name) => (
          <Badge key={name} variant="secondary" className="max-w-full gap-1">
            <span className="break-all">{name}</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-6 shrink-0"
              disabled={disabled}
              aria-label={`移除标签：${name}`}
              onClick={() => onChange(value.filter((item) => item !== name))}
            >
              <X />
            </Button>
          </Badge>
        ))}
      </div>
      <Popover
        onOpenChange={(open) => {
          if (!open) onSearchChange('');
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full justify-between"
            aria-label="选择标签"
          >
            <span>{value.length ? '添加更多标签' : '选择或输入标签'}</span>
            <ChevronDown />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-0"
          aria-label="标签选择"
        >
          <Command
            shouldFilter={false}
            className="h-auto"
            label="搜索或输入标签"
          >
            <CommandInput
              placeholder="搜索标签，或输入新标签名称…"
              disabled={disabled}
              value={search}
              onValueChange={onSearchChange}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229)
                  event.stopPropagation();
              }}
            />
            <CommandList className="max-h-48">
              <CommandEmpty>
                {query && exact ? '该标签已添加' : '输入名称创建新标签'}
              </CommandEmpty>
              <CommandGroup>
                {matches.map((name) => (
                  <CommandItem
                    key={name}
                    value={name}
                    disabled={disabled}
                    onSelect={() => add(name)}
                  >
                    <Plus />
                    <span className="break-all">{name}</span>
                  </CommandItem>
                ))}
                {query && !exact && (
                  <CommandItem
                    value={`create:${query}`}
                    disabled={disabled}
                    onSelect={() => add(search.trim())}
                  >
                    <Plus />
                    <span className="break-all">创建标签：{search.trim()}</span>
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground">
        支持选择已有标签或输入新标签，保存后生效
      </p>
    </div>
  );
}
