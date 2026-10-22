import { sessionRole, SESSION_COOKIE } from '@/lib/auth-session';
import { NextRequest, NextResponse } from 'next/server';

import { aggregateAdminRequests } from '@/api/admin/aggregation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_MONITOR_BASE_URL = 'http://127.0.0.1:8787';
const MONITOR_API_ENV = 'MONITOR_API';
const MONITOR_API_KEY_ENV = 'MONITOR_API_KEY';
const MAX_UPSTREAM_PAGE_SIZE = 500;

type MonitorTarget = 'health' | 'aggregate' | 'requests' | 'requestDomains' | 'feedback';

type UpstreamErrorEnvelope = {
  success?: boolean;
  code?: string;
  status?: number;
  requestId?: string;
  details?: Record<string, unknown>;
  message?: string;
};

type UpstreamRequestItem = {
  id?: unknown;
  createdAt?: unknown;
  timestamp?: unknown;
  platform?: unknown;
  parsedHost?: unknown;
  requestSource?: unknown;
  requestHost?: unknown;
  requestDomain?: unknown;
  sourceDomain?: unknown;
  success?: unknown;
  errorCode?: unknown;
  errorMessage?: unknown;
  message?: unknown;
  requestId?: unknown;
  url?: unknown;
  rawUrl?: unknown;
};

type UpstreamRequestPage = {
  items?: UpstreamRequestItem[];
  pagination?: {
    page?: unknown;
    pageSize?: unknown;
    total?: unknown;
    totalPages?: unknown;
  };
  filters?: Record<string, unknown>;
};

type UpstreamRequestAggregatePage = {
  items?: Array<Record<string, unknown>>;
  pagination?: {
    page?: unknown;
    pageSize?: unknown;
    total?: unknown;
    totalPages?: unknown;
  };
  filters?: Record<string, unknown>;
};

class UpstreamMonitorError extends Error {
  status: number;
  payload: unknown;
  requestId?: string;

  constructor(status: number, payload: unknown, requestId?: string) {
    super('upstream monitor request failed');
    this.name = 'UpstreamMonitorError';
    this.status = status;
    this.payload = payload;
    this.requestId = requestId;
  }
}

const isAdminRequest = async (request: NextRequest) =>
  await sessionRole(request.cookies.get(SESSION_COOKIE)?.value) === 'admin';

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const toString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return `${value}`;
  }
  return fallback;
};

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

const toBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true;
    }
    if (value.toLowerCase() === 'false') {
      return false;
    }
  }
  return undefined;
};

const appendQuery = (
  params: URLSearchParams,
  key: string,
  value: string | number | boolean | undefined,
) => {
  if (value === undefined) {
    return;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return;
  }
  params.set(key, `${value}`);
};

const getBaseUrl = () => {
  const value = process.env[MONITOR_API_ENV] || DEFAULT_MONITOR_BASE_URL;
  return value.endsWith('/') ? value : `${value}/`;
};

const buildUpstreamUrl = (
  target: 'health' | 'stats' | 'statsAggregate' | 'statsOverview' | 'feedback',
  query?: Record<string, string | number | boolean | undefined>,
) => {
  const upstreamPath =
    target === 'health'
      ? '/api/health'
      : target === 'feedback'
        ? '/api/admin/feedback'
      : target === 'statsOverview'
        ? '/api/admin/stats/overview'
        : target === 'statsAggregate'
          ? '/api/admin/stats/aggregate'
          : '/api/admin/stats';
  const url = new URL(upstreamPath, getBaseUrl());

  if (query) {
    Object.entries(query).forEach(([key, value]) =>
      appendQuery(url.searchParams, key, value),
    );
  }

  return url;
};

const createJsonResponse = (
  payload: unknown,
  status: number,
  requestId?: string,
) => {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });

  if (requestId) {
    headers.set('x-request-id', requestId);
  }

  return NextResponse.json(payload, { status, headers });
};

