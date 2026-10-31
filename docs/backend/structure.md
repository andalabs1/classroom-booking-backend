# โครงสร้าง Backend

[กลับหน้าคู่มือ](./overview.md) · [Tech stack](./tech-stack.md) · [Functions](./functions.md) · [Services](./services.md) · [คู่มือทดสอบ](./testing.md)

## โฟลเดอร์ที่เกี่ยวข้องกับ Backend

```text
src/
├── app.ts                           # ประกอบ Express app; ไม่ listen หรือเริ่ม worker
├── server.ts                        # entry point สำหรับ dev และ Node server
├── modules/
│   ├── admin/
│   │   ├── admin.routes.ts          # ตรวจสิทธิ์ ADMIN และประกอบ child routers
│   │   ├── admin-dashboard.routes.ts
│   │   ├── admin-classrooms.routes.ts
│   │   ├── admin-bookings.routes.ts
│   │   ├── admin-users.routes.ts
│   │   ├── admin-reports.routes.ts
│   │   ├── admin-audit-logs.routes.ts
│   │   ├── admin.schemas.ts         # schema และ safe user selection ภายใน admin
│   │   └── admin-audit.service.ts
│   ├── auth/auth.routes.ts
│   ├── bookings/
│   │   ├── bookings.routes.ts
│   │   └── booking-reminder.service.ts
│   ├── classrooms/classrooms.routes.ts
│   ├── config/config.routes.ts
│   ├── notifications/
│   │   ├── notifications.routes.ts
│   │   └── notification.service.ts
│   ├── uploads/
│   │   ├── uploads.routes.ts
│   │   └── image-storage.service.ts
│   └── users/users.routes.ts
└── shared/
    ├── config/{env,swagger}.ts
    ├── database/prisma.ts
    ├── middlewares/{auth,error}.ts
    ├── types/express.d.ts
    ├── utils/{id,json,response}.ts
    └── validators/common.ts

tests/
├── setup.ts                         # env ทดสอบ, Prisma mock และ R2 guard
├── helpers/{auth,prisma}.ts
├── integration/*.test.ts            # Express + middleware + routes/services
└── unit/*.test.ts                   # service และ OpenAPI document

prisma/                             # schema, migration และ seed
scripts/                            # เตรียม client, export/restore และรัน SQLite
public/                             # asset เดิม
vitest.config.mts                    # runner configuration
tsconfig.test.json                  # ตรวจ type ของ src/tests/config โดยไม่ emit
```

Frontend พัฒนาใน repository แยกจาก backend ชุดทดสอบ backend เลือกเฉพาะ `tests/**/*.test.ts` ส่วน TypeScript build เลือกเฉพาะ `src/**/*.ts`

## กติกาวางไฟล์ใหม่

1. วาง API และกติกาเฉพาะงานใน `modules/<ชื่อโมดูล>/` ใช้ชื่อ `<ชื่อ>.routes.ts` กับ router และ `<ชื่อ>.service.ts` กับงานที่หลาย handler หรือ worker เรียกใช้
2. วางโค้ดที่ใช้ร่วมหลายโมดูลใน `shared/` โดยแยกตามหน้าที่ เช่น middleware, configuration, database และ utilities; `shared/` ไม่ควร import กลับไปยัง `modules/`
3. ให้ `app.ts` รับผิดชอบการ mount router และ middleware ส่วน side effect ของการเริ่ม server/worker อยู่ที่ `server.ts`
4. Child routers ของ admin ใช้ผ่าน `admin.routes.ts` เพื่อให้ผ่าน `authenticate` และ `requireRole("ADMIN")` ก่อนเสมอ
5. เมื่อ logic โต ให้แยก schema/service ตามหน้าที่จริง ไม่สร้างชั้น controller/repository เปล่า ๆ เพียงเพื่อให้ครบชื่อโฟลเดอร์
6. เพิ่มเทสต์ API ใน `tests/integration/` และ service ใน `tests/unit/`; fixture หรือ helper ที่หลายไฟล์ใช้ร่วมกันวางใน `tests/helpers/`

## สิ่งที่เปลี่ยนจากโครงสร้างเดิม

| เดิม                                    | ปัจจุบัน                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/config/*`                          | `src/shared/config/*`                                                                             |
| `src/middlewares/*`                     | `src/shared/middlewares/*`                                                                        |
| `src/types/*`, `src/validators/*`       | `src/shared/types/*`, `src/shared/validators/*`                                                   |
| `src/utils/prisma.ts`                   | client ที่ `shared/database/prisma.ts`; `newId/jsonSafe` แยกไป `shared/utils/id.ts` และ `json.ts` |
| `src/utils/response.ts`                 | `src/shared/utils/response.ts`                                                                    |
| `src/services/*`                        | ย้ายไปโมดูลเจ้าของงาน: bookings, notifications, uploads                                           |
| `src/modules/<ชื่อ>/routes.ts`          | `src/modules/<ชื่อ>/<ชื่อ>.routes.ts`                                                             |
| admin router รวมไฟล์เดียว               | router หลักและ child routers 6 ส่วน พร้อม schema/audit service                                    |
| `tests/*.test.ts`                       | `tests/integration/` หรือ `tests/unit/`                                                           |
| `jest.config.cjs`, `tests/setup-env.ts` | `vitest.config.mts`, `tests/setup.ts`                                                             |

## Build และ deploy

ตำแหน่ง entry point ยังเป็น `src/server.ts` และ `src/app.ts` ผล build จึงใช้ `dist/server.js` กับ `dist/app.js` ได้ตามเดิม `scripts/start-local.cjs`, Docker และคำสั่ง `npm start` ใช้ entry point เดิม

เมื่อสลับจาก build เก่าที่มีโฟลเดอร์ `dist/config`, `dist/services` หรือ `dist/utils` ให้รัน `npm run build` ซึ่งล้าง `dist/` ก่อน compile เพื่อไม่ให้ไฟล์ที่ย้ายแล้วค้างอยู่

ดูขั้นตอนเตรียม database, generate Prisma client และการรันในแต่ละ environment ที่ [development.md](./development.md) กับสัญญา API ปัจจุบันที่ [api.md](./api.md)
