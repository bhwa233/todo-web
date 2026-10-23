import { currentRole } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json({ role: await currentRole() }, { headers: { 'Cache-Control': 'private, no-store' } });
}
