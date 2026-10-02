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
ลูกค้า ─> Worker /p/{code} ─(KV hit)──> render HTML
                         └─(KV miss)─> GAS ?api=product ─> Sheet/Drive ─> เก็บลง KV ─> render
Admin ─> GAS /exec (รหัสผ่าน) ─บันทึก─> Sheet/Drive ─POST /__sync─> Worker เขียน KV
```

เหตุผลที่แยกหน้าบ้านไปไว้ที่ Worker: หน้า `/exec` ของ GAS แสดงผลใน iframe ทำให้ LINE อ่าน OG tags ไม่ได้ (ไม่มีพรีวิวรูป), ลิงก์ยาว, มีแถบเตือนของ Google และโหลดช้า

### ร้านในระบบ (2 ร้าน แยกระบบกัน ใช้โค้ดชุดเดียว)

แต่ละร้านมี Google Sheet + Apps Script project + deployment + โฟลเดอร์ Drive + Worker + KV + `API_SECRET` + รหัสผ่าน admin **เป็นของตัวเอง** ข้อมูลไม่ปนกัน รหัสสินค้าซ้ำข้ามร้านได้ โค้ดใน `gas/` และ `worker/` ใช้ร่วมกัน ห้ามใส่ค่าเฉพาะร้านในโค้ด (ค่าร้านอยู่ใน Sheet `Settings`, Script Properties, `shops.json` และ env ของ Worker)

| key (`shops.json` / wrangler env) | ชื่อร้าน | Worker URL |
|---|---|---|
| `npbeauty` | NPBeauty | `https://npbeauty.ethermorph-corp.workers.dev` |
| `lemonbeauty` | LemonBeauty | `https://lemonbeauty.ethermorph-corp.workers.dev` |

- Cloudflare account subdomain: `ethermorph-corp.workers.dev` (ใช้ร่วมกันทุกร้าน) — ใช้ workers.dev ไปก่อน ผูก Custom Domain ทีหลังได้โดยไม่ต้องแก้โค้ด
- โควตา free plan (KV write 1,000/วัน, Workers ~100,000 request/วัน) เป็นของบัญชี **ใช้ร่วมกันทุกร้าน**
- เพิ่มร้านใหม่ = เพิ่ม entry ใน `shops.json` + env ใน `wrangler.jsonc` + ทำ Phase 0.4–0.5, 4, 6 ซ้ำสำหรับร้านนั้น

---

## 2. การตัดสินใจที่ยืนยันแล้ว (ห้ามเปลี่ยนโดยไม่ถามผู้ใช้)

- **หลายร้าน:** 2 ร้าน (NPBeauty, LemonBeauty) แยกระบบกันคนละชุด ใช้โค้ดร่วมกันใน repo เดียว (ดูหัวข้อ 1 "ร้านในระบบ")
- **ลิงก์ลูกค้า:** `{WORKER_URL}/p/{code}` หนึ่งลิงก์ต่อสินค้า (`WORKER_URL` ของแต่ละร้าน)
- **เข้า admin:** GAS `/exec` (ไม่มีพารามิเตอร์) → หน้าใส่รหัสผ่าน รหัสเก็บเป็น hash ใน Script Properties
- **รหัสสินค้า:** ผู้ใช้กรอกเอง ต้องไม่ซ้ำ (เทียบแบบไม่สนตัวพิมพ์เล็ก-ใหญ่) ใช้ได้เฉพาะ `^[A-Za-z0-9_-]{1,40}$` และ**แก้ไม่ได้หลังสร้าง**
- **ฟิลด์สินค้า:** รหัสสินค้า | ชื่อสินค้า | หมวดหมู่ | รายละเอียด | โฟลเดอร์รูป | สถานะ
- **รูปภาพ:** สินค้าละหลายรูป เก็บในโฟลเดอร์ Drive ของสินค้านั้น เรียงตามชื่อไฟล์ รูปแรกเป็นรูปปก รับรูปได้ 2 ทาง
  1. อัปโหลดผ่านแอป → ระบบสร้างโฟลเดอร์ชื่อตามรหัสสินค้าใต้โฟลเดอร์หลัก
  2. วางลิงก์โฟลเดอร์ Drive ที่มีอยู่แล้ว
