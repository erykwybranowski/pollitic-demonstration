import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const assetsDirectory = process.env.SOCIAL_ASSETS_DIR ?? '/var/lib/pollitic/social-assets';
const rendererBaseUrl = process.env.SOCIAL_RENDER_BASE_URL ?? 'http://frontend';
const rendererApiKey = process.env.SOCIAL_RENDERER_API_KEY ?? '';
const pollIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let browser;
let renderQueue = Promise.resolve();

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function isAuthorized(request) {
  if (!rendererApiKey) {
    return true;
  }

  const suppliedKey = request.headers['x-social-renderer-key'];
  if (typeof suppliedKey !== 'string') {
    return false;
  }

  const expected = Buffer.from(rendererApiKey);
  const actual = Buffer.from(suppliedKey);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16 * 1024) {
      throw new Error('Request body is too large.');
    }
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

async function waitForStableSocialCard(page) {
  const card = page.locator('article.social-card');
  await card.waitFor({ state: 'visible', timeout: 30_000 });

  await page.waitForFunction(() => {
    const cardElement = document.querySelector('article.social-card');
    const frame = document.querySelector('.social-graph-fit-frame-active');
    const canvas = document.querySelector('.social-graph-fit-canvas-active');
    const images = Array.from(document.images);

    if (!cardElement || !frame || !canvas || images.some(image => !image.complete || image.naturalWidth === 0)) {
      return false;
    }

    const frameHeight = frame.getBoundingClientRect().height;
    const canvasHeight = canvas.getBoundingClientRect().height;
    return document.fonts.status === 'loaded'
      && frameHeight > 0
      && canvasHeight > 0
      && Math.abs(frameHeight - canvasHeight) < 3;
  }, undefined, { timeout: 30_000 });

  let previousSize;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const size = await card.evaluate(element => {
      const { width, height } = element.getBoundingClientRect();
      return { width: Math.round(width), height: Math.round(height) };
    });

    if (previousSize && previousSize.width === size.width && previousSize.height === size.height) {
      return size;
    }

    previousSize = size;
    await page.waitForTimeout(150);
  }

  throw new Error('Social card size did not become stable.');
}

async function renderPoll(pollId) {
  const instance = await getBrowser();
  const context = await instance.newContext({
    viewport: { width: 1120, height: 1500 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  try {
    await page.route('**/api/**', route => {
      const requestUrl = new URL(route.request().url());
      const internalApiUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, rendererBaseUrl).toString();
      return route.continue({ url: internalApiUrl });
    });

    const socialRenderUrl = new URL(`/social-render/${pollId}`, rendererBaseUrl).toString();
    await page.goto(socialRenderUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const size = await waitForStableSocialCard(page);
    const png = await page.locator('article.social-card').screenshot({ type: 'png' });
    const relativePath = join('polls', pollId, 'portrait.png');
    const targetPath = join(assetsDirectory, relativePath);
    const temporaryPath = `${targetPath}.tmp`;

    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(temporaryPath, png);
    await rename(temporaryPath, targetPath);

    return {
      pollId,
      format: 'portrait',
      path: relativePath.replaceAll('\\', '/'),
      width: size.width,
      height: size.height,
      bytes: png.length,
      checksum: createHash('sha256').update(png).digest('hex'),
      renderedAt: new Date().toISOString()
    };
  } finally {
    await context.close();
  }
}

function enqueueRender(pollId) {
  const render = renderQueue.then(() => renderPoll(pollId));
  renderQueue = render.then(() => undefined, () => undefined);
  return render;
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (request.method !== 'POST' || request.url !== '/render') {
    sendJson(response, 404, { error: 'Not found.' });
    return;
  }

  if (!isAuthorized(request)) {
    sendJson(response, 401, { error: 'Unauthorized.' });
    return;
  }

  try {
    const { pollId } = await readJsonBody(request);
    if (typeof pollId !== 'string' || !pollIdPattern.test(pollId)) {
      sendJson(response, 400, { error: 'pollId must be a UUID.' });
      return;
    }

    const asset = await enqueueRender(pollId);
    sendJson(response, 201, asset);
  } catch (error) {
    console.error('Social render failed:', error);
    sendJson(response, 500, { error: 'Social render failed.' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Social renderer is listening on port ${port}.`);
});

async function shutdown() {
  server.close();
  await browser?.close();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
