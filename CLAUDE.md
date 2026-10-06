# Product Catalog — คู่มือโปรเจกต์สำหรับ Claude Code

อ่านไฟล์นี้ทุกครั้งก่อนเริ่มงาน แผนงานทีละเฟสอยู่ใน `PLAN.md`
ภาษา UI ทั้งหมดเป็นภาษาไทย / โค้ด ชื่อตัวแปร และคอมเมนต์เป็นภาษาอังกฤษ

---

## 1. ภาพรวมระบบ

ระบบแคตตาล็อกสินค้า แบ่งเป็น 2 ส่วน

| ส่วน | เทคโนโลยี | หน้าที่ |
|---|---|---|
| หลังบ้าน | Google Apps Script (ผูกกับ Google Sheet) | หน้า admin, ฐานข้อมูล (Sheet), เก็บรูป (Drive), JSON API ให้ Worker |
| หน้าบ้าน | Cloudflare Worker + KV | หน้าสินค้าสำหรับลูกค้าที่ `/p/{code}` พร้อม OG tags ให้ LINE แสดงพรีวิวรูป |

```
ลูกค้า ─> Worker /p/{code} ─(KV hit)──> render HTML (หรือ 301 ถ้าเป็นรหัสเก่า)
                         └─(KV miss)─> GAS ?api=product ─> Sheet/Drive ─> เก็บลง KV ─> render
Admin ─> GAS /exec (ชื่อผู้ใช้+รหัสผ่าน) ─บันทึก─> Sheet/Drive + AuditLog ─POST /__sync─> Worker เขียน KV
```

**UI อ้างอิง (ผู้ใช้อนุมัติแล้ว 2026-10-03):** https://claude.ai/artifact/TBdXkpz28tFKTUS4h2E6iE — canvas mockup ทุกหน้าจอ (หน้าลูกค้า, admin มือถือ/จอใหญ่, แท็บ AuditLog) ทำ UI ให้ตรงกับ mockup นี้

เหตุผลที่แยกหน้าบ้านไปไว้ที่ Worker: หน้า `/exec` ของ GAS แสดงผลใน iframe ทำให้ LINE อ่าน OG tags ไม่ได้ (ไม่มีพรีวิวรูป), ลิงก์ยาว, มีแถบเตือนของ Google และโหลดช้า

### ร้านในระบบ (2 ร้าน แยกระบบกัน ใช้โค้ดชุดเดียว)

แต่ละร้านมี Google Sheet + Apps Script project + deployment + โฟลเดอร์ Drive + Worker + KV + `API_SECRET` + ผู้ใช้ admin/staff **เป็นของตัวเอง** ข้อมูลไม่ปนกัน รหัสสินค้าซ้ำข้ามร้านได้ โค้ดใน `gas/` และ `worker/` ใช้ร่วมกัน ห้ามใส่ค่าเฉพาะร้านในโค้ด (ค่าร้านอยู่ใน Sheet `Settings`, Script Properties, `shops.json` และ env ของ Worker)

| key (`shops.json` / wrangler env) | ชื่อร้าน | Worker URL | สีหลักเริ่มต้น (จากโลโก้) |
|---|---|---|---|
| `npbeauty` | NPBeauty | `https://npbeauty.ethermorph-corp.workers.dev` | `#1F5FAE` |
| `lemonbeauty` | LemonBeauty | `https://lemonbeauty.ethermorph-corp.workers.dev` | `#8E4AA8` |

- Cloudflare account subdomain: `ethermorph-corp.workers.dev` (ใช้ร่วมกันทุกร้าน) — ใช้ workers.dev ไปก่อน ผูก Custom Domain ทีหลังได้โดยไม่ต้องแก้โค้ด
- โควตา free plan (KV write 1,000/วัน, Workers ~100,000 request/วัน) เป็นของบัญชี **ใช้ร่วมกันทุกร้าน**
- เพิ่มร้านใหม่ = เพิ่ม entry ใน `shops.json` + env ใน `wrangler.jsonc` + ทำ Phase 0.4–0.5, 4, 6 ซ้ำสำหรับร้านนั้น

---

## 2. การตัดสินใจที่ยืนยันแล้ว (ห้ามเปลี่ยนโดยไม่ถามผู้ใช้)

