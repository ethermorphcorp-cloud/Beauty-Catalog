// Setup.gs — first-time setup and the "Catalog" menu in the Sheet.
// Every function here is owner-only (guarded by requireEditorContext_) and safe to run again.

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Catalog')
    .addItem('ตั้งค่าเริ่มต้น', 'setup')
    .addItem('สร้าง/รีเซ็ตผู้ใช้ admin', 'menuUpsertAdmin')
    .addItem('แสดง API_SECRET', 'menuShowApiSecret')
    .addSeparator()
    .addItem('เพิ่มข้อมูลตัวอย่าง', 'menuSeedDemo')
    .addItem('ลบข้อมูลตัวอย่าง', 'menuRemoveDemo')
    .addItem('ทดสอบระบบ', 'menuSelfTest')
    .addToUi();
}

/** Creates missing tabs/headers, sets the shop's root Drive folder and API_SECRET. Never removes data. */
function setup() {
  requireEditorContext_();
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ensureSheet_(ss, SHEET.products, PRODUCT_HEADERS);
  ensureSheet_(ss, SHEET.categories, CATEGORY_HEADERS);
  ensureSheet_(ss, SHEET.settings, SETTINGS_HEADERS);
  ensureSheet_(ss, SHEET.audit, AUDIT_HEADERS);
  protectUsersSheet_(ensureSheet_(ss, SHEET.users, USER_HEADERS));
  mirrorUsers_(readUsers_());
  removeBlankDefaultSheet_(ss);

  const notes = [];
  const props = props_();

  // Root folder for product images (one per shop; see shops.json → rootFolderId).
  let rootId = props.getProperty('ROOT_FOLDER_ID');
  if (rootId && !folderOk_(rootId)) {
    notes.push('โฟลเดอร์หลักเดิมเปิดไม่ได้ ต้องตั้งใหม่');
    rootId = '';
  }
  if (!rootId) {
    const res = ui.prompt(
      'โฟลเดอร์หลักสำหรับรูปสินค้า',
      'วางลิงก์โฟลเดอร์ Google Drive ของร้าน (เว้นว่างเพื่อสร้างโฟลเดอร์ใหม่)',
      ui.ButtonSet.OK_CANCEL
    );
    if (res.getSelectedButton() !== ui.Button.OK) {
      ui.alert('ยกเลิกแล้ว ยังไม่ได้ตั้งโฟลเดอร์หลัก');
      return;
    }
    const input = res.getResponseText().trim();
    if (input) {
      rootId = parseFolderId_(input);
      if (!rootId || !folderOk_(rootId)) {
        ui.alert('เปิดโฟลเดอร์นี้ไม่ได้ ตรวจสอบลิงก์และสิทธิ์ แล้วรันตั้งค่าเริ่มต้นอีกครั้ง');
        return;
      }
    } else {
      rootId = DriveApp.createFolder(ss.getName() + ' — รูปสินค้า').getId();
    }
    props.setProperty('ROOT_FOLDER_ID', rootId);
  }
  const root = DriveApp.getFolderById(rootId);
  const shareWarning = shareAnyone_(root);
  notes.push('โฟลเดอร์หลัก: ' + root.getName() + (shareWarning ? ' (⚠️ ' + shareWarning + ')' : ''));

  if (!props.getProperty('API_SECRET')) {
    props.setProperty('API_SECRET', randomToken_());
    notes.push('สร้าง API_SECRET ใหม่แล้ว (ดูได้จากเมนู แสดง API_SECRET)');
  }

  if (!readSettings_().shopName) withLock_(() => writeSettings_({ shopName: ss.getName() }));

  if (!readUsers_().some((u) => u.role === 'admin')) notes.push('ยังไม่มีผู้ใช้ admin → รันเมนู สร้าง/รีเซ็ตผู้ใช้ admin');

  ui.alert('ตั้งค่าเริ่มต้นเรียบร้อย', notes.join('\n'), ui.ButtonSet.OK);
}

