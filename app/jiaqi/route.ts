import { publicUpstream } from '@/lib/public-upstream';
export async function GET(request: Request) { return publicUpstream(request, new URL('https://s3.cn-north-1.amazonaws.com.cn/general.lesignstatic.com/config/jiaqi.json')); }
