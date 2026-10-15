import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { handleGalleryMcp } from './gallery';

const token = 'test-only-gallery-token';
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://own.bhwa233.com/api/mcp/gallery', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
async function message(response: Response) {
  const text = await response.text();
  return JSON.parse(
    response.headers.get('content-type')?.includes('text/event-stream')
      ? text
          .split('\n')
          .find((line) => line.startsWith('data: '))!
          .slice(6)
      : text,
  );
}
beforeEach(() => {
  vi.stubEnv('GALLERY_MCP_TOKEN', token);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

it('fails closed without a configured token and never accepts web cookies as MCP credentials', async () => {
  vi.stubEnv('GALLERY_MCP_TOKEN', '');
  expect((await handleGalleryMcp(request({}))).status).toBe(503);
  vi.stubEnv('GALLERY_MCP_TOKEN', token);
  expect(
    (
      await handleGalleryMcp(
        request(
          {},
          { Authorization: '', Cookie: 'auth_role=admin; auth_token=legacy' },
        ),
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await handleGalleryMcp(
        request({}, { Authorization: 'Bearer wrong-token' }),
      )
    ).status,
  ).toBe(401);
  expect(
    (await handleGalleryMcp(request({}, { Origin: 'https://evil.test' })))
      .status,
  ).toBe(403);
});

it('serves legacy MCP initialization and executes a tool across independent HTTP requests', async () => {
  const initialized = await handleGalleryMcp(
    request({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'gallery-test', version: '1' },
      },
    }),
  );
  expect(initialized.status).toBe(200);
  expect(initialized.headers.get('mcp-session-id')).toBeNull();
  const response = await handleGalleryMcp(
    request({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'gallery_resolve_source',
        arguments: {
          type: 'WEIBO_PERSONAL',
          platformId: '123',
          name: '测试来源',
        },
      },
    }),
  );
  expect(response.status).toBe(200);
  const result = await message(response);
  expect(result.result.structuredContent).toMatchObject({
    type: 'WEIBO_PERSONAL',
    platformId: '123',
    name: '测试来源',
  });
  expect(response.headers.get('cache-control')).toBe('no-store');

  // Modern clients send per-request capabilities instead of initialize/session state.
  const modern = await handleGalleryMcp(
    request(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'gallery_resolve_source',
          arguments: {
            type: 'WEIBO_PERSONAL',
            platformId: '456',
            name: '现代客户端',
          },
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': {
              name: 'gallery-test',
              version: '1',
            },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
      {
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'tools/call',
        'Mcp-Name': 'gallery_resolve_source',
      },
    ),
  );
  expect(modern.status).toBe(200);
  expect((await message(modern)).result.structuredContent).toMatchObject({
    platformId: '456',
    name: '现代客户端',
  });
});

it('returns actionable identity errors through the MCP tool boundary', async () => {
  const response = await handleGalleryMcp(
    request({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'gallery_resolve_source',
        arguments: {
          url: 'https://weibo.com/u/123',
          platformId: '456',
          name: '测试来源',
        },
      },
    }),
  );
  const result = (await message(response)).result;
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).code).toBe('SOURCE_MISMATCH');
});