const proxyHealth = async () => {
  const upstream = await fetch(buildUpstreamUrl('health').toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const body = await upstream.text();
  const responseHeaders = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type':
      upstream.headers.get('content-type') || 'application/json; charset=utf-8',
  });

  const requestId = upstream.headers.get('x-request-id');
  if (requestId) {
    responseHeaders.set('x-request-id', requestId);
  }

  return new NextResponse(body, {
    status: upstream.status,
    headers: responseHeaders,
  });
};

const requestUpstreamJson = async <TPayload>(
  target: 'stats' | 'statsAggregate' | 'statsOverview' | 'feedback',
  query: Record<string, string | number | boolean | undefined>,
) => {
  const headers = new Headers({
    Accept: 'application/json',
  });
  headers.set('x-api-key', process.env[MONITOR_API_KEY_ENV]!.trim());

  const response = await fetch(buildUpstreamUrl(target, query).toString(), {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  const requestId = response.headers.get('x-request-id') || undefined;

  if (!response.ok) {
    throw new UpstreamMonitorError(response.status, payload, requestId);
  }

  return {
    payload: payload as TPayload,
    requestId,
  };
};

type NormalizedRequestItem = {
  id: string;
  timestamp: string;
  platform: string;
  url?: string;
  rawUrl?: string;
  requestSource: string;
  requestHost?: string;
  requestDomain?: string;
  success: boolean;
  errorCode: string;
  message: string;
  requestId: string;
  raw: Record<string, unknown>;
};

const normalizeParsedHost = (value?: string) => {
  if (!value || value.trim() === '') {
    return undefined;
  }
  return value.trim().toLowerCase();
};

const normalizeRequestItem = (
  entry: unknown,
  fallback: { page: number; pageSize: number; index: number },
): NormalizedRequestItem => {
  const row = toRecord(entry);
  const requestId =
    toString(row.requestId) ||
    toString(row.traceId) ||
    toString(row.id) ||
    '-';

  return {
    id: toString(row.id, `${fallback.page}-${fallback.index}`),
    timestamp: toString(row.createdAt) || toString(row.timestamp) || '-',
    platform: toString(row.platform, 'unknown'),
    url: toString(row.url) || undefined,
    rawUrl: toString(row.rawUrl) || undefined,
    requestSource:
      toString(row.requestSource) ||
      toString(row.parsedHost) ||
      toString(row.requestHost) ||
      toString(row.requestDomain) ||
      toString(row.sourceDomain) ||
      'unknown',
    requestHost: toString(row.requestHost) || undefined,
    requestDomain:
      normalizeParsedHost(toString(row.parsedHost)) ||
      normalizeParsedHost(toString(row.requestDomain)) ||
      normalizeParsedHost(toString(row.sourceDomain)) ||
      undefined,
    success: toBoolean(row.success) ?? false,
    errorCode: toString(row.errorCode),
    message: toString(row.errorMessage) || toString(row.message) || '',
    requestId,
    raw: row,
  };
};

const normalizeRequestPage = (
  data: unknown,
  fallback: { page: number; pageSize: number },
) => {
  const record = toRecord(data);
  const source = Array.isArray(record.items) ? record.items : [];

  const items = source.map((entry, index) =>
    normalizeRequestItem(entry, {
      page: fallback.page,
      pageSize: fallback.pageSize,
      index,
    }),
  );

  const paginationRecord = toRecord(record.pagination);
  const page = toNumber(paginationRecord.page, fallback.page);
  const pageSize = toNumber(paginationRecord.pageSize, fallback.pageSize);
  const total = toNumber(
    paginationRecord.total,
    toNumber(paginationRecord.totalCount, items.length),
  );
  const totalPages = Math.max(
    1,
    toNumber(
      paginationRecord.totalPages,
      pageSize > 0 ? Math.ceil(total / pageSize) : 1,
    ),
  );
  const filters = toRecord(record.filters);

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
    filters: {
      platform: toString(filters.platform) || undefined,
      url: toString(filters.url) || toString(filters.sourceUrl) || undefined,
      requestSource:
        toString(filters.requestSource) ||
        toString(filters.parsedHost) ||
        toString(filters.requestHost) ||
        undefined,
      requestHost: toString(filters.requestHost) || undefined,
      requestDomain:
        normalizeParsedHost(toString(filters.parsedHost)) ||
        normalizeParsedHost(toString(filters.requestDomain)) ||
        normalizeParsedHost(toString(filters.sourceDomain)) ||
        undefined,
      success: toBoolean(filters.success),
      errorCode: toString(filters.errorCode) || undefined,
      startDate: toString(filters.startDate) || undefined,
      endDate: toString(filters.endDate) || undefined,
    },
  };
};

const getUrlSearch = (request: NextRequest) => {
  const value = request.nextUrl.searchParams.get('url') || '';
  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
};

const matchesUrlSearch = (item: Pick<NormalizedRequestItem, 'url' | 'rawUrl'>, urlSearch?: string) => {
  if (!urlSearch) {
    return true;
  }

  const fields = [item.url, item.rawUrl]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  return fields.some((value) => value.includes(urlSearch));
};

const paginateItems = <TItem>(
  items: TItem[],
  page: number,
  pageSize: number,
) => {
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const start = (safePage - 1) * safePageSize;

  return {
    items: items.slice(start, start + safePageSize),
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages,
    },
  };
};

