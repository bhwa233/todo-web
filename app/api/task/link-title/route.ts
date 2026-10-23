import { currentRole } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { fetchPageTitle, publicPageUrl } from '@/api/task/linkTitleFetch';

export const runtime = 'nodejs';
const cachedTitle = unstable_cache(fetchPageTitle, ['task-link-title-v1'], {
  revalidate: 86400,
});

export async function GET(request: NextRequest) {
  if (await currentRole() !== 'admin') return NextResponse.json({ title: null }, { status: 401 });
  const input = request.nextUrl.searchParams.get('url');
  let url: URL;
  try {
    if (!input || input.length > 4096) throw new Error('Invalid URL');
    url = publicPageUrl(input);
  } catch {
    return NextResponse.json({ title: null }, { status: 400 });
  }
  try {
    const title = await cachedTitle(url.href);
    return NextResponse.json(
      { title },
      { headers: { 'Cache-Control': 'private, max-age=3600' } },
    );
  } catch (error) {
    // An unavailable title never prevents the original link from being used.
    console.warn('link_preview_failed', error instanceof Error ? error.name : 'UnknownError', error instanceof Error ? error.stack?.split('\n').slice(1, 3) : []);
    return NextResponse.json(
      { title: null },
      { headers: { 'Cache-Control': 'private, max-age=300' } },
    );
  }
}
