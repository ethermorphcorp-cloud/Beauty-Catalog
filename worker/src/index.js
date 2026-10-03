// index.js — router for the customer-facing shop (one Worker per shop, see wrangler.jsonc envs).
//   GET  /p/{code}              product page (KV → GAS on miss); old codes 301 to the current code
//   GET  /img/{fileId}?w=&s=    signed proxy for Drive thumbnails
//   POST /__sync                GAS pushes product/settings changes (X-Api-Secret)
//   GET  /                      simple shop page
// Responses are cached by Workers Caching ("cache": { "enabled": true }) according to Cache-Control.

import { fetchProduct, fetchSettings } from './gas.js';
import { imagePath, verifyImage, safeEqual } from './sign.js';
import { productPage, hiddenPage, notFoundPage, errorPage, homePage } from './render.js';

const CODE = /^[A-Za-z0-9_-]{1,40}$/;
const FILE_ID = /^[A-Za-z0-9_-]{10,128}$/;
const WIDTHS = [200, 400, 800, 1200, 1600];
// KV entries expire so a missed sync heals itself: at most one GAS read per product every 3 days.
const KV_TTL = 3 * 24 * 60 * 60;
const CACHE_HTML = 'public, max-age=60';
const CACHE_IMAGE = 'public, max-age=2592000, immutable';
const CACHE_NONE = 'no-store';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/__sync') {
        return request.method === 'POST' ? await handleSync(request, env) : plain('Method Not Allowed', 405);
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return plain('Method Not Allowed', 405);

      const img = url.pathname.match(/^\/img\/([^/]+)$/);
      if (img) return await handleImage(env, safeDecode(img[1]), url);

      const product = url.pathname.match(/^\/p\/([^/]+)\/?$/);
      if (product) return await handleProduct(env, ctx, safeDecode(product[1]), url);

      const shop = await shopFor(env, ctx, url);
      if (url.pathname === '/') return html(homePage(shop, url.origin + '/'), 200, CACHE_HTML);
      return html(notFoundPage(shop, url.href), 404, CACHE_HTML);
    } catch (err) {
      console.error('request failed', url.pathname, err && err.stack ? err.stack : err);
      return html(errorPage({}, url.href), 503, CACHE_NONE);
    }
  },
};

// ---------- helpers ----------

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch (err) {
    return '';
  }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function html(body, status, cacheControl) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cacheControl, ...SECURITY_HEADERS },
  });
}

function plain(text, status) {
  return new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': CACHE_NONE } });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': CACHE_NONE } });
}

// ---------- settings ----------

/** Shop settings from KV, falling back to GAS (and then to blanks so pages still render). */
async function getSettings(env, ctx) {
  const cached = await env.CATALOG.get('settings', 'json');
  if (cached) return cached;
  try {
    const settings = await fetchSettings(env);
    ctx.waitUntil(env.CATALOG.put('settings', JSON.stringify(settings), { expirationTtl: KV_TTL }));
    return settings;
  } catch (err) {
    console.error('settings unavailable', err);
    return {};
  }
}

/** Settings plus signed logo URLs for the header and og:image. */
async function shopFor(env, ctx, url) {
  const settings = await getSettings(env, ctx);
  const shop = { ...settings };
  if (settings.logoFileId && FILE_ID.test(settings.logoFileId) && env.API_SECRET) {
    shop.logoSrc = await imagePath(env.API_SECRET, settings.logoFileId, 200);
    shop.logoOg = url.origin + (await imagePath(env.API_SECRET, settings.logoFileId, 1200));
  }
  return shop;
}

// ---------- routes ----------

