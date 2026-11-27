import { draftMode } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { apiOrigin, siteIsHttps } from '@/lib/origins';
import { PREVIEW_COOKIE } from '@/lib/preview-cookie';

// 单独起路由文件而不是走 /api/[...path] 代理：
// Next 的静态段优先级高于 catch-all，因此 /api/preview 不会被代理吃掉。

const LOCALES = new Set(['de', 'en', 'zh']);
// 与 drafts 生命周期对齐：15 分钟。够看一遍，过期自动失效。
const PREVIEW_MAX_AGE = 15 * 60;

// 来源与协议判定统一走 lib/origins.ts，不在此硬编码端口
const API_ORIGIN = apiOrigin();
const SITE_IS_HTTPS = siteIsHttps();

function page(title: string, message: string, status: number) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${title}</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#f8f8f6;color:#202725;font-family:Arial,Helvetica,sans-serif}
main{max-width:520px;padding:32px;border:1px solid #e1e5e1;background:#fff}h1{margin:0 0 12px;font-size:20px;font-weight:600}
p{margin:0;color:#5e6963;font-size:14px;line-height:1.7}</style></head>
<body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || '';
  const rawLocale = request.nextUrl.searchParams.get('locale') || 'de';
  const locale = LOCALES.has(rawLocale) ? rawLocale : 'de';

  if (!token) return page('预览链接无效', '缺少预览令牌，请回到管理后台重新生成预览链接。', 400);

  // 先向后端确认令牌有效，再开启 Draft Mode。
  // 顺序很重要：令牌无效时绝不能把站点切到草稿态。
  let check: Response;
  try {
    check = await fetch(`${API_ORIGIN}/api/public/layout-preview?locale=${locale}&token=${encodeURIComponent(token)}`, { cache: 'no-store' });
  } catch {
    return page('预览暂不可用', '无法连接到内容服务，请稍后重试。', 502);
  }
  if (!check.ok) {
    const detail = await check.json().then((body) => body?.error).catch(() => null);
    return page('预览链接不可用', String(detail || '预览链接无效或已过期，请回到管理后台重新生成。'), check.status === 401 ? 401 : 502);
  }

  const draft = await draftMode();
  draft.enable();

  const response = NextResponse.redirect(new URL(`/${locale}`, request.url));
  response.cookies.set(PREVIEW_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: PREVIEW_MAX_AGE,
    secure: SITE_IS_HTTPS,
  });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}
