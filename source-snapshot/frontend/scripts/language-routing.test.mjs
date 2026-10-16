import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfigModule } from './generate-sitemap.mjs';

const config = await loadConfigModule('src/app/i18n/language-config.ts');
const { readLanguageCookie, selectPreferredLanguage, neutralRedirectPath,
  buildLocalizedPath, getLanguageFromPathSegments, getContentPathSegments } = config;

test('explicit locales, including English, always win over any preference', () => {
  for (const language of config.SUPPORTED_LANGUAGE_CODES) {
    assert.equal(buildLocalizedPath(language, ['country', 'bg']), `/${language}/country/bg`);
    assert.equal(getLanguageFromPathSegments([language, 'country', 'bg']), language);
    assert.deepEqual(getContentPathSegments([language, 'country', 'bg']), ['country', 'bg']);
    assert.equal(neutralRedirectPath(`/${language}/country/bg`, 'pl'), null);
    assert.equal(neutralRedirectPath(`/${language}`, 'pl'), null);
  }
});

test('a validated saved preference takes priority over Accept-Language', () => {
  assert.equal(readLanguageCookie('other=1; pollitic.language=pl'), 'pl');
  assert.equal(selectPreferredLanguage('pollitic.language=en', 'pl-PL,fr;q=0.9'), 'en');
  assert.equal(selectPreferredLanguage('pollitic.language=pl', 'de-DE'), 'pl');
  for (const invalid of ['xx', '%broken', 'https://evil.test', 'PL', '']) {
    assert.equal(readLanguageCookie(`pollitic.language=${invalid}`), null);
    assert.equal(selectPreferredLanguage(`pollitic.language=${invalid}`, 'fr'), 'fr');
  }
});

test('browser preferences respect quality, regional tags, unsupported languages and fallback', () => {
  assert.equal(selectPreferredLanguage('', 'de;q=0.5,pl-PL;q=0.9,en;q=0.2'), 'pl');
  assert.equal(selectPreferredLanguage('', 'zh,pt-BR;q=0.9,en;q=0.8'), 'pt');
  assert.equal(selectPreferredLanguage('', 'pl;q=0,de;q=0.3'), 'de');
  assert.equal(selectPreferredLanguage('', 'pl;q=bad,fr;q=2,sv;q=0.5'), 'sv');
  assert.equal(selectPreferredLanguage('', '*'), 'en');
  assert.equal(selectPreferredLanguage('', ''), 'en');
});

test('neutral page redirects keep content path, encoded party ID and query string', () => {
  assert.equal(neutralRedirectPath('/', 'en'), '/en');
  assert.equal(neutralRedirectPath('/?utm_source=x', 'pl'), '/pl?utm_source=x');
  assert.equal(neutralRedirectPath('/country/bg', 'pl'), '/pl/country/bg');
  assert.equal(neutralRedirectPath('/compare/dk/%C3%85?q=1', 'en'), '/en/compare/dk/%C3%85?q=1');
  for (const route of ['about', 'sources', 'privacy', 'groups', 'not-found']) {
    assert.equal(neutralRedirectPath(`/${route}/`, 'fr'), `/fr/${route}`);
  }
});

test('technical routes, assets, external URLs and arbitrary paths are never language-redirected', () => {
  for (const route of ['/social-render/123', '/refresh', '/api/public/countries', '/i18n/pl.json',
    '/sitemap.xml', '/robots.txt', '/assets/flag.png', '/unknown', '/en/about',
    'https://evil.test/about', '//evil.test/about', '/about\\evil', '/about\r\n']) {
    assert.equal(neutralRedirectPath(route, 'pl'), null, route);
  }
});
