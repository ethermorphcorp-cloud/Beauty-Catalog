# แผนสร้าง Product Catalog ทีละขั้น

สเปกและกติกาทั้งหมดอยู่ใน `CLAUDE.md`
- **[คุณ]** = ทำเองในเบราว์เซอร์หรือบนเครื่อง
- **[Claude Code]** = สั่ง Claude Code ด้วยข้อความในกล่อง "สั่ง Claude Code"

ติ๊ก `[x]` เมื่อทำเสร็จ เพื่อให้ Claude Code รู้ว่าถึงขั้นไหนแล้ว

---

## Phase 0 — เตรียมบัญชีและเครื่องมือ [คุณ] (~45–60 นาที)

> ระบบนี้มี **2 ร้าน** (NPBeauty, LemonBeauty) แยกระบบกัน ใช้โค้ดชุดเดียว — ดู CLAUDE.md หัวข้อ 1 "ร้านในระบบ"
> ข้อที่มี ×2 ต้องทำแยกสำหรับแต่ละร้าน

### 0.1 สมัคร Cloudflare
- [x] สมัครบัญชี Cloudflare (Ethermorph.corp)
- [x] **Compute → Workers & Pages** → ตั้ง account subdomain เป็น `ethermorph-corp` → ลิงก์จะเป็น `npbeauty.ethermorph-corp.workers.dev` และ `lemonbeauty.ethermorph-corp.workers.dev`
- [ ] ยังไม่ต้องสร้าง Worker (ทำใน Phase 6)

### 0.2 สร้าง repo ใน GitHub (repo เดียวใช้ทั้งสองร้าน)
- [x] ไปที่ https://github.com/new
- [x] repo: https://github.com/ethermorphcorp-cloud/Beauty-Catalog (Private, repo เดียวทั้งสองร้าน)
- [x] ผูก remote `origin` แล้ว

