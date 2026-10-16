import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { DOCUMENT } from '@angular/common';
import { HTTP_TRANSFER_CACHE_ORIGIN_MAP } from '@angular/common/http';
import { appConfig } from './app.config';
import { API_BASE_URL, ASSET_BASE_URL } from './runtime-config';

const ssrApiBaseUrl = process.env['SSR_API_BASE_URL'] ?? 'https://pollitic.eu/api/public';
const publicOrigin = process.env['SSR_PUBLIC_ORIGIN'] ?? 'https://pollitic.eu';

function getSsrAssetBaseUrl(document: Document): string {
  const configuredBaseUrl = process.env['SSR_ASSET_BASE_URL'];
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  // In `ng serve`, Angular's Vite SSR middleware renders the page itself. Its
  // port is not exposed through process.env, but the server-side document has
  // the actual request URL (including a custom --port value).
  const documentOrigin = document.location?.origin;
  if (documentOrigin && documentOrigin !== 'null') {
    return documentOrigin;
  }

  // The standalone production SSR server serves both the document and assets
  // on port 4000 inside the Docker network.
  return `http://127.0.0.1:${process.env['PORT'] ?? '4000'}`;
}

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    { provide: API_BASE_URL, useValue: ssrApiBaseUrl },
    {
      provide: ASSET_BASE_URL,
      useFactory: getSsrAssetBaseUrl,
      deps: [DOCUMENT]
    },
    {
      provide: HTTP_TRANSFER_CACHE_ORIGIN_MAP,
      useValue: {
        [new URL(ssrApiBaseUrl).origin]: publicOrigin
      }
    }
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
