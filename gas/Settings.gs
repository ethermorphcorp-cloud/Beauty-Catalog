// Settings.gs — shop settings (Settings tab) and categories (Categories tab).

const SETTING_KEYS = ['shopName', 'logoFileId', 'lineOaId', 'primaryColor', 'workerUrl'];
const SETTING_DEFAULTS = { shopName: '', logoFileId: '', lineOaId: '', primaryColor: '#2563EB', workerUrl: '' };
const SETTING_LABELS = { shopName: 'ชื่อร้าน', lineOaId: 'LINE OA ID', primaryColor: 'สีหลัก', workerUrl: 'Worker URL' };

// ---------- settings ----------

/** Per-shop defaults from shops.json (gas/ShopDefaults.gs is generated at push time; absent in tests). */
function shopDefaults_() {
  return typeof SHOP_DEFAULTS !== 'undefined' ? SHOP_DEFAULTS : {};
}

/**
 * Writes shop defaults into the Settings tab for keys that have no value yet, so the sheet shows
 * what the system uses. Never overwrites a value someone saved. Call inside withLock_.
 */
function applyShopDefaults_() {
  const defaults = shopDefaults_();
  const table = readTable_(SHEET.settings);
  const entries = [];
  const appended = [];
  Object.keys(defaults).forEach((key) => {
    if (SETTING_KEYS.indexOf(key) < 0 || !defaults[key]) return;
    const rec = table.records.find((r) => r.key === key);
    if (rec && rec.value !== '') return;
    entries.push({ field: key, before: '', after: defaults[key] });
    if (rec) {
      rec.value = defaults[key];
      writeRecord_(table, rec);
    } else {
      appended.push({ key, value: defaults[key] });
    }
  });
  appendRecords_(table, appended);
  if (entries.length) auditMany_('system (shops.json)', 'saveSettings', entries);
  return entries.length;
}

function readSettings_() {
  const out = Object.assign({}, SETTING_DEFAULTS, shopDefaults_());
  readTable_(SHEET.settings).records.forEach((r) => {
    if (SETTING_KEYS.indexOf(r.key) >= 0 && r.value !== '') out[r.key] = r.value;
  });
  return out;
}

/** Writes changed keys; returns audit entries for the values that actually changed. Call inside withLock_. */
function writeSettings_(values) {
  const table = readTable_(SHEET.settings);
  const current = readSettings_();
  const entries = [];
  const appended = [];
  Object.keys(values).forEach((key) => {
    if (SETTING_KEYS.indexOf(key) < 0 || values[key] === current[key]) return;
    entries.push({ field: key, before: current[key], after: values[key] });
    const rec = table.records.find((r) => r.key === key);
    if (rec) {
      rec.value = values[key];
      writeRecord_(table, rec);
    } else {
      appended.push({ key, value: values[key] });
    }
  });
  appendRecords_(table, appended);
  return entries;
}

/** The subset the Worker may see. */
function publicSettings_(s) {
  return { shopName: s.shopName, logoFileId: s.logoFileId, lineOaId: s.lineOaId, primaryColor: s.primaryColor, workerUrl: s.workerUrl };
}

function cleanSettingsInput_(input) {
  const s = input || {};
  const out = {};
  if ('shopName' in s) {
    out.shopName = String(s.shopName || '').trim();
    if (!out.shopName) throw userError_('กรุณากรอกชื่อร้าน');
    if (out.shopName.length > 60) throw userError_('ชื่อร้านยาวเกิน 60 ตัวอักษร');
  }
  if ('lineOaId' in s) {
    const id = String(s.lineOaId || '').trim();
    if (id && !/^@?[A-Za-z0-9._-]{1,40}$/.test(id)) throw userError_('LINE OA ID ไม่ถูกต้อง (เช่น @myshop)');
    out.lineOaId = id && id[0] !== '@' ? '@' + id : id;
  }
  if ('primaryColor' in s) {
    const color = String(s.primaryColor || '').trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw userError_('สีหลักต้องเป็นรหัสสี เช่น #1F5FAE');
    out.primaryColor = color.toUpperCase();
  }
  if ('workerUrl' in s) {
    const url = String(s.workerUrl || '').trim().replace(/\/+$/, '');
    if (url && !/^https:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[^\s]*)?$/.test(url)) throw userError_('Worker URL ต้องขึ้นต้นด้วย https://');
    out.workerUrl = url;
  }
  return out;
}

function getSettings(token) {
  return respond_(() => {
    requireUser_(token);
    return readSettings_();
  });
}

function saveSettings(token, input) {
  return respond_(() => {
    const user = requireUser_(token);
    const values = cleanSettingsInput_(input);
    const entries = withLock_(() => {
      const changed = writeSettings_(values);
      auditMany_(user.username, 'saveSettings', changed);
      return changed;
    });
    const sync = entries.length ? syncSettings_() : { synced: false, skipped: true };
    return { settings: readSettings_(), sync };
  });
}

