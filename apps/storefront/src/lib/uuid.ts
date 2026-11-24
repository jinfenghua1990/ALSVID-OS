// RFC 9562 UUIDv7 生成器。
// 后端大量「申请编号 / 请求幂等键」要求 v7（含时间前缀且版本号为 7），
// 浏览器端没有原生实现，集中在此一处，避免各组件各写一份。
export function uuidv7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let time = Date.now();
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = time & 255;
    time = Math.floor(time / 256);
  }
  bytes[6] = (bytes[6]! & 15) | 112;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