const normalizeRequestAggregatePage = (
  data: unknown,
  fallback: { page: number; pageSize: number },
) => {
  const record = toRecord(data);
  const source = Array.isArray(record.items) ? record.items : [];

  const items = source.map((entry, index) => {
    const row = toRecord(entry);
    const parsedHost =
      normalizeParsedHost(toString(row.parsedHost)) ||
      normalizeParsedHost(toString(row.requestDomain)) ||
      normalizeParsedHost(toString(row.key)) ||
      'unknown';

    return {
      key: toString(row.key, `${fallback.page}-${index}`),
      requestDomain: parsedHost,
      requestHost: parsedHost,
      total: toNumber(row.total, 0),
      successCount: toNumber(row.successCount, 0),
      failureCount: toNumber(row.failureCount, 0),
      latestCreatedAt: toString(row.latestCreatedAt) || '-',
      raw: row,
    };
  });

  const paginationRecord = toRecord(record.pagination);
  const page = toNumber(paginationRecord.page, fallback.page);
  const pageSize = toNumber(paginationRecord.pageSize, fallback.pageSize);
  const total = toNumber(
    paginationRecord.total,
    toNumber(paginationRecord.totalCount, items.length),
  );
  const totalPages = Math.max(
    1,
    toNumber(
      paginationRecord.totalPages,
      pageSize > 0 ? Math.ceil(total / pageSize) : 1,
    ),
  );
  const filters = toRecord(record.filters);

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
    filters: {
      groupBy: 'domain' as const,
      sortBy: toString(filters.sortBy) || undefined,
      sortOrder: toString(filters.sortOrder) || undefined,
      q: toString(filters.q) || undefined,
      platform: toString(filters.platform) || undefined,
      requestSource: toString(filters.parsedHost) || undefined,
      requestHost: toString(filters.parsedHost) || undefined,
      requestDomain:
        normalizeParsedHost(toString(filters.parsedHost)) ||
        normalizeParsedHost(toString(filters.requestDomain)) ||
        undefined,
      success: toBoolean(filters.success),
      errorCode: toString(filters.errorCode) || undefined,
      startDate: toString(filters.startDate) || undefined,
      endDate: toString(filters.endDate) || undefined,
    },
  };
};

const getTarget = (request: NextRequest): MonitorTarget | null => {
  const targetValue = request.nextUrl.searchParams.get('target');
  if (targetValue === 'aggregate') {
    return 'aggregate';
  }
  if (targetValue === 'requests') {
    return 'requests';
  }
  if (targetValue === 'requestDomains') {
    return 'requestDomains';
  }
  if (targetValue === 'feedback') {
    return 'feedback';
  }
  if (targetValue === 'health') {
    return 'health';
  }
  return null;
};

