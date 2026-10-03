# Beauty Catalog — แคตตาล็อกสินค้า NPBeauty & LemonBeauty

ระบบแคตตาล็อกสินค้า: หลังบ้านเป็น Google Apps Script + Google Sheet, หน้าบ้านเป็น Cloudflare Worker

- สเปกระบบ: `CLAUDE.md`
- แผนงานทีละเฟส: `PLAN.md`
- สถานะงานปัจจุบัน: `WORKPLAN.md`

## ลิงก์ของแต่ละร้าน

| ร้าน | หน้า admin (GAS Web app) | หน้าร้านสำหรับลูกค้า (Worker) |
|---|---|---|
| NPBeauty | https://script.google.com/macros/s/AKfycbyfMCb5m-TTBWT2NykhvyjvhGOktfumfKx6M_2sDLb25ATRDR4AHX-9EvyFZgsFJPl1-A/exec | https://npbeauty.ethermorph-corp.workers.dev |
| LemonBeauty | https://script.google.com/macros/s/AKfycbzGSVAOM_Kd6ueNRJE3yVdnK6ZHqLo7tgOA05WXxm6W3oQ253bn4kDtiJSAVOeQ1E8e/exec | https://lemonbeauty.ethermorph-corp.workers.dev |

Deployment ID อยู่ใน `shops.json` → อัปเดตโค้ดด้วย `npm run gas -- <shop> deploy "ข้อความ"` เท่านั้น
⚠️ ห้ามกด **New deployment** ใน Apps Script อีก เพราะ URL จะเปลี่ยนและ Worker จะใช้ไม่ได้

คู่มือติดตั้งและใช้งานฉบับเต็มจะเขียนใน Phase 9
