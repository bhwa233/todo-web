import { Readable } from 'node:stream';
import { beforeEach, expect, it, vi } from 'vitest';
import axios from 'axios';
import { lookup } from 'node:dns';
import {
  fetchPageTitle,
  isPublicAddress,
  publicLookup,
  publicPageUrl,
  readPageTitle,
} from './linkTitleFetch';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('node:dns', () => ({ lookup: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it('reads the head across chunks, prefers Open Graph, decodes entities, and stops before the body', async () => {
  const stream = Readable.from([
    '<head><title>Site &amp; ',
    'news</title><meta content=" A &quot;quoted&quot; story " property="og:title"></head>',
    '<body><meta property="og:title" content="wrong"></body>',
  ]);
  expect(await readPageTitle(stream, 'text/html')).toBe('A "quoted" story');
  expect(stream.destroyed).toBe(true);
  expect(
    await readPageTitle(
      Readable.from(['<title>  Plain\n title &amp; notes </title>']),
      'text/html',
    ),
  ).toBe('Plain title & notes');
});

it('limits title reads even when a page never finishes its head', async () => {
  let reads = 0;
  const stream = Readable.from(
    (async function* () {
      while (reads < 100) {
        reads++;
        yield Buffer.alloc(65536, 32);
      }
    })(),
  );
  expect(await readPageTitle(stream, 'text/html')).toBeNull();
  expect(reads).toBeLessThan(10);
  expect(stream.destroyed).toBe(true);
});

it('rejects private and disguised IPs including IPv6 mappings, protocols, and credentials', () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '100.64.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])
    expect(isPublicAddress(address), address).toBe(false);
  expect(isPublicAddress('1.1.1.1')).toBe(true);
  expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  for (const url of [
    'http://2130706433',
    'http://0x7f000001',
    'http://[::ffff:127.0.0.1]',
    'file:///etc/hosts',
    'https://user:pass@example.com',
    'http://example.com:8080',
  ])
    expect(() => publicPageUrl(url), url).toThrow();
});

it('rejects a DNS answer containing any private address before supplying an address to the socket', () => {
  const callback = vi.fn();
  publicLookup('example.com', { all: true }, callback);
  const resolve = (
    vi.mocked(lookup).mock.calls[0] as unknown[]
  )[2] as unknown as (
    error: null,
    addresses: { address: string; family: number }[],
  ) => void;
  resolve(null, [
    { address: '1.1.1.1', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]);
  expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
});

it('checks redirect destinations before making another request', async () => {
  const stream = Readable.from([]);
  vi.mocked(axios.get).mockResolvedValueOnce({
    status: 302,
    headers: { location: 'http://169.254.169.254/latest/meta-data/' },
    data: stream,
  });
  await expect(fetchPageTitle('https://example.com')).rejects.toThrow();
  expect(axios.get).toHaveBeenCalledTimes(1);
  expect(stream.destroyed).toBe(true);
});

it('replaces fake proxy DNS with a verified public answer and still rejects private resolver answers', async () => {
  for (const address of ['1.1.1.1', '127.0.0.1']) {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { Status: 0, Answer: [{ type: 1, data: address }] },
    });
    const result = new Promise<unknown[]>((done) => {
      publicLookup('example.com', {}, (...args) => done(args));
    });
    const resolve = (
      vi.mocked(lookup).mock.calls.at(-1) as unknown[]
    )[2] as unknown as (
      error: null,
      addresses: { address: string; family: number }[],
    ) => void;
    resolve(null, [{ address: '198.18.1.2', family: 4 }]);
    const args = await result;
    if (address === '1.1.1.1') expect(args).toEqual([null, '1.1.1.1', 4]);
    else expect(args[0]).toBeInstanceOf(Error);
  }
});
