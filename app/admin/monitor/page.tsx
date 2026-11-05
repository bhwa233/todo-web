import { permanentRedirect } from 'next/navigation';
import { downloaderAdminUrl } from '@/lib/downloader-admin';

export default async function MonitorRedirect({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  permanentRedirect(downloaderAdminUrl(params));
}
