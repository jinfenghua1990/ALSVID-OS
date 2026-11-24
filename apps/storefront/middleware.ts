import { NextResponse, type NextRequest } from 'next/server';

const LOCALES = new Set(['de', 'en', 'zh']);

export function middleware(request: NextRequest) {
  const segment = request.nextUrl.pathname.split('/')[1] || '';
  // 之前只区分 en / de，导致 /zh/* 的 <html lang> 被写成 de，
  // 影响朗读语音、断词与 SEO。这里按真实语言透传，未知值回退默认语言 de。
  const locale = LOCALES.has(segment) ? segment : 'de';
  const headers = new Headers(request.headers);
  headers.set('x-alsvid-locale', locale);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/).*)'] };
