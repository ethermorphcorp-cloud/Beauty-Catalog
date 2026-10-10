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

/** Opens a user-supplied folder link, shares it, and reads its first image as the cover. */
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
  return { id, url: folder.getUrl(), warning: shareAnyone_(folder), coverFileId: images.length ? images[0].id : '' };
}

/** Images in a folder sorted by file name (natural order); the first one is the cover. */
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
    if (!f.isTrashed() && String(f.getMimeType()).indexOf('image/') === 0) images.push({ id: f.getId(), name: f.getName() });
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

/** Updates coverFileId when the first image changed. Returns true when the row was written. */
function refreshCover_(table, rec, images) {
  const cover = images.length ? images[0].id : '';
  if (rec.coverFileId === cover) return false;
  rec.coverFileId = cover;
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
      rec.coverFileId = images.length ? images[0].id : '';
      writeRecord_(table, rec);
      audit_(user.username, 'uploadImage', { productId: rec.productId, code: rec.code, field: 'images', after: created.getName() });
      return { rec, images, warning };
    });
    const sync = syncProduct_(result.rec, result.images);
    return { images: result.images, coverFileId: result.rec.coverFileId, warnings: result.warning ? [result.warning] : [], sync };
  });
}

function listImages(token, productId) {
  return respond_(() => {
    requireUser_(token);
    const table = readProducts_();
    const rec = findById_(table, productId);
    const images = listFolderImages_(rec.folderId);
    // Folders can change outside the app (linked folders), so keep the cover in step when we notice.
    if (rec.coverFileId !== (images.length ? images[0].id : '')) {
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
      rec.coverFileId = images.length ? images[0].id : '';
      writeRecord_(table, rec);
      audit_(user.username, 'removeImage', { productId: rec.productId, code: rec.code, field: 'images', before: name });
      return { rec, images };
    });
    const sync = syncProduct_(result.rec, result.images);
    return { images: result.images, coverFileId: result.rec.coverFileId, sync };
  });
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