- **หลายร้าน:** 2 ร้าน (NPBeauty, LemonBeauty) แยกระบบกันคนละชุด ใช้โค้ดร่วมกันใน repo เดียว (ดูหัวข้อ 1 "ร้านในระบบ")
- **ลิงก์ลูกค้า:** `{WORKER_URL}/p/{code}` หนึ่งลิงก์ต่อสินค้า (`WORKER_URL` ของแต่ละร้าน) ถ้าเปลี่ยนรหัสสินค้า ลิงก์รหัสเก่าต้อง **301 redirect** ไปรหัสใหม่ (ลิงก์ที่ส่งใน LINE แล้วต้องไม่เสีย)
- **เข้า admin:** GAS `/exec` (ไม่มีพารามิเตอร์) → หน้า login **ชื่อผู้ใช้ + รหัสผ่าน** ผู้ใช้หลายคนต่อร้าน เก็บใน Script Properties (`USERS`) รหัสผ่านเป็น salted hash
- **สิทธิ์ 2 ระดับ:** `admin` และ `staff` — staff ทำได้ทุกอย่าง (สินค้า, หมวดหมู่, ตั้งค่าร้าน, นำเข้า CSV) **ยกเว้น**จัดการผู้ใช้ เฉพาะ admin ที่ ดูรายชื่อผู้ใช้ / สร้างผู้ใช้ / ตั้งรหัสผ่านใหม่ให้ผู้อื่น / ลบผู้ใช้ ทุกคนเปลี่ยนรหัสผ่านตัวเองได้ admin ลบตัวเองไม่ได้ และต้องเหลือ admin อย่างน้อย 1 คนเสมอ
- **Product ID vs รหัสสินค้า:** แยกกัน 2 ฟิลด์
  - `productId` — ระบบสร้าง รูปแบบ `P` + เลข 6 หลัก (`P000001`) เรียงต่อจากค่ามากสุด **ห้ามแก้** ใช้เป็น key ภายในทุกที่ (API, AuditLog, ชื่อโฟลเดอร์รูป)
  - `code` (รหัสสินค้า) — ผู้ใช้กรอกและ**แก้ได้** ต้องไม่ซ้ำกับ `code` ปัจจุบันของสินค้าอื่น (เทียบแบบไม่สนตัวพิมพ์) ใช้ได้เฉพาะ `^[A-Za-z0-9_-]{1,40}$` เมื่อแก้ รหัสเดิมถูกเก็บใน `oldCodes` เพื่อ redirect ถ้ารหัสใหม่ไปตรงกับ `oldCodes` ของสินค้าอื่น ให้ลบออกจากสินค้านั้น (รหัสปัจจุบันชนะเสมอ)
- **ฟิลด์สินค้า:** Product ID | รหัสสินค้า | ชื่อสินค้า | หมวดหมู่ | รายละเอียด | โฟลเดอร์รูป | สถานะ
- **รูปภาพ:** สินค้าละหลายรูป เก็บในโฟลเดอร์ Drive ของสินค้านั้น เรียงตามชื่อไฟล์ รูปแรกเป็นรูปปก รับรูปได้ 2 ทาง
  0. **รูปปก** (ใช้ในรายการสินค้าของ admin): ค่าเริ่มต้นคือ**รูปล่าสุด** (ใหม่สุดตามเวลาสร้างไฟล์ใน Drive, เท่ากันให้ชื่อไฟล์หลังสุด) ผู้ใช้เลือกเองได้ในหน้าแก้ไขสินค้า (กดดาวที่รูป → `setCover`) รูปที่เลือกเองถูกปักไว้ (`coverPinned`) อัปโหลดรูปใหม่ก็ไม่เปลี่ยน; ลบรูปปกที่ปักไว้ หรือเชื่อมโฟลเดอร์ใหม่ → กลับเป็นรูปล่าสุด; ปุ่ม "ใช้รูปล่าสุดอัตโนมัติ" ยกเลิกการปัก — **ไม่กระทบหน้าลูกค้า** (แกลเลอรีเรียงตามชื่อไฟล์ รูปแรกเป็นรูปแรก/OG image เหมือนเดิม)
  1. อัปโหลดผ่านแอป → ระบบสร้างโฟลเดอร์**ชื่อตาม `productId`** ใต้โฟลเดอร์หลักของร้าน (เปลี่ยนรหัสสินค้าแล้วไม่ต้องเปลี่ยนชื่อโฟลเดอร์)
  2. วางลิงก์โฟลเดอร์ Drive ที่มีอยู่แล้ว
