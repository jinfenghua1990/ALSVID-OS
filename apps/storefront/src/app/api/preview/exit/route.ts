import { draftMode } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { PREVIEW_COOKIE } from '@/lib/preview-cookie';

const LOCALES = new Set(['de', 'en', 'zh']);

export async function GET(request: NextRequest) {
  const rawLocale = request.nextUrl.searchParams.get('locale') || 'de';
  const locale = LOCALES.has(rawLocale) ? rawLocale : 'de';

  const draft = await draftMode();
  draft.disable();

  const response = NextResponse.redirect(new URL(`/${locale}`, request.url));
  response.cookies.delete(PREVIEW_COOKIE);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
