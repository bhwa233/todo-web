import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    success: false,
    code: 'MONITOR_MOVED',
    message: '下载服务监控已迁移到独立管理后台。',
    adminUrl: 'https://admin.bhwa233.com/zh/admin/downloader',
  }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