- **ย่อรูปฝั่งเบราว์เซอร์** ก่อนอัปโหลด: ด้านยาวไม่เกิน 1600px, JPEG quality 0.85, อัปโหลดทีละไฟล์
- **Batch:** อัปโหลดไฟล์ CSV (UTF-8) คอลัมน์ `code,name,category,description,folder_url` โดย `folder_url` ไม่บังคับ ถ้าว่างระบบสร้างโฟลเดอร์เปล่าให้ ต้องแสดงตารางตัวอย่างพร้อมสถานะของแต่ละแถว (ใหม่ / รหัสซ้ำ / ข้อมูลไม่ครบ) ก่อนกดยืนยัน
- **หมวดหมู่:** dropdown จากแท็บ `Categories` และพิมพ์หมวดใหม่ได้ (เพิ่มเข้าแท็บอัตโนมัติ)
- **เลิกขาย:** ใช้สถานะ `active` / `hidden` ไม่มีการลบสินค้า ลิงก์ของสินค้าที่ hidden แสดงข้อความ "สินค้านี้ไม่พร้อมจำหน่าย"
- **หน้าสินค้า:** แกลเลอรีรูป (ปัดได้บนมือถือ), ชื่อ, หมวด, รายละเอียด (ข้อความธรรมดา รักษาการขึ้นบรรทัด) และปุ่ม "ทัก LINE" ที่เปิด LINE OA พร้อมข้อความ `สนใจสินค้า {code} {name}`
- **ไม่มี:** ราคา, สต็อก, ตะกร้า, สินค้าที่เกี่ยวข้อง
- **ตั้งค่าร้าน:** เมนูตั้งค่าใน admin สำหรับ ชื่อร้าน, โลโก้, LINE OA ID, สีหลัก และ Worker URL
- **ปุ่ม copy ลิงก์:** คัดลอกข้อความ `{name}\n{WORKER_URL}/p/{code}`
- **ค้นหา (admin):** ค้นหาจากรหัสและชื่อ โหลดรายการทั้งหมดครั้งเดียวแล้วกรองฝั่ง client ทันทีที่พิมพ์

---

## 3. โครงสร้าง repo

```
/CLAUDE.md
/PLAN.md
/README.md                  คู่มือติดตั้งและใช้งานสำหรับผู้ใช้ (ภาษาไทย)
/WORKPLAN.md                checklist / สถานะงานปัจจุบัน
/.gitignore
/package.json               npm run gas -- <shop|all> <push|deploy|open>
/shops.json                 รายชื่อร้าน: scriptId, deploymentId, workerEnv (ไม่ใช่ความลับ)
/scripts/
  gas.mjs                   เขียน gas/.clasp.json จาก shops.json แล้วรัน clasp
/gas/
  .clasp.json               สร้างอัตโนมัติโดย scripts/gas.mjs (gitignore) ห้ามแก้เอง
  appsscript.json
  Main.gs                   doGet routing
  Setup.gs                  setup(), onOpen() เมนูใน Sheet
  Auth.gs                   login, session, hash
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
  csv-template.csv
/.github/workflows/
  deploy-gas.yml
```

---

## 4. Data model (Google Sheet)

**แท็บ `Products`** (แถวแรกเป็น header)

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| code | string | primary key, ห้ามแก้ |
| name | string | บังคับ |
| category | string | |
| description | string | ข้อความธรรมดา มีขึ้นบรรทัดได้ |
| folderId | string | Drive folder ID |
| folderUrl | string | |
| status | `active` \| `hidden` | ค่าเริ่มต้น `active` |
| createdAt | ISO datetime | |
| updatedAt | ISO datetime | |

**แท็บ `Categories`**: คอลัมน์ `name`

**แท็บ `Settings`**: คอลัมน์ `key | value` โดยมี key คือ `shopName`, `logoFileId`, `lineOaId`, `primaryColor`, `workerUrl`

**Script Properties** (ห้ามเก็บใน Sheet)

| key | ค่า |
|---|---|
| `ADMIN_PASSWORD_HASH` | SHA-256 ของ `salt + password` (hex) |
| `ADMIN_PASSWORD_SALT` | random string |
| `API_SECRET` | random 32+ ตัวอักษร ใช้ค่าเดียวกับ Worker |
| `ROOT_FOLDER_ID` | โฟลเดอร์หลักใน Drive ที่ `setup()` สร้าง |

---

## 5. สัญญา API

### GAS → admin UI (ผ่าน `google.script.run`)
ทุกฟังก์ชัน (ยกเว้น `login`) รับ `token` เป็นพารามิเตอร์แรก และตรวจกับ `CacheService` ก่อนทำงาน
คืนค่ารูปแบบ `{ ok: true, data }` หรือ `{ ok: false, error: "ข้อความภาษาไทย" }`

