// Drive.gs — product image folders, uploads, sharing and image listing.
// Product folders are named after productId under the shop's ROOT_FOLDER_ID.

const IMAGE_MAX_BASE64 = 14 * 1024 * 1024; // ~10 MB binary; the client resizes to <= 1600px first
const SHARE_WARNING = 'ตั้งค่าแชร์โฟลเดอร์ให้ "ทุกคนที่มีลิงก์" ไม่ได้ (อาจไม่ใช่เจ้าของโฟลเดอร์) รูปอาจไม่แสดงบนหน้าร้าน';

function rootFolder_() {
  const id = props_().getProperty('ROOT_FOLDER_ID');
  if (!id) throw userError_('ยังไม่ได้ตั้งโฟลเดอร์หลัก กรุณารันเมนู Catalog → ตั้งค่าเริ่มต้น', 'setup');
  return DriveApp.getFolderById(id);
}

/** Extracts a folder id from a Drive folder URL or a bare id. Returns '' when it does not look like one. */
function parseFolderId_(value) {
  const s = String(value || '').trim();
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || s.match(/^([A-Za-z0-9_-]{10,})$/);
  return m ? m[1] : '';
}

/** Makes a folder (or file) viewable by anyone with the link. Returns a warning string instead of throwing. */
function shareAnyone_(item) {
  try {
    item.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return '';
  } catch (err) {
    console.warn('setSharing failed', err);
    return SHARE_WARNING;
  }
}

function createProductFolder_(productId) {
  const folder = rootFolder_().createFolder(productId);
  return { id: folder.getId(), url: folder.getUrl(), warning: shareAnyone_(folder) };
}

/** Opens a user-supplied folder link, shares it, and picks its cover (the latest image). */
function linkExistingFolder_(folderUrl) {
  const id = parseFolderId_(folderUrl);
  if (!id) throw userError_('ลิงก์โฟลเดอร์ Google Drive ไม่ถูกต้อง');
  let folder;
  try {
    folder = DriveApp.getFolderById(id);
    folder.getName();
  } catch (err) {
    throw userError_('เปิดโฟลเดอร์นี้ไม่ได้ ตรวจสอบว่าลิงก์ถูกต้องและบัญชีเจ้าของระบบมีสิทธิ์เข้าถึง');
  }
  const images = listFolderImages_(id);
  return { id, url: folder.getUrl(), warning: shareAnyone_(folder), coverFileId: pickCover_({}, images).id };
}

/** Images in a folder sorted by file name (natural order). Each carries its creation time (ISO) for cover selection. */
function listFolderImages_(folderId) {
  if (!folderId) return [];
  let folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (err) {
    console.warn('folder not accessible', folderId, err);
    return [];
  }
  const images = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (!f.isTrashed() && String(f.getMimeType()).indexOf('image/') === 0) images.push({ id: f.getId(), name: f.getName(), created: f.getDateCreated().toISOString() });
  }
  return images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

/** Ensures the product has a usable folder (re-creating it if it was removed). Call inside withLock_. */
function ensureProductFolder_(table, rec) {
  if (rec.folderId) {
    try {
      const f = DriveApp.getFolderById(rec.folderId);
      if (!f.isTrashed()) return { folder: f, warning: '' };
    } catch (err) {
      console.warn('product folder missing, re-creating', rec.productId, err);
    }
  }
  const created = createProductFolder_(rec.productId);
  rec.folderId = created.id;
  rec.folderUrl = created.url;
  writeRecord_(table, rec);
  return { folder: DriveApp.getFolderById(created.id), warning: created.warning };
}

function cleanFileName_(name, mimeType) {
  let n = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120) || 'image';
  if (mimeType === 'image/jpeg' && !/\.jpe?g$/i.test(n)) n = n.replace(/\.[A-Za-z0-9]{1,5}$/, '') + '.jpg';
  return n;
}

