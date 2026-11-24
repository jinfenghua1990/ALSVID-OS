'use client';

// 账户中心统一的接口调用层。
// 所有请求都走同域 /api/*，由 app/api/[...path]/route.ts 按白名单转发到 8089，
// 因此这里既不需要知道后端地址，也不会把会话带出本站。
// 会话 Cookie 由浏览器自动携带（HttpOnly），前端不接触 token。

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, { cache: 'no-store', ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error || 'request_failed', response.status);
  }
  return response;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await request(path, init);
  return (await response.json()) as T;
}

// 订单列表的分页信号在响应头 X-Has-More，需要单独取回。
export async function apiList<T>(path: string, init?: RequestInit): Promise<{ items: T[]; hasMore: boolean }> {
  const response = await request(path, init);
  const body = await response.json().catch(() => null);
  const items = Array.isArray(body) ? (body as T[]) : [];
  return { items, hasMore: response.headers.get('x-has-more') === 'true' };
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function putJson<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
