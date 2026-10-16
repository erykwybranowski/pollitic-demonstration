import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import {
  DEFAULT_LANGUAGE_CODE,
  isLocalizedLanguageCode,
  LanguageCode,
  LanguageOption,
  isSupportedLanguageCode, LANGUAGE_COOKIE_NAME, LANGUAGE_COOKIE_MAX_AGE,
  readLanguageCookie, selectPreferredLanguage
} from './language-config';
import { ASSET_BASE_URL } from '../runtime-config';

export type { LanguageCode, LanguageOption } from './language-config';

interface TranslationDictionary {
  [key: string]: string | TranslationDictionary;
}

type TranslationValue = string | TranslationDictionary;

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private readonly fallbackLanguage: LanguageCode = DEFAULT_LANGUAGE_CODE;
  private readonly sharedTranslations: TranslationDictionary = {
    common: {
      dash: '-',
      languages: {
        en: 'English',
        pl: 'Polski',
        de: 'Deutsch',
        nl: 'Nederlands',
        fr: 'Fran\u00e7ais',
        bg: '\u0411\u044a\u043b\u0433\u0430\u0440\u0441\u043a\u0438',
        hr: 'Hrvatski',
        el: '\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac',
        cs: '\u010ce\u0161tina',
        da: 'Dansk',
        et: 'Eesti',
        fi: 'Suomi',
        sv: 'Svenska',
        hu: 'Magyar',
        it: 'Italiano',
        lv: 'Latvie\u0161u',
        lt: 'Lietuvi\u0173',
        lb: 'L\u00ebtzebuergesch',
        mt: 'Malti',
        pt: 'Portugu\u00eas',
        ro: 'Rom\u00e2n\u0103',
        sk: 'Sloven\u010dina',
        sl: 'Sloven\u0161\u010dina',
        es: 'Espa\u00f1ol'
      }
    }
  };
  private readonly languages: LanguageOption[] = [
    { code: 'en', labelKey: 'common.languages.en' },
    { code: 'pl', labelKey: 'common.languages.pl' },
    { code: 'de', labelKey: 'common.languages.de' },
    { code: 'nl', labelKey: 'common.languages.nl' },
    { code: 'fr', labelKey: 'common.languages.fr' },
    { code: 'bg', labelKey: 'common.languages.bg' },
    { code: 'hr', labelKey: 'common.languages.hr' },
    { code: 'el', labelKey: 'common.languages.el' },
    { code: 'cs', labelKey: 'common.languages.cs' },
    { code: 'da', labelKey: 'common.languages.da' },
    { code: 'et', labelKey: 'common.languages.et' },
    { code: 'fi', labelKey: 'common.languages.fi' },
    { code: 'sv', labelKey: 'common.languages.sv' },
    { code: 'hu', labelKey: 'common.languages.hu' },
    { code: 'it', labelKey: 'common.languages.it' },
    { code: 'lv', labelKey: 'common.languages.lv' },
    { code: 'lt', labelKey: 'common.languages.lt' },
    { code: 'lb', labelKey: 'common.languages.lb' },
    { code: 'mt', labelKey: 'common.languages.mt' },
    { code: 'pt', labelKey: 'common.languages.pt' },
    { code: 'ro', labelKey: 'common.languages.ro' },
    { code: 'sk', labelKey: 'common.languages.sk' },
    { code: 'sl', labelKey: 'common.languages.sl' },
    { code: 'es', labelKey: 'common.languages.es' }
  ];
  private readonly translations: Partial<Record<LanguageCode, TranslationDictionary>> = {};
  private readonly currentLanguageSubject = new BehaviorSubject<LanguageCode>(this.fallbackLanguage);

  readonly language$ = this.currentLanguageSubject.asObservable();

  constructor(
    private http: HttpClient,
    @Inject(DOCUMENT) private readonly document: Document,
    @Inject(PLATFORM_ID) private readonly platformId: Object,
    @Inject(ASSET_BASE_URL) private readonly assetBaseUrl: string
  ) {}

  get currentLanguage(): LanguageCode {
    return this.currentLanguageSubject.value;
  }

  get supportedLanguages(): LanguageOption[] {
    return this.languages;
  }

  async initialize(): Promise<void> {
    this.migrateStoredPreference();
    const language = await this.resolveInitialLanguage();

    await this.loadLanguage(this.fallbackLanguage);
    if (language !== this.fallbackLanguage) {
      await this.loadLanguage(language);
    }

    this.applyLanguage(language);
  }

  async setLanguage(language: LanguageCode): Promise<void> {
    await this.loadLanguage(language);
    this.applyLanguage(language);
  }

  get preferredLanguage(): LanguageCode {
    if (!isPlatformBrowser(this.platformId)) return this.fallbackLanguage;
    return selectPreferredLanguage(this.document.cookie, navigator.languages.join(','));
  }

  rememberLanguage(language: LanguageCode): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.document.cookie = `${LANGUAGE_COOKIE_NAME}=${language}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE}; SameSite=Lax${this.document.location.protocol === 'https:' ? '; Secure' : ''}`;
    try { localStorage.setItem('pollitic.language', language); } catch { /* Storage may be blocked. */ }
  }

  private migrateStoredPreference(): void {
    if (!isPlatformBrowser(this.platformId) || readLanguageCookie(this.document.cookie)) return;
    try {
      const language = localStorage.getItem('pollitic.language');
      if (isSupportedLanguageCode(language)) this.rememberLanguage(language);
    } catch { /* Storage may be blocked. */ }
  }

  translate(key: string, params?: Record<string, unknown>): string {
    const current = this.resolve(this.currentLanguage, key);
    const fallback = this.currentLanguage === this.fallbackLanguage
      ? current
      : this.resolve(this.fallbackLanguage, key);

    const template = current ?? fallback ?? key;
    return this.interpolate(template, params);
  }

  private async resolveInitialLanguage(): Promise<LanguageCode> {
    const pathSegments = this.document.location?.pathname
      .split('/')
      .filter(Boolean) ?? [];
    const localePrefix = pathSegments[0]?.toLowerCase();

    return isLocalizedLanguageCode(localePrefix)
      ? localePrefix
      : this.fallbackLanguage;
  }

  private async loadLanguage(language: LanguageCode): Promise<void> {
    if (this.translations[language]) {
      return;
    }

    const values = await firstValueFrom(
      this.http.get<TranslationDictionary>(`${this.assetBaseUrl}/i18n/${language}.json`)
    );
    this.translations[language] = values;
  }

  private applyLanguage(language: LanguageCode): void {
    this.currentLanguageSubject.next(language);

    if (this.document.documentElement) {
      this.document.documentElement.lang = language;
    }
  }

  private resolve(language: LanguageCode, key: string): string | null {
    const shared = this.resolveFromDictionary(this.sharedTranslations, key);
    if (shared != null) {
      return shared;
    }

    const dictionary = this.translations[language];
    if (!dictionary) {
      return null;
    }

    return this.resolveFromDictionary(dictionary, key);
  }

  private resolveFromDictionary(dictionary: TranslationDictionary, key: string): string | null {
    const value = key.split('.').reduce<TranslationValue | undefined>((current, part) => {
      if (typeof current === 'string' || current == null) {
        return undefined;
      }
      return current[part] as TranslationValue | undefined;
    }, dictionary);

    return typeof value === 'string' ? value : null;
  }

  private interpolate(template: string, params?: Record<string, unknown>): string {
    if (!params) {
      return template;
    }

    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, token: string) => {
      const value = params[token];
      return value == null ? '' : String(value);
    });
  }

}