- **ย่อรูปฝั่งเบราว์เซอร์** ก่อนอัปโหลด: ด้านยาวไม่เกิน 1600px, JPEG quality 0.85, อัปโหลดทีละไฟล์
- **Batch (ทั้งมือถือและจอใหญ่):** อัปโหลดไฟล์ CSV (UTF-8) คอลัมน์ `code,name,category,description,folder_url` โดย `folder_url` ไม่บังคับ ถ้าว่างระบบสร้างโฟลเดอร์เปล่าให้ ต้องแสดงตารางตัวอย่างพร้อมสถานะของแต่ละแถว (ใหม่ / รหัสซ้ำ / ข้อมูลไม่ครบ) ก่อนกดยืนยัน (บนมือถือแต่ละแถวแสดงเป็นการ์ด) — หน้า "นำเข้ารายการสินค้า (Bulk upload)"
- **หมวดหมู่:** dropdown จากแท็บ `Categories` และพิมพ์หมวดใหม่ได้ (เพิ่มเข้าแท็บอัตโนมัติ) + จัดการในตั้งค่า › หมวดหมู่สินค้า: เพิ่ม / เปลี่ยนชื่อ (สินค้าในหมวดเปลี่ยนตาม) / ลบ (เฉพาะหมวดที่ไม่มีสินค้า) แสดงจำนวนสินค้าต่อหมวด
- **เลิกขาย:** ใช้สถานะ `active` / `hidden` ไม่มีการลบสินค้า ลิงก์ของสินค้าที่ hidden แสดงข้อความ "สินค้านี้ไม่พร้อมจำหน่าย" สลับแสดง/ซ่อนได้**จากสวิตช์บนการ์ดในหน้ารายการสินค้า**โดยตรง (ทั้งมือถือและจอใหญ่) และในหน้าแก้ไข
- **หน้าสรุปรายการสินค้า:** stat card จำนวนทั้งหมด / แสดง (active) / ซ่อน (hidden) + การ์ดแยกตามหมวดหมู่ (จำนวน, แถบสัดส่วน, แสดง·ซ่อน) กดการ์ดหมวดแล้วเปิดรายการสินค้าที่กรองหมวดนั้น คำนวณฝั่ง client จาก `listProducts`
- **AuditLog:** ทุกการเขียนข้อมูลบันทึกลงแท็บ `AuditLog` ใน Sheet (append อย่างเดียว ห้ามแก้/ลบแถวเดิม) หนึ่งแถวต่อหนึ่งฟิลด์ที่เปลี่ยน ห้ามบันทึกรหัสผ่านหรือ hash
- **หน้าสินค้า:** แกลเลอรีรูป (ปัดได้บนมือถือ), ชื่อ, หมวด, รายละเอียด (ข้อความธรรมดา รักษาการขึ้นบรรทัด) และปุ่ม "ทัก LINE" ที่เปิด LINE OA พร้อมข้อความ `สนใจสินค้า {code} {name}`
- **ไม่มี:** ราคา, สต็อก, ตะกร้า, สินค้าที่เกี่ยวข้อง
- **ตั้งค่า:** 3 แท็บ — **ร้านค้า** (ชื่อร้าน, โลโก้, LINE OA ID, สีหลัก, Worker URL, ลิงก์ Google Sheet, ลิงก์โฟลเดอร์ Drive) — **Worker URL เป็นแถบสีเทาแก้ไม่ได้ จนกว่าจะกดปุ่ม "แก้ไข"** (กด "ยกเลิก" คืนค่าเดิม; แก้แล้วต้องยืนยันรหัสผ่านตามด้านล่าง) · **ลิงก์ Google Sheet** และ **ลิงก์โฟลเดอร์ Google Drive** (โฟลเดอร์หลัก `ROOT_FOLDER_ID`) แสดงอย่างเดียว (ปุ่มคัดลอก/เปิด) ได้จาก `SpreadsheetApp.getUrl()` / `ROOT_FOLDER_ID` ไม่เก็บใน Settings และไม่ส่งไป Worker · **LINE OA ID** ต้องเป็น ID ของ LINE Official Account เท่านั้น (ลิงก์ `oaMessage` ใช้กับ LINE ID ส่วนตัวไม่ได้ → "user not found") ตอนบันทึก ID ใหม่ server ตรวจ `https://page.line.me/<id>` (OA จริง = HTTP 200, ไม่ใช่ = 3xx/404) ถ้าไม่ใช่จะคืน `warnings` เป็นข้อความเตือน (ไม่บล็อกการบันทึก) / **หมวดหมู่สินค้า** / **ผู้ใช้งาน** (admin เห็นรายชื่อ + เพิ่ม/ตั้งรหัสใหม่/ลบ, staff เห็นแค่ตัวเอง; ทุกคนเปลี่ยนรหัสผ่านตัวเองได้)
- **เมนูหลัก admin (แก้ 2026-10-04):** มือถือ = แถบล่าง **ไม่มีกรอบ** 4 ปุ่มเรียง `รายการสินค้า · สรุป · นำเข้า · ตั้งค่า(ไอคอนเฟือง)` (รายการสินค้าเป็นหน้าแรก, ปุ่มที่เลือกเป็นสีหลัก ตัวหนา ไอคอนใหญ่) / จอใหญ่ = แท็บบน `รายการสินค้า · สรุป · นำเข้า CSV · ตั้งค่า` **"เพิ่มสินค้า" ไม่ใช่เมนู** แต่เป็นปุ่มหลักในหน้ารายการสินค้า: จอใหญ่เปิดฟอร์มเป็น side panel ฝั่งขวา, มือถือเปิดเป็นหน้าเต็มที่มี breadcrumbs `รายการสินค้า › เพิ่มสินค้า` ด้านบน โลโก้ร้านในหัวเว็บบนมือถือขนาด 45px (1.5 เท่า) จอใหญ่ 30px
- **ปุ่ม copy ลิงก์:** คัดลอกข้อความ `{name}\n{WORKER_URL}/p/{code}`
- **ค้นหา / กรอง / แบ่งหน้า (admin, หน้ารายการสินค้า):** ค้นหาจากรหัสและชื่อ + dropdown กรองตามหมวดหมู่ (ทุกหมวดหมู่ / แต่ละหมวดพร้อมจำนวน / ไม่มีหมวด) กรองร่วมกันได้ โหลดรายการทั้งหมดครั้งเดียวแล้วกรองและแบ่งหน้าฝั่ง client ทันที แสดง **20 รายการต่อหน้า** (ตัวแบ่งหน้า: ก่อนหน้า / เลขหน้า / ถัดไป — มือถือแสดงเฉพาะเลขหน้าปัจจุบันระหว่างลูกศร) เปลี่ยนคำค้นหรือหมวดแล้วกลับหน้า 1 (แก้ 2026-10-04)

---

## 3. โครงสร้าง repo

