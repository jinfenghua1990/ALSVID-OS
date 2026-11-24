function createNetworkPolicy({ port, bindHost = '127.0.0.1', publicOrigins = '', lanOrigins = '' }) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid port');
  if (!['127.0.0.1', '0.0.0.0'].includes(bindHost)) throw Error('Invalid bind host');
  const localHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  const publicHosts = new Map();
  for (const value of String(publicOrigins).split(',').map(x => x.trim()).filter(Boolean)) {
    let url; try { url = new URL(value); } catch (_) { throw Error('Invalid public origin'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.origin !== value) throw Error('Public origins must be exact HTTPS origins');
    if (localHosts.has(url.host.toLowerCase())) throw Error('Public origin conflicts with loopback');
    publicHosts.set(url.host.toLowerCase(), url.origin);
  }
  // 内网 HTTP 直连白名单：允许局域网设备用 http://IP:port 访问。
  // 与 publicHosts 分开，避免被 isPublicHost 判定为公网而加上 Secure cookie（HTTP 下会导致登录态失效）。
  const lanHosts = new Map();
  let allowPrivateLan = false;
  for (const value of String(lanOrigins).split(',').map(x => x.trim()).filter(Boolean)) {
    if (value === 'lan') { allowPrivateLan = true; continue; }
    let url; try { url = new URL(value); } catch (_) { throw Error('Invalid LAN origin'); }
    if (url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.origin !== value) throw Error('LAN origins must be exact HTTP origins');
    lanHosts.set(url.host.toLowerCase(), url.origin);
  }
  const privateV4 = /^(?:10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}$|^192\.168\.\d{1,3}\.\d{1,3}$|^172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$|^169\.254\.\d{1,3}\.\d{1,3}$/;
  const isPrivateLanHost = host => {
    const hostname = String(host || '').split(':')[0];
    return privateV4.test(hostname);
  };
  if (bindHost === '0.0.0.0' && publicHosts.size === 0 && lanHosts.size === 0 && !allowPrivateLan) throw Error('Public bind requires HTTPS origins');
  const isPublicHost = host => publicHosts.has(String(host || '').toLowerCase());
  function allows(host, origin, method) {
    host = String(host || '').toLowerCase();
    const lan = lanHosts.get(host);
    if (lan) return !origin || origin === lan;
    if (allowPrivateLan && (isPrivateLanHost(host) || localHosts.has(host))) return !origin || origin === `http://${host}`;
    if (localHosts.has(host)) return bindHost === '127.0.0.1' && (!origin || origin === `http://${host}`);
    const expected = publicHosts.get(host);
    if (!expected) return false;
    if (origin) return origin === expected;
    return ['GET', 'HEAD', 'OPTIONS'].includes(String(method || '').toUpperCase());
  }
  return { bindHost, allows, isPublicHost };
}
module.exports = { createNetworkPolicy };