const buildUpstreamFilterQuery = (
  request: NextRequest,
  options?: { includeUrl?: boolean; includeQ?: boolean },
) => ({
  platform: request.nextUrl.searchParams.get('platform') || undefined,
  url:
    options?.includeUrl === false
      ? undefined
      : request.nextUrl.searchParams.get('url') || undefined,
  q:
    options?.includeQ === false
      ? undefined
      : request.nextUrl.searchParams.get('q') || undefined,
  parsedHost:
    normalizeParsedHost(
      request.nextUrl.searchParams.get('requestDomain') || undefined,
    ) || undefined,
  success: request.nextUrl.searchParams.get('success') || undefined,
  errorCode: request.nextUrl.searchParams.get('errorCode') || undefined,
  startDate: request.nextUrl.searchParams.get('startDate') || undefined,
  endDate: request.nextUrl.searchParams.get('endDate') || undefined,
});

const fetchAllNormalizedRequests = async (
  request: NextRequest,
  options?: { includeUrl?: boolean; includeQ?: boolean },
) => {
  const query = buildUpstreamFilterQuery(request, options);
  const items: NormalizedRequestItem[] = [];
  let page = 1;
  let totalPages = 1;
  let requestId: string | undefined;

  do {
    const result = await requestUpstreamJson<{ data?: UpstreamRequestPage }>(
      'stats',
      {
        ...query,
        page,
        pageSize: MAX_UPSTREAM_PAGE_SIZE,
      },
    );

    const data = normalizeRequestPage(result.payload.data, {
      page,
      pageSize: MAX_UPSTREAM_PAGE_SIZE,
    });

    items.push(...data.items);
    totalPages = data.pagination.totalPages;
    requestId = result.requestId || requestId;
    page += 1;
  } while (page <= totalPages);

  return {
    items,
    requestId,
  };
};

const buildLocalRequestDomainPage = (
  items: NormalizedRequestItem[],
  options: {
    page: number;
    pageSize: number;
    sortBy?: string;
    sortOrder?: string;
    q?: string;
    filters: Record<string, string | boolean | undefined>;
  },
) => {
  const q = options.q?.trim().toLowerCase();
  const grouped = new Map<
    string,
    {
      key: string;
      requestDomain: string;
      requestHost: string;
      total: number;
      successCount: number;
      failureCount: number;
      latestCreatedAt: string;
      raw: Record<string, unknown>;
    }
  >();

  items.forEach((item) => {
    const requestDomain =
      normalizeParsedHost(item.requestDomain) ||
      normalizeParsedHost(item.requestHost) ||
      'unknown';
    const current = grouped.get(requestDomain) ?? {
      key: requestDomain,
      requestDomain,
      requestHost: requestDomain,
      total: 0,
      successCount: 0,
      failureCount: 0,
      latestCreatedAt: item.timestamp,
      raw: {},
    };

    current.total += 1;
    if (item.success) {
      current.successCount += 1;
    } else {
      current.failureCount += 1;
    }
    if (item.timestamp > current.latestCreatedAt) {
      current.latestCreatedAt = item.timestamp;
    }

    grouped.set(requestDomain, current);
  });

  const rows = Array.from(grouped.values())
    .filter((item) => !q || item.requestDomain.includes(q))
    .sort((left, right) => {
      const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
      if (options.sortBy === 'latestCreatedAt') {
        return (
          left.latestCreatedAt.localeCompare(right.latestCreatedAt) * sortOrder ||
          left.requestDomain.localeCompare(right.requestDomain)
        );
      }

      return (
        (left.total - right.total) * sortOrder ||
        right.latestCreatedAt.localeCompare(left.latestCreatedAt) ||
        left.requestDomain.localeCompare(right.requestDomain)
      );
    });

  const paginated = paginateItems(rows, options.page, options.pageSize);

  return {
    items: paginated.items,
    pagination: paginated.pagination,
    filters: {
      ...options.filters,
      groupBy: 'domain',
      sortBy: options.sortBy || 'count',
      sortOrder: options.sortOrder || 'desc',
      q,
    },
  };
};