```
/CLAUDE.md
/PLAN.md
/README.md                  คู่มือใช้งานและส่งมอบ (ภาษาไทย) — ถ้าเปลี่ยนพฤติกรรมของระบบ ให้แก้ README ให้ตรงด้วย
/WORKPLAN.md                checklist / สถานะงานปัจจุบัน
/.gitignore
/package.json               npm run gas -- <shop|all> <push|deploy|open>
/shops.json                 รายชื่อร้าน: scriptId, deploymentId, rootFolderId, workerEnv, defaults (ไม่ใช่ความลับ)
/scripts/
  gas.mjs                   เขียน gas/.clasp.json จาก shops.json แล้วรัน clasp
/tests/
  gas-mocks.cjs             mock บริการ Apps Script (Sheets, Drive, Cache, Properties ฯลฯ) ใช้ร่วมกัน
  gas-harness.cjs           รัน _selfTest() บน Node: `npm run test:gas`
  admin-preview.cjs         เปิดหน้า admin จริงที่ http://localhost:8787 ต่อกับ backend บน mock: `npm run preview:admin` (owner / owner-password, staff1 / staff-password)
/gas/
  .clasp.json               สร้างอัตโนมัติโดย scripts/gas.mjs (gitignore) ห้ามแก้เอง
  ShopDefaults.gs           สร้างอัตโนมัติตอน push: SHOP_DEFAULTS (shops.json → defaults) + BUILD_VERSION (commit) (gitignore) ห้ามแก้เอง
  appsscript.json
  Main.gs                   doGet routing
  Setup.gs                  setup(), onOpen() เมนูใน Sheet
  Auth.gs                   login, session, hash, ผู้ใช้และสิทธิ์ (admin/staff)
  Audit.gs                  เขียนแท็บ AuditLog
  Seed.gs                   ข้อมูลตัวอย่าง 12 สินค้า (รหัส DEMO-xxx, 5 หมวด, ไม่มีรูป) เพิ่ม/ลบผ่านเมนู Catalog
  SelfTest.gs               _selfTest() ทดสอบ backend บน Sheet จริง (เมนู Catalog → ทดสอบระบบ) แล้วลบข้อมูลทดสอบทิ้ง
  Products.gs               CRUD, ค้นหา, import CSV
  Drive.gs                  โฟลเดอร์, อัปโหลด, ตั้งค่าแชร์, list รูป
  Settings.gs               ตั้งค่าร้าน, หมวดหมู่
  Api.gs                    JSON API สำหรับ Worker
  Sync.gs                   ส่งข้อมูลไป Worker /__sync
  admin.html                โครง HTML ของ admin
  admin_css.html            <style>
  admin_js.html             <script>
/worker/
  wrangler.jsonc
  package.json
  src/index.js              router
  src/render.js             HTML หน้าสินค้า / หน้าไม่พบ / หน้าซ่อน
  src/gas.js                เรียก GAS API
  src/sign.js               HMAC สำหรับลิงก์รูป
/docs/
  csv-template.csv          ไฟล์ตัวอย่างนำเข้า (UTF-8 BOM, import ได้ทันที)
  brand/                    ไฟล์โลโก้ต้นฉบับของแต่ละร้าน
  test/                     ไฟล์ CSV ทดสอบ (UTF-8 และ ANSI) ใช้ตอนทดสอบ
/.github/workflows/
  deploy-gas.yml            push เข้า main ที่แก้ gas/** ฯลฯ → test:gas → clasp push + deploy -i ทุกร้าน (secret CLASPRC_JSON)
```

---

## 4. Data model (Google Sheet)

**แท็บ `Products`** (แถวแรกเป็น header)

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| productId | string | primary key ระบบสร้าง `P000001` ห้ามแก้ |
| code | string | รหัสสินค้า ผู้ใช้แก้ได้ unique (ไม่สนตัวพิมพ์) |
| name | string | บังคับ |
| category | string | |
| description | string | ข้อความธรรมดา มีขึ้นบรรทัดได้ |
| folderId | string | Drive folder ID |
| folderUrl | string | |
| status | `active` \| `hidden` | ค่าเริ่มต้น `active` |
| oldCodes | string | รหัสเก่าคั่นด้วย `,` ใช้ redirect |
| coverFileId | string | id รูปปก (รูปล่าสุด หรือรูปที่ผู้ใช้เลือก) อัปเดตเมื่ออัปโหลด/ลบรูป/เชื่อมโฟลเดอร์/เปิดหน้าแก้ไข ใช้แสดงรูปย่อในรายการ admin โดยไม่ต้องเปิดทุกโฟลเดอร์ |
| coverPinned | `1` | ว่าง | `1` = ผู้ใช้เลือกรูปปกเอง (ไม่เปลี่ยนตามรูปใหม่) คอลัมน์ถูกเพิ่มให้อัตโนมัติเมื่อเปิดหน้า admin หลังอัปเกรด |
| createdAt | ISO datetime | |
| updatedAt | ISO datetime | |
| updatedBy | string | username ล่าสุดที่แก้ |

**แท็บ `Categories`**: คอลัมน์ `name`

