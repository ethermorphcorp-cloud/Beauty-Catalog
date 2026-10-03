// gas-harness.cjs — runs _selfTest() and extra backend checks under Node mocks.
// Usage: npm run test:gas   (no Google account needed; real-Sheet test = menu Catalog → ทดสอบระบบ)
const path = require('path');
const { loadGas, spreadsheet, store, syncCalls, driveItems } = require('./gas-mocks.cjs');

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

// Demo seed data: add, re-add (idempotent), remove; product IDs are never reused.
const seeded = run(`seedDemo_('test')`);
const again = run(`seedDemo_('test')`);
const maxIdBefore = run(`readProducts_().records.map((r) => r.productId).sort().pop()`);
const removed = run(`removeDemo_('test')`);
const demoLeft = run(`readProducts_().records.filter((r) => r.code.indexOf('DEMO-') === 0).length`);
const demoCatsLeft = run(`readCategories_().records.filter((c) => ['กันแดด', 'ดูแลเส้นผม'].indexOf(c.name) >= 0).length`);
const after = run(`createProduct('${tok}', { code: 'AFTER-DEMO', name: 'หลังลบตัวอย่าง', category: '' })`).data.product.productId;
const trashedDemo = Object.values(driveItems).filter((f) => f.kind === 'folder' && /^P0000(0[4-9]|1[0-5])$/.test(f.name) && f.trashed).length;
const seedOk = trashedDemo === 12 && seeded.added === 12 && again.added === 0 && again.skipped === 12 && removed.removed === 12 && demoLeft === 0 && demoCatsLeft === 0 && after > maxIdBefore;
console.log((seedOk ? 'PASS' : 'FAIL') + ' demo seed add/re-add/remove, ids not reused', JSON.stringify({ trashedDemo, seeded, again, removed, demoLeft, demoCatsLeft, maxIdBefore, after }));
if (!seedOk) process.exitCode = 1;

// Users tab mirrors USERS (no salt/hash) and is protected with a warning.
const usersTab = spreadsheet.getSheetByName('Users');
const userRows = usersTab.data.slice(1).filter((r) => r && r[0]);
const usersOk = usersTab.data[0].join(',') === 'username,displayName,role,createdAt,lastLoginAt' &&
  userRows.length === JSON.parse(store.USERS).length &&
  !JSON.stringify(usersTab.data).match(/salt|hash/) && usersTab.protections && usersTab.protections[0].warningOnly === true;
console.log((usersOk ? 'PASS' : 'FAIL') + ' Users tab mirrors accounts without secrets', JSON.stringify(userRows));
if (!usersOk) process.exitCode = 1;

// Per-shop defaults: fill empty Settings keys only, never overwrite saved values.
run(`var SHOP_DEFAULTS = { primaryColor: '#8E4AA8', workerUrl: 'https://lemon.example.workers.dev' }`);
const filled = run(`withLock_(() => applyShopDefaults_())`);
const afterDefaults = run('readSettings_()');
const defaultsOk = filled === 0 && afterDefaults.primaryColor === '#1F5FAE'; // saved earlier in this test → kept
run(`withLock_(() => { const t = readTable_(SHEET.settings); t.records.filter((r) => r.key === 'primaryColor').forEach((r) => { r.value = ''; writeRecord_(t, r); }); })`);
const filled2 = run(`withLock_(() => applyShopDefaults_())`);
const defaultsOk2 = filled2 === 1 && run('readSettings_()').primaryColor === '#8E4AA8';
console.log((defaultsOk && defaultsOk2 ? 'PASS' : 'FAIL') + ' shop defaults fill empty settings only', JSON.stringify({ filled, filled2 }));
if (!(defaultsOk && defaultsOk2)) process.exitCode = 1;
