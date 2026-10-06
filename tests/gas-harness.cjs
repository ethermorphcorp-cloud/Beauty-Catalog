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
const results = run('_selfTest()'); // no Worker URL yet → live shop page checks are skipped
run(`writeSettings_({ workerUrl: 'https://example.workers.dev' })`);
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
const pid = p.data.product.productId;
const idOf = (n) => imgs.data.find((i) => i.name === n).id;
// Cover = latest upload by default (a.jpg is first by name, b.jpg was uploaded first, a.jpg last).
const coverLatest = prod.data.product.coverFileId === idOf('a.jpg') && prod.data.product.coverPinned === false;
const pinB = run(`setCover('${tok}', '${pid}', '${idOf('b.jpg')}')`);
run(`uploadImage('${tok}', '${pid}', { name: 'c.jpg', mimeType: 'image/jpeg', base64: 'AAAA' })`);
const afterUpload = run(`getProduct('${tok}', '${pid}')`).data.product;
const pinOk = pinB.ok && pinB.data.coverFileId === idOf('b.jpg') && pinB.data.coverPinned === true && afterUpload.coverFileId === idOf('b.jpg') && afterUpload.coverPinned === true;
const badPin = run(`setCover('${tok}', '${pid}', 'nope')`);
const rmPinned = run(`removeImage('${tok}', '${pid}', '${idOf('b.jpg')}')`);
const latestC = rmPinned.ok && rmPinned.data.coverPinned === false && rmPinned.data.images.some((i) => i.name === 'c.jpg') &&
  rmPinned.data.coverFileId === rmPinned.data.images.find((i) => i.name === 'c.jpg').id;
const reset = run(`setCover('${tok}', '${pid}', '${idOf('a.jpg')}')`);
const auto = run(`setCover('${tok}', '${pid}', '')`);
const resetOk = reset.ok && reset.data.coverPinned && auto.ok && !auto.data.coverPinned && auto.data.coverFileId === rmPinned.data.coverFileId;
const syncImgs = require('./gas-mocks.cjs').syncCalls.filter((c) => c.body.type === 'product').pop().body.data.images;
const workerClean = syncImgs.length > 0 && syncImgs.every((i) => Object.keys(i).sort().join() === 'id,name');
const coverOk = coverLatest && pinOk && !badPin.ok && latestC && resetOk && workerClean;
console.log((coverOk ? 'PASS' : 'FAIL') + ' cover = latest by default, pinnable, falls back, worker payload clean', JSON.stringify({ coverLatest, pinOk, badPin: badPin.ok, latestC, resetOk, workerClean }));
if (!coverOk) process.exitCode = 1;
const rm = run(`removeImage('${tok}', '${pid}', '${idOf('a.jpg')}')`);
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
const demoIds = run(`readProducts_().records.filter((r) => r.code.indexOf('DEMO-') === 0).map((r) => r.productId)`);
const removed = run(`removeDemo_('test')`);
const demoLeft = run(`readProducts_().records.filter((r) => r.code.indexOf('DEMO-') === 0).length`);
const demoCatsLeft = run(`readCategories_().records.filter((c) => ['กันแดด', 'ดูแลเส้นผม'].indexOf(c.name) >= 0).length`);
const after = run(`createProduct('${tok}', { code: 'AFTER-DEMO', name: 'หลังลบตัวอย่าง', category: '' })`).data.product.productId;
const trashedDemo = Object.values(driveItems).filter((f) => f.kind === 'folder' && demoIds.indexOf(f.name) >= 0 && f.trashed).length;
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

// Lockout: 5 wrong passwords within 15 minutes lock the username, even before a correct one.
run(`withLock_(() => { const u = readUsers_(); u.push(newUser_('locktest', 'Lock test', 'staff', 'right-password')); writeUsers_(u); })`);
const attempts = [];
for (let i = 0; i < 5; i++) attempts.push(run(`login('locktest', 'wrong-password')`).code);
const afterLock = run(`login('locktest', 'right-password')`);
const lockOk = attempts.every((c) => c === 'auth_failed') && !afterLock.ok && afterLock.code === 'locked';
console.log((lockOk ? 'PASS' : 'FAIL') + ' 5 wrong passwords lock the account', JSON.stringify({ attempts, afterLock: afterLock.code }));
if (!lockOk) process.exitCode = 1;

// API_SECRET rotation: new value differs, the old one is refused by the Worker API, nothing secret is logged.
const oldSecret = run(`props_().getProperty('API_SECRET')`);
const newSecret = run(`rotateApiSecret_('test')`);
const viaOld = JSON.parse(run(`handleApi_({ api: 'settings', key: '${oldSecret}' })`).text);
const viaNew = JSON.parse(run(`handleApi_({ api: 'settings', key: '${newSecret}' })`).text);
const auditText = JSON.stringify(spreadsheet.getSheetByName('AuditLog').data);
const rotateOk = newSecret !== oldSecret && newSecret.length >= 32 && viaOld.error === 'forbidden' && viaNew.ok === true &&
  auditText.indexOf('rotateApiSecret') >= 0 && auditText.indexOf(newSecret) < 0 && auditText.indexOf(oldSecret) < 0;
