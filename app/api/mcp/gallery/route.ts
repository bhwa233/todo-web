import { handleGalleryMcp } from '@/lib/mcp/gallery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const POST = handleGalleryMcp;
export const GET = handleGalleryMcp;
export const DELETE = handleGalleryMcp;
