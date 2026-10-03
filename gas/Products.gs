// Products.gs — product CRUD and CSV import.
// Products are addressed by productId (system generated, immutable); code is user-editable.
// When a code changes, the old code is kept in oldCodes so customer links redirect.

const CSV_CHUNK_MAX = 50;
const CSV_PREVIEW_MAX = 2000;

// ---------- lookups ----------

function readProducts_() {
  return readTable_(SHEET.products);
}

function findById_(table, productId) {
  const id = String(productId || '');
  const rec = table.records.find((r) => r.productId === id);
  if (!rec) throw userError_('ไม่พบสินค้านี้ อาจถูกแก้ไขโดยผู้ใช้อื่น กรุณารีเฟรช', 'not_found');
  return rec;
}

function findByCode_(table, code) {
  const key = String(code || '').toLowerCase();
  return table.records.find((r) => r.code.toLowerCase() === key) || null;
}

function findByOldCode_(table, code) {
  const key = String(code || '').toLowerCase();
  return table.records.find((r) => splitCodes_(r.oldCodes).some((c) => c.toLowerCase() === key)) || null;
}

function splitCodes_(value) {
  return String(value || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Allocates the next productId. IDs are never reused, even after rows are deleted
 * (the high-water mark is kept in Script Properties as LAST_PRODUCT_SEQ). Call inside withLock_.
 */
function nextProductId_(table) {
  const maxInSheet = table.records.reduce((m, r) => {
    const n = Number(String(r.productId).replace(/^P/, ''));
    return isFinite(n) && n > m ? n : m;
  }, 0);
  const next = Math.max(maxInSheet, Number(props_().getProperty('LAST_PRODUCT_SEQ') || 0)) + 1;
  props_().setProperty('LAST_PRODUCT_SEQ', String(next));
  return 'P' + String(next).padStart(6, '0');
}

/** A current code always wins over a redirect: drop `code` from other products' oldCodes. */
function releaseOldCode_(table, code, exceptProductId) {
  const key = code.toLowerCase();
  table.records.forEach((r) => {
    if (r.productId === exceptProductId) return;
    const olds = splitCodes_(r.oldCodes);
    const kept = olds.filter((c) => c.toLowerCase() !== key);
    if (kept.length !== olds.length) {
      r.oldCodes = kept.join(',');
      writeRecord_(table, r);
    }
  });
}

function publicProduct_(rec) {
  return {
    productId: rec.productId,
    code: rec.code,
    name: rec.name,
    category: rec.category,
    description: rec.description,
    folderId: rec.folderId,
    folderUrl: rec.folderUrl,
    status: rec.status || 'active',
    oldCodes: splitCodes_(rec.oldCodes),
    coverFileId: rec.coverFileId,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    updatedBy: rec.updatedBy,
  };
}

/** Validates user input. With partial=true only the fields present are checked and returned. */
function cleanProductInput_(input, partial) {
  const out = {};
  const has = (f) => !partial || Object.prototype.hasOwnProperty.call(input, f);
  if (has('code')) {
    const code = String(input.code || '').trim();
    if (!CODE_PATTERN.test(code)) throw userError_('รหัสสินค้าใช้ได้เฉพาะ A-Z a-z 0-9 - _ ยาวไม่เกิน 40 ตัว');
    out.code = code;
  }
  if (has('name')) {
    const name = String(input.name || '').trim();
    if (!name) throw userError_('กรุณากรอกชื่อสินค้า');
    if (name.length > 200) throw userError_('ชื่อสินค้ายาวเกิน 200 ตัวอักษร');
    out.name = name;
  }
  if (has('category')) out.category = cleanCategoryName_(input.category, true);
  if (has('description')) {
    const description = String(input.description || '').replace(/\r\n?/g, '\n').trim();
    if (description.length > 5000) throw userError_('รายละเอียดยาวเกิน 5,000 ตัวอักษร');
    out.description = description;
  }
  return out;
}

// ---------- read ----------

function listProducts(token) {
  return respond_(() => {
    requireUser_(token);
    return readProducts_()
      .records.map(publicProduct_)
      // Newest first; productId breaks ties (CSV imports share one timestamp).
      .sort((a, b) => (b.createdAt + b.productId).localeCompare(a.createdAt + a.productId));
  });
}

function getProduct(token, productId) {
  return respond_(() => {
    requireUser_(token);
    const rec = findById_(readProducts_(), productId);
    return { product: publicProduct_(rec), images: listFolderImages_(rec.folderId) };
  });
}

// ---------- write ----------

function createProduct(token, input) {
  return respond_(() => {
    const user = requireUser_(token);
    const data = cleanProductInput_(input || {}, false);
    const result = withLock_(() => {
      const table = readProducts_();
      if (findByCode_(table, data.code)) throw userError_('รหัสสินค้า ' + data.code + ' มีอยู่แล้ว');
      releaseOldCode_(table, data.code, null);
      const productId = nextProductId_(table);
      const folder = createProductFolder_(productId);
      const now = nowIso_();
      const rec = Object.assign(
        {
          productId,
          folderId: folder.id,
          folderUrl: folder.url,
          status: 'active',
          oldCodes: '',
          coverFileId: '',
          createdAt: now,
          updatedAt: now,
          updatedBy: user.username,
        },
        data
      );
      appendRecords_(table, [rec]);
      ensureCategory_(data.category);
      audit_(user.username, 'createProduct', { productId, code: data.code, after: data.name });
      return { rec, warnings: folder.warning ? [folder.warning] : [] };
    });
    const sync = syncProduct_(result.rec, []);
    return { product: publicProduct_(result.rec), warnings: result.warnings, sync };
  });
}

function updateProduct(token, productId, fields) {
  return respond_(() => {
    const user = requireUser_(token);
    const data = cleanProductInput_(fields || {}, true);
    const result = withLock_(() => {
      const table = readProducts_();
      const rec = findById_(table, productId);
      const previousCode = rec.code;
      let movedFrom = null;

      if (data.code !== undefined && data.code !== rec.code) {
        const clash = findByCode_(table, data.code);
        if (clash && clash.productId !== rec.productId) throw userError_('รหัสสินค้า ' + data.code + ' มีอยู่แล้ว');
        // A case-only change keeps the same customer link (KV keys are lower-case), so no redirect is needed.
        if (data.code.toLowerCase() !== rec.code.toLowerCase()) {
          releaseOldCode_(table, data.code, rec.productId);
          const olds = splitCodes_(rec.oldCodes).filter((c) => c.toLowerCase() !== data.code.toLowerCase());
          if (!olds.some((c) => c.toLowerCase() === previousCode.toLowerCase())) olds.push(previousCode);
          rec.oldCodes = olds.join(',');
          movedFrom = previousCode;
        }
      }

      const changes = [];
      ['code', 'name', 'category', 'description'].forEach((f) => {
        if (data[f] !== undefined && data[f] !== rec[f]) {
          changes.push({ productId: rec.productId, field: f, before: rec[f], after: data[f] });
          rec[f] = data[f];
        }
      });
      if (!changes.length) return { rec, changed: false, movedFrom };

      changes.forEach((c) => {
        c.code = rec.code;
      });
      rec.updatedAt = nowIso_();
      rec.updatedBy = user.username;
      writeRecord_(table, rec);
      if (data.category) ensureCategory_(data.category);
      auditMany_(user.username, 'updateProduct', changes);
      return { rec, changed: true, movedFrom };
    });
    const sync = result.changed
      ? syncProduct_(result.rec, listFolderImages_(result.rec.folderId), result.movedFrom ? [result.movedFrom] : [])
      : { synced: false, skipped: true };
    return { product: publicProduct_(result.rec), changed: result.changed, sync };
  });
}

function setStatus(token, productId, status) {
  return respond_(() => {
    const user = requireUser_(token);
    if (STATUSES.indexOf(status) < 0) throw userError_('สถานะไม่ถูกต้อง');
    const result = withLock_(() => {
      const table = readProducts_();
      const rec = findById_(table, productId);
      if (rec.status === status) return { rec, changed: false };
      audit_(user.username, 'setStatus', { productId: rec.productId, code: rec.code, field: 'status', before: rec.status, after: status });
      rec.status = status;
      rec.updatedAt = nowIso_();
      rec.updatedBy = user.username;
      writeRecord_(table, rec);
      return { rec, changed: true };
    });
    const sync = result.changed
      ? syncProduct_(result.rec, status === 'active' ? listFolderImages_(result.rec.folderId) : [])
      : { synced: false, skipped: true };
    return { product: publicProduct_(result.rec), sync };
  });
}

// ---------- CSV import ----------
// The client parses the file (BOM, quoted fields, encoding warning) and sends row objects:
// { code, name, category, description, folder_url }.

/** Status per row: new | duplicate | invalid, checked against current codes and earlier rows of the same file. */
function evaluateCsvRows_(table, rows) {
  const existing = {};
  table.records.forEach((r) => {
    existing[r.code.toLowerCase()] = true;
  });
  const seen = {};
  return rows.map((row) => {
    const r = row || {};
    const code = String(r.code || '').trim();
    const name = String(r.name || '').trim();
    if (!code) return { status: 'invalid', message: 'ไม่มีรหัสสินค้า' };
    if (!name) return { status: 'invalid', message: 'ไม่มีชื่อสินค้า' };
    if (!CODE_PATTERN.test(code)) return { status: 'invalid', message: 'รหัสสินค้ามีอักขระที่ใช้ไม่ได้' };
    if (name.length > 200) return { status: 'invalid', message: 'ชื่อสินค้ายาวเกิน 200 ตัวอักษร' };
    if (String(r.folder_url || '').trim() && !parseFolderId_(r.folder_url)) return { status: 'invalid', message: 'ลิงก์โฟลเดอร์ไม่ถูกต้อง' };
    const key = code.toLowerCase();
    if (seen[key]) return { status: 'duplicate', message: 'รหัสซ้ำในไฟล์' };
    seen[key] = true;
    if (existing[key]) return { status: 'duplicate', message: 'มีในระบบแล้ว' };
    return { status: 'new', message: '' };
  });
}

function previewCsv(token, rows) {
  return respond_(() => {
    requireUser_(token);
    if (!Array.isArray(rows) || !rows.length) throw userError_('ไม่พบข้อมูลในไฟล์');
    if (rows.length > CSV_PREVIEW_MAX) throw userError_('ไฟล์มีมากกว่า ' + CSV_PREVIEW_MAX + ' แถว กรุณาแบ่งไฟล์');
    return evaluateCsvRows_(readProducts_(), rows);
  });
}

/** Imports up to 50 rows. Not synced to the Worker (KV write quota); pages load from GAS on first view. */
function importCsv(token, rows) {
  return respond_(() => {
    const user = requireUser_(token);
    if (!Array.isArray(rows) || !rows.length) throw userError_('ไม่พบข้อมูลที่จะนำเข้า');
    if (rows.length > CSV_CHUNK_MAX) throw userError_('นำเข้าได้ครั้งละไม่เกิน ' + CSV_CHUNK_MAX + ' แถว');
    return withLock_(() => {
      const table = readProducts_();
      const verdicts = evaluateCsvRows_(table, rows);
      const created = [];
      const skipped = [];
      const warnings = [];
      const recs = [];
      const now = nowIso_();

      rows.forEach((row, i) => {
        const code = String(row.code || '').trim();
        if (verdicts[i].status !== 'new') {
          skipped.push({ code, message: verdicts[i].message });
          return;
        }
        let data;
        try {
          data = cleanProductInput_(row, false);
        } catch (err) {
          if (!err.userFacing) throw err;
          skipped.push({ code, message: err.message });
          return;
        }
        const productId = nextProductId_(table);
        const folderUrl = String(row.folder_url || '').trim();
        let folder;
        try {
          folder = folderUrl ? linkExistingFolder_(folderUrl) : createProductFolder_(productId);
        } catch (err) {
          if (!err.userFacing) throw err;
          skipped.push({ code, message: err.message });
          return;
        }
        if (folder.warning) warnings.push(code + ': ' + folder.warning);
        releaseOldCode_(table, data.code, null);
        recs.push(
          Object.assign(
            {
              productId,
              folderId: folder.id,
              folderUrl: folder.url,
              status: 'active',
              oldCodes: '',
              coverFileId: folder.coverFileId || '',
              createdAt: now,
              updatedAt: now,
              updatedBy: user.username,
            },
            data
          )
        );
        created.push({ productId, code: data.code });
      });

      appendRecords_(table, recs);
      recs.forEach((r) => ensureCategory_(r.category));
      if (created.length) {
        audit_(user.username, 'importCsv', {
          after: created.length + ' รายการ (' + created[0].code + (created.length > 1 ? '…' + created[created.length - 1].code : '') + ')',
        });
      }
      return { created, skipped, warnings };
    });
  });
}