**แท็บ `Settings`**: คอลัมน์ `key | value` โดยมี key คือ `shopName`, `logoFileId`, `lineOaId`, `primaryColor`, `workerUrl`
- ค่าเริ่มต้นต่อร้านอยู่ใน `shops.json` → `defaults` (ตอนนี้ `primaryColor`, `workerUrl`) ถูก compile เป็น `gas/ShopDefaults.gs` ตอน push และเขียนลงแท็บ Settings ให้เฉพาะ key ที่ยังว่าง (ตอน setup / login / Worker ขอ settings) ไม่ทับค่าที่ผู้ใช้บันทึกเอง — แก้ค่าทีหลังให้ทำในหน้า admin

**แท็บ `AuditLog`** (append อย่างเดียว): `timestamp | user | action | productId | code | field | before | after`
- action: `login`, `loginFailed`, `createProduct`, `updateProduct`, `setStatus`, `uploadImage`, `removeImage`, `setCover`, `linkFolder`, `importCsv` (1 แถวสรุป), `addCategory`, `renameCategory`, `deleteCategory`, `saveSettings`, `uploadLogo`, `createUser`, `resetPassword`, `deleteUser`, `changePassword`, `removeDemo`, `rotateApiSecret`, `confirmFailed` (ยืนยันรหัสผ่านผิดตอนแก้ค่าสำคัญ)
- `updateProduct` / `saveSettings` บันทึก 1 แถวต่อฟิลด์ที่ค่าเปลี่ยนจริง; ค่า before/after ยาวเกิน 500 ตัวอักษรให้ตัด

**แท็บ `Users`** (แสดงผลอย่างเดียว ผู้ใช้ขอเพิ่ม 2026-10-03): `username | displayName | role | createdAt | lastLoginAt` — เขียนใหม่ทั้งแท็บจาก `USERS` ทุกครั้งที่ผู้ใช้เปลี่ยน (สร้าง/ลบ/ตั้งรหัส/login) ไม่มี salt/hash, ป้องกันแบบเตือน (warning-only) แก้ในแท็บนี้จะถูกเขียนทับ — จัดการผู้ใช้ที่ admin › ตั้งค่า › ผู้ใช้งาน

**Script Properties** (ห้ามเก็บใน Sheet)

| key | ค่า |
|---|---|
| `USERS` | JSON array `[{ username, displayName, role: "admin"\|"staff", salt, hash, passwordChangedAt, createdAt, lastLoginAt }]` — session ที่ออกก่อน `passwordChangedAt` ใช้ไม่ได้ (ตั้งรหัสใหม่แล้วหลุดทุกเครื่อง), `hash` = SHA-256 hex ของ `salt + password`, `username` ตรง `^[a-z0-9_.-]{3,30}$`, รหัสผ่านอย่างน้อย 8 ตัว |
| `API_SECRET` | random 32+ ตัวอักษร ใช้ค่าเดียวกับ Worker |
| `LAST_PRODUCT_SEQ` | เลข productId ล่าสุดที่เคยออก — productId ไม่ถูกนำกลับมาใช้ซ้ำแม้ลบแถว |
| `ROOT_FOLDER_ID` | โฟลเดอร์หลักใน Drive ของร้าน (ร้านละโฟลเดอร์ ระบุไว้แล้วใน `shops.json` → `rootFolderId`) `setup()` ถามลิงก์โฟลเดอร์ผ่าน prompt ถ้ายังไม่ได้ตั้ง (เว้นว่าง = สร้างใหม่) และตรวจว่าเปิดได้ ถ้าแท็บ `Settings` มี key `rootFolderUrl` ที่ต่างจากค่าปัจจุบัน `setup()` จะสลับไปใช้โฟลเดอร์นั้น (ใช้ตอนส่งมอบร้านให้ลูกค้า) และเขียน URL ปัจจุบันกลับลงแท็บนี้เสมอ — key นี้อยู่เฉพาะใน Sheet ไม่แสดงในหน้า admin และไม่ส่งให้ Worker |

---

## 5. สัญญา API

### GAS → admin UI (ผ่าน `google.script.run`)
ทุกฟังก์ชัน (ยกเว้น `login`) รับ `token` เป็นพารามิเตอร์แรก ตรวจ session ใน `CacheService` (เก็บ `{ username, role }`) และตรวจว่าผู้ใช้ยังอยู่ใน `USERS` ก่อนทำงาน (ผู้ใช้ที่ถูกลบหลุดทันที) ฟังก์ชันที่ระบุ **[admin]** ต้องตรวจ role ฝั่ง server ด้วย ไม่ใช่แค่ซ่อนปุ่ม
คืนค่ารูปแบบ `{ ok: true, data }` หรือ `{ ok: false, error: "ข้อความภาษาไทย" }`
สินค้าอ้างอิงด้วย `productId` เสมอ (ไม่ใช่ `code`)

