const SITE_ORIGIN = 'https://www.alsvidbike.com';

function setMeta(attribute, key, content) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

export function setPageMetadata({ lang, title, description, path, image, alternates = [], robots = 'index,follow' }) {
  const pageTitle = `${title} · ALSVID`;
  const summary = String(description || '').trim().slice(0, 320);
  const url = new URL(path, SITE_ORIGIN).toString();
  document.documentElement.lang = lang;
  document.title = pageTitle;
  setMeta('name', 'description', summary);
  setMeta('property', 'og:site_name', 'ALSVID');
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:title', pageTitle);
  setMeta('property', 'og:description', summary);
  setMeta('property', 'og:url', url);
  setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
  setMeta('name', 'robots', robots);
  if (image) setMeta('property', 'og:image', new URL(image, SITE_ORIGIN).toString());
  else document.head.querySelector('meta[property="og:image"]')?.remove();

  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = url;

  document.head.querySelectorAll('link[data-seo-hreflang]').forEach(element => element.remove());
  for (const alternate of alternates) {
    const link = document.createElement('link');
    link.rel = 'alternate';
    link.hreflang = alternate.lang;
    link.href = new URL(alternate.path, SITE_ORIGIN).toString();
    link.dataset.seoHreflang = 'true';
    document.head.appendChild(link);
  }
}
