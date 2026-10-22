import { publicUpstream } from '@/lib/public-upstream';
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const target = new URL('https://game.gtimg.cn/');
  target.pathname += path.map(encodeURIComponent).join('/');
  target.search = new URL(request.url).search;
  return publicUpstream(request, target);
}
