const ADMIN_URL = 'https://admin.bhwa233.com/zh/admin/downloader';
const FILTERS = ['tab', 'platform', 'parsedHost', 'urlSearch', 'success', 'errorCode', 'startDate', 'endDate', 'pageSize',
  'parsePage', 'downloadPage', 'feedbackPage', 'domainPage', 'domainQuery', 'domainSortBy', 'domainSortOrder',
  'downloadGroupPage', 'downloadGroupBy', 'q', 'type', 'status', 'path', 'downloadType', 'stage', 'autoRefresh'];

// Only filter state crosses the domain boundary. Own-session credentials and
// arbitrary redirect targets are never copied to the admin URL.
export function downloaderAdminUrl(params: URLSearchParams) {
  const target = new URL(ADMIN_URL);
  for (const key of FILTERS) for (const value of params.getAll(key)) target.searchParams.append(key, value);
  for (const [oldKey, newKey] of [['url', 'urlSearch'], ['requestDomain', 'parsedHost'], ['page', 'parsePage'], ['sortBy', 'domainSortBy'], ['sortOrder', 'domainSortOrder']]) {
    const value = params.get(oldKey);
    if (value && !target.searchParams.has(newKey)) target.searchParams.set(newKey, value);
  }
  return target.href;
}
