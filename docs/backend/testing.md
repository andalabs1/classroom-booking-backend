# ทดสอบ Backend ด้วย Vitest

[กลับหน้าคู่มือ](./overview.md) · [โครงสร้างโฟลเดอร์](./structure.md)

## เตรียมเครื่องและคำสั่ง

ใช้ Node.js 22.12 ขึ้นไปในสาย 22 หรือ Node รุ่นใหม่ที่ Vitest/Vite รองรับ โครงการใช้ Node 22 ใน Docker

```bash
npm ci
npm test
npm run test:watch
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
npm run typecheck:test
npm run lint
```

| คำสั่ง                     | ความหมาย                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm test`                 | รัน Vitest ทั้งหมดครั้งเดียว                                                                   |
| `npm run test:watch`       | รัน watch mode สำหรับการพัฒนา                                                                  |
| `npm run test:unit`        | ทดสอบ service และเอกสาร OpenAPI                                                                |
| `npm run test:integration` | ทดสอบ HTTP ผ่าน Supertest กับ Express app จริง                                                 |
| `npm run test:e2e`         | คงชื่อ script เดิมสำหรับ auth, booking และ authorization; ยังเป็น HTTP tests ที่จำลอง database |
| `npm run typecheck:test`   | ตรวจ type ของ source, tests และ Vitest config โดยไม่สร้างไฟล์                                  |

รันเฉพาะไฟล์หรือชื่อเคสได้ เช่น:

```bash
npm test -- tests/integration/admin-bookings.integration.test.ts
npm test -- -t "protects the last active admin"
```

## การแยกจากระบบจริง

`tests/setup.ts` กำหนด environment สำหรับเทสต์ก่อน import แอป รวม JWT, กติกาการจอง และ R2 endpoint ของเทสต์ จึงไม่ใช้ค่าที่ผู้พัฒนาตั้งไว้ใน `.env` สำหรับค่าที่แอปอ่าน

Prisma module กลางถูกแทนที่ด้วย `tests/helpers/prisma.ts` ตั้งแต่ก่อนสร้างแอป โดยไม่สร้าง Prisma client จริง ไม่มีการ seed, migrate, reset หรืออ่าน/เขียนฐานข้อมูลจริง เทสต์ไม่ต้องใช้ MySQL, SQLite หรือ R2 ที่รันอยู่

ทุก database operation ใน mock มีค่าเริ่มต้นเป็นการโยน error หากไม่ได้ stub ไว้ พร้อมบันทึกชื่อ operation และตรวจซ้ำหลังจบเทสต์ แม้โค้ดแอปจะ catch error ไปแล้ว เทสต์ก็ยังล้มเหลวได้ เช่นเดียวกับ `S3Client.send` ที่มี guard ป้องกันส่งคำขอ R2 โดยไม่ได้จำลองไว้

แต่ละเทสต์เริ่มด้วยการ reset Prisma mocks และหลังจบจะคืน spies กับ timers เทสต์ HTTP ใช้ listener ชั่วคราวของ Supertest ไม่เริ่ม background worker จาก `server.ts` จึงไม่ใช่การทดสอบฐานข้อมูลหรือระบบที่ deploy แล้ว

## ขอบเขตที่ตรวจ

- Auth: สมัคร/เข้า/ออกจากระบบ, user code, token หมดอายุ/ถูกแก้ไข/ถูก revoke, inactive user, validation และ login rate limit
- Authorization: สิทธิ์จาก user ใน database, ป้องกัน admin child routers และ upload endpoint
- Bookings: สร้างรายการ, เวลาทับซ้อน, ห้อง/ความจุ/อุปกรณ์, business hours, ค้นหา/แบ่งหน้า, daily/weekly/monthly ในเวลาไทย, cancellation cutoff และ check-in
- Admin: แยก router, การเปลี่ยนสถานะ booking, side effects ของ transaction, ป้องกันแอดมินคนสุดท้าย, dashboard, ห้อง/ผู้ใช้ และ audit logs
- Classrooms: รายการห้อง, ACTIVE status, availability หลายห้อง และ schedule
- Users/config: โปรไฟล์, เปลี่ยนรหัสผ่าน, ประวัติจอง, directory และ business rules
- Notifications: รายการของเจ้าของ, unread count, read-all, อ่านรายรายการ และการส่งถึงผู้ใช้/admin
- Reminders/lifecycle: ป้องกันแจ้งซ้ำและรันซ้อน, คืนสถานะหลังล้มเหลว, การแข่งระหว่าง worker, cutoff และ interval
- Uploads/R2: MIME, ขนาด 5 MB, key, metadata/cache, การลบและข้อผิดพลาด storage
- Reports/OpenAPI: filter และช่วงเวลา Bangkok, CSV ภาษาไทย, graph/status pie และรายการ path/schema

## วิธีเพิ่มเทสต์

นำเข้า `describe`, `it`, `expect`, hooks และ `vi` จาก `vitest` อย่างชัดเจน ไม่ใช้ global ของ Jest

```ts
import { expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/shared/database/prisma";
import { authenticateAs } from "../helpers/auth";

it("returns the owner's unread count", async () => {
  const auth = authenticateAs();
  vi.spyOn(prisma.notification, "count").mockResolvedValue(3);
  const response = await request(app)
    .get("/api/notifications/unread-count")
    .set("Authorization", auth);

  expect(response.status).toBe(200);
  expect(response.body.data.count).toBe(3);
  expect(prisma.notification.count).toHaveBeenCalledWith({
    where: { userId: 10n, isRead: false },
  });
});
```

`authenticateAs(role)` จำลองผู้ใช้ active และสร้าง Bearer token; `mockTransaction()` ให้ callback ใช้ Prisma mock ตัวเดียวเพื่อทดสอบผลของ handler แต่ไม่ตรวจ rollback, locking หรือ isolation ของฐานข้อมูลจริง

สำหรับ API ที่ต้องกำหนดวันเวลา ใช้ `vi.useFakeTimers({ toFake: ["Date"] })` กับ `vi.setSystemTime(...)` เพื่อให้ Supertest ยังใช้ timers ของระบบได้ ส่วน worker tests ใช้ fake timers เต็มรูปแบบและล้าง interval ใน `finally`

เมื่อเพิ่ม model/operation ใหม่ ให้เพิ่มใน `tests/helpers/prisma.ts` และ stub ผลลัพธ์ในเทสต์แต่ละกรณี อย่าตั้ง default success ที่ซ่อน query ซึ่งยังไม่ได้ตรวจ

## ข้อจำกัด

ชุดนี้ตรวจการประกอบ Express, middleware, validation, business rules และ service ด้วย dependency ที่จำลองไว้ ยังไม่ยืนยัน SQL, migration, transaction rollback, การจองพร้อมกันข้าม process หรือการเชื่อมต่อ R2 จริง หากเปลี่ยน schema/transaction/storage ต้องเพิ่มการตรวจใน environment แยกที่ออกแบบสำหรับงานนั้น

ถ้ารันใน sandbox ที่ห้ามเปิด local listener ให้ใช้สิทธิ์ที่อนุญาต listener สำหรับ Supertest ก่อน ไม่ควรแก้ API assertion เพียงเพื่อข้ามข้อจำกัดของ sandbox
