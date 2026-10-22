import { sessionRole, SESSION_COOKIE } from './src/lib/auth-session';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 定义需要管理员权限的路由
const ADMIN_ROUTES = [
  '/task',
  '/habit',
  '/fund',
  '/bookmark',
  '/anniversary',
  '/admin/monitor',
];

export async function proxy(request: NextRequest) {
  const role = await sessionRole(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = request.nextUrl;
  const previewPublic = pathname === '/login' || pathname.startsWith('/api/auth/') || pathname === '/api/mcp/gallery';
  if (process.env.APP_ENV === 'preview' && role === 'none' && !previewPublic) {
    return pathname.startsWith('/api/') ? NextResponse.json({ error: '需要登录' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } }) : NextResponse.redirect(new URL('/login', request.url));
  }
  const isAdminRoute = ADMIN_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`));
  if (isAdminRoute && role !== 'admin') return NextResponse.redirect(new URL('/login', request.url));
  if (pathname === '/login' && role !== 'none') return NextResponse.redirect(new URL('/', request.url));
  const response = NextResponse.next();
  if (isAdminRoute || pathname === '/login' || pathname === '/') response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径，除了静态资源和 API
     */
    '/((?!_next/static|_next/image|favicon.ico|logo/|icons/|sw.js|offline.html).*)',
  ],
};
