export function parseWebsiteProductRoute(pathname) {
  const match = pathname.match(/^\/(zh|en|de)\/explore\/(l7|l1|l8|fc1|fc2|accessory-cup-holder)\/?$/);
  return match ? { lang: match[1], product: match[2] === 'l1' ? 'l8' : match[2] } : null;
}

export function parseUnmigratedWebsiteRoute(pathname) {
  const match = pathname.match(/^\/(zh|en|de)\/.+$/);
  return match && !parseWebsiteProductRoute(pathname) && !parsePublicLocationsRoute(pathname) && !parseDealerPartnershipRoute(pathname) ? { lang: match[1] } : null;
}

export function parsePublicLocationsRoute(pathname) {
  const match = pathname.match(/^\/(zh|en|de)\/(dealers\/locations|service-locations)\/?$/);
  return match ? { lang: match[1], kind: match[2] === 'service-locations' ? 'service' : 'sales' } : null;
}

export function parseDealerPartnershipRoute(pathname) {
  const match = pathname.match(/^\/(zh|en|de)\/dealers\/?$/);
  return match ? { lang: match[1] } : null;
}