- `login(username, password)` → `{ token, user: { username, displayName, role } }` (session 6 ชม.; ผิด 5 ครั้งใน 15 นาทีต่อ username ล็อกชั่วคราว; ข้อความผิดไม่บอกว่าผิดที่ชื่อหรือรหัส), `logout(token)`, `me(token)`
- `listProducts(token)`, `getProduct(token, productId)`
- `createProduct(token, product)` → สร้าง `productId`, `updateProduct(token, productId, fields)` (รวม `code`), `setStatus(token, productId, status)`
- `previewCsv(token, rows)` → สถานะรายแถว / `importCsv(token, rows)` รับทีละไม่เกิน 50 แถว
- `uploadImage(token, productId, { name, mimeType, base64 })`, `listImages(token, productId)`, `removeImage(token, productId, fileId)` (ย้ายไปถังขยะของ Drive)
- `linkFolder(token, productId, folderUrl)`, `setCover(token, productId, fileId)` (`fileId` ว่าง = กลับเป็นรูปล่าสุดอัตโนมัติ)
- `getCategories(token)` → `[{ name, count }]`, `addCategory(token, name)`, `renameCategory(token, oldName, newName)` (อัปเดตสินค้าในหมวด + sync), `deleteCategory(token, name)` (เฉพาะ count = 0)
- `getSettings(token)`, `saveSettings(token, settings, confirmPassword)`, `uploadLogo(token, file)` — **การเปลี่ยน `workerUrl` ต้องส่ง `confirmPassword` (รหัสผ่านของผู้ใช้เอง) และ server ตรวจเสมอ** (sync ส่ง `API_SECRET` ไปที่ URL นี้ จึงห้ามให้ session ที่หลุดเปลี่ยนเงียบๆ) ใส่ผิดนับรวมกับตัวนับล็อกของ login (ครบ 5 ครั้งล็อก 15 นาที) ข้อผิดพลาด: `confirm_required` / `bad_password` / `locked`; UI แสดงคำเตือนทันทีที่แก้ช่อง และกล่องยืนยันรหัสผ่านก่อนบันทึก
- `changeMyPassword(token, oldPassword, newPassword)` → `{ token }` ใหม่ (session อื่นของผู้ใช้นี้หลุด)
- **[admin]** `listUsers(token)` (ไม่คืน salt/hash), `createUser(token, { username, displayName, role, password })`, `resetPassword(token, username, newPassword)`, `deleteUser(token, username)`

การเขียนข้อมูลทุกครั้งต้องอยู่ใน `LockService.getScriptLock()` และเขียน AuditLog ภายใน lock เดียวกัน

### GAS public JSON (สำหรับ Worker)
`GET {GAS_URL}?api=product&code={code}&key={API_SECRET}`
`GET {GAS_URL}?api=settings&key={API_SECRET}`

```json
{ "ok": true,
  "product": { "productId": "", "code": "", "name": "", "category": "", "description": "", "status": "active", "updatedAt": "" },
  "images": [ { "id": "", "name": "" } ] }
```
- ค้นหา `code` ปัจจุบันก่อน ถ้าไม่เจอค่อยค้นใน `oldCodes` → `{ ok:true, redirect:"<code ปัจจุบัน>" }`
- `key` ผิด → `{ ok:false, error:"forbidden" }`, ไม่พบ → `{ ok:false, error:"not_found" }`
- `doGet` ของ GAS อ่าน HTTP header ไม่ได้ จึงต้องส่ง secret ทาง query string

### GAS → Worker (หลังบันทึก)
`POST {workerUrl}/__sync` header `X-Api-Secret: {API_SECRET}` body `{ type: "product", data: { product, images }, oldCodes: [...] }` หรือ `{ type: "settings", data: {...} }`
- เมื่อรหัสสินค้าเปลี่ยน Worker เขียน `p:{code ใหม่}` = ข้อมูลสินค้า และ `p:{code เก่า}` = `{ redirect: "<code ใหม่>" }`
ถ้า sync ล้มเหลว ห้ามทำให้การบันทึกใน Sheet ล้มเหลว ให้แจ้งเตือนใน UI แทน
**การ import CSV ไม่ต้อง sync** (KV free plan เขียนได้ 1,000 ครั้ง/วัน) ปล่อยให้ Worker ดึงเองเมื่อมีคนเปิดครั้งแรก

### Worker routes
| route | หน้าที่ |
|---|---|
| `GET /p/{code}` | อ่าน KV `p:{code ตัวเล็ก}` + `settings` → ถ้าไม่มี ดึงจาก GAS แล้วเก็บ → render HTML; ถ้าค่าเป็น `{ redirect }` → HTTP 301 ไป `/p/{redirect}` |
| `GET /img/{fileId}?w=1200&s={hmac}` | ตรวจ HMAC แล้ว proxy รูปจาก `https://drive.google.com/thumbnail?id={fileId}&sz=w{w}` แคชด้วย Cache API 30 วัน |
| `POST /__sync` | ตรวจ `X-Api-Secret` แล้วเขียน KV |
| `GET /` | หน้าเรียบๆ แสดงชื่อร้าน |

