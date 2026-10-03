// Api.gs — public JSON API for the Worker.
//   ?api=product&code={code}&key={API_SECRET}
//   ?api=settings&key={API_SECRET}
// doGet cannot read HTTP headers, so the secret travels in the query string.

function handleApi_(params) {
  const secret = props_().getProperty('API_SECRET');
  if (!secret || !safeEqual_(String(params.key || ''), secret)) return json_({ ok: false, error: 'forbidden' });
  if (params.api === 'product') return json_(apiProduct_(params.code));
  if (params.api === 'settings') {
    try {
      withLock_(() => applyShopDefaults_());
    } catch (err) {
      console.warn('shop defaults not written', err); // values still come from the defaults below
    }
    return json_({ ok: true, settings: publicSettings_(readSettings_()) });
  }
  return json_({ ok: false, error: 'unknown_api' });
}

/** Looks up the current code first, then old codes (→ redirect to the current code). */
function apiProduct_(code) {
  const c = String(code || '').trim();
  if (!CODE_PATTERN.test(c)) return { ok: false, error: 'not_found' };
  const table = readProducts_();
  const rec = findByCode_(table, c);
  if (rec) {
    return { ok: true, product: workerProduct_(rec), images: rec.status === 'active' ? listFolderImages_(rec.folderId) : [] };
  }
  const moved = findByOldCode_(table, c);
  if (moved) return { ok: true, redirect: moved.code };
  return { ok: false, error: 'not_found' };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
