import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

// 缓存刷新回调：由 8089 在装修发布/回滚成功后调用。
// 这样「后台点发布 → 前台立刻新」，不用等 TTL，也不用重新部署。

export const runtime = 'nodejs';

// 只允许失效已知 tag：否则任何持令牌方都能构造任意 tag 把缓存打穿。
const ALLOWED_TAGS = new Set(['storefront-layout']);

function tokenMatches(received: string, expected: string) {
  if (!received || !expected) return false;
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expected = String(process.env.ALSVID_REVALIDATE_TOKEN || '').trim();
  // 未配置或密钥过短一律关闭：宁可刷新不生效，也不能出现无鉴权的公开刷新端点。
  if (Buffer.byteLength(expected, 'utf8') < 16) {
    return NextResponse.json({ error: '缓存刷新未配置' }, { status: 503 });
  }
  if (!tokenMatches(String(request.headers.get('x-alsvid-revalidate-token') || ''), expected)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const requested = Array.isArray(body?.tags) ? body.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : [];
  const tags = requested.filter((tag: string) => ALLOWED_TAGS.has(tag));
  if (!tags.length) return NextResponse.json({ error: '没有可刷新的缓存标签' }, { status: 400 });

  // 发布/撤回必须使下一次访问重新读取，不采用 stale-while-revalidate。
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return NextResponse.json({ revalidated: true, tags, now: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
}
