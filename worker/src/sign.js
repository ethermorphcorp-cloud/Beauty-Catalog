// sign.js — HMAC-SHA256 signatures for /img URLs so the Worker is never an open image proxy.

const encoder = new TextEncoder();
let cachedKey = null;
let cachedSecret = null;

async function hmacKey(secret) {
  if (cachedKey && cachedSecret === secret) return cachedKey;
  cachedKey = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  cachedSecret = secret;
  return cachedKey;
}

function toBase64Url(buffer) {
  let s = '';
  new Uint8Array(buffer).forEach((b) => {
    s += String.fromCharCode(b);
  });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const payload = (fileId, width) => fileId + ':' + width;

export async function signImage(secret, fileId, width) {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(payload(fileId, width)));
  return toBase64Url(sig);
}

/** Constant-time verification via crypto.subtle.verify. */
export async function verifyImage(secret, fileId, width, signature) {
  if (!signature || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(secret), fromBase64Url(signature), encoder.encode(payload(fileId, width)));
}

/** Path + query for an image at a given width, e.g. /img/abc?w=1200&s=... */
export async function imagePath(secret, fileId, width) {
  return '/img/' + encodeURIComponent(fileId) + '?w=' + width + '&s=' + (await signImage(secret, fileId, width));
}

/** Constant-time string comparison for the sync secret header. */
export function safeEqual(a, b) {
  const x = encoder.encode(String(a || ''));
  const y = encoder.encode(String(b || ''));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
