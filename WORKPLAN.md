# Working Plan & Checklist — Beauty Catalog

อัปเดตล่าสุด: 2026-10-03 · รายละเอียดแต่ละเฟสอยู่ใน `PLAN.md` · สเปกอยู่ใน `CLAUDE.md`

## ร้านในระบบ

| ร้าน | key | Worker URL | Script ID | Deployment ID |
|---|---|---|---|---|
| NPBeauty | `npbeauty` | https://npbeauty.ethermorph-corp.workers.dev | `10kH9xDU…ERkt` | `AKfycbyfMCb5…Jl1-A` |
| LemonBeauty | `lemonbeauty` | https://lemonbeauty.ethermorph-corp.workers.dev | `16CtkagF…mkC27` | `AKfycbzGSVAO…Q1E8e` |

แยกระบบกันคนละชุด (Sheet, Apps Script, Drive, Worker, KV, secret, รหัสผ่าน) ใช้โค้ดชุดเดียวใน repo นี้ · ใช้ workers.dev ไปก่อน ผูกโดเมนทีหลังได้

## UI ที่อนุมัติแล้ว (2026-10-03)

Mockup: https://claude.ai/artifact/TBdXkpz28tFKTUS4h2E6iE — สีหลัก NPBeauty `#1F5FAE`, LemonBeauty `#8E4AA8` (จากโลโก้)

การตัดสินใจรอบ UI (บันทึกใน CLAUDE.md หัวข้อ 2 แล้ว):
- ผู้ใช้หลายคน สิทธิ์ admin / staff — จัดการผู้ใช้ได้เฉพาะ admin
- Product ID (ระบบสร้าง) แยกจากรหัสสินค้า (แก้ได้) — ลิงก์รหัสเก่า 301 ไปรหัสใหม่, โฟลเดอร์รูปชื่อตาม Product ID
- เมนูมือถือ 4 ปุ่มไม่มีกรอบ (เพิ่มสินค้า · รายการสินค้า · สรุป · ตั้งค่า), นำเข้า CSV เฉพาะจอใหญ่
- สวิตช์แสดง/ซ่อนบนการ์ดรายการสินค้า, หน้าสรุป, ตั้งค่า 3 แท็บ, แท็บ AuditLog ใน Sheet

⚠️ โลโก้ NP สะกด "BUEAUTY" — แจ้งผู้ใช้แล้ว รอไฟล์แก้

## สถานะเครื่องมือ (ตรวจ 2026-10-02)

| รายการ | สถานะ | หมายเหตุ |
|---|---|---|
| Node.js / Git | ✅ v20.20.0 / 2.53.0 | |
| clasp + login | ✅ 3.4.1 (ล่าสุด) | ตรึง 3.4.1 ทั้งในเครื่องและ CI |
| wrangler | ✅ 4.86.0 | ethermorph.corp@gmail.com |
| GitHub CLI | ✅ ethermorphcorp-cloud | git ใช้ credential จาก gh |
| git repo | ✅ `git init` แล้ว | remote `origin` → ethermorphcorp-cloud/Beauty-Catalog |

## Checklist

### Phase 0 — เตรียมบัญชี [คุณ]
- [x] 0.1 สมัคร Cloudflare (Ethermorph.corp)
- [x] 0.1 account subdomain `ethermorph-corp.workers.dev` (ตรวจผ่าน Cloudflare API แล้ว)
- [x] 0.2 GitHub repo: https://github.com/ethermorphcorp-cloud/Beauty-Catalog
- [x] 0.3 `gh auth login` (ethermorphcorp-cloud)
- [x] 0.4 Sheet `NPBeauty Catalog DB` + `LemonBeauty Catalog DB`
- [x] 0.5 Script ID ทั้งสองร้าน
- [x] 0.6 เปิด Apps Script API
- [x] 0.7 `npx wrangler login`
- [ ] 0.8 ข้อมูลร้าน ×2 (ชื่อ, โลโก้, LINE OA ID, สี)

### Phase 1 — โครง repo [Claude Code]
- [x] โครงไฟล์, `shops.json`, `scripts/gas.mjs`, wrangler env 2 ร้าน
- [x] ใส่ Script ID → `npm run gas -- all push` → commit `phase 1: scaffold`

### Phase 2 — GAS หลังบ้าน · Phase 3 — หน้า admin [Claude Code]
- [x] ออกแบบ UI + อนุมัติ mockup
- [x] Phase 2: backend (ผู้ใช้/สิทธิ์, Product ID, AuditLog, หมวดหมู่, redirect) — push ทั้ง 2 ร้าน, `npm run test:gas` ผ่าน 21/21 (ทดสอบบน Sheet จริงหลัง Phase 4 ผ่านเมนู Catalog → ทดสอบระบบ)
- [x] Phase 3: admin UI ตาม mockup — push ทั้ง 2 ร้าน, ทดสอบบน `npm run preview:admin` แล้ว (ทดสอบบน Apps Script จริงหลัง Phase 4)

### Phase 4 — Deploy GAS ครั้งแรก ×2 [คุณ + Claude Code]
- [x] ตั้งค่าเริ่มต้น, ผู้ใช้ admin, New deployment (ครั้งเดียวต่อร้าน) — ทั้ง 2 ร้านเปิด /exec ได้ และ API ตอบ forbidden เมื่อ key ผิด (2026-10-03)

### Phase 5 — Worker [Claude Code]
- [x] KV ×2, router/render/gas/sign, OG tags, 404/410, cache — ทดสอบกับ GAS จำลองผ่าน (GAS จริง/รูปจริงทดสอบใน Phase 6)

### Phase 6 — Cloudflare ↔ GitHub ×2 · Phase 7 — Auto deploy GAS · Phase 8 — ทดสอบ · Phase 9 — ส่งมอบ

## ลำดับการทำงาน

1. **ตอนนี้:** Phase 0 เหลือแค่ 0.8 ข้อมูลร้าน (ใช้ใน Phase 6) → Claude Code เริ่ม Phase 2 ได้
2. Claude Code ทำ Phase 1 → 2 → 3 ต่อเนื่อง ระหว่างนั้นคุณเตรียม 0.8
3. Phase 4 ทำมือในเบราว์เซอร์ ร้านละรอบ
4. Phase 5 → 9 ตามลำดับ