const handleAggregateRequest = async (request: NextRequest) => {
  const topN = request.nextUrl.searchParams.get('topN') || undefined;
  const urlSearch = getUrlSearch(request);
  const parsedTopN = topN ? Number(topN) : undefined;
  const topNValue =
    typeof parsedTopN === 'number' && Number.isFinite(parsedTopN)
      ? parsedTopN
      : undefined;

  if (urlSearch) {
    const result = await fetchAllNormalizedRequests(request, {
      includeUrl: false,
    });
    const filteredItems = result.items.filter((item) =>
      matchesUrlSearch(item, urlSearch),
    );
    const data = aggregateAdminRequests(
      filteredItems.map((item) => ({
        timestamp: item.timestamp,
        platform: item.platform,
        requestSource: item.requestSource,
        requestDomain: item.requestDomain,
        url: item.url,
        success: item.success,
      })),
      {
        startDate: request.nextUrl.searchParams.get('startDate') || undefined,
        endDate: request.nextUrl.searchParams.get('endDate') || undefined,
        topN: topNValue,
      },
    );

    return createJsonResponse(
      {
        success: true,
        data,
      },
      200,
      result.requestId,
    );
  }

  const result = await requestUpstreamJson<Record<string, unknown>>(
    'statsOverview',
    {
      ...buildUpstreamFilterQuery(request),
      topN,
    },
  );

  return createJsonResponse(result.payload, 200, result.requestId);
};

const handleRequestsRequest = async (request: NextRequest) => {
  const page = Number(request.nextUrl.searchParams.get('page') || '1');
  const pageSize = Number(request.nextUrl.searchParams.get('pageSize') || '20');
  const urlSearch = getUrlSearch(request);

  if (urlSearch) {
    const result = await fetchAllNormalizedRequests(request, {
      includeUrl: false,
    });
    const filteredItems = result.items.filter((item) =>
      matchesUrlSearch(item, urlSearch),
    );
    const paginated = paginateItems(filteredItems, page, pageSize);

    return createJsonResponse(
      {
        success: true,
        data: {
          items: paginated.items,
          pagination: paginated.pagination,
          filters: {
            platform: request.nextUrl.searchParams.get('platform') || undefined,
            url: request.nextUrl.searchParams.get('url') || undefined,
            requestDomain:
              normalizeParsedHost(
                request.nextUrl.searchParams.get('requestDomain') || undefined,
              ) || undefined,
            success: toBoolean(request.nextUrl.searchParams.get('success')),
            errorCode: request.nextUrl.searchParams.get('errorCode') || undefined,
            startDate: request.nextUrl.searchParams.get('startDate') || undefined,
            endDate: request.nextUrl.searchParams.get('endDate') || undefined,
          },
        },
      },
      200,
      result.requestId,
    );
  }

  const result = await requestUpstreamJson<{ data?: UpstreamRequestPage }>(
    'stats',
    {
      ...buildUpstreamFilterQuery(request),
      page,
      pageSize,
    },
  );

  const data = normalizeRequestPage(result.payload.data, {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
  });

  return createJsonResponse({ success: true, data }, 200, result.requestId);
};

const handleRequestDomainsRequest = async (request: NextRequest) => {
  const page = Number(request.nextUrl.searchParams.get('page') || '1');
  const pageSize = Number(request.nextUrl.searchParams.get('pageSize') || '20');
  const sortBy = request.nextUrl.searchParams.get('sortBy') || undefined;
  const sortOrder = request.nextUrl.searchParams.get('sortOrder') || undefined;
  const urlSearch = getUrlSearch(request);
  const q = request.nextUrl.searchParams.get('q') || undefined;

  if (urlSearch) {
    const result = await fetchAllNormalizedRequests(request, {
      includeUrl: false,
      includeQ: false,
    });
    const filteredItems = result.items.filter((item) =>
      matchesUrlSearch(item, urlSearch),
    );
    const data = buildLocalRequestDomainPage(filteredItems, {
      page,
      pageSize,
      sortBy,
      sortOrder,
      q,
      filters: {
        platform: request.nextUrl.searchParams.get('platform') || undefined,
        url: request.nextUrl.searchParams.get('url') || undefined,
        requestDomain:
          normalizeParsedHost(
            request.nextUrl.searchParams.get('requestDomain') || undefined,
          ) || undefined,
        success: toBoolean(request.nextUrl.searchParams.get('success')),
        errorCode: request.nextUrl.searchParams.get('errorCode') || undefined,
        startDate: request.nextUrl.searchParams.get('startDate') || undefined,
        endDate: request.nextUrl.searchParams.get('endDate') || undefined,
      },
    });

    return createJsonResponse(
      {
        success: true,
        data,
      },
      200,
      result.requestId,
    );
  }

  const result = await requestUpstreamJson<{
    data?: UpstreamRequestAggregatePage;
  }>('statsAggregate', {
    ...buildUpstreamFilterQuery(request),
    page,
    pageSize,
    sortBy,
    sortOrder,
  });

  const data = normalizeRequestAggregatePage(result.payload.data, {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
  });

  return createJsonResponse({ success: true, data }, 200, result.requestId);
};

