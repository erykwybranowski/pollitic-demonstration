import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import bootstrap from './src/main.server';
import { neutralRedirectPath, selectPreferredLanguage } from './src/app/i18n/language-config';
import { SSR_RESPONSE_STATUS, SsrResponseStatus } from './src/app/ssr/response-status';

// The Express app is exported so that it can be used by serverless Functions.
export function app(): express.Express {
  const server = express();
  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  const browserDistFolder = resolve(serverDistFolder, '../browser');
  const indexHtml = join(serverDistFolder, 'index.server.html');

  const commonEngine = new CommonEngine();

  server.set('trust proxy', true);
  server.set('view engine', 'html');
  server.set('views', browserDistFolder);

  server.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const language = selectPreferredLanguage(req.headers.cookie ?? '', req.headers['accept-language'] ?? '');
    const destination = neutralRedirectPath(req.originalUrl, language);
    if (!destination) return next();
    res.setHeader('Cache-Control', 'private, no-store');
    res.vary('Cookie');
    res.vary('Accept-Language');
    return res.redirect(302, destination);
  });

  // This fixed URL changes on deployment. Do not cache it for a year like
  // fingerprinted assets; ETag/Last-Modified still allow conditional requests.
  server.get('/sitemap.xml', express.static(browserDistFolder, { maxAge: 0 }));

  // Only paths that are actual files are served directly. Page routes always
  // pass through CommonEngine, which lets it return SSR HTML (or a future SSG
  // document) instead of the empty browser index.html.
  server.get('*.*', express.static(browserDistFolder, {
    maxAge: '1y',
  }));

  // All regular routes use the Angular engine
  server.get('**', (req, res, next) => {
    const { protocol, originalUrl, baseUrl, headers } = req;
    const responseStatus: SsrResponseStatus = { code: 200 };

    commonEngine
      .render({
        bootstrap,
        documentFilePath: indexHtml,
        url: `${protocol}://${headers.host}${originalUrl}`,
        publicPath: browserDistFolder,
        providers: [
          { provide: APP_BASE_HREF, useValue: baseUrl },
          { provide: SSR_RESPONSE_STATUS, useValue: responseStatus },
        ],
      })
      .then((html) => res.status(responseStatus.code).send(html))
      .catch((err) => next(err));
  });

  return server;
}

function run(): void {
  const port = process.env['PORT'] || 4000;

  // Start up the Node server
  const server = app();
  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

run();