- หน้าสินค้าต้องมี `og:title`, `og:description` (ตัด 150 ตัวอักษร), `og:image` (URL เต็มของ `/img/...` ขนาด 1200), `og:url`, `og:type=product`
- ลิงก์รูปทุกอันต้องเซ็น HMAC-SHA256 ด้วย `API_SECRET` เพื่อไม่ให้ Worker กลายเป็น proxy เปิดสาธารณะ
- สินค้า hidden → HTTP 410 + หน้า "สินค้านี้ไม่พร้อมจำหน่าย" / ไม่พบ → HTTP 404
- ปุ่ม LINE: `https://line.me/R/oaMessage/{encodeURIComponent(lineOaId)}/?{encodeURIComponent(text)}` — ตรวจกับเอกสาร LINE URL scheme แล้ว (2026-10-03): ทั้ง LINE ID (`@` → `%40`) และข้อความต้อง percent-encode แบบ UTF-8
- ถ้ายังไม่ได้ตั้ง LINE OA ID: ปุ่ม "ทัก LINE" ยังแสดง (โหมดตัวอย่าง ผู้ใช้ขอไว้เพื่อให้ลูกค้าดูหน้าตาได้ก่อน 2026-10-03) กดแล้วขึ้นข้อความอธิบายแทนการเปิด LINE; ตั้ง ID แล้วกลายเป็นลิงก์จริงอัตโนมัติ

### Worker env (`wrangler.jsonc`)
หนึ่ง wrangler environment ต่อร้าน (`env.npbeauty`, `env.lemonbeauty`) แต่ละ env override `name` เป็นชื่อร้าน → Worker ชื่อ `npbeauty` / `lemonbeauty` ต้องใช้ `--env <shop>` ทุกครั้ง (ห้าม deploy แบบไม่ใส่ env)
- `vars.GAS_URL` — URL `/exec` ของ GAS ของร้านนั้น (ไม่ใช่ความลับ, commit ได้)
- secret `API_SECRET` — ตั้งผ่าน `npx wrangler secret put API_SECRET --env <shop>` หรือ dashboard (ห้าม commit) ค่าต้องตรงกับ Script Properties ของ GAS ร้านเดียวกัน
- KV binding `CATALOG` — KV namespace แยกต่อร้าน (`catalog-npbeauty` = `ce19a061…`, `catalog-lemonbeauty` = `c1536310…`) ทุก key ตั้ง `expirationTtl` 3 วัน ถ้า sync พลาด ข้อมูลจะดึงใหม่จาก GAS เองภายใน 3 วัน
- **Workers Caching** (`"cache": { "enabled": true }`) แคชตาม `Cache-Control`: หน้าสินค้า/404/410 = 60 วินาที, `/img` = 30 วัน, redirect 301 = 1 ชม., 503 และ `/__sync` = no-store (Cache API `caches.default` ใช้บน workers.dev ไม่ได้ จึงไม่ใช้)
- ทดสอบในเครื่องโดยไม่ใช้ secret จริง: `npm run preview:admin` (GAS จำลองที่ :8787 มี `/exec?api=…`, secret = `preview-secret`) แล้ว `cd worker && npm run dev:preview` (:8788)
- ทดสอบกับ GAS จริง: ใส่ `API_SECRET=...` ใน `worker/.dev.vars.npbeauty` หรือ `.dev.vars.lemonbeauty` (gitignore แล้ว) แล้ว `npx wrangler dev --env <shop>`
- wrangler ตรึง `4.86.x` เพราะเครื่องนี้ใช้ Node 20 (wrangler ใหม่ต้อง Node 22) และ `compatibility_date` = `2026-05-01` ซึ่ง runtime ของ 4.86 รองรับ

---

## 6. กติกาดีไซน์

- ฟอนต์ **Noto Sans Thai** ทั้งระบบ (Google Fonts, weight 400/500/600/700) ทั้ง admin และหน้าสินค้า
- สไตล์ minimal, modern, **mobile-first** ออกแบบที่ความกว้าง 360px ก่อน แล้วขยายที่ breakpoint 640px และ 1024px
- ใช้ CSS variables; สีหลักมาจาก `Settings.primaryColor` → `--primary`
- ปุ่มและจุดกดต้องสูงอย่างน้อย 44px, ห้ามมี horizontal scroll
- หน้าสินค้า: มือถือแสดงรูปด้านบนแบบปัด (CSS scroll-snap) + จุดบอกตำแหน่ง; จอใหญ่แสดงรูปซ้าย ข้อมูลขวา มีรูปย่อให้กดเลือก
- ปุ่ม "ทัก LINE" บนมือถือติดอยู่ล่างจอ (sticky)
- admin: ทำตาม mockup ที่อนุมัติ (ลิงก์ในหัวข้อ 1) — เมนูตามหัวข้อ 2; การ์ดสินค้ามี รูปปก, รหัส, ชื่อ, หมวด, สวิตช์แสดง/ซ่อน, ปุ่ม copy ลิงก์ และแก้ไข (สินค้าที่ซ่อนแสดงจางลง); การแก้ไขเปิดเป็น drawer บนจอใหญ่ / หน้าเต็มบนมือถือ **กดบันทึกสำเร็จแล้วปิด drawer/หน้านั้นทันที** กลับรายการสินค้า (แก้ 2026-10-06; ถ้าไม่มีอะไรเปลี่ยนจะไม่ปิด); หน้าแก้ไขแสดง Product ID แบบล็อก + ช่องรหัสสินค้าที่แก้ได้
- สถานะสีของ toggle/ป้ายต้องต่างกันทั้งสีและข้อความ (ไม่ใช้สีอย่างเดียว); ถ้าสีหลักสว่าง (luminance > 0.6) ตัวอักษรบนสีหลักใช้สีเข้ม
- ทุกการกระทำต้องมี loading state และ toast แจ้งผลเป็นภาษาไทย

