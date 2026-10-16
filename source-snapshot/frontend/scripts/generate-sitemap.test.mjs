import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  generateSitemap, escapeXml, languages, countries, contentPaths,
  defaultLanguage, siteUrl, localizedUrl, neutralUrl, sitemapFile,
} from './generate-sitemap.mjs';

const xml = generateSitemap();
const entries = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>([\s\S]*?)<\/url>/g)]
  .map(([, loc, body]) => ({ loc, links: [...body.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)" \/>/g)]
    .map(([, language, url]) => ({ language, url })) }));
const byUrl = new Map(entries.map(entry => [entry.loc, entry]));

test('includes exactly the public indexable routes in every supported language', () => {
  assert.equal(contentPaths.length, 5 + countries.length * 2);
  assert.equal(entries.length, contentPaths.length * languages.length);
  assert.equal(byUrl.size, entries.length);
  for (const segments of contentPaths) {
    for (const language of languages) {
      assert.ok(byUrl.has(localizedUrl(language, segments)));
    }
  }
  for (const { loc } of entries) {
    const url = new URL(loc);
    assert.equal(url.origin, siteUrl);
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    assert.doesNotMatch(url.pathname, /refresh|social-render|not-found/);
    assert.ok(languages.includes(url.pathname.split('/')[1]));
    assert.doesNotMatch(url.pathname, /\/compare\/[^/]+\//);
  }
});

test('prefixes English too and builds language prefixes independently of country codes', () => {
  assert.equal(defaultLanguage, 'en');
  assert.equal(localizedUrl('en', []), 'https://pollitic.eu/en');
  assert.equal(localizedUrl('en', ['country', 'bg']), 'https://pollitic.eu/en/country/bg');
  assert.equal(localizedUrl('pl', []), 'https://pollitic.eu/pl');
  assert.equal(localizedUrl('hr', ['country', 'ee']), 'https://pollitic.eu/hr/country/ee');
  assert.equal(localizedUrl('sv', ['country', 'se']), 'https://pollitic.eu/sv/country/se');
  assert.equal(localizedUrl('sl', ['compare', 'si']), 'https://pollitic.eu/sl/compare/si');
});

test('all hreflang sets contain self, every language, reciprocal links and neutral x-default', () => {
  for (const segments of contentPaths) {
    const expected = [
      ...languages.map(language => ({ language, url: localizedUrl(language, segments) })),
      { language: 'x-default', url: neutralUrl(segments) },
    ];
    for (const language of languages) {
      const entry = byUrl.get(localizedUrl(language, segments));
      assert.deepEqual(entry.links, expected);
      for (const link of entry.links) {
        if (link.language === 'x-default') assert.ok(!byUrl.has(link.url));
        else assert.ok(byUrl.has(link.url));
      }
    }
  }
});

test('declares XML namespaces, stays within limits and does not invent lastmod dates', () => {
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.match(xml, /xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
  assert.match(xml, /xmlns:xhtml="http:\/\/www.w3.org\/1999\/xhtml"/);
  assert.ok(entries.length <= 50_000);
  assert.ok(Buffer.byteLength(xml) <= 50 * 1024 * 1024);
  assert.doesNotMatch(xml, /lastmod|changefreq|priority/);
  assert.equal(escapeXml('<"a&b\'>'), '&lt;&quot;a&amp;b&apos;&gt;');
});

test('the checked-in sitemap matches the generator (including Windows line endings)', async () => {
  const existing = await readFile(sitemapFile, 'utf8');
  assert.equal(existing.replaceAll('\r\n', '\n'), xml);
});
