// Seed.gs — demo products for trying the system (menu Catalog → เพิ่มข้อมูลตัวอย่าง / ลบข้อมูลตัวอย่าง).
// Every demo product uses a code starting with DEMO- so it can be removed cleanly. No images are added.

const DEMO_PREFIX = 'DEMO-';
const DEMO_NOTE = '\n\n(ข้อมูลตัวอย่าง)';
const DEMO_PRODUCTS = [
  ['DEMO-001', 'เซรั่มวิตามินซี 30 ml', 'สกินแคร์', 'เซรั่มเนื้อบางเบา ซึมไว\nใช้เช้าและเย็นหลังล้างหน้า', 'active'],
  ['DEMO-002', 'มอยส์เจอไรเซอร์ไฮยาลูรอน 50 ml', 'สกินแคร์', 'เจลครีมเนื้อบางเบา ให้ความชุ่มชื้น\nเหมาะกับผิวผสม', 'active'],
  ['DEMO-003', 'โทนเนอร์สูตรอ่อนโยน 150 ml', 'สกินแคร์', 'เช็ดหรือตบเบาๆ หลังล้างหน้า', 'active'],
  ['DEMO-004', 'โฟมล้างหน้า 100 ml', 'สกินแคร์', 'ฟองนุ่ม ล้างออกง่าย', 'active'],
  ['DEMO-005', 'ครีมกันแดด SPF50 PA++++ 40 g', 'กันแดด', 'เนื้อบางเบา ไม่เหนียวเหนอะหนะ\nทาก่อนออกแดด 15 นาที', 'active'],
  ['DEMO-006', 'สเปรย์กันแดด SPF50 100 ml', 'กันแดด', 'ฉีดซ้ำระหว่างวันได้', 'active'],
  ['DEMO-007', 'ลิปทินท์เนื้อแมตต์', 'เมคอัพ', 'สีชัด ติดทน\nมีให้เลือกหลายเฉด สอบถามสีได้ทาง LINE', 'active'],
  ['DEMO-008', 'คุชชั่นคุมมัน', 'เมคอัพ', 'ตัวอย่างสินค้าที่ซ่อนอยู่ (ลิงก์จะขึ้นว่าไม่พร้อมจำหน่าย)', 'hidden'],
  ['DEMO-009', 'มาสคาร่ากันน้ำ', 'เมคอัพ', 'ขนตางอนเด้ง ไม่เป็นก้อน', 'active'],
  ['DEMO-010', 'โลชั่นบำรุงผิวกาย 250 ml', 'ดูแลผิวกาย', 'บำรุงผิวให้นุ่มชุ่มชื้น', 'active'],
  ['DEMO-011', 'สครับผิวกาย 200 g', 'ดูแลผิวกาย', 'ตัวอย่างสินค้าที่ซ่อนอยู่', 'hidden'],
  ['DEMO-012', 'แชมพูสมุนไพร 300 ml', 'ดูแลเส้นผม', 'สูตรอ่อนโยน ใช้ได้ทุกวัน', 'active'],
];

/** Adds the demo products that are not there yet. Returns { added, skipped }. */
function seedDemo_(actor) {
  return withLock_(() => {
    const table = readProducts_();
    const now = nowIso_();
    const recs = [];
    let skipped = 0;
    DEMO_PRODUCTS.forEach(([code, name, category, description, status]) => {
      if (findByCode_(table, code)) {
        skipped++;
        return;
      }
      const productId = nextProductId_(table);
      const folder = createProductFolder_(productId);
      recs.push({
        productId,
        code,
        name,
        category,
        description: description + DEMO_NOTE,
        folderId: folder.id,
        folderUrl: folder.url,
        status,
        oldCodes: '',
        coverFileId: '',
        createdAt: now,
        updatedAt: now,
        updatedBy: actor,
      });
    });
    appendRecords_(table, recs);
    recs.forEach((r) => ensureCategory_(r.category));
    if (recs.length) audit_(actor, 'importCsv', { after: recs.length + ' รายการ (ข้อมูลตัวอย่าง ' + recs[0].code + '…' + recs[recs.length - 1].code + ')' });
    return { added: recs.length, skipped };
  });
}

/** Removes products whose code starts with DEMO-, their empty Drive folders, and demo categories left empty. */
function removeDemo_(actor) {
  return withLock_(() => {
    const table = readProducts_();
    const demo = table.records.filter((r) => r.code.toUpperCase().indexOf(DEMO_PREFIX) === 0);
    const rootId = props_().getProperty('ROOT_FOLDER_ID');
    demo.forEach((r) => {
      // Only trash folders the system created for this product (named after productId, inside the root folder).
      try {
        const folder = DriveApp.getFolderById(r.folderId);
        const parents = folder.getParents();
        let inRoot = false;
        while (parents.hasNext()) if (parents.next().getId() === rootId) inRoot = true;
        if (inRoot && folder.getName() === r.productId) folder.setTrashed(true);
      } catch (err) {
        console.warn('demo folder not removed', r.productId, err);
      }
    });
    demo
      .map((r) => r._row)
      .sort((a, b) => b - a)
      .forEach((row) => table.sheet.deleteRow(row));

    const remaining = readProducts_().records;
    const demoCats = DEMO_PRODUCTS.map((p) => p[2].toLowerCase());
    const cats = readCategories_();
    cats.records
      .filter((c) => demoCats.indexOf(c.name.toLowerCase()) >= 0 && !remaining.some((p) => p.category.toLowerCase() === c.name.toLowerCase()))
      .map((c) => c._row)
      .sort((a, b) => b - a)
      .forEach((row) => cats.sheet.deleteRow(row));

    if (demo.length) audit_(actor, 'removeDemo', { before: demo.length + ' รายการ (ข้อมูลตัวอย่าง)' });
    return { removed: demo.length };
  });
}

function menuSeedDemo() {
  requireEditorContext_();
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    'เพิ่มข้อมูลตัวอย่าง',
    'เพิ่มสินค้าตัวอย่าง ' + DEMO_PRODUCTS.length + ' รายการ (รหัสขึ้นต้นด้วย DEMO-) ใน 5 หมวด ไม่มีรูป\nลบออกทั้งหมดได้ภายหลังด้วยเมนู ลบข้อมูลตัวอย่าง',
    ui.ButtonSet.OK_CANCEL
  );
  if (answer !== ui.Button.OK) return;
  try {
    const res = seedDemo_(Session.getActiveUser().getEmail());
    ui.alert('เรียบร้อย', 'เพิ่ม ' + res.added + ' รายการ' + (res.skipped ? ' (มีอยู่แล้ว ' + res.skipped + ' รายการ)' : ''), ui.ButtonSet.OK);
  } catch (err) {
    ui.alert(err.userFacing ? err.message : 'เกิดข้อผิดพลาด: ' + err);
  }
}

function menuRemoveDemo() {
  requireEditorContext_();
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert('ลบข้อมูลตัวอย่าง', 'ลบสินค้าทุกรายการที่รหัสขึ้นต้นด้วย DEMO- และโฟลเดอร์รูปของสินค้านั้น?', ui.ButtonSet.OK_CANCEL);
  if (answer !== ui.Button.OK) return;
  try {
    ui.alert('เรียบร้อย', 'ลบ ' + removeDemo_(Session.getActiveUser().getEmail()).removed + ' รายการ', ui.ButtonSet.OK);
  } catch (err) {
    ui.alert(err.userFacing ? err.message : 'เกิดข้อผิดพลาด: ' + err);
  }
}
