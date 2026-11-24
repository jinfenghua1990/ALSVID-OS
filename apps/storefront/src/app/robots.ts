import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/alsvid-api';

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/my', '/dealer'] }, sitemap: `${siteUrl}/sitemap.xml` };
}
