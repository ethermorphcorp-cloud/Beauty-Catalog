// gas.js — reads products and settings from the shop's Apps Script JSON API (on KV miss).

const CODE_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

async function callGas(env, params) {
  if (!env.GAS_URL || !env.API_SECRET) throw new Error('GAS_URL or API_SECRET is not configured');
  const url = new URL(env.GAS_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set('key', env.API_SECRET);
  // Apps Script answers with a 302 to script.googleusercontent.com; fetch follows it.
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('GAS HTTP ' + res.status);
  return res.json();
}

/** → { product, images } | { redirect } | null (not found). Throws when GAS is unreachable or rejects the key. */
export async function fetchProduct(env, code) {
  if (!CODE_PATTERN.test(code)) return null;
  const data = await callGas(env, { api: 'product', code });
  if (data.ok && data.redirect) return { redirect: data.redirect };
  if (data.ok && data.product) return { product: data.product, images: data.images || [] };
  if (data.error === 'not_found') return null;
  throw new Error('GAS error: ' + (data.error || 'unknown'));
}

export async function fetchSettings(env) {
  const data = await callGas(env, { api: 'settings' });
  if (!data.ok) throw new Error('GAS error: ' + (data.error || 'unknown'));
  return data.settings;
}
