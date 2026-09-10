import { describe, expect, it } from 'vitest';
import type { Task } from './taskActions';
import {
  changeCompletedSummary,
  matchesCompletedTask,
  mergeCompletedTasks,
} from './completedTasks';

const query = { search: 'review', tag: 'all', status: 'all' };
const task = (id: string, changes: Partial<Task> = {}): Task => ({
  id,
  name: 'Review work',
  remark: '',
  status: '1',
  priority: null,
  tags: [],
  deletedAt: null,
  createTime: new Date('2026-09-01'),
  updateTime: new Date('2026-09-01'),
  ...changes,
});

describe('completed task page updates', () => {
  it('reopening and rolling back a task restores both totals without counting unrelated matches', () => {
    const before = { total: 48, matching: 3 };
    const done = task('one');
    const reopened = { ...done, status: '2' };
    const after = changeCompletedSummary(before, done, reopened, query);
    expect(after).toEqual({ total: 47, matching: 2 });
    expect(changeCompletedSummary(after, reopened, done, query)).toEqual(
      before,
    );
    expect(
      changeCompletedSummary(
        before,
        undefined,
        task('other', { name: 'Read a book' }),
        query,
      ),
    ).toEqual({ total: 49, matching: 3 });
  });

  it('merges overlapping pages by identity and orders equal timestamps deterministically', () => {
    const initial = [task('b'), task('a')];
    const newer = task('a', {
      name: 'Updated title',
      updateTime: new Date('2026-09-02'),
    });
    const merged = mergeCompletedTasks(initial, [newer, task('c')]);
    expect(merged.map((item) => item.id)).toEqual(['a', 'c', 'b']);
    expect(merged[0].name).toBe('Updated title');
    expect(initial[1].name).toBe('Review work');
  });

  it('searches tags and ignores deleted tags when matching untagged completed tasks', () => {
    const hidden = {
      id: 'old',
      name: 'Review',
      remark: null,
      createTime: new Date(),
      updateTime: new Date(),
      deletedAt: new Date(),
    };
    const item = task('tagged', { name: 'Plan', tags: [hidden] });
    expect(matchesCompletedTask(item, query)).toBe(false);
    expect(
      matchesCompletedTask(item, { ...query, search: '', tag: 'untagged' }),
    ).toBe(true);
    expect(
      matchesCompletedTask(
        { ...item, tags: [{ ...hidden, deletedAt: null }] },
        query,
      ),
    ).toBe(true);
    expect(
      changeCompletedSummary(
        { total: 48, matching: 3 },
        task('one'),
        { ...item, id: 'one' },
        query,
      ),
    ).toEqual({ total: 48, matching: 2 });
  });
});
