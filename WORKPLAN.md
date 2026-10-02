# Working Plan & Checklist — Beauty Catalog

อัปเดตล่าสุด: 2026-10-02 · รายละเอียดแต่ละเฟสอยู่ใน `PLAN.md` · สเปกอยู่ใน `CLAUDE.md`

## ร้านในระบบ

| ร้าน | key | Worker URL | Script ID | Deployment ID |
|---|---|---|---|---|
| NPBeauty | `npbeauty` | https://npbeauty.ethermorph-corp.workers.dev | ⏳ | ⏳ |
| LemonBeauty | `lemonbeauty` | https://lemonbeauty.ethermorph-corp.workers.dev | ⏳ | ⏳ |

แยกระบบกันคนละชุด (Sheet, Apps Script, Drive, Worker, KV, secret, รหัสผ่าน) ใช้โค้ดชุดเดียวใน repo นี้ · ใช้ workers.dev ไปก่อน ผูกโดเมนทีหลังได้

## สถานะเครื่องมือ (ตรวจ 2026-10-02)

| รายการ | สถานะ | หมายเหตุ |
|---|---|---|
| Node.js / Git | ✅ v20.20.0 / 2.53.0 | |
| clasp + login | ✅ 3.4.1 | แผนเดิมตรึง 2.4.2 — รอยืนยันใช้ v3 |
| wrangler | ⚠️ 4.86.0 ยังไม่ login | `npx wrangler login` |
| GitHub CLI | ⚠️ ยังไม่ login | `gh auth login` |
| git repo | ✅ `git init` แล้ว | remote `origin` → ethermorphcorp-cloud/Beauty-Catalog |

## Checklist

### Phase 0 — เตรียมบัญชี [คุณ]
- [x] 0.1 สมัคร Cloudflare (Ethermorph.corp)
- [ ] 0.1 ตั้ง account subdomain `ethermorph-corp`
- [x] 0.2 GitHub repo: https://github.com/ethermorphcorp-cloud/Beauty-Catalog
- [ ] 0.3 `gh auth login`
- [ ] 0.4 Sheet `NPBeauty Catalog DB` + `LemonBeauty Catalog DB`
- [ ] 0.5 Script ID ทั้งสองร้าน → ส่งให้ Claude Code
- [ ] 0.6 เปิด Apps Script API
- [ ] 0.7 `npx wrangler login`
- [ ] 0.8 ข้อมูลร้าน ×2 (ชื่อ, โลโก้, LINE OA ID, สี)

### Phase 1 — โครง repo [Claude Code]
- [x] โครงไฟล์, `shops.json`, `scripts/gas.mjs`, wrangler env 2 ร้าน
- [ ] ใส่ Script ID → `npm run gas -- all push` → commit `phase 1: scaffold`

### Phase 2 — GAS หลังบ้าน · Phase 3 — หน้า admin [Claude Code]
- [ ] โค้ดชุดเดียว push ไปทั้งสองร้าน

### Phase 4 — Deploy GAS ครั้งแรก ×2 [คุณ + Claude Code]
- [ ] ตั้งค่าเริ่มต้น, รหัสผ่าน, New deployment (ครั้งเดียวต่อร้าน) → ส่ง URL + Deployment ID

### Phase 5 — Worker [Claude Code]
- [ ] KV ×2, router/render/gas/sign → commit `phase 5: worker`

### Phase 6 — Cloudflare ↔ GitHub ×2 · Phase 7 — Auto deploy GAS · Phase 8 — ทดสอบ · Phase 9 — ส่งมอบ

## ลำดับการทำงาน

1. **ตอนนี้:** คุณทำ Phase 0 ให้ครบ — สำคัญสุดคือ Script ID ทั้งสองร้าน (0.4–0.6)
2. Claude Code ทำ Phase 1 → 2 → 3 ต่อเนื่อง ระหว่างนั้นคุณเตรียม 0.8
3. Phase 4 ทำมือในเบราว์เซอร์ ร้านละรอบ
4. Phase 5 → 9 ตามลำดับ

## ต้องตัดสินใจ

- **เวอร์ชัน clasp:** แนะนำใช้ 3.x ต่อ (ตรงกับ login ปัจจุบันและโปรเจกต์อื่น) และใช้เวอร์ชันเดียวกันใน GitHub Actions
