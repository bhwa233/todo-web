import { Readable } from 'node:stream';
import { isIP } from 'node:net';
import {
  isPublicAddress,
  publicPageUrl,
  readPageTitle,
} from './linkTitleFetch';

async function addresses(
  hostname: string,
  signal: AbortSignal,
): Promise<string[]> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return isPublicAddress(host) ? [host] : [];
  const results = await Promise.all(
    ['A', 'AAAA'].map(async (type) => {
      const url = new URL('https://cloudflare-dns.com/dns-query');
      url.searchParams.set('name', host);
      url.searchParams.set('type', type);
      const response = await fetch(url, {
        headers: { Accept: 'application/dns-json' },
        redirect: 'manual',
        signal,
      });
      if (!response.ok || !response.body)
        throw new Error('DNS resolution failed');
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 16384) {
            await reader.cancel();
            throw new Error('DNS response too large');
          }
          chunks.push(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        Status?: number;
        Answer?: { type: number; data: string }[];
      };
      if (body.Status !== 0) return [];
      return (body.Answer ?? [])
        .filter((a) => a.type === 1 || a.type === 28)
        .map((a) => a.data);
    }),
  );
  const found = results.flat();
  if (!found.length || found.some((ip) => !isPublicAddress(ip)))
    throw new Error('Non-public destination');
  return found;
}

// Use the Worker's global public-internet fetch, never a VPC/Tunnel binding.
// workerd's public network excludes private addresses at connection time, so a
// DNS change between the additional DoH check and fetch cannot reach a private
// service. Every redirect is revalidated; no cookies or authorization are sent.
// See https://github.com/cloudflare/workerd/discussions/1523.
export async function fetchWorkerPageMetadata(
  input: string,
  validateUrl?: (url: URL) => void,
) {
  let url = publicPageUrl(input);
  const signal = AbortSignal.timeout(7000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    validateUrl?.(url);
    await addresses(url.hostname, signal);
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'ToDo-LinkPreview/1.0',
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      void response.body?.cancel().catch(() => undefined);
      const location = response.headers.get('location');
      if (!location || redirects === 3) return null;
      url = publicPageUrl(new URL(location, url).href);
      continue;
    }
    const type = response.headers.get('content-type') ?? '';
    if (
      !response.ok ||
      !response.body ||
      !/^(text\/html|application\/xhtml\+xml)/i.test(type)
    ) {
      void response.body?.cancel().catch(() => undefined);
      return { url: url.href, title: null };
    }
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      while (size < 262144) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        const part = Buffer.from(value.subarray(0, 262144 - size));
        chunks.push(part);
        size += part.length;
      }
    } finally {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    return {
      url: url.href,
      title: await readPageTitle(Readable.from([Buffer.concat(chunks)]), type),
    };
  }
  return null;
}
