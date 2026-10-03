// gas-harness.cjs — runs _selfTest() and extra backend checks under Node mocks.
// Usage: npm run test:gas   (no Google account needed; real-Sheet test = menu Catalog → ทดสอบระบบ)
const path = require('path');
const { loadGas, spreadsheet, store, syncCalls } = require('./gas-mocks.cjs');

const gasDir = process.argv[2] || path.join(__dirname, '..', 'gas');
const { run } = loadGas(gasDir);

// ---------- run ----------
run('setup()');
console.log('sheets:', spreadsheet.sheets.map((s) => s.name).join(', '));
run(`upsertAdmin_('owner', 'owner-password', 'owner@example.com')`);
run(`writeSettings_({ workerUrl: 'https://example.workers.dev' })`);
const results = run('_selfTest()');
console.log(results.join('\n'));

// Extra checks outside the self test.
const t = run(`login('owner', 'owner-password')`);
if (!t.ok) throw new Error('owner login failed');
const tok = t.data.token;
const p = run(`createProduct('${tok}', { code: 'A-1', name: 'สินค้า A', category: 'หมวด 1' })`);
const up = run(`uploadImage('${tok}', '${p.data.product.productId}', { name: 'b.jpg', mimeType: 'image/jpeg', base64: 'AAAA' })`);
run(`uploadImage('${tok}', '${p.data.product.productId}', { name: 'a.jpg', mimeType: 'image/jpeg', base64: 'AAAA' })`);
const imgs = run(`listImages('${tok}', '${p.data.product.productId}')`);
console.log('images sorted:', imgs.data.map((i) => i.name).join(','), '| upload ok:', up.ok);
const prod = run(`getProduct('${tok}', '${p.data.product.productId}')`);
console.log('cover is first image:', prod.data.product.coverFileId === imgs.data[0].id);
const rm = run(`removeImage('${tok}', '${p.data.product.productId}', '${imgs.data[0].id}')`);
console.log('remove ok:', rm.ok, 'remaining:', rm.data.images.map((i) => i.name).join(','));
const ren = run(`renameCategory('${tok}', 'หมวด 1', 'หมวดใหม่')`);
console.log('rename category:', JSON.stringify(ren));
const set = run(`saveSettings('${tok}', { shopName: 'ร้านทดสอบ', lineOaId: 'myshop', primaryColor: '#1f5fae' })`);
console.log('settings:', JSON.stringify(set.data.settings));
const csv = run(`importCsv('${tok}', [{ code: 'C-1', name: 'จาก CSV', category: 'หมวด CSV' }, { code: 'A-1', name: 'ซ้ำ' }])`);
console.log('importCsv:', JSON.stringify(csv.data));
const api = JSON.parse(run(`handleApi_({ api: 'product', code: 'a-1', key: PropertiesService.getScriptProperties().getProperty('API_SECRET') })`).text);
console.log('api product:', api.ok, api.product && api.product.name, 'images:', api.images.length);
const bad = JSON.parse(run(`handleApi_({ api: 'product', code: 'a-1', key: 'wrong' })`).text);
console.log('api wrong key:', bad.error);
const audit = spreadsheet.getSheetByName('AuditLog').data;
console.log('audit rows:', audit.length - 1, '| actions:', [...new Set(audit.slice(1).map((r) => r[2]))].join(','));
console.log('selftest users left:', JSON.parse(store.USERS).map((u) => u.username).join(','));
console.log('sync calls:', syncCalls.length, 'last:', JSON.stringify(syncCalls[syncCalls.length - 1].body).slice(0, 160));
