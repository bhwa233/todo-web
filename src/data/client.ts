import type { TodoDataService } from '../../data-service/src/index';
import superjson from 'superjson';
import { DataServiceError, type ServiceResponse } from './protocol';

// Prisma's D1 adapter requires a Worker binding. This is only the authenticated
// HTTP boundary; Prisma on the Worker handles model queries and validation.
export async function callDataService<T>(
  operation: string,
  input: unknown,
): Promise<T> {
  if (typeof window !== 'undefined')
    throw new Error('The data service is server-only');
  const encoded = superjson.stringify(input);
  let response: Response;
  const localUrl = process.env.DATA_SERVICE_URL;
  // The HTTP fallback exists only for disposable loopback integration tests.
  // Production website calls always use the named WorkerEntrypoint binding.
  if (
    localUrl &&
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(localUrl).hostname)
  ) {
    const token = process.env.DATA_SERVICE_TOKEN;
    if (!token) throw new Error('Local data service token is required');
    const url = new URL(localUrl);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/v1/${operation}`;
    response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: encoded,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
  } else {
    const { env } = await import('cloudflare:workers');
    if (!env.TODO_DATA)
      throw new Error('TODO_DATA service binding is required');
    const payload = superjson.parse<ServiceResponse<T>>(
      await (env.TODO_DATA as Service<TodoDataService>).call(
        operation,
        encoded,
      ),
    );
    if ('error' in payload)
      throw new DataServiceError(
        payload.error.code,
        payload.error.message,
        payload.error.details,
      );
    return payload.result;
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new DataServiceError(
      'SERVICE_UNAVAILABLE',
      `Data service returned HTTP ${response.status}`,
    );
  }
  const payload = superjson.parse<ServiceResponse<T>>(await response.text());
  if ('error' in payload)
    throw new DataServiceError(
      payload.error.code,
      payload.error.message,
      payload.error.details,
    );
  if (!response.ok)
    throw new DataServiceError(
      'SERVICE_UNAVAILABLE',
      `Data service returned HTTP ${response.status}`,
    );
  return payload.result;
}
