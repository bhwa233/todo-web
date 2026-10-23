import { publicUpstream } from '@/lib/public-upstream';
export async function GET(request: Request) { return publicUpstream(request, new URL('https://apiv3.shanbay.com/weapps/dailyquote/quote/')); }
