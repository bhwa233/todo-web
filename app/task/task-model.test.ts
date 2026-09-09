import { describe, expect, it } from 'vitest';
import { Priority } from '@prisma/client';
import type { Task } from '../../src/api/task/taskActions';
import { selectTasks, type TaskFilters } from './task-model';

const filters: TaskFilters = {
  search: '',
  tag: 'all',
  status: 'all',
  sort: 'priority',
  descending: true,
};
const task = (id: string, changes: Partial<Task> = {}): Task => ({
  id,
  name: id,
  remark: '',
  status: '0',
  priority: null,
  tags: [],
  deletedAt: null,
  createTime: new Date('2026-09-01T00:00:00Z'),
  updateTime: new Date('2026-09-01T00:00:00Z'),
  ...changes,
});

describe('task view selection', () => {
  it('combines search, tag and in-progress filters without showing deleted tasks', () => {
    const work = {
      id: 'work',
      name: '工作',
      remark: '',
      createTime: new Date(),
      updateTime: new Date(),
      deletedAt: null,
    };
    const source = [
      task('match', { status: '2', remark: 'Review API', tags: [work] }),
      task('wrong-status', { status: '0', remark: 'Review API', tags: [work] }),
      task('wrong-tag', { status: '2', remark: 'Review API' }),
      task('deleted', {
        status: '2',
        remark: 'Review API',
        tags: [work],
        deletedAt: new Date(),
      }),
    ];
    expect(
      selectTasks(source, {
        ...filters,
        search: '  api ',
        tag: 'work',
        status: '2',
      }).map((item) => item.id),
    ).toEqual(['match']);
    expect(
      selectTasks(source, { ...filters, search: '工作', status: '2' }).map(
        (item) => item.id,
      ),
    ).toEqual(['match']);
  });

  it('sorts null priorities last and breaks ties by creation date without mutating data', () => {
    const source = [
      task('no-priority'),
      task('older-important', { priority: Priority.IMPORTANT_URGENT }),
      task('newer-important', {
        priority: Priority.IMPORTANT_URGENT,
        createTime: new Date('2026-09-02T00:00:00Z'),
      }),
    ];
    expect(selectTasks(source, filters).map((item) => item.id)).toEqual([
      'newer-important',
      'older-important',
      'no-priority',
    ]);
    expect(source.map((item) => item.id)).toEqual([
      'no-priority',
      'older-important',
      'newer-important',
    ]);
  });

  it('sorts workflow states in execution order, independently of persisted numeric values', () => {
    const source = [
      task('done', { status: '1' }),
      task('started', { status: '2' }),
      task('todo'),
    ];
    expect(
      selectTasks(source, {
        ...filters,
        sort: 'status',
        descending: false,
      }).map((item) => item.id),
    ).toEqual(['todo', 'started', 'done']);
    expect(
      selectTasks(source, { ...filters, sort: 'status', descending: true }).map(
        (item) => item.id,
      ),
    ).toEqual(['done', 'started', 'todo']);
  });
});