---

## 7. ข้อห้ามและข้อควรระวัง

- **ห้ามสร้าง GAS deployment ใหม่** ให้อัปเดต deployment เดิมด้วย `deploymentId` ของร้านนั้นใน `shops.json` เท่านั้น เพราะ URL `/exec` จะเปลี่ยนและ Worker จะใช้ไม่ได้
- **ห้าม push โค้ดร้านหนึ่งไปอีก Script ID** — เรียก clasp ผ่าน `npm run gas -- <shop> ...` เสมอ ไม่รัน `clasp` ตรงๆ ใน `gas/`
- **ห้ามแก้โค้ดใน Apps Script editor ออนไลน์** เพราะ `clasp push` จะเขียนทับ
- ฟังก์ชัน top-level ที่ไม่ลงท้ายด้วย `_` ถูกเรียกจากเว็บได้ผ่าน `google.script.run` (web app รันในนามเจ้าของ) → helper ภายในต้องลงท้าย `_` เสมอ, ฟังก์ชัน API ต้องเรียก `requireUser_`, ฟังก์ชันเมนู/setup/ทดสอบต้องเรียก `requireEditorContext_`
- ข้อความผู้ใช้ที่ขึ้นต้นด้วย `= + - @` ต้องผ่าน `toCell_` (กัน formula injection) และทุกแท็บตั้ง format เป็น plain text
- รัน `npm run test:gas` ก่อน push โค้ด `gas/` ทุกครั้ง
- ห้าม commit: `.clasprc.json`, `API_SECRET`, รหัสผ่าน, `.dev.vars`
- `navigator.clipboard` อาจถูกบล็อกใน iframe ของ GAS → ต้องมี fallback `document.execCommand('copy')`
- `sessionStorage`/`localStorage` ใน GAS อาจใช้ไม่ได้ → ห่อด้วย try/catch และต้องทำงานได้แม้ไม่มี (เก็บ token ในตัวแปร)
- Worker free plan มี CPU 10ms ต่อ request → ห้ามประมวลผลรูปใน Worker
- ไฟล์ CSV: ตัด BOM, รองรับ field ที่มี comma/ขึ้นบรรทัดในเครื่องหมายคำพูด, ถ้าเจออักขระ `�` ให้เตือนว่า "กรุณาบันทึกไฟล์เป็น CSV UTF-8"
- โฟลเดอร์รูปต้องตั้ง `DriveApp.Access.ANYONE_WITH_LINK` + `Permission.VIEW` ถ้าตั้งไม่ได้ (เช่น ไม่ใช่เจ้าของ) ให้แจ้งผู้ใช้ชัดเจน
- GAS deployment: Execute as **Me**, Who has access **Anyone**

---

## 8. คำสั่งที่ใช้บ่อย

```bash
# ทดสอบในเครื่อง (ไม่ต้องใช้บัญชี Google)
npm run test:gas                                          # backend self test บน mock
npm run preview:admin                                     # หน้า admin บน http://localhost:8787

# GAS (<shop> = npbeauty | lemonbeauty | all)
npm run gas -- <shop> push                                # clasp push -f
npm run gas -- <shop> deploy "msg"                        # clasp deploy -i <deploymentId> (อัปเดต deployment เดิม)
npm run gas -- <shop> open                                # เปิด editor

# Worker (<shop> = npbeauty | lemonbeauty)
cd worker && npx wrangler dev --env <shop>                # รันทดสอบกับ GAS จริง (ใส่ API_SECRET ใน worker/.dev.vars.<shop>)
cd worker && npm run dev:preview                          # รันทดสอบกับ GAS จำลอง (ต้องเปิด npm run preview:admin ก่อน)
cd worker && npx wrangler kv namespace create CATALOG --env <shop>
cd worker && npx wrangler secret put API_SECRET --env <shop>
```

clasp ใช้เวอร์ชัน `3.4.1` (ล่าสุด ณ 2026-10-02, ผู้ใช้ยืนยันแล้ว) ตรึงเวอร์ชันนี้ทั้งในเครื่องและ GitHub Actions เพราะรูปแบบ `~/.clasprc.json` ต้องตรงกับ major version (v2 ใช้กับ token ของ v3 ไม่ได้) ห้ามใช้ v2
Worker deploy อัตโนมัติจาก Cloudflare Workers Builds เมื่อ push เข้า `main` (1 โปรเจกต์ต่อร้าน deploy command `npx wrangler deploy --env <shop>`) ส่วน GAS deploy ผ่าน GitHub Actions (matrix ทุกร้านใน `shops.json`)

## 9. วิธีทำงาน
- ทำทีละเฟสตาม `PLAN.md` จบแต่ละเฟสต้องผ่าน "เสร็จเมื่อ" แล้ว commit ด้วยข้อความ `phase N: ...`
- ถ้าขั้นตอนไหนต้องให้ผู้ใช้ทำเอง (ล็อกอิน, กดอนุญาต, ตั้ง secret) ให้หยุดแล้วบอกขั้นตอนเป็นภาษาไทยทีละข้อ
- เจออะไรที่ขัดกับหัวข้อ 2 ให้ถามผู้ใช้ก่อน