console.log((rotateOk ? 'PASS' : 'FAIL') + ' API_SECRET rotation (old refused, new accepted, not logged)');
if (!rotateOk) process.exitCode = 1;

// Changing the Worker URL needs the user's own password (checked on the server).
run(`withLock_(() => { const u = readUsers_(); u.push(newUser_('urlowner', 'URL owner', 'admin', 'url-password-1')); writeUsers_(u); })`);
const urlTok = run(`login('urlowner', 'url-password-1')`).data.token;
const urlSave = (extra, pw) => run(`saveSettings('${urlTok}', ${JSON.stringify(extra)}${pw === undefined ? '' : ", '" + pw + "'"})`);
const sameUrl = run('readSettings_()').workerUrl;
const r1 = urlSave({ shopName: 'ชื่อใหม่', workerUrl: sameUrl });                     // unchanged URL → no password
const r2 = urlSave({ workerUrl: 'https://evil.example.com' });                          // changed, no password
const r3 = urlSave({ workerUrl: 'https://evil.example.com' }, 'wrong-password');        // changed, wrong password
const stillOld = run('readSettings_()').workerUrl === sameUrl;
const r4 = urlSave({ workerUrl: 'https://new.example.workers.dev/' }, 'url-password-1'); // changed, right password (trailing slash normalised)
const r5 = urlSave({ shopName: 'ไม่แตะ URL' });                                         // other fields only
const afterNew = run('readSettings_()').workerUrl;
const confirmAudit = JSON.stringify(spreadsheet.getSheetByName('AuditLog').data);
// 5 wrong confirmations share the login counter → locked, even with the right password
for (let i = 0; i < 5; i++) urlSave({ workerUrl: 'https://evil2.example.com' }, 'wrong-' + i); // a success above reset the counter
const r6 = urlSave({ workerUrl: 'https://evil2.example.com' }, 'url-password-1');
const urlOk = r1.ok && r2.code === 'confirm_required' && r3.code === 'bad_password' && stillOld && r4.ok &&
  afterNew === 'https://new.example.workers.dev' && r5.ok && confirmAudit.indexOf('confirmFailed') >= 0 &&
  confirmAudit.indexOf('url-password-1') < 0 && r6.code === 'locked';
console.log((urlOk ? 'PASS' : 'FAIL') + ' Worker URL change needs password', JSON.stringify({ r1: r1.ok, r2: r2.code, r3: r3.code, stillOld, r4: r4.ok, afterNew, r5: r5.ok, r6: r6.code }));
if (!urlOk) process.exitCode = 1;

// Settings: Sheet URL is shown to the admin UI only; LINE OA IDs that are not Official Accounts get a hint.
run(`withLock_(() => { const u = readUsers_(); u.push(newUser_('setowner', 'Set owner', 'admin', 'set-password-1')); writeUsers_(u); })`);
const adminTok = run(`login('setowner', 'set-password-1')`).data.token;
run(`props_().setProperty('ROOT_FOLDER_ID', 'MOCKROOTFOLDER01')`);
const got = run(`getSettings('${adminTok}')`).data;
const publicOnly = JSON.stringify(run('publicSettings_(readSettings_())'));
const lineBefore = require('./gas-mocks.cjs').lineChecks.length;
const lineReal = run(`saveSettings('${adminTok}', { lineOaId: '@linedevelopers' })`);
const lineFake = run(`saveSettings('${adminTok}', { lineOaId: 'jiratheepz' })`);
const lineSame = run(`saveSettings('${adminTok}', { lineOaId: '@jiratheepz', shopName: 'ชื่ออื่น' })`);
const checks = require('./gas-mocks.cjs').lineChecks.length - lineBefore;
const settingsOk = got.sheetUrl === 'https://docs.google.com/spreadsheets/d/MOCK-SHEET-ID/edit' && publicOnly.indexOf('sheetUrl') < 0 &&
  got.driveUrl === 'https://drive.google.com/drive/folders/MOCKROOTFOLDER01' && publicOnly.indexOf('driveUrl') < 0 &&
  lineReal.ok && lineReal.data.warnings.length === 0 && lineFake.ok && lineFake.data.warnings.length === 1 &&
  lineFake.data.settings.lineOaId === '@jiratheepz' && lineFake.data.warnings[0].indexOf('user not found') > 0 &&
  lineSame.ok && lineSame.data.warnings.length === 0 && checks === 2 && lineFake.data.settings.sheetUrl === got.sheetUrl;
console.log((settingsOk ? 'PASS' : 'FAIL') + ' sheet URL (admin only) + LINE OA hint', JSON.stringify({ sheetUrl: !!got.sheetUrl, publicHasSheet: publicOnly.indexOf('sheetUrl') >= 0, real: lineReal.data && lineReal.data.warnings.length, fake: lineFake.data && lineFake.data.warnings.length, same: lineSame.data && lineSame.data.warnings.length, checks }));
if (!settingsOk) process.exitCode = 1;
