import { expect, it } from 'vitest';
import { normalizeTaskTagNames } from './taskTagNames';

it('merges typed duplicates without changing the first tag spelling or order', () => {
  const names = [
    ' 工作 ',
    'Work',
    '',
    'work ',
    '工作',
    '项目 A',
    '项目A',
    '  ',
  ];
  expect(normalizeTaskTagNames(names)).toEqual([
    '工作',
    'Work',
    '项目 A',
    '项目A',
  ]);
  expect(names[0]).toBe(' 工作 ');
});
