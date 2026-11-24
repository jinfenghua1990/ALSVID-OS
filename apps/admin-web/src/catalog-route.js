export function parseCatalogRoute(pathname) {
  const match = pathname.match(/^\/www\/(zh|en|de)\/products(?:\/([^/]+))?\/?$/);
  if (!match) return null;
  let productId;
  try { productId = match[2] ? decodeURIComponent(match[2]) : undefined; }
  catch (_) { productId = match[2]; }
  return { lang: match[1], productId };
}
