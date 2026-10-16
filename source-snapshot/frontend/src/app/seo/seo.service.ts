import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslationService } from '../i18n/translation.service';
import { buildLocalizedPath, getContentPathSegments, getLanguageFromPathSegments, LanguageCode } from '../i18n/language-config';
import { isSupportedCountryCode } from '../routing/country-routes';
import { SITE_URL } from './site-config';

type StaticSeoPage = 'home' | 'groups' | 'about' | 'privacy' | 'sources';

interface PageMetadata {
  title: string;
  description: string;
  robots: string;
  canonicalPath?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private readonly siteUrl = SITE_URL;
  private readonly socialImageUrl = `${this.siteUrl}/assets/og/pollitic-social.png`;
  private readonly subscriptions = new Subscription();
  private initialized = false;

  constructor(
    private readonly router: Router,
    private readonly title: Title,
    private readonly meta: Meta,
    private readonly i18n: TranslationService,
    @Inject(DOCUMENT) private readonly document: Document
  ) {}

  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.subscriptions.add(
      this.router.events.subscribe(event => {
        if (event instanceof NavigationEnd) {
          this.updateMetadata();
        }
      })
    );
    this.subscriptions.add(this.i18n.language$.subscribe(() => this.updateMetadata()));
    this.updateMetadata();
  }

  private updateMetadata(): void {
    const requestedPath = this.router.url.split(/[?#]/, 1)[0] || '/';
    const requestedSegments = requestedPath.split('/').filter(Boolean);
    const language = getLanguageFromPathSegments(requestedSegments);
    const contentSegments = getContentPathSegments(requestedSegments);
    const metadata = this.getPageMetadata(contentSegments, language);
    const canonicalPath = metadata.canonicalPath ?? buildLocalizedPath(language, contentSegments);
    const canonicalUrl = new URL(canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`, this.siteUrl).toString();

    this.title.setTitle(metadata.title);
    this.meta.updateTag({ name: 'description', content: metadata.description });
    this.meta.updateTag({ name: 'robots', content: metadata.robots });
    this.meta.updateTag({ property: 'og:title', content: metadata.title }, "property='og:title'");
    this.meta.updateTag({ property: 'og:description', content: metadata.description }, "property='og:description'");
    this.meta.updateTag({ property: 'og:url', content: canonicalUrl }, "property='og:url'");
    this.meta.updateTag({ property: 'og:image', content: this.socialImageUrl }, "property='og:image'");
    this.meta.updateTag({ property: 'og:image:alt', content: this.i18n.translate('seo.imageAlt') }, "property='og:image:alt'");
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: metadata.title }, "name='twitter:title'");
    this.meta.updateTag({ name: 'twitter:description', content: metadata.description }, "name='twitter:description'");
    this.meta.updateTag({ name: 'twitter:image', content: this.socialImageUrl }, "name='twitter:image'");
    this.setCanonical(canonicalUrl);
    this.setStructuredData(contentSegments, language, canonicalUrl, metadata);
  }

  private getPageMetadata(segments: string[], language: LanguageCode): PageMetadata {
    const countryCode = segments[1]?.toLowerCase();

    if (segments[0] === 'not-found' || (segments[0] === 'country' && !isSupportedCountryCode(countryCode))) {
      return this.getNotFoundMetadata();
    }

    if (segments[0] === 'country' && countryCode) {
      return this.getLocalizedMetadata('country', countryCode);
    }

    if (segments[0] === 'compare' && countryCode) {
      if (!isSupportedCountryCode(countryCode)) {
        return this.getNotFoundMetadata();
      }

      const metadata = this.getLocalizedMetadata('compare', countryCode);
      return segments.length > 2
        ? {
            ...metadata,
            robots: 'noindex,follow',
            canonicalPath: buildLocalizedPath(language, ['compare', countryCode])
          }
        : metadata;
    }

    if (segments[0] === 'groups') {
      return this.getStaticMetadata('groups');
    }

    if (segments[0] === 'about') {
      return this.getStaticMetadata('about');
    }

    if (segments[0] === 'privacy') {
      return this.getStaticMetadata('privacy');
    }

    if (segments[0] === 'sources') {
      return this.getStaticMetadata('sources');
    }

    if (segments[0] === 'refresh') {
      return {
        ...this.getStaticMetadata('home'),
        robots: 'noindex,nofollow'
      };
    }

    return this.getStaticMetadata('home');
  }

  private getLocalizedMetadata(page: 'country' | 'compare', countryCode: string): PageMetadata {
    const country = this.i18n.translate(`countries.${countryCode}`);
    const countryName = country === `countries.${countryCode}` ? countryCode.toUpperCase() : country;

    return {
      title: this.i18n.translate(`seo.${page}.title`, { country: countryName }),
      description: this.i18n.translate(`seo.${page}.description`, { country: countryName }),
      robots: 'index,follow'
    };
  }

  private getStaticMetadata(page: StaticSeoPage): PageMetadata {
    return {
      title: this.i18n.translate(`seo.${page}.title`),
      description: this.i18n.translate(`seo.${page}.description`),
      robots: 'index,follow'
    };
  }

  private getNotFoundMetadata(): PageMetadata {
    return {
      title: this.i18n.translate('seo.notFound.title'),
      description: this.i18n.translate('seo.notFound.description'),
      robots: 'noindex,nofollow'
    };
  }

  private setCanonical(url: string): void {
    let canonical = this.document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;

    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.rel = 'canonical';
      this.document.head.appendChild(canonical);
    }

    canonical.href = url;
  }

  private setStructuredData(
    segments: string[],
    language: LanguageCode,
    canonicalUrl: string,
    metadata: PageMetadata
  ): void {
    const existing = this.document.head.querySelector('script#pollitic-structured-data') as HTMLScriptElement | null;

    if (metadata.robots.includes('noindex')) {
      existing?.remove();
      return;
    }

    const countryCode = segments[1]?.toLowerCase();
    const websiteId = `${this.siteUrl}/#website`;
    const page: Record<string, unknown> = {
      '@type': this.getStructuredPageType(segments[0]),
      '@id': `${canonicalUrl}#webpage`,
      url: canonicalUrl,
      name: metadata.title,
      description: metadata.description,
      isPartOf: { '@id': websiteId }
    };

    const graph: Record<string, unknown>[] = [
      {
        '@type': 'WebSite',
        '@id': websiteId,
        url: `${this.siteUrl}/`,
        name: 'Pollitic.EU',
        description: this.i18n.translate('seo.home.description')
      },
      page
    ];

    if ((segments[0] === 'country' || segments[0] === 'compare') && countryCode) {
      const country = this.i18n.translate(`countries.${countryCode}`);
      const countryName = country === `countries.${countryCode}` ? countryCode.toUpperCase() : country;
      page['about'] = { '@type': 'Country', name: countryName };
      page['breadcrumb'] = { '@id': `${canonicalUrl}#breadcrumb` };
      graph.push({
        '@type': 'BreadcrumbList',
        '@id': `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Pollitic.EU',
            item: new URL(buildLocalizedPath(language, []), this.siteUrl).toString()
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: segments[0] === 'country'
              ? countryName
              : this.i18n.translate('seo.compareBreadcrumb', { country: countryName }),
            item: canonicalUrl
          }
        ]
      });
    }

    const structuredData = {
      '@context': 'https://schema.org',
      '@graph': graph
    };
    const script = existing ?? this.document.createElement('script');
    script.id = 'pollitic-structured-data';
    script.type = 'application/ld+json';
    script.text = JSON.stringify(structuredData).replace(/</g, '\\u003c');

    if (!existing) {
      this.document.head.appendChild(script);
    }
  }

  private getStructuredPageType(segment: string | undefined): string {
    switch (segment) {
      case 'country':
      case 'compare':
        return 'CollectionPage';
      case 'about':
        return 'AboutPage';
      default:
        return 'WebPage';
    }
  }
}
