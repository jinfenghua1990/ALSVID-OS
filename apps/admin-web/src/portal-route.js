const ownerSections = {
  '/my': null,
  '/my/vehicles': 'portal-vehicles',
  '/my/vehicles/register': 'portal-registration',
  '/my/service': 'portal-service',
  '/my/service/new': 'portal-service',
};
const dealerSections = {
  '/dealer': null,
  '/dealer/orders': 'portal-dealer-orders',
  '/dealer/order-status': 'portal-dealer-orders',
  '/dealer/purchase': 'portal-dealer-orders',
  '/dealer/service': 'portal-service',
};
const supplierSections = { '/supplier': null, '/supplier/orders': 'supplier-orders' };

export function parsePortalRoute(pathname, hostname) {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  const host = String(hostname || '').toLowerCase();
  let kind;
  if (path === '/my' || path.startsWith('/my/')) kind = 'owner';
  else if (path === '/dealer' || path.startsWith('/dealer/')) kind = 'dealer';
  else if (path === '/supplier' || path.startsWith('/supplier/')) kind = 'supplier';
  else if (host.startsWith('my.')) kind = 'owner';
  else if (host.startsWith('dealer.')) kind = 'dealer';
  else return null;
  const paths = kind === 'owner' ? ownerSections : kind === 'dealer' ? dealerSections : supplierSections;
  const effectivePath = path === '/' ? (kind === 'owner' ? '/my' : kind === 'dealer' ? '/dealer' : '/supplier') : path;
  const supported = Object.hasOwn(paths, effectivePath);
  return { kind, supported, section: supported ? paths[effectivePath] : null };
}