/** Decodes { name, mimeType, base64 } from the client into a Blob, validating type and size. */
function imageBlob_(file) {
  const f = file || {};
  const mimeType = String(f.mimeType || '');
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mimeType)) throw userError_('รองรับเฉพาะไฟล์รูป JPG, PNG, WEBP หรือ GIF');
  const b64 = String(f.base64 || '');
  if (!b64) throw userError_('ไม่พบข้อมูลรูป');
  if (b64.length > IMAGE_MAX_BASE64) throw userError_('ไฟล์รูปใหญ่เกินไป');
  return Utilities.newBlob(Utilities.base64Decode(b64), mimeType, cleanFileName_(f.name, mimeType));
}

/**
 * The cover is the image the user pinned (setCover) while it still exists in the folder,
 * otherwise the most recently created image. Ties go to the later file name.
 */
function pickCover_(rec, images) {
  if (!images.length) return { id: '', pinned: false };
  if (rec.coverPinned === '1' && images.some((i) => i.id === rec.coverFileId)) return { id: rec.coverFileId, pinned: true };
  let latest = images[0];
  images.forEach((i) => {
    if (i.created >= latest.created) latest = i;
  });
  return { id: latest.id, pinned: false };
}

/** Sets rec.coverFileId / rec.coverPinned from the current images (the caller writes the row). */
function applyCover_(rec, images) {
  const cover = pickCover_(rec, images);
  rec.coverFileId = cover.id;
  rec.coverPinned = cover.pinned ? '1' : '';
  return cover;
}

/** Updates the stored cover when it no longer matches the folder. Returns true when the row was written. */
function refreshCover_(table, rec, images) {
  const cover = pickCover_(rec, images);
  if (rec.coverFileId === cover.id && (rec.coverPinned === '1') === cover.pinned) return false;
  applyCover_(rec, images);
  writeRecord_(table, rec);
  return true;
}

// ---------- API ----------

function uploadImage(token, productId, file) {
  return respond_(() => {
    const user = requireUser_(token);
    const blob = imageBlob_(file);
    const result = withLock_(() => {
      const table = readProducts_();
      const rec = findById_(table, productId);
      const target = ensureProductFolder_(table, rec);
      const created = target.folder.createFile(blob);
      const warning = target.warning || shareAnyone_(created);
      const images = listFolderImages_(rec.folderId);
      rec.updatedAt = nowIso_();
      rec.updatedBy = user.username;
      applyCover_(rec, images);
      writeRecord_(table, rec);
      audit_(user.username, 'uploadImage', { productId: rec.productId, code: rec.code, field: 'images', after: created.getName() });
      return { rec, images, warning };
    });
    const sync = syncProduct_(result.rec, result.images);
    return { images: result.images, coverFileId: result.rec.coverFileId, coverPinned: result.rec.coverPinned === '1', warnings: result.warning ? [result.warning] : [], sync };
  });
}

function listImages(token, productId) {
  return respond_(() => {
    requireUser_(token);
    const table = readProducts_();
    const rec = findById_(table, productId);
    const images = listFolderImages_(rec.folderId);
    // Folders can change outside the app (linked folders), so keep the cover in step when we notice.
    if (rec.coverFileId !== pickCover_(rec, images).id) {
      withLock_(() => {
        const fresh = readProducts_();
        refreshCover_(fresh, findById_(fresh, productId), images);
      });
    }
    return images;
  });
}

function removeImage(token, productId, fileId) {
  return respond_(() => {
    const user = requireUser_(token);
    const result = withLock_(() => {
      const table = readProducts_();
      const rec = findById_(table, productId);
      let file;
      try {
        file = DriveApp.getFileById(String(fileId || ''));
      } catch (err) {
        throw userError_('ไม่พบรูปนี้ อาจถูกลบไปแล้ว', 'not_found');
      }
      // Only files inside this product's folder may be trashed.
      let inFolder = false;
      const parents = file.getParents();
      while (parents.hasNext()) if (parents.next().getId() === rec.folderId) inFolder = true;
      if (!inFolder) throw userError_('รูปนี้ไม่ได้อยู่ในโฟลเดอร์ของสินค้านี้', 'forbidden');
      const name = file.getName();
      file.setTrashed(true);
      const images = listFolderImages_(rec.folderId);
      rec.updatedAt = nowIso_();
      rec.updatedBy = user.username;
      applyCover_(rec, images); // removing the pinned cover falls back to the latest image
      writeRecord_(table, rec);
      audit_(user.username, 'removeImage', { productId: rec.productId, code: rec.code, field: 'images', before: name });
      return { rec, images };
    });
    const sync = syncProduct_(result.rec, result.images);
    return { images: result.images, coverFileId: result.rec.coverFileId, coverPinned: result.rec.coverPinned === '1', sync };
  });
}

