// Fixed-origin public feeds/assets. Forward only public negotiation headers;
// vinext external rewrites otherwise forward the site's session credentials.
export async function publicUpstream(request: Request, target: URL) {
  const headers = new Headers();
  for (const key of [
    'accept',
    'accept-language',
    'range',
    'if-none-match',
    'if-modified-since',
  ]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  const upstream = await fetch(target, {
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('set-cookie');
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
