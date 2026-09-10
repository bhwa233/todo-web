import { expect, it } from 'vitest';
import { taskLinkDetails } from './task-links';

it('prefers a named link or decoded section title without sending its fragment to the title fetcher', () => {
  const href =
    'https://blog.bhwa233.com/posts/reddit-2026-09-06-life/?from=task#29-' +
    encodeURIComponent('哪些电视剧从头到尾一季都没有拉胯');
  expect(taskLinkDetails(href, href)).toMatchObject({
    preferredTitle: '哪些电视剧从头到尾一季都没有拉胯',
    domain: 'blog.bhwa233.com',
    pageUrl: 'https://blog.bhwa233.com/posts/reddit-2026-09-06-life/?from=task',
  });
  expect(taskLinkDetails(href, '周末片单')?.preferredTitle).toBe('周末片单');
});

it('uses a short path for generic or broken fragments and refuses non-web destinations', () => {
  for (const fragment of [
    'comments',
    'section-3',
    'a50a1f0e-389a-4f12-b176-a949c300ace4',
    '%E0%A4%A',
  ]) {
    expect(
      taskLinkDetails(`https://example.com/read?token=secret#${fragment}`),
    ).toMatchObject({
      preferredTitle: '',
      fallback: 'example.com/read',
    });
  }
  for (const href of [
    'javascript:alert(1)',
    'data:text/html,<h1>x</h1>',
    '/relative',
    'https://',
  ])
    expect(taskLinkDetails(href)).toBeNull();
});

it('separates Chinese sentence punctuation in autolinks without changing encoded punctuation or named destinations', () => {
  const href = 'https://example.com/a_(b)?x=1&y=2#comments';
  expect(taskLinkDetails(href + '%EF%BC%8C', href + '，')).toMatchObject({
    href,
    suffix: '，',
  });
  expect(taskLinkDetails(href + '%EF%BC%8C', href + '%EF%BC%8C')).toMatchObject(
    { href: href + '%EF%BC%8C', suffix: '' },
  );
  expect(taskLinkDetails(href + '%EF%BC%8C', '我的资料')).toMatchObject({
    href: href + '%EF%BC%8C',
    preferredTitle: '我的资料',
  });
  expect(
    taskLinkDetails('http://www.example.com/', 'www.example.com')
      ?.preferredTitle,
  ).toBe('');
});
