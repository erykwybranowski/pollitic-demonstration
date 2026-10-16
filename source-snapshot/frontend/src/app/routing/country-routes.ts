export const SUPPORTED_COUNTRY_CODES = [
  'at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'fr', 'de', 'gr',
  'hu', 'ie', 'it', 'lv', 'lt', 'lu', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk',
  'si', 'es', 'se'
] as const;

const supportedCountryCodeSet = new Set<string>(SUPPORTED_COUNTRY_CODES);

export function isSupportedCountryCode(countryCode: string | null | undefined): boolean {
  return !!countryCode && supportedCountryCodeSet.has(countryCode.toLowerCase());
}