function uploadLogo(token, file) {
  return respond_(() => {
    const user = requireUser_(token);
    const blob = imageBlob_(file);
    blob.setName('logo-' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHHmmss') + '-' + blob.getName());
    const result = withLock_(() => {
      const root = rootFolder_();
      const previous = readSettings_().logoFileId;
      const created = root.createFile(blob);
      const warning = shareAnyone_(created);
      const entries = writeSettings_({ logoFileId: created.getId() });
      auditMany_(user.username, 'uploadLogo', entries);
      // Remove the old logo only when it lives in the shop's root folder (never touch unrelated files).
      if (previous) {
        try {
          const old = DriveApp.getFileById(previous);
          let inRoot = false;
          const parents = old.getParents();
          while (parents.hasNext()) if (parents.next().getId() === root.getId()) inRoot = true;
          if (inRoot) old.setTrashed(true);
        } catch (err) {
          console.warn('old logo not removed', err);
        }
      }
      return { logoFileId: created.getId(), warning };
    });
    const sync = syncSettings_();
    return { logoFileId: result.logoFileId, warnings: result.warning ? [result.warning] : [], sync };
  });
}

// ---------- categories ----------

function cleanCategoryName_(value, allowEmpty) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name && !allowEmpty) throw userError_('กรุณากรอกชื่อหมวดหมู่');
  if (name.length > 50) throw userError_('ชื่อหมวดหมู่ยาวเกิน 50 ตัวอักษร');
  if (name.indexOf(',') >= 0) throw userError_('ชื่อหมวดหมู่ห้ามมีเครื่องหมาย ,');
  return name;
}

function readCategories_() {
  return readTable_(SHEET.categories);
}

function findCategory_(table, name) {
  const key = String(name || '').toLowerCase();
  return table.records.find((r) => r.name.toLowerCase() === key) || null;
}

/** Adds the category to the Categories tab if it is new. Call inside withLock_. */
function ensureCategory_(name) {
  if (!name) return;
  const table = readCategories_();
  if (!findCategory_(table, name)) appendRecords_(table, [{ name }]);
}

function getCategories(token) {
  return respond_(() => {
    requireUser_(token);
    const counts = {};
    readProducts_().records.forEach((r) => {
      if (r.category) counts[r.category.toLowerCase()] = (counts[r.category.toLowerCase()] || 0) + 1;
    });
    return readCategories_().records
      .filter((r) => r.name)
      .map((r) => ({ name: r.name, count: counts[r.name.toLowerCase()] || 0 }));
  });
}

function addCategory(token, name) {
  return respond_(() => {
    const user = requireUser_(token);
    const clean = cleanCategoryName_(name, false);
    return withLock_(() => {
      const table = readCategories_();
      if (findCategory_(table, clean)) throw userError_('มีหมวดหมู่ ' + clean + ' แล้ว');
      appendRecords_(table, [{ name: clean }]);
      audit_(user.username, 'addCategory', { field: 'category', after: clean });
      return { name: clean, count: 0 };
    });
  });
}

/** Renames a category and every product in it. Affected products are synced (one KV write each). */
function renameCategory(token, oldName, newName) {
  return respond_(() => {
    const user = requireUser_(token);
    const target = cleanCategoryName_(newName, false);
    const result = withLock_(() => {
      const cats = readCategories_();
      const rec = findCategory_(cats, oldName);
      if (!rec) throw userError_('ไม่พบหมวดหมู่นี้', 'not_found');
      const clash = findCategory_(cats, target);
      if (clash && clash !== rec) throw userError_('มีหมวดหมู่ ' + target + ' แล้ว');
      const from = rec.name;
      rec.name = target;
      writeRecord_(cats, rec);

      const products = readProducts_();
      const moved = products.records.filter((p) => p.category.toLowerCase() === from.toLowerCase());
      const now = nowIso_();
      moved.forEach((p) => {
        p.category = target;
        p.updatedAt = now;
        p.updatedBy = user.username;
        writeRecord_(products, p);
      });
      audit_(user.username, 'renameCategory', { field: 'category', before: from, after: target + ' (' + moved.length + ' สินค้า)' });
      return moved;
    });
    const failed = result.filter((p) => {
      const s = syncProduct_(p, p.status === 'active' ? listFolderImages_(p.folderId) : []);
      return !s.synced && !s.skipped;
    }).length;
    return { name: target, count: result.length, sync: { synced: failed === 0, failed } };
  });
}

function deleteCategory(token, name) {
  return respond_(() => {
    const user = requireUser_(token);
    return withLock_(() => {
      const cats = readCategories_();
      const rec = findCategory_(cats, name);
      if (!rec) throw userError_('ไม่พบหมวดหมู่นี้', 'not_found');
      const inUse = readProducts_().records.some((p) => p.category.toLowerCase() === rec.name.toLowerCase());
      if (inUse) throw userError_('ลบไม่ได้ เพราะยังมีสินค้าในหมวด ' + rec.name);
      cats.sheet.deleteRow(rec._row);
      audit_(user.username, 'deleteCategory', { field: 'category', before: rec.name });
      return true;
    });
  });
}
