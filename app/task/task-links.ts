export function taskLinkDetails(href: string, label = '') {
  let url: URL;
  try {
    url = new URL(href);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
  } catch {
    return null;
  }
  let named = label.trim();
  let suffix = '';
  // GFM adds a protocol to www links and includes some Chinese punctuation
  // in bare URLs. Keep prose punctuation outside the link, but preserve encoded
  // punctuation and explicitly named Markdown destinations.
  try {
    const source = named.startsWith('www.')
      ? `${url.protocol}//${named}`
      : named;
    if (new URL(source).href === url.href) {
      suffix = source.match(/[，。；！？、]+$/u)?.[0] ?? '';
      if (suffix) {
        href = source.slice(0, -suffix.length);
        url = new URL(href);
      }
      named = '';
    }
  } catch {
    /* A normal, manually supplied label is not a URL. */
  }
  let anchor = '';
  try {
    anchor = decodeURIComponent(url.hash.slice(1).split(':~:text=')[0])
      .replace(/^\d+(?:[._-]\d+)*[-_.、\s]+/, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    const chineseTitle = (anchor.match(/\p{Script=Han}/gu) ?? []).length >= 4;
    const words = anchor.split(/\s+/);
    const englishTitle =
      words.length >= 3 && words.every((word) => /^[a-z]{2,}$/i.test(word));
    if ((!chineseTitle && !englishTitle) || /[/?=&%]/.test(anchor)) anchor = '';
  } catch {
    anchor = '';
  }
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    /* Keep malformed escapes readable. */
  }
  const fallback = `${url.host}${path === '/' ? '' : path}`;
  const short = Array.from(fallback);
  url.hash = '';
  return {
    href,
    suffix,
    preferredTitle: named || anchor,
    fallback: short.length > 80 ? `${short.slice(0, 77).join('')}…` : fallback,
    domain: url.host,
    pageUrl: url.href,
  };
}