### 0.3 ติดตั้งเครื่องมือบนเครื่อง
- [x] Node.js LTS (https://nodejs.org) — ตรวจด้วย `node -v`
- [x] Git — ตรวจด้วย `git --version`
- [x] Claude Code — ตามคู่มือที่ https://docs.claude.com
- [x] clasp `3.4.1` (ตรึงเวอร์ชันนี้ — ดู CLAUDE.md หัวข้อ 8)
- [x] GitHub CLI: `gh auth login` (ethermorphcorp-cloud)
- [x] repo ในเครื่อง: โฟลเดอร์ `VALIN Catalog` (`git init` แล้ว)

### 0.4 สร้าง Google Sheet ×2
- [x] NPBeauty: https://sheets.new → ตั้งชื่อ `NPBeauty Catalog DB`
- [x] LemonBeauty: https://sheets.new → ตั้งชื่อ `LemonBeauty Catalog DB`
- [x] ไม่ต้องสร้างแท็บหรือ header เอง (`setup()` จะสร้างให้ใน Phase 4)

### 0.5 สร้าง Apps Script project และหา Script ID ×2
- [x] ในแต่ละ Sheet เปิดเมนู **ส่วนขยาย (Extensions) → Apps Script**
- [x] ตั้งชื่อโปรเจกต์ `NPBeauty Catalog` / `LemonBeauty Catalog`
- [x] ⚙️ **Project Settings** → คัดลอก **Script ID** ของแต่ละร้านส่งให้ Claude Code (จะใส่ใน `shops.json`)
- หมายเหตุ: ไม่ต้องสร้าง Google Cloud project หรือ GCP Project ID แยก clasp ใช้งานได้โดยไม่ต้องมี

### 0.6 เปิด Apps Script API
- [x] ไปที่ https://script.google.com/home/usersettings แล้วเปิด **Google Apps Script API** เป็น **On**
- ถ้าไม่เปิด `clasp push` จะ error

### 0.7 ล็อกอินเครื่องมือบนเครื่อง
- [x] `clasp login` → เลือกบัญชี Google เดียวกับเจ้าของ Sheet → กดอนุญาต (จะได้ไฟล์ `~/.clasprc.json` — **ห้ามส่งไฟล์นี้ให้ใครหรือวางในแชท**)
- [x] `npx wrangler login` → กดอนุญาตในเบราว์เซอร์ (บัญชี Ethermorph.corp)

### 0.8 เตรียมข้อมูลร้าน ×2
- [ ] NPBeauty: ชื่อร้าน, โลโก้ (PNG/JPG สี่เหลี่ยมจัตุรัส), LINE OA ID, สีหลัก
- [ ] LemonBeauty: ชื่อร้าน, โลโก้, LINE OA ID, สีหลัก

### 0.9 วางไฟล์แผนลง repo
- [x] `CLAUDE.md` และ `PLAN.md` อยู่ที่ root ของ repo แล้ว
- [x] [Claude Code] ผูก remote → commit → push (`docs: add plan`)

---

## Phase 1 — โครง repo [Claude Code]

> **สั่ง Claude Code:** `ทำ Phase 1 Script ID: npbeauty=<ID>, lemonbeauty=<ID>`

- [x] สร้างโครงโฟลเดอร์ตาม CLAUDE.md หัวข้อ 3
- [x] `shops.json` + `scripts/gas.mjs` (เขียน `gas/.clasp.json` ตามร้านแล้วรัน clasp)
- [x] ใส่ Script ID ทั้งสองร้านใน `shops.json`
- [x] `gas/appsscript.json` ตั้ง `timeZone: "Asia/Bangkok"`, `runtimeVersion: "V8"`, `webapp: { executeAs: "USER_DEPLOYING", access: "ANYONE_ANONYMOUS" }`
- [x] `worker/wrangler.jsonc` (env `npbeauty` / `lemonbeauty`), `worker/package.json` (มี wrangler เป็น devDependency)
- [x] `.gitignore`: `node_modules`, `.wrangler`, `.dev.vars`, `.clasprc.json`, `gas/.clasp.json`
- [x] `docs/csv-template.csv` พร้อมตัวอย่างภาษาไทย 2 แถว

**เสร็จเมื่อ:** โครงไฟล์ครบ, `npm run gas -- all push` สำเร็จทั้งสองร้าน (โค้ดว่างได้), commit `phase 1: scaffold`

---

## Phase 2 — GAS หลังบ้าน [Claude Code]

> **สั่ง Claude Code:** `ทำ Phase 2`

- [x] `Setup.gs`: `setup()` สร้างแท็บ Products / Categories / Settings / **AuditLog** พร้อม header, ตั้งโฟลเดอร์หลักใน Drive (ถามลิงก์โฟลเดอร์ของร้าน — ดู `shops.json` → `rootFolderId`), สร้าง `API_SECRET` แบบสุ่ม (ถ้ายังไม่มี) — ต้องรันซ้ำได้โดยไม่ทำข้อมูลเดิมเสียหาย
- [x] `onOpen()` เพิ่มเมนู **Catalog** ใน Sheet: "ตั้งค่าเริ่มต้น", "สร้าง/รีเซ็ตผู้ใช้ admin" (prompt ชื่อผู้ใช้ + รหัสผ่าน ด้วย `SpreadsheetApp.getUi().prompt` — ใช้ตอนเริ่มระบบหรือกู้คืนเมื่อลืมรหัส), "แสดง API_SECRET" (สำหรับคัดลอกไปใส่ Worker)
- [x] `Auth.gs`: ผู้ใช้หลายคนใน Script Properties `USERS`, role `admin`/`staff`, hash + salt, session token ใน CacheService 6 ชม., ล็อกชั่วคราวเมื่อใส่ผิด 5 ครั้งใน 15 นาทีต่อ username, ฟังก์ชันจัดการผู้ใช้ [admin] + `changeMyPassword`
- [x] `Audit.gs`: append แถวลงแท็บ AuditLog ทุกการเขียน (ไม่บันทึกรหัสผ่าน)
- [x] `Products.gs`, `Drive.gs`, `Settings.gs` ตามสัญญา API ใน CLAUDE.md หัวข้อ 5 — `productId` สร้างอัตโนมัติ, แก้ `code` ได้ + เก็บ `oldCodes`, โฟลเดอร์รูปชื่อตาม `productId`, จัดการหมวดหมู่ (เพิ่ม/เปลี่ยนชื่อ/ลบเมื่อว่าง)
- [x] `Api.gs`: `?api=product` และ `?api=settings` ตรวจ `key`; ค้นรหัสเก่าใน `oldCodes` แล้วคืน `redirect`
- [x] `Sync.gs`: POST ไป `{workerUrl}/__sync` หลัง create/update/setStatus/อัปโหลดหรือลบรูป/saveSettings (ข้ามถ้ายังไม่ได้ตั้ง workerUrl)
- [x] `Main.gs`: `doGet(e)` → มี `api` ส่ง JSON, ไม่มีส่งหน้า admin; ตั้ง `setXFrameOptionsMode` และ viewport meta

- [x] `SelfTest.gs` + `tests/gas-harness.cjs` (`npm run test:gas` — 21/21 ผ่านบน mock, 2026-10-03)

**เสร็จเมื่อ:** `npm run gas -- all push` ผ่าน และมีฟังก์ชันทดสอบ `_selfTest()` ที่สร้าง/แก้ (รวมเปลี่ยนรหัส)/ซ่อนสินค้าทดสอบ ตรวจ redirect รหัสเก่า และตรวจสิทธิ์ staff ห้ามจัดการผู้ใช้ แล้วลบแถวทดสอบทิ้ง, commit `phase 2: gas backend`

---

## Phase 3 — หน้า admin [Claude Code]

> **สั่ง Claude Code:** `ทำ Phase 3`

> ทำ UI ตาม mockup ที่อนุมัติ: https://claude.ai/artifact/TBdXkpz28tFKTUS4h2E6iE

- [x] หน้า login (ชื่อผู้ใช้ + รหัสผ่าน)
- [x] เมนูหลัก: มือถือ = แถบล่างไม่มีกรอบ `เพิ่มสินค้า · รายการสินค้า · สรุป · ตั้งค่า` / จอใหญ่ = แท็บบน `รายการสินค้า · สรุป · เพิ่มสินค้า · นำเข้า CSV · ตั้งค่า`
- [x] **รายการสินค้า** (หน้าแรก): ช่องค้นหา (รหัส/ชื่อ กรองทันที), การ์ด (รูปปก, รหัส, ชื่อ, หมวด, **สวิตช์แสดง/ซ่อน**), ปุ่ม **copy ลิงก์** และ **แก้ไข**, รองรับกรองตามหมวด (มาจากหน้าสรุป)
- [x] **สรุป**: stat card ทั้งหมด/แสดง/ซ่อน + การ์ดต่อหมวด (คำนวณฝั่ง client)
- [x] หน้า **แก้ไข**: Product ID (ล็อก), รหัสสินค้า (แก้ได้ + เตือนว่าลิงก์เดิมจะ redirect), ชื่อ/หมวด/รายละเอียด, สลับแสดง/ซ่อน, จัดการรูป (อัปโหลดหลายไฟล์พร้อมแถบความคืบหน้า, ลบรูป, วางลิงก์โฟลเดอร์)
- [x] **เพิ่มสินค้า**: ฟอร์มเดี่ยว + เลือกรูปได้ทันที, เช็ครหัสซ้ำก่อนบันทึก
- [x] **นำเข้า CSV (เฉพาะจอใหญ่)**: ปุ่มดาวน์โหลดไฟล์ตัวอย่าง, เลือกไฟล์ → ตารางตัวอย่างพร้อมสถานะรายแถว → ยืนยัน → นำเข้าทีละ 50 แถวพร้อมความคืบหน้า → สรุปผล
- [x] **ตั้งค่า** 3 แท็บ: ร้านค้า (ชื่อร้าน, โลโก้, LINE OA ID, สีหลัก + ตัวอย่าง, Worker URL) / หมวดหมู่สินค้า (เพิ่ม, เปลี่ยนชื่อ, ลบเมื่อว่าง, จำนวนต่อหมวด) / ผู้ใช้งาน (admin: รายชื่อ + เพิ่ม/ตั้งรหัสใหม่/ลบ; staff: แค่ตัวเอง; ทุกคนเปลี่ยนรหัสผ่านตัวเอง)
- [x] ย่อรูปด้วย canvas ก่อนอัปโหลด; copy มี fallback; ทุกปุ่มมี loading + toast

- [x] ทดสอบบน `npm run preview:admin` ที่ 360px และ 1280px: ไม่มี scroll แนวนอน, จุดกดสูง ≥44px, staff ไม่เห็นเมนูจัดการผู้ใช้ (2026-10-03)
- [ ] เปิดผ่าน Test deployment บน Apps Script จริง ← ทำได้หลัง Phase 4 (ต้องกดอนุญาตสิทธิ์ก่อน)

**เสร็จเมื่อ:** push แล้วเปิดหน้า admin ผ่าน **Deploy → Test deployments** ได้ ใช้งานได้ครบบนจอ 360px และ 1280px, commit `phase 3: admin ui`

---

## Phase 4 — Deploy GAS ครั้งแรก [คุณ + Claude Code] ×2

ขั้นนี้ต้องทำมือครั้งเดียว**ต่อร้าน** (ทำกับ Sheet ของ NPBeauty แล้วทำซ้ำกับ LemonBeauty) เพื่ออนุญาตสิทธิ์และได้ deployment ID

- [x] **[คุณ]** รีเฟรช Sheet → เมนู **Catalog → ตั้งค่าเริ่มต้น** → กดอนุญาตสิทธิ์ (Sheets, Drive, ส่ง request ภายนอก)
  - ถ้าเจอหน้า "Google hasn't verified this app" ให้กด Advanced → Go to ... (unsafe) ซึ่งปกติสำหรับสคริปต์ของตัวเอง
- [x] **[คุณ]** **Catalog → สร้าง/รีเซ็ตผู้ใช้ admin** (ผู้ใช้ admin คนแรก)
- [x] **[คุณ]** **Catalog → ทดสอบระบบ** → ทุกบรรทัด PASS
- [ ] **[คุณ]** (ไม่บังคับ) **Catalog → เพิ่มข้อมูลตัวอย่าง** → สินค้า DEMO-001…DEMO-012 สำหรับลองระบบ ลบทีหลังด้วย **Catalog → ลบข้อมูลตัวอย่าง**
- [x] **[คุณ]** ใน Apps Script editor: **Deploy → New deployment** → ชนิด **Web app** → Execute as **Me** → Who has access **Anyone** → Deploy
- [x] **[คุณ]** จด **Deployment ID** และ **Web app URL** (`.../exec`)
  - ⚠️ นี่เป็นครั้งเดียวที่กด New deployment ต่อจากนี้ห้ามกดอีก
- [x] **[Claude Code]** สั่ง: `ทำ Phase 4: npbeauty GAS_URL=<URL> deploymentId=<ID>, lemonbeauty GAS_URL=<URL> deploymentId=<ID>` → ใส่ `deploymentId` ใน `shops.json`, `GAS_URL` ใน env ของแต่ละร้านใน `worker/wrangler.jsonc` และเขียนลง README

**เสร็จเมื่อ:** (ทั้งสองร้าน) เปิด Web app URL แล้วล็อกอิน เพิ่มสินค้าทดสอบพร้อมรูปได้ และเปิด `{GAS_URL}?api=product&code=<รหัส>&key=<API_SECRET>` แล้วได้ JSON

---

## Phase 5 — Cloudflare Worker [Claude Code]

> **สั่ง Claude Code:** `ทำ Phase 5`

- [x] **[Claude Code]** รัน `npx wrangler kv namespace create CATALOG --env <shop>` ทั้งสองร้าน แล้วใส่ id ใน env ของแต่ละร้านใน `wrangler.jsonc`
- [x] router, render, gas, sign ตาม CLAUDE.md หัวข้อ 5
- [x] หน้าสินค้า: OG tags ครบ, แกลเลอรีปัดได้, ปุ่ม LINE sticky บนมือถือ, Noto Sans Thai, สีหลักจาก settings
- [x] หน้า 404 / 410 สวยงามและมีชื่อร้าน
- [x] `Cache-Control` ที่เหมาะสม: HTML สั้น (เช่น 60 วินาที), รูป 30 วัน
- [x] ทดสอบด้วย `npx wrangler dev --env <shop>` (ใส่ `API_SECRET` ใน `worker/.dev.vars`)

- [x] ทดสอบด้วย GAS จำลอง (2026-10-03): 200 หน้าสินค้า (รหัสพิมพ์เล็กได้), 410 สินค้าซ่อน, 404 ไม่พบ/รหัสผิดรูป, 301 รหัสเก่า, 403 `/img` ลายเซ็นผิดหรือคนละขนาด, 401 `/__sync` ไม่มี/ผิด secret, sync สินค้า+redirect+ซ่อน, OG tags, layout 375/1280 ไม่มี scroll แนวนอน
- [x] ทดสอบกับ GAS จริงทั้ง 2 ร้านหลังตั้ง `API_SECRET`: 200 `/p/DEMO-001`, 410 `/p/DEMO-008` (2026-10-03)
- [ ] ทดสอบรูปจริงจาก Drive ← รอมีสินค้าที่อัปโหลดรูป

**เสร็จเมื่อ:** `wrangler dev` แสดงหน้าสินค้าทดสอบจาก Phase 4 ได้ถูกต้อง, `/img` ที่ลายเซ็นผิดได้ 403, `/__sync` ที่ไม่มี secret ได้ 401, commit `phase 5: worker`

---

## Phase 6 — เชื่อม Cloudflare กับ GitHub [คุณ + Claude Code] ×2 (1 Worker ต่อร้าน)

- [x] **[Claude Code]** push โค้ดทั้งหมดขึ้น `main`
- [x] **[Claude Code]** deploy ครั้งแรกด้วย `npx wrangler deploy --env <shop>` ทั้ง 2 ร้าน (2026-10-03)
- [x] **[คุณ]** Worker สร้างไว้แล้ว → Cloudflare dashboard → **Workers & Pages → (ชื่อร้าน) → Settings → Builds → Connect** → เชื่อม GitHub → เลือก repo `Beauty-Catalog` (GitHub app ต้องได้สิทธิ์ repo นี้ที่ github.com/settings/installations)
  - Project name: `npbeauty` / `lemonbeauty` (ต้องตรงกับ `name` ใน env ของ `wrangler.jsonc`)
  - Root directory: `worker`
  - Deploy command: `npx wrangler deploy --env npbeauty` / `npx wrangler deploy --env lemonbeauty`
- [x] **[คุณ]** ตั้ง secret: Worker → **Settings → Variables and Secrets → Add** → ชนิด **Secret** ชื่อ `API_SECRET` ค่าคัดลอกจากเมนู **Catalog → แสดง API_SECRET** ใน Sheet ของร้านเดียวกัน (ห้ามสลับร้าน)
  - หรือสั่ง Claude Code ให้รัน `npx wrangler secret put API_SECRET --env <shop>` แล้ววางค่าในเทอร์มินัลเอง
- [x] **[คุณ]** URL ของ Worker: `https://npbeauty.ethermorph-corp.workers.dev` / `https://lemonbeauty.ethermorph-corp.workers.dev`
- [ ] **[คุณ]** หน้า admin ของแต่ละร้าน → **ตั้งค่า** → ใส่ Worker URL ของร้านนั้น, ชื่อร้าน, โลโก้, LINE OA ID, สี → บันทึก

**เสร็จเมื่อ:** (ทั้งสองร้าน) กด copy ลิงก์ใน admin แล้วเปิดลิงก์ได้หน้าสินค้าจาก Worker ของร้านนั้น

---

## Phase 7 — Auto deploy GAS ผ่าน GitHub Actions [คุณ + Claude Code]

> **สั่ง Claude Code:** `ทำ Phase 7`

- [x] **[Claude Code]** สร้าง `.github/workflows/deploy-gas.yml`: ทดสอบ `npm run test:gas` ก่อน แล้ว ทำงานเมื่อ push เข้า `main` ที่แก้ใน `gas/**` → ติดตั้ง `@google/clasp@3.4.1` → เขียน secret `CLASPRC_JSON` ลง `~/.clasprc.json` → `npm run gas -- all push` → `npm run gas -- all deploy "${{ github.sha }}"` (`deploymentId` อ่านจาก `shops.json`)
- [ ] **[คุณ]** GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
  - `CLASPRC_JSON` = เนื้อหาไฟล์ `~/.clasprc.json` บนเครื่องคุณ (รันคำสั่ง `gh secret set` เอง หรือคัดลอกเอง — ไม่ต้องให้ Claude อ่าน)
  - ไม่ต้องตั้ง `GAS_DEPLOYMENT_ID` แล้ว (อ่านจาก `shops.json`)
- [ ] **[Claude Code]** push แล้วดูว่า Action ผ่าน และหน้า admin › ตั้งค่า แสดง "เวอร์ชันระบบ <commit>" ตรงกับ commit ล่าสุด

**เสร็จเมื่อ:** Action เป็นสีเขียว และ Web app URL เดิมของทั้งสองร้านแสดงข้อความที่แก้แล้ว (URL ไม่เปลี่ยน)

---

## Phase 8 — ทดสอบครบวงจร [คุณ + Claude Code]

ทำทุกข้อกับทั้งสองร้าน และเพิ่ม:
- [ ] ข้อมูลไม่ปนกัน: รหัสสินค้าเดียวกันในสองร้านเปิดได้คนละหน้า, ลิงก์ `/img` ที่เซ็นด้วย secret ของร้านหนึ่งใช้กับอีกร้านไม่ได้ (403)

- [ ] เพิ่มสินค้าเดี่ยวพร้อมรูป 3 รูป → เปิดลิงก์ลูกค้า เห็นรูปเรียงถูก
- [ ] นำเข้า CSV 10 แถว (มีภาษาไทย, รหัสซ้ำ 1 แถว, แถวที่ชื่อว่าง 1 แถว, แถวที่มี folder_url 1 แถว) → ตัวอย่างแสดงสถานะถูก
- [ ] นำเข้าไฟล์ที่บันทึกแบบ ANSI → มีคำเตือนให้ใช้ CSV UTF-8
- [ ] แก้ชื่อสินค้า → หน้าลูกค้าอัปเดตภายในประมาณ 1 นาที
- [ ] ซ่อนสินค้า → ลิงก์แสดง "สินค้านี้ไม่พร้อมจำหน่าย"
- [ ] ส่งลิงก์ใน LINE (เช่น ส่งเข้า LINE Keep หรือแชทกับตัวเอง) → เห็นพรีวิวรูปและชื่อ
- [ ] กดปุ่มทัก LINE บนมือถือ → เปิดแชท OA พร้อมข้อความรหัสสินค้า
- [ ] ใส่รหัสผ่านผิด 5 ครั้ง → ถูกล็อกชั่วคราว
- [ ] staff เข้าแท็บผู้ใช้งานแล้วไม่เห็นรายชื่อ และเรียก `createUser` ตรงๆ แล้วถูกปฏิเสธ
- [ ] เปลี่ยนรหัสสินค้า → ลิงก์รหัสเก่าที่ส่งใน LINE แล้ว redirect ไปหน้าใหม่
- [ ] สลับแสดง/ซ่อนจากหน้ารายการ → หน้าลูกค้าเปลี่ยนตาม และมีแถวใน AuditLog
- [ ] หน้าสรุป: ตัวเลขตรงกับข้อมูลใน Sheet
- [ ] ทดสอบหน้าจอ 360 / 390 / 768 / 1280 px ไม่มี scroll แนวนอน
- [ ] Lighthouse หน้าสินค้า (มือถือ) Performance ≥ 90

**เสร็จเมื่อ:** ผ่านทุกข้อ, commit `phase 8: verified`

---

## Phase 9 — ส่งมอบ [Claude Code]

> **สั่ง Claude Code:** `ทำ Phase 9`

- [ ] README ภาษาไทย: วิธีใช้งาน admin, รูปแบบ CSV, วิธีอัปเดตโค้ด, สิ่งที่ห้ามทำ, วิธีเปลี่ยนรหัสผ่าน, วิธีหมุนเปลี่ยน API_SECRET (ต้องเปลี่ยนทั้งสองฝั่ง)
- [ ] ข้อจำกัดที่ควรรู้: KV ฟรีเขียนได้ 1,000 ครั้ง/วัน, Workers ฟรีประมาณ 100,000 request/วัน, LINE จำพรีวิวลิงก์ไว้ระยะหนึ่ง

---

## กฎที่ต้องจำ (สรุป)
1. ห้ามกด **New deployment** ใน Apps Script อีก หลัง Phase 4 (ทุกร้าน)
2. ห้ามแก้โค้ดใน Apps Script editor ออนไลน์ ให้แก้ผ่าน repo เท่านั้น
3. ห้ามวาง API_SECRET, รหัสผ่าน, หรือ `.clasprc.json` ในแชทหรือ commit ลง repo
