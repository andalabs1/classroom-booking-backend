# รัน พัฒนา และดูแล Backend

[หน้าคู่มือ](./overview.md) · [ฟังก์ชัน](./functions.md) · [Services](./services.md) · [API](./api.md)

## เตรียม environment

ต้องมี Node.js 22 ที่รองรับ lockfile, npm, database สำหรับพัฒนา และ R2 configuration ที่แอปอ่านได้ การ export snapshot เพิ่มเติมต้องมีคำสั่ง `python` ที่ใช้งาน Python 3 พร้อม sqlite3 ได้

```bash
npm ci
cp .env.example .env
```

แก้ `.env` ให้เป็นค่าของ environment พัฒนา โดยดู [env table](./tech-stack.md#environment-variables) ตั้ง DATABASE_URL, JWT_SECRET, ADMIN_EMAIL/ADMIN_PASSWORD และ R2 credentials/endpoint/public URL ให้ครบ ห้ามนำค่าจากบัญชีหรือฐานข้อมูลจริงมาใส่ในเอกสารตัวอย่าง

## รันกับ MySQL ในเครื่อง

ใช้ database ว่างสำหรับพัฒนาที่ตั้งไว้ใน DATABASE_URL เช่น mysql://... และเริ่ม MySQL ก่อน:

```bash
docker compose up -d mysql
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

`prisma:migrate` คือ migrate dev และมีผลเขียน schema ของ database ที่ชี้อยู่ ส่วน seed เป็น optional สำหรับข้อมูลตัวอย่าง `predev` จะเลือก schema จาก DATABASE_URL และ generate client ก่อน tsx watch server.ts อีกครั้ง

เปิด `http://localhost:3000/health` หรือ `/docs/` หลัง server พร้อม `/health` ยืนยันว่า HTTP app ตอบได้ ไม่ได้ตรวจ connection ของ MySQL/R2

การรันทั้งชุดด้วย `docker compose up --build` ใช้ entrypoint ใน Dockerfile: install → Prisma MySQL generate → build และตอนเริ่ม container ใช้ migrate deploy ก่อน npm start ค่า DATABASE_URL ภายใน backend container ต้องชี้ host ของ service mysql; depends_on อย่างเดียวยังไม่ใช่ readiness check

## รัน SQLite สำหรับพัฒนา

เลือก `.env.sqlite.example` เป็นจุดตั้งต้น และระบุ `DATABASE_URL=file:./dev.db` ซึ่ง resolve ตามตำแหน่ง Prisma schema (ไฟล์ใน prisma/) แล้วตั้ง env ที่เหลือให้ผ่าน validation

```bash
npm run prisma:generate:sqlite
npm run prisma:push:sqlite
npm run prisma:seed:sqlite
npm run dev
```

generate และ db push เป็นคนละขั้น Client ต้องตรง provider ก่อนรัน seed/server `prisma:seed` กับ `prisma:seed:sqlite` เรียก seed.ts ตัวเดียวกันและใช้ generated client ปัจจุบัน

มี script prisma:migrate:sqlite อยู่ด้วย แต่ migration directory ใน repo เป็น MySQL จึงต้องออกแบบ history ของ SQLite แยกก่อนใช้เส้นทางนั้น คู่มือนี้เลือก db push สำหรับ local SQLite แทนการใช้ MySQL history โดยตรง

## Export จาก MySQL เพื่อรัน snapshot ในเครื่อง

```bash
npm run prisma:generate
npm run db:export:local
npm run dev:sqlite
```

ก่อน export ต้องตั้ง DATABASE_URL ให้เป็น MySQL ต้นทางและ generate MySQL client แล้ว ตัว exporter อ่าน 5 tables โดยไม่แก้ source database สร้าง directory ใหม่ใต้ `sql_backup/<UTC timestamp>/` พร้อม:

- mysql.sql: DDL และ rows สำหรับ restore MySQL
- local.db: SQLite snapshot
- sqlite.sql: SQLite dump ที่ restore กลับมาเทียบข้อมูลแล้ว
- manifest.json: จำนวน rows, integrity และผลตรวจ restore

`dev:sqlite` เลือก snapshot ล่าสุดที่มี manifest, ตั้ง absolute file: URL ของ local.db, generate SQLite client แล้วเริ่ม server.ts โดยไม่แก้ไฟล์ `.env` ถาวร restore-local.py รับ JSON ทาง stdin จาก exporter และปฏิเสธการทับ local.db เดิม

snapshot มีข้อมูลผู้ใช้และ password hashes จึงอยู่ใน sql_backup ที่ Git ignore อยู่แล้ว ขั้นตอนเชิงลึกและการ restore ด้วยเครื่องมือ SQL ดู [docs.md](../../docs.md)

## Seed ทำอะไรบ้าง

[prisma/seed.ts](../../prisma/seed.ts) upsert:

1. Admin ID1 ใช้ ADMIN_EMAIL/ADMIN_PASSWORD จาก env และ userCode admin
2. บัญชีตัวอย่าง ID2 พร้อมข้อมูลจาก source และ hash ของรหัส demo ที่ระบุในไฟล์
3. ห้องตัวอย่างสิบห้อง ID3–12 โดยมี ACTIVE/MAINTENANCE/INACTIVE
4. Demo bookings หกรายการที่วันที่เลื่อนตามวันนี้ใน Asia/Bangkok และสร้างสถานะต่าง ๆ
5. Welcome notification แบบ dedupe ของบัญชีตัวอย่าง

การรันซ้ำแก้ฟิลด์ของรายการที่ ID/code ตรง รวมรหัสผ่านและวันที่ booking ตาม implementation จึงใช้กับ database สำหรับพัฒนาที่ตั้งใจให้มี demo records

## คำสั่งทั้งหมดใน package.json

| Script                                   | การใช้งาน / ผล                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| dev                                      | predev อัตโนมัติ แล้ว tsx watch src/server.ts                                             |
| predev                                   | เลือก MySQL/SQLite schema ตาม URL และ generate Prisma client                              |
| dev:sqlite                               | เริ่ม server จาก snapshot ล่าสุดใน sql_backup                                             |
| db:export:local                          | อ่าน MySQL แล้วเขียน snapshot ผ่าน Node + Python                                          |
| build                                    | npm run clean แล้ว tsc; ไม่ generate Prisma ให้อัตโนมัติ                                  |
| clean                                    | ลบ dist ทั้ง directory เพื่อไม่เหลือ output จากไฟล์ที่ย้าย                                |
| start                                    | node dist/server.js; ไม่ build/migrate ให้อัตโนมัติ                                       |
| lint                                     | eslint .                                                                                  |
| format                                   | prettier --write .; อาจแก้หลายไฟล์ ควรเลือก path เฉพาะงานเมื่อไม่ต้องการ format ทั้ง repo |
| test / test:watch                        | Vitest run / watch                                                                        |
| test:unit / test:integration             | รันตามกลุ่มโฟลเดอร์                                                                       |
| test:e2e                                 | compatibility script ของ auth/booking/authorization แบบ mocked HTTP tests                 |
| typecheck:test                           | tsc ของ tsconfig.test.json แบบ noEmit                                                     |
| prisma:generate / prisma:generate:sqlite | generate client ของ provider ที่เลือก                                                     |
| prisma:migrate                           | migrate dev ของ MySQL ใน development                                                      |
| prisma:deploy                            | migrate deploy ของ MySQL สำหรับ apply migrations ที่มีอยู่                                |
| prisma:migrate:sqlite                    | migrate dev ด้วย SQLite schema; ต้องพิจารณา migration history ของ provider                |
| prisma:push:sqlite                       | db push จาก SQLite schema                                                                 |
| prisma:seed / prisma:seed:sqlite         | tsx prisma/seed.ts ด้วย client และ URL ปัจจุบัน                                           |

## เพิ่ม feature หนึ่งเรื่องควรแก้ตรงไหน

| งาน                | จุดเปลี่ยนหลัก                                                 | สิ่งที่ต้องตรวจตาม                                                  |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| Endpoint ใหม่      | modules/<domain>/<domain>.routes.ts และ app.ts หากเพิ่ม module | auth/role, validation, OpenAPI, HTTP tests และ api.md               |
| กติกาจอง           | bookings helpers, env schema, config business-rules route      | create/update/check-in/cancel/worker ต้องสอดคล้อง, tests ของขอบเวลา |
| Role หรือสถานะใหม่ | สอง Prisma schemas + migration + guards/queries                | transitions, filters, notifications, OpenAPI และ data-model.md      |
| Field ใหม่         | models + migration + schemas + selects + responses             | jsonSafe, seed/export/restore, tests และ API consumer               |
| Notification ใหม่  | service/caller, type/dedupeKey                                 | ผู้รับ, idempotency, read APIs และ failure behavior                 |
| Storage ใหม่       | ImageStorage implementation และ instance selection             | env, key/URL policy, upload size/MIME, cleanup และ mocked SDK tests |
| รายงานใหม่         | reportFilter/reportWhere, grouping/CSV                         | เวลาไทย, overlap semantics, full-duration hours และ document/test   |

ลำดับที่ใช้ได้จริงสำหรับ endpoint ที่ต้องเขียนข้อมูล:

1. ระบุ input/output และสิทธิ์ รวม HTTP status ในกรณีผิดเงื่อนไข
2. เลือก transaction boundary และลำดับ external side effects
3. เพิ่ม/ใช้ schema และ helper ที่มีอยู่
4. ใช้ tx delegate สำหรับคำสั่งที่ต้อง atomic; อย่าให้ helper เรียก prisma กลางหลุด transaction
5. เลือก response fields โดยไม่ส่ง passwordHash และแปลง BigInt ก่อน JSON
6. เพิ่ม HTTP/service tests และ stub database operations ทุกตัวที่ใช้
7. แก้ swaggerDocument และคู่มือที่ได้รับผล

## ตรวจงานก่อนส่งต่อ

```bash
npm run build
npm run typecheck:test
npm run lint
npm test
```

ดู [testing.md](./testing.md) สำหรับการจำลอง dependencies และข้อจำกัด ชุดนี้ไม่ต้อง seed database หรือเชื่อม R2 จริง หากเปลี่ยน schema/transaction/storage ให้เพิ่มการตรวจกับ environment ทดสอบที่ใช้ระบบจริงแยกต่างหาก

## จุดที่ implementation ยังต้องคำนึง

- Login limiter เป็นค่าเริ่มต้นของ express-rate-limit ไม่มี distributed store ใน source; การตั้งค่าหลัง proxy ต้องตรวจตาม deployment จริง
- หลาย operation อ่าน preconditions ก่อนเขียนและไม่ได้ครอบ transaction ทั้งหมด อย่าอาศัย HTTP mock test เป็นหลักฐานว่า concurrent calls ปลอดการชนเสมอ
- เส้นทางเปลี่ยน/รีเซ็ตรหัสผ่านไม่ได้ revoke JWT โดยเพิ่ม tokenVersion เหมือน logout
- IDs ใช้ timestamp บวกเลขสุ่มและ schema unique constraint ไม่ใช่ distributed ID service
- Worker ใช้ process memory และ interval; ยังไม่มี durable job queue, distributed lock หรือ outbox
- นำเข้า app อย่างเดียวไม่เริ่ม worker และ root health ไม่ตรวจ readiness ของ dependencies
- OpenAPI, JSDoc, docs.md และ README เป็นเอกสารหลายแหล่ง ต้องเทียบกับ handler/schema ปัจจุบัน โดยเฉพาะการลบห้องที่เปลี่ยนเป็น hard delete

## Troubleshooting

| อาการ                              | ตรวจจากตรงไหน                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| ZodError ตอนเริ่ม app              | env schema และ required R2/JWT/admin/database values                                                                        |
| Client ไม่ตรง database URL         | generate client ตาม schema/provider ใหม่ก่อน dev/build/start                                                                |
| 401 หลัง logout หรือปิดบัญชี       | tokenVersion/status ใน database; client ต้อง login ใหม่ตามเงื่อนไข                                                          |
| 403 จองแทนหรือ directory           | delegatedRoles/requireAnyRole ใช้ ADMIN เท่านั้น                                                                            |
| 409 เวลา/สถานะ                     | findConflict, ensureTime, cancellation cutoff และ transition table                                                          |
| ลบห้องแล้วได้409                   | มี booking อ้างห้องแม้เป็นประวัติ terminal; ใช้ PATCH status INACTIVE หากต้องเก็บประวัติ                                    |
| ลบห้องได้แต่รูปยังอยู่             | ตรวจ console.warn ของ R2 cleanup; flow ปัจจุบันให้ลบ database ต่อเมื่อ storage fail                                         |
| Reminder ไม่ทำงาน                  | process เริ่มผ่าน server.ts หรือไม่, worker logs, status/startAt และ dedupeKey                                              |
| เทสต์ Unstubbed database operation | เพิ่มผล mock ให้ query นั้นอย่างเจาะจง; อย่าเปิดให้ต่อ DB จริงเพื่อให้เทสต์ผ่าน                                             |
| เทสต์ลบห้องยังคาด soft delete      | เทียบ handler ปัจจุบันที่ลบจริง/booking count กับ assertion; งานปรับเทสต์ของ cleanup branch อาจยังไม่ได้รวมใน branch ที่รัน |
