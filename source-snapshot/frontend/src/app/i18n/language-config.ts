export const DEFAULT_LANGUAGE_CODE = 'en';

export const SUPPORTED_LANGUAGE_CODES = [
  'en', 'pl', 'de', 'nl', 'fr', 'bg', 'hr', 'el', 'cs', 'da', 'et', 'fi',
  'sv', 'hu', 'it', 'lv', 'lt', 'lb', 'mt', 'pt', 'ro', 'sk', 'sl', 'es'
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGE_CODES[number];

export interface LanguageOption {
  code: LanguageCode;
  labelKey: string;
}

const supportedLanguageCodeSet = new Set<string>(SUPPORTED_LANGUAGE_CODES);

export function isSupportedLanguageCode(value: string | null | undefined): value is LanguageCode {
  return !!value && value === value.toLowerCase() && supportedLanguageCodeSet.has(value);
}

export function isLocalizedLanguageCode(value: string | null | undefined): value is LanguageCode {
  return isSupportedLanguageCode(value);
}

export function getLanguageFromPathSegments(segments: readonly string[]): LanguageCode {
  const locale = segments[0];
  return isLocalizedLanguageCode(locale)
    ? locale.toLowerCase() as LanguageCode
    : DEFAULT_LANGUAGE_CODE;
}

export function getContentPathSegments(segments: readonly string[]): string[] {
  return isLocalizedLanguageCode(segments[0]) ? [...segments.slice(1)] : [...segments];
}

export function buildLocalizedPath(language: LanguageCode, segments: readonly string[]): string {
  const pathSegments = segments.filter(Boolean);
  const localizedSegments = [language, ...pathSegments];

  return localizedSegments.length > 0 ? `/${localizedSegments.join('/')}` : '/';
}

export const LANGUAGE_COOKIE_NAME = 'pollitic.language';
export const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function readLanguageCookie(cookie: string): LanguageCode | null {
  for (const item of cookie.split(';')) {
    const [name, ...parts] = item.trim().split('=');
    if (name !== LANGUAGE_COOKIE_NAME) continue;
    try {
      const value = decodeURIComponent(parts.join('='));
      if (isSupportedLanguageCode(value)) return value;
    } catch { /* Ignore malformed cookies. */ }
  }
  return null;
}

export function selectPreferredLanguage(cookie: string, acceptLanguage: string): LanguageCode {
  const remembered = readLanguageCookie(cookie);
  if (remembered) return remembered;
  const preferences = acceptLanguage.split(',').map((entry, index) => {
    const [tag, ...parameters] = entry.trim().toLowerCase().split(';');
    const qParameter = parameters.map(value => value.trim()).find(value => value.startsWith('q='));
    const quality = qParameter ? Number(qParameter.slice(2)) : 1;
    return { language: tag.split('-')[0], quality, index };
  }).filter(item => Number.isFinite(item.quality) && item.quality > 0 && item.quality <= 1)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return preferences.find(item => isSupportedLanguageCode(item.language))?.language as LanguageCode
    ?? DEFAULT_LANGUAGE_CODE;
}

// An allow-list prevents redirecting API/assets/technical routes or creating
// an open redirect. Keep encoded party IDs and query strings untouched.
export function neutralRedirectPath(requestTarget: string, language: LanguageCode): string | null {
  const queryIndex = requestTarget.indexOf('?');
  const path = queryIndex < 0 ? requestTarget : requestTarget.slice(0, queryIndex);
  const query = queryIndex < 0 ? '' : requestTarget.slice(queryIndex);
  const neutralPage = /^\/(?:about|groups|privacy|sources|not-found)?\/?$/.test(path)
    || /^\/(?:country\/[a-z]{2}|compare\/[a-z]{2}(?:\/[^/]+)?)\/?$/.test(path);
  if (!neutralPage || /[\\\r\n]/.test(requestTarget)) return null;
  return `/${language}${path === '/' ? '' : path.replace(/\/$/, '')}${query}`;
}
