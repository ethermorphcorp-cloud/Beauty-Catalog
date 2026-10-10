// Sync.gs — pushes changes to the Worker (POST {workerUrl}/__sync).
// A failed sync never fails the save; callers return the status so the UI can warn.

function postToWorker_(body) {
  const url = String(readSettings_().workerUrl || '').replace(/\/+$/, '');
  const secret = props_().getProperty('API_SECRET');
  if (!url || !secret) return { synced: false, skipped: true };
  try {
    const res = UrlFetchApp.fetch(url + '/__sync', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Api-Secret': secret },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
      followRedirects: false,
    });
    const code = res.getResponseCode();
    if (code >= 200 && code < 300) return { synced: true };
    console.warn('sync failed', code, res.getContentText().slice(0, 200));
    return { synced: false, error: 'HTTP ' + code };
  } catch (err) {
    console.warn('sync error', err);
    return { synced: false, error: String((err && err.message) || err) };
  }
}

/** The product as the Worker sees it. Hidden products carry no details. */
function workerProduct_(rec) {
  if (rec.status !== 'active') return { productId: rec.productId, code: rec.code, status: 'hidden', updatedAt: rec.updatedAt };
  return {
    productId: rec.productId,
    code: rec.code,
    name: rec.name,
    category: rec.category,
    description: rec.description,
    status: 'active',
    updatedAt: rec.updatedAt,
  };
}

/** oldCodes: codes that should now redirect to rec.code (only the ones that just changed, to save KV writes). */
function syncProduct_(rec, images, oldCodes) {
  return postToWorker_({
    type: 'product',
    data: { product: workerProduct_(rec), images: rec.status === 'active' ? images || [] : [] },
    oldCodes: oldCodes || [],
  });
}

function syncSettings_() {
  return postToWorker_({ type: 'settings', data: publicSettings_(readSettings_()) });
}
