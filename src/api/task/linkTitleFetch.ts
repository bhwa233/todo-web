import { lookup, type LookupAddress } from 'node:dns';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';
import axios from 'axios';
import ipaddr from 'ipaddr.js';
import { Parser } from 'htmlparser2';

export function isPublicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

export function publicPageUrl(input: string): URL {
  const url = new URL(input);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port)) ||
    (isIP(host) && !isPublicAddress(host))
  )
    throw new Error('Unsupported page URL');
  url.hash = '';
  return url;
}

async function resolveProxyHostname(
  hostname: string,
): Promise<LookupAddress[]> {
  // Fake-IP proxy DNS uses 198.18.0.0/15 locally. Ask a fixed HTTPS resolver
  // for public A records instead of allowing those non-public socket targets.
  const response = await axios.get('https://cloudflare-dns.com/dns-query', {
    adapter: 'http',
    proxy: false,
    timeout: 2500,
    maxRedirects: 0,
    maxContentLength: 16384,
    responseType: 'json',
    params: { name: hostname, type: 'A' },
    headers: { Accept: 'application/dns-json' },
  });
  const answers: { type: number; data: string }[] =
    response.data?.Status === 0 && Array.isArray(response.data.Answer)
      ? response.data.Answer
      : [];
  return answers
    .filter((answer) => answer.type === 1 && typeof answer.data === 'string')
    .map((answer) => ({ address: answer.data, family: 4 }));
}

// Validate the addresses used by the actual socket, not a separate preflight
// lookup. This also applies to every redirect, and proxy env vars are disabled.
export const publicLookup: LookupFunction = (hostname, options, callback) => {
  const deliver = (addresses: LookupAddress[]) => {
    if (
      !addresses.length ||
      addresses.some(({ address }) => !isPublicAddress(address))
    )
      return callback(new Error('Non-public destination'), '');
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  };
  lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error, '');
    if (
      addresses.length &&
      addresses.every(
        ({ address }) =>
          isIP(address) === 4 &&
          ipaddr.parse(address).match(ipaddr.parseCIDR('198.18.0.0/15')),
      )
    ) {
      resolveProxyHostname(hostname).then(deliver, (cause) =>
        callback(cause, ''),
      );
    } else deliver(addresses);
  });
};

// Parse only a bounded HTML head. htmlparser2 handles attribute order, quoting,
// entities and malformed HTML; no regex-based HTML parser is needed.
export async function readPageTitle(stream: Readable, contentType: string) {
  let title = '',
    ogTitle = '',
    twitterTitle = '',
    inTitle = false,
    finished = false;
  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (name === 'body') {
          finished = true;
          parser.pause();
        }
        if (name === 'title') inTitle = true;
        if (name === 'meta') {
          const key = (attrs.property || attrs.name || '').toLowerCase();
          if (key === 'og:title' && !ogTitle) ogTitle = attrs.content || '';
          if (key === 'twitter:title' && !twitterTitle)
            twitterTitle = attrs.content || '';
        }
      },
      ontext(text) {
        if (inTitle) title += text;
      },
      onclosetag(name) {
        if (name === 'title') inTitle = false;
        if (name === 'head') {
          finished = true;
          parser.pause();
        }
      },
    },
    { decodeEntities: true },
  );
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(
      /charset=["']?([^;\s"']+)/i.exec(contentType)?.[1] || 'utf-8',
    );
  } catch {
    decoder = new TextDecoder();
  }
  let remaining = 256 * 1024;
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const part = bytes.subarray(0, remaining);
      parser.write(decoder.decode(part, { stream: true }));
      remaining -= part.length;
      if (finished || remaining <= 0) break;
    }
    if (!finished) parser.end(decoder.decode());
  } finally {
    stream.destroy();
  }
  return (
    [ogTitle, twitterTitle, title]
      .map((value) => value.replace(/\s+/g, ' ').trim())
      .find(Boolean)
      ?.slice(0, 300) || null
  );
}

export async function fetchPageTitle(input: string): Promise<string | null> {
  let url = publicPageUrl(input);
  const httpAgent = new HttpAgent({ lookup: publicLookup });
  const httpsAgent = new HttpsAgent({ lookup: publicLookup });
  const signal = AbortSignal.timeout(7000);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await axios.get<Readable>(url.href, {
        adapter: 'http',
        proxy: false,
        httpAgent,
        httpsAgent,
        responseType: 'stream',
        timeout: 5000,
        signal,
        maxRedirects: 0,
        validateStatus: () => true,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'ToDo-LinkPreview/1.0',
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        response.data.destroy();
        if (!response.headers.location || redirects === 3) return null;
        url = publicPageUrl(new URL(response.headers.location, url).href);
        continue;
      }
      const type = String(response.headers['content-type'] || '');
      if (
        response.status < 200 ||
        response.status >= 300 ||
        !/^(text\/html|application\/xhtml\+xml)\b/i.test(type)
      ) {
        response.data.destroy();
        return null;
      }
      return await readPageTitle(response.data, type);
    }
    return null;
  } finally {
    httpAgent.destroy();
    httpsAgent.destroy();
  }
}