- `login(password)` → `{ token }` (session 6 ชม.; ผิด 5 ครั้งใน 15 นาที ล็อกชั่วคราว)
- `listProducts(token)`, `getProduct(token, code)`
- `createProduct(token, product)`, `updateProduct(token, code, fields)`, `setStatus(token, code, status)`
- `previewCsv(token, rows)` → สถานะรายแถว / `importCsv(token, rows)` รับทีละไม่เกิน 50 แถว
- `uploadImage(token, code, { name, mimeType, base64 })`, `listImages(token, code)`, `removeImage(token, code, fileId)` (ย้ายไปถังขยะของ Drive)
- `linkFolder(token, code, folderUrl)`
- `getCategories(token)`, `addCategory(token, name)`
- `getSettings(token)`, `saveSettings(token, settings)`, `uploadLogo(token, file)`

การเขียนข้อมูลทุกครั้งต้องอยู่ใน `LockService.getScriptLock()`

### GAS public JSON (สำหรับ Worker)
`GET {GAS_URL}?api=product&code={code}&key={API_SECRET}`
`GET {GAS_URL}?api=settings&key={API_SECRET}`

```json
{ "ok": true,
  "product": { "code": "", "name": "", "category": "", "description": "", "status": "active", "updatedAt": "" },
  "images": [ { "id": "", "name": "" } ] }
```
- `key` ผิด → `{ ok:false, error:"forbidden" }`, ไม่พบ → `{ ok:false, error:"not_found" }`
- `doGet` ของ GAS อ่าน HTTP header ไม่ได้ จึงต้องส่ง secret ทาง query string

### GAS → Worker (หลังบันทึก)
`POST {workerUrl}/__sync` header `X-Api-Secret: {API_SECRET}` body `{ type: "product", data: {...} }` หรือ `{ type: "settings", data: {...} }`
ถ้า sync ล้มเหลว ห้ามทำให้การบันทึกใน Sheet ล้มเหลว ให้แจ้งเตือนใน UI แทน
**การ import CSV ไม่ต้อง sync** (KV free plan เขียนได้ 1,000 ครั้ง/วัน) ปล่อยให้ Worker ดึงเองเมื่อมีคนเปิดครั้งแรก

### Worker routes
| route | หน้าที่ |
|---|---|
| `GET /p/{code}` | อ่าน KV `p:{code ตัวเล็ก}` + `settings` → ถ้าไม่มี ดึงจาก GAS แล้วเก็บ → render HTML |
| `GET /img/{fileId}?w=1200&s={hmac}` | ตรวจ HMAC แล้ว proxy รูปจาก `https://drive.google.com/thumbnail?id={fileId}&sz=w{w}` แคชด้วย Cache API 30 วัน |
| `POST /__sync` | ตรวจ `X-Api-Secret` แล้วเขียน KV |
| `GET /` | หน้าเรียบๆ แสดงชื่อร้าน |

- หน้าสินค้าต้องมี `og:title`, `og:description` (ตัด 150 ตัวอักษร), `og:image` (URL เต็มของ `/img/...` ขนาด 1200), `og:url`, `og:type=product`
- ลิงก์รูปทุกอันต้องเซ็น HMAC-SHA256 ด้วย `API_SECRET` เพื่อไม่ให้ Worker กลายเป็น proxy เปิดสาธารณะ
- สินค้า hidden → HTTP 410 + หน้า "สินค้านี้ไม่พร้อมจำหน่าย" / ไม่พบ → HTTP 404
- ปุ่ม LINE: `https://line.me/R/oaMessage/{lineOaId}/?{encodeURIComponent(text)}` — **ตรวจรูปแบบ URL กับเอกสาร LINE ก่อนใช้จริง**

### Worker env (`wrangler.jsonc`)
หนึ่ง wrangler environment ต่อร้าน (`env.npbeauty`, `env.lemonbeauty`) แต่ละ env override `name` เป็นชื่อร้าน → Worker ชื่อ `npbeauty` / `lemonbeauty` ต้องใช้ `--env <shop>` ทุกครั้ง (ห้าม deploy แบบไม่ใส่ env)
- `vars.GAS_URL` — URL `/exec` ของ GAS ของร้านนั้น (ไม่ใช่ความลับ, commit ได้)
- secret `API_SECRET` — ตั้งผ่าน `npx wrangler secret put API_SECRET --env <shop>` หรือ dashboard (ห้าม commit) ค่าต้องตรงกับ Script Properties ของ GAS ร้านเดียวกัน
- KV binding `CATALOG` — KV namespace แยกต่อร้าน

