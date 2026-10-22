import { connect } from 'cloudflare:sockets';
import { HTTPParser } from 'http-parser-js';
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

// Workers cannot pin fetch() DNS to an arbitrary IP. Connect to the validated
// address directly, verify TLS against the original hostname, and use the
// maintained http-parser-js for HTTP framing/chunked bodies instead of writing
// an HTTP parser. The bound applies to both wire bytes and decoded HTML.
async function pinnedResponse(url: URL, signal: AbortSignal) {
  const ips = await addresses(url.hostname, signal);
  signal.throwIfAborted();
  let socket = connect(
    {
      hostname: ips[0],
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
    },
    {
      secureTransport: url.protocol === 'https:' ? 'starttls' : 'off',
      allowHalfOpen: false,
    },
  );
  let rejectAbort!: (reason: unknown) => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    rejectAbort(signal.reason);
    void socket.close().catch(() => undefined);
  };
  signal.addEventListener('abort', abort, { once: true });
  let phase = 'connect';
  try {
    signal.throwIfAborted();
    await Promise.race([socket.opened, aborted]);
    if (url.protocol === 'https:') {
      phase = 'tls';
      socket = socket.startTls({
        expectedServerHostname: url.hostname.replace(/^\[|\]$/g, ''),
      });
      await Promise.race([socket.opened, aborted]);
    }
    const writer = socket.writable.getWriter();
    phase = 'request';
    await Promise.race([
      writer.write(
        new TextEncoder().encode(
          `GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\nAccept: text/html,application/xhtml+xml\r\nAccept-Encoding: identity\r\nUser-Agent: ToDo-LinkPreview/1.0\r\nConnection: close\r\n\r\n`,
        ),
      ),
      aborted,
    ]);
    writer.releaseLock();
    phase = 'response';
    const parser = new HTTPParser(HTTPParser.RESPONSE);
    parser.maxHeaderSize = 32768;
    const headers = new Headers();
    let status = 0;
    let complete = false;
    let bytes = 0;
    let wireBytes = 0;
    const parts: Buffer[] = [];
    parser[HTTPParser.kOnHeadersComplete] = (info) => {
      status = info.statusCode ?? 0;
      for (let i = 0; i < info.headers.length; i += 2)
        headers.append(info.headers[i], info.headers[i + 1]);
    };
    parser[HTTPParser.kOnBody] = (chunk, offset, length) => {
      const part = chunk.subarray(
        offset,
        offset + Math.min(length, 262144 - bytes),
      );
      parts.push(part);
      bytes += part.length;
    };
    parser[HTTPParser.kOnMessageComplete] = () => {
      complete = true;
    };
    const reader = socket.readable.getReader();
    try {
      while (!complete && bytes < 262144) {
        signal.throwIfAborted();
        const { done, value } = await Promise.race([reader.read(), aborted]);
        if (done) break;
        wireBytes += value.length;
        if (wireBytes > 600000 || (!status && wireBytes > 32768))
          throw new Error('Page response too large');
        const parsed = parser.execute(Buffer.from(value));
        if (parsed instanceof Error) throw parsed;
        if (
          status &&
          (status < 200 ||
            status >= 300 ||
            !/^(text\/html|application\/xhtml\+xml)/i.test(
              headers.get('content-type') ?? '',
            ))
        )
          break;
      }
    } finally {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    if (
      headers.has('content-encoding') &&
      headers.get('content-encoding') !== 'identity'
    )
      throw new Error('Unsupported content encoding');
    return { status, headers, body: Buffer.concat(parts) };
  } catch (error) {
    // Connection errors contain no request headers or model/user content.
    console.warn(
      'link_socket_failed',
      phase,
      error instanceof Error
        ? error.message.replaceAll(url.hostname, '[host]').slice(0, 160)
        : 'Unknown',
    );
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    void socket.close().catch(() => undefined);
  }
}

export async function fetchWorkerPageMetadata(
  input: string,
  validateUrl?: (url: URL) => void,
) {
  let url = publicPageUrl(input);
  const signal = AbortSignal.timeout(7000);
  for (let i = 0; i <= 3; i++) {
    validateUrl?.(url);
    const response = await pinnedResponse(url, signal);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get('location');
      if (!next || i === 3) return null;
      url = publicPageUrl(new URL(next, url).href);
      continue;
    }
    const type = response.headers.get('content-type') ?? '';
    if (
      response.status < 200 ||
      response.status >= 300 ||
      !/^(text\/html|application\/xhtml\+xml)/i.test(type)
    )
      return { url: url.href, title: null };
    return {
      url: url.href,
      title: await readPageTitle(Readable.from([response.body]), type),
    };
  }
  return null;
}
