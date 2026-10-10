// Main.gs — doGet routing and shared helpers (sheets, responses, locking, hashing).

const SHEET = {
  products: 'Products',
  categories: 'Categories',
  settings: 'Settings',
  audit: 'AuditLog',
  users: 'Users',
};

const PRODUCT_HEADERS = ['productId', 'code', 'name', 'category', 'description', 'folderId', 'folderUrl', 'status', 'oldCodes', 'coverFileId', 'coverPinned', 'createdAt', 'updatedAt', 'updatedBy'];
const CATEGORY_HEADERS = ['name'];
const SETTINGS_HEADERS = ['key', 'value'];
const AUDIT_HEADERS = ['timestamp', 'user', 'action', 'productId', 'code', 'field', 'before', 'after'];
// Read-only mirror of USERS (Script Properties) for owners to see who has access. Never holds salt/hash.
const USER_HEADERS = ['username', 'displayName', 'role', 'createdAt', 'lastLoginAt'];

const CODE_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const STATUSES = ['active', 'hidden'];

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.api) return handleApi_(params);
  const boot = bootData_();
  const tpl = HtmlService.createTemplateFromFile('admin');
  // Escape "<" so shop text can never close the inline <script> it is embedded in.
  tpl.boot = JSON.stringify(boot).replace(/</g, '\\u003c');
  return tpl
    .evaluate()
    .setTitle((boot.settings.shopName ? boot.settings.shopName + ' · ' : '') + 'ระบบจัดการสินค้า')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Public branding for the login screen (before anyone signs in). */
function bootData_() {
  try {
    ensureUsersTab_();
    ensureProductColumns_();
    const s = readSettings_();
    return { settings: { shopName: s.shopName, logoFileId: s.logoFileId, primaryColor: s.primaryColor }, version: buildVersion_() };
  } catch (err) {
    return { settings: { shopName: '', logoFileId: '', primaryColor: '#2563EB' }, setupNeeded: true, version: buildVersion_() };
  }
}

/** Commit id baked in by scripts/gas.mjs at push time (gas/ShopDefaults.gs). */
function buildVersion_() {
  return typeof BUILD_VERSION !== 'undefined' ? BUILD_VERSION : 'dev';
}

/** Inlines another HTML file inside a template: <?!= include_('admin_css') ?> */
function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// ---------- errors & responses ----------

/** An error whose message is safe to show to the user (Thai). */
function userError_(message, code) {
  const err = new Error(message);
  err.userFacing = true;
  err.code = code || 'invalid';
  return err;
}

/** Runs fn and wraps the result in the { ok, data } / { ok, error, code } envelope used by the admin UI. */
function respond_(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    if (err && err.userFacing) return { ok: false, error: err.message, code: err.code };
    console.error(err && err.stack ? err.stack : err);
    return { ok: false, error: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง', code: 'internal' };
  }
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw userError_('ระบบกำลังบันทึกข้อมูลอื่นอยู่ กรุณาลองใหม่อีกครั้ง', 'busy');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Throws unless running from the Sheet/editor as a signed-in user.
 * Guards owner-only functions that google.script.run could otherwise reach from the
 * anonymous web app (which executes as the owner but has no active user).
 */
function requireEditorContext_() {
  const active = Session.getActiveUser().getEmail();
  if (!active || active !== Session.getEffectiveUser().getEmail()) {
    throw new Error('This function can only be run from the spreadsheet or the script editor.');
  }
}

// ---------- small utilities ----------

function nowIso_() {
  return new Date().toISOString();
}

function props_() {
  return PropertiesService.getScriptProperties();
}

function randomToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function sha256Hex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map((b) => ((b + 256) % 256).toString(16).padStart(2, '0'))
    .join('');
}

/** Length-safe string comparison that does not stop at the first differing character. */
function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- sheet access ----------

function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw userError_('ไม่พบแท็บ ' + name + ' กรุณารันเมนู Catalog → ตั้งค่าเริ่มต้น', 'setup');
  return sh;
}

/** Reads a sheet into objects keyed by header. Each record carries its 1-based row number in _row. */
function readTable_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  const records = [];
  for (let i = 1; i < values.length; i++) {
    const rec = { _row: i + 1 };
    headers.forEach((h, c) => {
      rec[h] = fromCell_(values[i][c]);
    });
    records.push(rec);
  }
  return { sheet: sh, headers, records };
}

function toRow_(headers, obj) {
  return headers.map((h) => toCell_(obj[h]));
}

/** Text starting with = + - @ gets a leading apostrophe so Sheets never evaluates user input as a formula. */
function toCell_(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function fromCell_(value) {
  if (value instanceof Date) return value.toISOString();
  const s = value === null || value === undefined ? '' : String(value);
  return s.replace(/^'(?=[=+\-@])/, '');
}

function writeRecord_(table, rec) {
  table.sheet.getRange(rec._row, 1, 1, table.headers.length).setValues([toRow_(table.headers, rec)]);
}

/** getRange() cannot reach past the sheet's last row, so grow the sheet first when appending. */
function ensureRows_(sheet, lastRowNeeded) {
  const max = sheet.getMaxRows();
  if (lastRowNeeded > max) sheet.insertRowsAfter(max, lastRowNeeded - max);
}

function appendRecords_(table, recs) {
  if (!recs.length) return;
  const start = table.sheet.getLastRow() + 1;
  ensureRows_(table.sheet, start + recs.length - 1);
  table.sheet
    .getRange(start, 1, recs.length, table.headers.length)
    .setValues(recs.map((r) => toRow_(table.headers, r)));
  recs.forEach((r, i) => {
    r._row = start + i;
    table.records.push(r);
  });
}
