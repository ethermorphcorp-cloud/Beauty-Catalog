// Minimal in-memory mocks of the Apps Script services used by gas/*.gs, to run _selfTest() under Node.
// Usage: npm run test:gas   (no Google account needed; real-Sheet test = menu Catalog → ทดสอบระบบ)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const gasDir = process.argv[2] || path.join(__dirname, '..', 'gas');

// ---------- Sheets ----------
class Range {
  constructor(sheet, row, col, rows, cols) { Object.assign(this, { sheet, row, col, rows, cols }); }
  getValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const line = [];
      for (let c = 0; c < this.cols; c++) {
        const v = (this.sheet.data[this.row - 1 + r] || [])[this.col - 1 + c];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    if (this.row + this.rows - 1 > this.sheet.maxRows) throw new Error('Range outside sheet dimensions');
    if (values.length !== this.rows || values[0].length !== this.cols) throw new Error('setValues size mismatch');
    values.forEach((line, r) => line.forEach((v, c) => {
      const rr = this.row - 1 + r;
      this.sheet.data[rr] = this.sheet.data[rr] || [];
      // Plain-text cells: a leading apostrophe is an escape marker and is not part of the value.
      this.sheet.data[rr][this.col - 1 + c] = typeof v === 'string' && /^'[=+\-@]/.test(v) ? v.slice(1) : v;
    }));
    return this;
  }
  setFontWeight() { return this; }
  setNumberFormat() { return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.data = []; this.maxRows = 1000; }
  getName() { return this.name; }
  getLastRow() { let n = 0; this.data.forEach((r, i) => { if (r && r.some((v) => v !== '' && v !== undefined)) n = i + 1; }); return n; }
  getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r ? r.length : 0), 0); }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(_, n) { this.maxRows += n; }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  getRange(row, col, rows = 1, cols = 1) { return new Range(this, row, col, rows, cols); }
  deleteRow(row) { this.data.splice(row - 1, 1); }
  setFrozenRows() {}
}
const spreadsheet = {
  sheets: [new Sheet('Sheet1')],
  getName: () => 'Test Shop DB',
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; },
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; },
  getSheets() { return this.sheets.slice(); },
  deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); },
};
const SpreadsheetApp = {
  getActiveSpreadsheet: () => spreadsheet,
  getUi: () => ({
    createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }),
    prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => '' }),
    alert: (...a) => console.log('[alert]', a.filter((x) => typeof x === 'string').join(' | ')),
    Button: { OK: 'OK' },
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL' },
  }),
};

// ---------- Drive ----------
let idSeq = 0;
const driveItems = {};
const newId = () => 'id' + (++idSeq).toString().padStart(12, '0');
function makeFolder(name, parentId) {
  const id = newId();
  const f = {
    id, name, parentId, trashed: false, kind: 'folder',
    getId: () => id, getName: () => f.name, getUrl: () => 'https://drive.google.com/drive/folders/' + id,
    isTrashed: () => f.trashed, setTrashed: (t) => { f.trashed = t; }, setSharing() {},
    createFolder: (n) => makeFolder(n, id),
    createFile: (blob) => makeFile(blob.getName(), blob.getContentType(), id),
    getFiles: () => iter(Object.values(driveItems).filter((x) => x.kind === 'file' && x.parentId === id)),
  };
  driveItems[id] = f;
  return f;
}
function makeFile(name, mime, parentId) {
  const id = newId();
  const f = {
    id, name, mime, parentId, trashed: false, kind: 'file',
    getId: () => id, getName: () => name, getMimeType: () => mime, isTrashed: () => f.trashed,
    setTrashed: (t) => { f.trashed = t; }, setSharing() {},
    getParents: () => iter([driveItems[parentId]]),
  };
  driveItems[id] = f;
  return f;
}
function iter(arr) { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; }
const DriveApp = {
  Access: { ANYONE_WITH_LINK: 'A' }, Permission: { VIEW: 'V' },
  createFolder: (n) => makeFolder(n, null),
  getFolderById: (id) => { const f = driveItems[id]; if (!f || f.kind !== 'folder') throw new Error('No item with the given ID'); return f; },
  getFileById: (id) => { const f = driveItems[id]; if (!f || f.kind !== 'file') throw new Error('No item with the given ID'); return f; },
};

// ---------- misc services ----------
const store = {};
const PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => (k in store ? store[k] : null), setProperty: (k, v) => { store[k] = String(v); } }) };
const cache = {};
const CacheService = { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { if (k.length > 250) throw new Error('key too long'); cache[k] = String(v); }, remove: (k) => { delete cache[k]; } }) };
const LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
const Utilities = {
  getUuid: () => crypto.randomUUID(),
  DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
  computeDigest: (alg, text) => Array.from(crypto.createHash('sha256').update(text, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
  formatDate: (d) => d.toISOString().replace('T', ' ').slice(0, 19),
  base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
  newBlob: (bytes, type, name) => { let n = name; return { getName: () => n, setName: (x) => { n = x; }, getContentType: () => type }; },
};
const Session = { getActiveUser: () => ({ getEmail: () => 'owner@example.com' }), getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }), getScriptTimeZone: () => 'Asia/Bangkok' };
const syncCalls = [];
const UrlFetchApp = { fetch: (url, opts) => { syncCalls.push({ url, body: JSON.parse(opts.payload) }); return { getResponseCode: () => 200, getContentText: () => '{}' }; } };
const ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) };
const HtmlService = {};

const context = vm.createContext({
  console, SpreadsheetApp, DriveApp, PropertiesService, CacheService, LockService, Utilities, Session, UrlFetchApp, ContentService, HtmlService,
});
const files = fs.readdirSync(gasDir).filter((f) => f.endsWith('.gs')).sort();
// Apps Script loads all files into one global scope; concatenate so top-level const/class bindings are shared.
vm.runInContext(files.map((f) => fs.readFileSync(path.join(gasDir, f), 'utf8')).join('\n;\n'), context, { filename: 'gas-bundle.js' });

// ---------- run ----------
const run = (code) => vm.runInContext(code, context);
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