/** Pins fileId as the product's cover; an empty fileId goes back to the automatic cover (latest image). */
function setCover(token, productId, fileId) {
  return respond_(() => {
    const user = requireUser_(token);
    const id = String(fileId || '');
    const result = withLock_(() => {
      const table = readProducts_();
      const rec = findById_(table, productId);
      const images = listFolderImages_(rec.folderId);
      if (id && !images.some((i) => i.id === id)) throw userError_('ไม่พบรูปนี้ในโฟลเดอร์ของสินค้า กรุณารีเฟรช', 'not_found');
      const before = rec.coverFileId;
      rec.coverPinned = id ? '1' : '';
      rec.coverFileId = id;
      applyCover_(rec, images);
      rec.updatedAt = nowIso_();
      rec.updatedBy = user.username;
      writeRecord_(table, rec);
      const nameOf = (fid) => (images.find((i) => i.id === fid) || {}).name || '';
      audit_(user.username, 'setCover', {
        productId: rec.productId,
        code: rec.code,
        field: 'coverFileId',
        before: nameOf(before),
        after: id ? nameOf(id) : '(อัตโนมัติ: รูปล่าสุด)',
      });
      return { rec, images, changed: rec.coverFileId !== before };
    });
    // The cover is the first image on the customer page and the LINE preview, so the shop page must follow.
    const sync = result.changed ? syncProduct_(result.rec, result.images) : { synced: false, skipped: true };
    return { coverFileId: result.rec.coverFileId, coverPinned: result.rec.coverPinned === '1', sync };
  });
}

/** Trashes the product's Drive folder, but only when the system created it (named productId, directly inside the root folder). */
function trashOwnFolder_(rec) {
  if (!rec.folderId) return false;
  try {
    const rootId = props_().getProperty('ROOT_FOLDER_ID');
    const folder = DriveApp.getFolderById(rec.folderId);
    const parents = folder.getParents();
    let inRoot = false;
    while (parents.hasNext()) if (parents.next().getId() === rootId) inRoot = true;
    if (!inRoot || folder.getName() !== rec.productId) return false;
    folder.setTrashed(true);
    return true;
  } catch (err) {
    console.warn('product folder not trashed', rec.productId, err);
    return false;
  }
}

/** Menu helper: recompute every product's cover from its folder (after an upgrade or folder edits outside the app). */
function menuRefreshCovers() {
  requireEditorContext_();
  const ui = SpreadsheetApp.getUi();
  const result = withLock_(() => {
    const table = readProducts_();
    let changed = 0;
    table.records.forEach((rec) => {
      if (!rec.folderId) return;
      if (refreshCover_(table, rec, listFolderImages_(rec.folderId))) changed++;
    });
    return { total: table.records.length, changed };
  });
  ui.alert('อัปเดตรูปปกแล้ว', 'ตรวจ ' + result.total + ' สินค้า เปลี่ยนรูปปก ' + result.changed + ' รายการ', ui.ButtonSet.OK);
}

function linkFolder(token, productId, folderUrl) {
  return respond_(() => {
    const user = requireUser_(token);
    const linked = linkExistingFolder_(folderUrl);
    const result = withLock_(() => {
      const table = readProducts_();
      const rec = findById_(table, productId);
      audit_(user.username, 'linkFolder', { productId: rec.productId, code: rec.code, field: 'folderUrl', before: rec.folderUrl, after: linked.url });
      rec.folderId = linked.id;
      rec.folderUrl = linked.url;
      rec.coverFileId = linked.coverFileId;
      rec.coverPinned = ''; // a different folder starts with the automatic cover
      rec.updatedAt = nowIso_();
      rec.updatedBy = user.username;
      writeRecord_(table, rec);
      return rec;
    });
    const images = listFolderImages_(result.folderId);
    const sync = syncProduct_(result, images);
    return { product: publicProduct_(result), images, warnings: linked.warning ? [linked.warning] : [], sync };
  });
}