---

## 6. กติกาดีไซน์

- ฟอนต์ **Noto Sans Thai** ทั้งระบบ (Google Fonts, weight 400/500/600/700) ทั้ง admin และหน้าสินค้า
- สไตล์ minimal, modern, **mobile-first** ออกแบบที่ความกว้าง 360px ก่อน แล้วขยายที่ breakpoint 640px และ 1024px
- ใช้ CSS variables; สีหลักมาจาก `Settings.primaryColor` → `--primary`
- ปุ่มและจุดกดต้องสูงอย่างน้อย 44px, ห้ามมี horizontal scroll
- หน้าสินค้า: มือถือแสดงรูปด้านบนแบบปัด (CSS scroll-snap) + จุดบอกตำแหน่ง; จอใหญ่แสดงรูปซ้าย ข้อมูลขวา มีรูปย่อให้กดเลือก
- ปุ่ม "ทัก LINE" บนมือถือติดอยู่ล่างจอ (sticky)
- admin: แท็บ "สินค้า" (ค้นหา + รายการ + ปุ่ม copy/แก้ไข), "เพิ่มสินค้า", "นำเข้า CSV", "ตั้งค่า"; การแก้ไขเปิดเป็น drawer/หน้าเต็มบนมือถือ
- ทุกการกระทำต้องมี loading state และ toast แจ้งผลเป็นภาษาไทย

---

## 7. ข้อห้ามและข้อควรระวัง

- **ห้ามสร้าง GAS deployment ใหม่** ให้อัปเดต deployment เดิมด้วย `deploymentId` ของร้านนั้นใน `shops.json` เท่านั้น เพราะ URL `/exec` จะเปลี่ยนและ Worker จะใช้ไม่ได้
- **ห้าม push โค้ดร้านหนึ่งไปอีก Script ID** — เรียก clasp ผ่าน `npm run gas -- <shop> ...` เสมอ ไม่รัน `clasp` ตรงๆ ใน `gas/`
- **ห้ามแก้โค้ดใน Apps Script editor ออนไลน์** เพราะ `clasp push` จะเขียนทับ
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
# GAS (<shop> = npbeauty | lemonbeauty | all)
npm run gas -- <shop> push                                # clasp push -f
npm run gas -- <shop> deploy "msg"                        # clasp deploy -i <deploymentId> (อัปเดต deployment เดิม)
npm run gas -- <shop> open                                # เปิด editor

# Worker (<shop> = npbeauty | lemonbeauty)
cd worker && npx wrangler dev --env <shop>                # รันทดสอบ (ใส่ API_SECRET ใน worker/.dev.vars)
cd worker && npx wrangler kv namespace create CATALOG --env <shop>
cd worker && npx wrangler secret put API_SECRET --env <shop>
```

clasp ใช้เวอร์ชัน `3.4.1` (ล่าสุด ณ 2026-10-02, ผู้ใช้ยืนยันแล้ว) ตรึงเวอร์ชันนี้ทั้งในเครื่องและ GitHub Actions เพราะรูปแบบ `~/.clasprc.json` ต้องตรงกับ major version (v2 ใช้กับ token ของ v3 ไม่ได้) ห้ามใช้ v2
Worker deploy อัตโนมัติจาก Cloudflare Workers Builds เมื่อ push เข้า `main` (1 โปรเจกต์ต่อร้าน deploy command `npx wrangler deploy --env <shop>`) ส่วน GAS deploy ผ่าน GitHub Actions (matrix ทุกร้านใน `shops.json`)

## 9. วิธีทำงาน
- ทำทีละเฟสตาม `PLAN.md` จบแต่ละเฟสต้องผ่าน "เสร็จเมื่อ" แล้ว commit ด้วยข้อความ `phase N: ...`
- ถ้าขั้นตอนไหนต้องให้ผู้ใช้ทำเอง (ล็อกอิน, กดอนุญาต, ตั้ง secret) ให้หยุดแล้วบอกขั้นตอนเป็นภาษาไทยทีละข้อ
- เจออะไรที่ขัดกับหัวข้อ 2 ให้ถามผู้ใช้ก่อน
