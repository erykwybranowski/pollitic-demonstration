export const SITE_URL = 'https://pollitic.eu';

// Only public, indexable pages. Country and general comparison pages are
// expanded using SUPPORTED_COUNTRY_CODES by the sitemap generator.
export const STATIC_INDEXABLE_PATHS = ['', 'about', 'groups', 'privacy', 'sources'] as const;