async function handleProduct(env, ctx, code, url) {
  const shop = await shopFor(env, ctx, url);
  if (!CODE.test(code)) return html(notFoundPage(shop, url.href), 404, CACHE_HTML);

  const key = 'p:' + code.toLowerCase();
  let entry = await env.CATALOG.get(key, 'json');
  if (!entry) {
    entry = await fetchProduct(env, code); // throws if GAS is unreachable → 503 (not cached)
    if (!entry) return html(notFoundPage(shop, url.href), 404, CACHE_HTML);
    ctx.waitUntil(env.CATALOG.put(key, JSON.stringify(entry), { expirationTtl: KV_TTL }));
  }

  if (entry.redirect) {
    // 301 keeps old links shared in LINE working; a short max-age lets a reassigned code take effect.
    return new Response(null, {
      status: 301,
      headers: { Location: url.origin + '/p/' + encodeURIComponent(entry.redirect), 'Cache-Control': 'public, max-age=3600' },
    });
  }

  const product = entry.product;
  if (!product || product.status !== 'active') return html(hiddenPage(shop, url.href), 410, CACHE_HTML);

  const secret = env.API_SECRET;
  const images = await Promise.all(
    (entry.images || [])
      .filter((img) => FILE_ID.test(img.id))
      .map(async (img) => {
        const [w800, w1200, w200] = await Promise.all([800, 1200, 200].map((w) => imagePath(secret, img.id, w)));
        return { name: img.name, src: w1200, srcset: w800 + ' 800w, ' + w1200 + ' 1200w', thumb: w200 };
      })
  );
  const canonical = url.origin + '/p/' + encodeURIComponent(product.code);
  const ogImage = images.length ? url.origin + images[0].src : shop.logoOg || '';
  return html(productPage({ shop, product, images, url: canonical, ogImage }), 200, CACHE_HTML);
}

async function handleImage(env, fileId, url) {
  const width = Number(url.searchParams.get('w'));
  if (!FILE_ID.test(fileId) || WIDTHS.indexOf(width) < 0) return plain('Not Found', 404);
  if (!env.API_SECRET || !(await verifyImage(env.API_SECRET, fileId, width, url.searchParams.get('s')))) {
    return plain('Forbidden', 403);
  }
  // Drive renders a resized JPEG/PNG; the Worker only streams it (no image processing within the CPU limit).
  const upstream = await fetch('https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w' + width, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CatalogImageProxy/1.0)' },
  });
  const type = upstream.headers.get('Content-Type') || '';
  if (!upstream.ok || type.indexOf('image/') !== 0) {
    console.warn('image upstream failed', fileId, upstream.status, type);
    return plain('Image Unavailable', upstream.status === 404 ? 404 : 502);
  }
  return new Response(upstream.body, {
    status: 200,
    headers: { 'Content-Type': type, 'Cache-Control': CACHE_IMAGE, 'X-Content-Type-Options': 'nosniff' },
  });
}

async function handleSync(request, env) {
  if (!env.API_SECRET || !safeEqual(request.headers.get('X-Api-Secret'), env.API_SECRET)) return json({ ok: false, error: 'unauthorized' }, 401);
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ ok: false, error: 'bad_json' }, 400);
  }

  if (body.type === 'settings' && body.data && typeof body.data === 'object') {
    await env.CATALOG.put('settings', JSON.stringify(body.data), { expirationTtl: KV_TTL });
    return json({ ok: true }, 200);
  }

  if (body.type === 'product' && body.data && body.data.product && CODE.test(body.data.product.code || '')) {
    const product = body.data.product;
    const images = Array.isArray(body.data.images) ? body.data.images.filter((i) => i && FILE_ID.test(i.id)) : [];
    const writes = [env.CATALOG.put('p:' + product.code.toLowerCase(), JSON.stringify({ product, images }), { expirationTtl: KV_TTL })];
    (Array.isArray(body.oldCodes) ? body.oldCodes : [])
      .filter((c) => CODE.test(c) && c.toLowerCase() !== product.code.toLowerCase())
      .forEach((c) => {
        writes.push(env.CATALOG.put('p:' + c.toLowerCase(), JSON.stringify({ redirect: product.code }), { expirationTtl: KV_TTL }));
      });
    await Promise.all(writes);
    return json({ ok: true, writes: writes.length }, 200);
  }

  return json({ ok: false, error: 'bad_request' }, 400);
}