const handleFeedbackRequest = async (request: NextRequest) => {
  const page = Number(request.nextUrl.searchParams.get('page') || '1');
  const pageSize = Number(request.nextUrl.searchParams.get('pageSize') || '20');
  const result = await requestUpstreamJson<Record<string, unknown>>('feedback', {
    type: request.nextUrl.searchParams.get('type') || undefined,
    status: request.nextUrl.searchParams.get('status') || undefined,
    q: request.nextUrl.searchParams.get('q') || undefined,
    startDate: request.nextUrl.searchParams.get('startDate') || undefined,
    endDate: request.nextUrl.searchParams.get('endDate') || undefined,
    page,
    pageSize,
  });

  return createJsonResponse(result.payload, 200, result.requestId);
};

export async function GET(request: NextRequest) {
  const target = getTarget(request);

  if (!target) {
    return NextResponse.json(
      {
        success: false,
        code: 'BAD_REQUEST',
        status: 400,
        requestId: 'monitor_proxy_invalid_target',
        details: {
          message:
            'target 必须是 health、aggregate、requests、requestDomains 或 feedback',
        },
      },
      { status: 400 },
    );
  }

  if (!(await isAdminRequest(request))) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNAUTHORIZED',
        status: 401,
        requestId: 'monitor_proxy_forbidden',
        details: {
          message: '需要管理员登录态',
        },
      },
      { status: 401 },
    );
  }

  if (target !== 'health') {
    const apiKey = process.env[MONITOR_API_KEY_ENV]?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          code: 'SERVER_MISCONFIGURED',
          status: 503,
          requestId: 'monitor_proxy_missing_api_key',
          details: {
            message: `缺少 ${MONITOR_API_KEY_ENV} 环境变量`,
          },
        },
        { status: 503 },
      );
    }
  }

  try {
    if (target === 'health') {
      return await proxyHealth();
    }

    if (target === 'aggregate') {
      return await handleAggregateRequest(request);
    }

    if (target === 'requestDomains') {
      return await handleRequestDomainsRequest(request);
    }

    if (target === 'feedback') {
      return await handleFeedbackRequest(request);
    }

    return await handleRequestsRequest(request);
  } catch (error) {
    if (error instanceof UpstreamMonitorError) {
      const payload = toRecord(error.payload) as UpstreamErrorEnvelope;
      const normalizedPayload = {
        success: false,
        code: toString(payload.code, 'INTERNAL_ERROR'),
        status: payload.status ?? error.status,
        requestId: toString(payload.requestId) || error.requestId,
        details: payload.details,
        message: toString(payload.message),
      };

      return createJsonResponse(
        normalizedPayload,
        error.status,
        normalizedPayload.requestId,
      );
    }

    console.error('monitor proxy request failed', error);
    return NextResponse.json(
      {
        success: false,
        code: 'SERVICE_UNAVAILABLE',
        status: 503,
        requestId: 'monitor_proxy_upstream_error',
        details: {
          message: '监控服务暂时不可用',
        },
      },
      { status: 503 },
    );
  }
}
