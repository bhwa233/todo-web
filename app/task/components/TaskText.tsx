'use client';

import { Children, memo, useRef } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useInViewport, useRequest } from 'ahooks';
import { Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { taskLinkDetails } from '../task-links';

const plugins = [remarkGfm];
const allowedElements = ['a', 'p', 'br'];

function TaskLink({
  href,
  details,
}: {
  href: string;
  details: NonNullable<ReturnType<typeof taskLinkDetails>>;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [visible] = useInViewport(ref);
  const { data } = useRequest(
    async () => {
      const response = await fetch(
        `/api/task/link-title?${new URLSearchParams({ url: details.pageUrl })}`,
      );
      if (!response.ok) return null;
      const result = await response.json();
      return typeof result.title === 'string' ? result.title : null;
    },
    {
      ready: !!visible && !details.preferredTitle,
      cacheKey: `task-link-title:${details.pageUrl}`,
      staleTime: 5 * 60 * 1000,
      cacheTime: 60 * 60 * 1000,
    },
  );
  const title = details.preferredTitle || data || details.fallback;
  return (
    <a
      ref={ref}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      className="my-1 flex min-w-0 max-w-full items-start gap-2 rounded-md border bg-muted/30 px-2.5 py-2 text-foreground no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Link2
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm leading-5 [overflow-wrap:anywhere]">
          {title}
        </span>
        {title !== details.domain && (
          <span className="block truncate text-xs leading-5 text-muted-foreground">
            {details.domain}
          </span>
        )}
      </span>
    </a>
  );
}

const components: Components = {
  p: ({ children }) => (
    <span className="block whitespace-pre-wrap">{children}</span>
  ),
  a: ({ href, children }) => {
    const label = Children.toArray(children)
      .filter((child) => typeof child === 'string' || typeof child === 'number')
      .join('');
    const details = href ? taskLinkDetails(href, label) : null;
    return details && href ? (
      <>
        <TaskLink key={details.href} href={details.href} details={details} />
        {details.suffix}
      </>
    ) : (
      <span>{children}</span>
    );
  },
};

// Use the installed Markdown renderer and GFM's autolinks. Task-specific code
// only supplies link presentation; URL tokenization remains in the library.
export default memo(function TaskText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={cn('block min-w-0 [overflow-wrap:anywhere]', className)}>
      <Markdown
        remarkPlugins={plugins}
        components={components}
        allowedElements={allowedElements}
        unwrapDisallowed
      >
        {text}
      </Markdown>
    </span>
  );
});