/** Creates the sheet if missing and appends any missing header columns (existing columns are never moved). */
function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const existing = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String).filter(Boolean);
  const missing = headers.filter((h) => existing.indexOf(h) < 0);
  if (missing.length) sh.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  const width = existing.length + missing.length;
  sh.getRange(1, 1, 1, width).setFontWeight('bold');
  sh.setFrozenRows(1);
  // Plain text everywhere so codes like 001 or dates are never re-interpreted by Sheets.
  sh.getRange(1, 1, sh.getMaxRows(), width).setNumberFormat('@');
  return sh;
}

/** Deletes the untouched default tab (Sheet1 / แผ่น1) once our tabs exist. */
function removeBlankDefaultSheet_(ss) {
  const ours = [SHEET.products, SHEET.categories, SHEET.settings, SHEET.audit, SHEET.users];
  ss.getSheets().forEach((sh) => {
    if (ours.indexOf(sh.getName()) < 0 && sh.getLastRow() === 0 && ss.getSheets().length > ours.length) ss.deleteSheet(sh);
  });
}

/** Warn (not block) anyone editing the Users tab by hand: it is regenerated from the admin app. */
function protectUsersSheet_(sh) {
  if (sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) return;
  sh.protect().setDescription('แท็บนี้แสดงผู้ใช้จากระบบเท่านั้น เพิ่ม/ลบ/เปลี่ยนรหัสผ่านที่หน้า admin › ตั้งค่า › ผู้ใช้งาน').setWarningOnly(true);
}

function folderOk_(id) {
  try {
    return !DriveApp.getFolderById(id).isTrashed();
  } catch (err) {
    return false;
  }
}

function menuUpsertAdmin() {
  requireEditorContext_();
  const ui = SpreadsheetApp.getUi();
  const nameRes = ui.prompt('สร้าง/รีเซ็ตผู้ใช้ admin', 'ชื่อผู้ใช้ (a-z 0-9 . _ - ยาว 3–30 ตัว)', ui.ButtonSet.OK_CANCEL);
  if (nameRes.getSelectedButton() !== ui.Button.OK) return;
  const pwRes = ui.prompt(
    'ตั้งรหัสผ่าน',
    'รหัสผ่านอย่างน้อย ' + PASSWORD_MIN_LENGTH + ' ตัว\n(ช่องนี้แสดงตัวอักษร ระวังคนมองหน้าจอ)',
    ui.ButtonSet.OK_CANCEL
  );
  if (pwRes.getSelectedButton() !== ui.Button.OK) return;
  try {
    const user = upsertAdmin_(nameRes.getResponseText(), pwRes.getResponseText(), Session.getActiveUser().getEmail());
    ui.alert('เรียบร้อย', 'ผู้ใช้ ' + user.username + ' เป็น admin แล้ว ใช้เข้าสู่ระบบหน้า admin ได้', ui.ButtonSet.OK);
  } catch (err) {
    ui.alert(err.userFacing ? err.message : 'เกิดข้อผิดพลาด: ' + err);
  }
}

function menuShowApiSecret() {
  requireEditorContext_();
  const ui = SpreadsheetApp.getUi();
  const secret = props_().getProperty('API_SECRET');
  if (!secret) {
    ui.alert('ยังไม่มี API_SECRET กรุณารันตั้งค่าเริ่มต้นก่อน');
    return;
  }
  ui.alert('API_SECRET', secret + '\n\nคัดลอกไปใส่ใน Cloudflare Worker ของร้านนี้เท่านั้น ห้ามส่งในแชท', ui.ButtonSet.OK);
}

function menuSelfTest() {
  requireEditorContext_();
  const ui = SpreadsheetApp.getUi();
  try {
    ui.alert('ทดสอบระบบผ่าน', _selfTest().join('\n'), ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('ทดสอบระบบไม่ผ่าน', String(err.message || err), ui.ButtonSet.OK);
  }
}
