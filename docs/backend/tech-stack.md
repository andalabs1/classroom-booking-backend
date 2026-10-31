# Tech stack และ configuration

[หน้าคู่มือ](./overview.md) · [ฟังก์ชัน](./functions.md) · [Services](./services.md) · [API](./api.md)

## Runtime และรูปแบบการ build

| ส่วน               | สิ่งที่โครงการใช้                                             | ที่มา                                 |
| ------------------ | ------------------------------------------------------------- | ------------------------------------- |
| Runtime            | Node.js 22; เลือกสาย 22 ที่รองรับ Vite/Vitest ใน lockfile     | `Dockerfile` ใช้ `node:22-alpine`     |
| ภาษา               | TypeScript strict, target ES2022                              | `tsconfig.json`                       |
| Module ของแอป      | CommonJS; source รันด้วย tsx ตอน dev                          | `compilerOptions.module`, npm scripts |
| HTTP               | Express 5, แยก Router ตามโมดูล                                | `src/app.ts`, `src/modules/`          |
| Database หลัก      | MySQL; Docker ใช้ image `mysql:8.4`                           | `schema.prisma`, `docker-compose.yml` |
| Database ในเครื่อง | SQLite ผ่าน schema แยกและ client ที่ generate ให้ตรง provider | `schema.sqlite.prisma`, scripts       |
| Storage            | Cloudflare R2 ผ่าน S3 API                                     | `image-storage.service.ts`            |
| Auth               | JWT + bcrypt + database role/tokenVersion                     | auth route/middleware                 |
| API docs           | OpenAPI 3.0.3, document version 2.0.0, Swagger UI             | `shared/config/swagger.ts`            |
| Tests              | Vitest 5, Supertest, mocks ของ Prisma/R2                      | `vitest.config.mts`, `tests/setup.ts` |

`package.json` ระบุ application version `1.0.0` ซึ่งต่างจาก version ของ OpenAPI document และไม่ใช่การกำหนด URL `/api/v1`; base path ที่ใช้งานจริงคือ `/api`

## Dependency ทั้งหมด

ช่วงเวอร์ชันมาจาก [package.json](../../package.json) และเวอร์ชันที่ resolve มาจาก [package-lock.json](../../package-lock.json) ณ วันที่จัดทำคู่มือ ใช้ `npm ci` เมื่อต้องการติดตั้งตาม lockfile; ตารางนี้ไม่ได้อ้างว่าเป็นรุ่นล่าสุดของ registry

### Runtime dependencies

| Package              | ช่วงที่ประกาศ | ใน lockfile | ใช้ทำอะไร                                                                            |
| -------------------- | ------------- | ----------- | ------------------------------------------------------------------------------------ |
| `@aws-sdk/client-s3` | `^3.1137.0`   | `3.1137.0`  | S3Client, PutObjectCommand, DeleteObjectCommand สำหรับ R2                            |
| `@prisma/client`     | `^6.14.0`     | `6.19.3`    | client, enums, Prisma types และ error codes ที่ runtime ใช้                          |
| `bcryptjs`           | `^3.0.2`      | `3.0.3`     | hash/compare รหัสผ่าน; การสร้าง hash ใน route และ seed ใช้ cost 12                   |
| `cors`               | `^2.8.5`      | `2.8.6`     | middleware CORS แบบค่าเริ่มต้นที่ app.use(cors())                                    |
| `dotenv`             | `^17.2.1`     | `17.4.2`    | โหลด .env ผ่าน dotenv/config และ scripts                                             |
| `express`            | `^5.1.0`      | `5.2.1`     | HTTP app, Router และ middleware                                                      |
| `express-rate-limit` | `^8.0.1`      | `8.7.0`     | จำกัด /api/auth/login ที่ 20 ครั้งต่อ 15 นาที                                        |
| `helmet`             | `^8.1.0`      | `8.3.0`     | HTTP security headers หลัง gateway/health routes                                     |
| `jsonwebtoken`       | `^9.0.2`      | `9.0.3`     | sign/verify Bearer JWT                                                               |
| `multer`             | `^2.0.2`      | `2.3.0`     | multipart upload ในหน่วยความจำ จำกัดรูป 5 MB                                         |
| `swagger-jsdoc`      | `^6.2.8`      | `6.3.0`     | มี dependency แต่ source ปัจจุบันประกอบ OpenAPI object เอง ไม่มี import ใช้งานตัวนี้ |
| `swagger-ui-express` | `^5.0.1`      | `5.0.1`     | เปิด Swagger UI ที่ /docs และ /api-docs                                              |
| `zod`                | `^4.0.17`     | `4.6.4`     | parse/validate env, body, params/query ที่แต่ละ route กำหนด                          |

### Development dependencies

| Package                     | ช่วงที่ประกาศ | ใน lockfile | ใช้ทำอะไร                                                                      |
| --------------------------- | ------------- | ----------- | ------------------------------------------------------------------------------ |
| `@types/bcryptjs`           | `^2.4.6`      | `2.4.6`     | Type definitions ของ bcryptjs สำหรับ compile; ไม่ใช่ runtime library           |
| `@types/cors`               | `^2.8.19`     | `2.8.19`    | Type definitions ของ cors สำหรับ compile; ไม่ใช่ runtime library               |
| `@types/express`            | `^5.0.3`      | `5.0.6`     | Type definitions ของ express สำหรับ compile; ไม่ใช่ runtime library            |
| `@types/express-rate-limit` | `^6.0.0`      | `6.0.2`     | Type definitions ของ express-rate-limit สำหรับ compile; ไม่ใช่ runtime library |
| `@types/jsonwebtoken`       | `^9.0.10`     | `9.0.10`    | Type definitions ของ jsonwebtoken สำหรับ compile; ไม่ใช่ runtime library       |
| `@types/multer`             | `^2.0.0`      | `2.2.0`     | Type definitions ของ multer สำหรับ compile; ไม่ใช่ runtime library             |
| `@types/node`               | `^24.3.0`     | `24.13.4`   | Type definitions ของ node สำหรับ compile; ไม่ใช่ runtime library               |
| `@types/supertest`          | `^6.0.3`      | `6.0.3`     | Type definitions ของ supertest สำหรับ compile; ไม่ใช่ runtime library          |
| `@types/swagger-jsdoc`      | `^6.0.4`      | `6.0.4`     | Type definitions ของ swagger-jsdoc สำหรับ compile; ไม่ใช่ runtime library      |
| `@types/swagger-ui-express` | `^4.1.8`      | `4.1.8`     | Type definitions ของ swagger-ui-express สำหรับ compile; ไม่ใช่ runtime library |
| `eslint`                    | `^9.34.0`     | `9.39.5`    | ตรวจ source ด้วย flat config                                                   |
| `eslint-config-prettier`    | `^10.1.8`     | `10.1.8`    | ติดตั้งอยู่ แต่ eslint.config.mjs ปัจจุบันยังไม่ได้ extends config นี้         |
| `prettier`                  | `^3.6.2`      | `3.9.6`     | จัดรูปแบบโค้ดและเอกสาร                                                         |
| `prisma`                    | `^6.14.0`     | `6.19.3`    | CLI generate/migrate/deploy/db push และสร้าง client                            |
| `supertest`                 | `^7.1.4`      | `7.2.2`     | ทดสอบ HTTP กับ Express app โดยไม่เริ่ม server.ts                               |
| `tsx`                       | `^4.20.3`     | `4.23.13`   | รัน TypeScript ใน dev/watch และ seed                                           |
| `typescript`                | `^5.9.2`      | `5.9.3`     | compile src เป็น CommonJS และตรวจ type                                         |
| `typescript-eslint`         | `^8.70.0`     | `8.70.0`    | parser/config/rules สำหรับ eslint ของไฟล์ TypeScript                           |
| `vitest`                    | `^5.0.0`      | `5.0.5`     | runner สำหรับ tests/unit และ tests/integration                                 |

Node built-ins ที่ใช้โดยตรงได้แก่ `node:path`, `node:crypto`, `node:fs`, `node:child_process` และ `Buffer`; การคำนวณเวลาใช้ `Date`/`Intl.DateTimeFormat` โดยไม่มี date library ภายนอก ส่วน restore snapshot ใช้ Python standard library `sqlite3`, `datetime`, `json`, `pathlib`, `sys`

## Environment variables

แหล่งอ้างอิง [env.ts](../../src/shared/config/env.ts) โดย `schema.parse(process.env)` ทำงานตอน import module ค่าที่ไม่มี default ต้องผ่าน validation ก่อนเริ่มแอป ส่วน `.env.example` เป็นตัวอย่างเท่านั้น ไม่ต้องส่ง credentials จริงเข้าเอกสาร

| ตัวแปร                          | ค่าเริ่มต้น / เงื่อนไข                                                                | ใช้ที่ไหน                                            |
| ------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `DATABASE_URL`                  | ต้องไม่ว่าง; runtime ต้องตรง provider ของ generated client                            | Prisma และ scripts                                   |
| `JWT_SECRET`                    | บังคับ อย่างน้อย 16 ตัวอักษร                                                          | sign/verify JWT                                      |
| `JWT_EXPIRES_IN`                | `1d`                                                                                  | login ส่งต่อให้ jsonwebtoken                         |
| `PORT`                          | `3000`, แปลงเป็น number                                                               | HTTP listener                                        |
| `ADMIN_EMAIL`                   | บังคับ รูปแบบ email                                                                   | seed; ถูก validate ทุกครั้งที่ import env            |
| `ADMIN_PASSWORD`                | บังคับ อย่างน้อย 8 ตัวอักษร                                                           | seed; ไม่ใช่การ login แบบข้าม database               |
| `R2_ACCOUNT_ID`                 | optional ใน Zod; ต้องมีหากไม่ตั้ง endpoint                                            | ประกอบ endpoint                                      |
| `R2_ACCESS_KEY_ID`              | บังคับ ไม่ว่าง                                                                        | S3 credentials                                       |
| `R2_SECRET_ACCESS_KEY`          | บังคับ ไม่ว่าง                                                                        | S3 credentials                                       |
| `R2_BUCKET`                     | `classroom-images`                                                                    | save/remove รูป                                      |
| `R2_ENDPOINT`                   | optional URL; ใช้ก่อน account ID                                                      | S3 endpoint                                          |
| `R2_PUBLIC_BASE_URL`            | default เป็น public R2 URL ที่ระบุใน source; ควรกำหนด URL ของ bucket environment นั้น | URL รูปและ managedImageKey                           |
| `BOOKING_REMINDER_MINUTES`      | `60`, integer > 0                                                                     | ระยะก่อนเริ่มที่สร้าง reminder                       |
| `REMINDER_POLL_INTERVAL_MS`     | `60000`, integer >= 10000                                                             | รอบ worker                                           |
| `BOOKING_CANCEL_MINUTES`        | `120`, integer >= 0                                                                   | cutoff การยกเลิกโดยผู้ใช้                            |
| `BOOKING_MAX_DURATION_HOURS`    | `8`, number > 0                                                                       | ระยะเวลาจองสูงสุด                                    |
| `BOOKING_MAX_ADVANCE_DAYS`      | `90`, integer > 0                                                                     | จำนวนวันล่วงหน้าสูงสุด                               |
| `BOOKING_OPEN_TIME`             | `06:00`, HH:mm                                                                        | เวลาเปิดตาม Asia/Bangkok                             |
| `BOOKING_CLOSE_TIME`            | `20:00`, HH:mm                                                                        | เวลาปิดตาม Asia/Bangkok                              |
| `BOOKING_CHECKIN_EARLY_MINUTES` | `30`, integer >= 0                                                                    | check-in ก่อนเวลาเริ่ม                               |
| `BOOKING_CHECKIN_LATE_MINUTES`  | `30`, integer >= 0                                                                    | check-in หลังเวลาเริ่ม และ cutoff ของ NO_SHOW worker |

Zod ตรวจรูปแบบเวลาเปิด/ปิด แต่ยังไม่ตรวจ cross-field ว่าเวลาเปิดน้อยกว่าเวลาปิด `JWT_EXPIRES_IN` เป็น string ที่ library ตรวจตอน sign อีกชั้น และ PORT ปัจจุบันไม่ได้จำกัดช่วงใน schema

## Configuration files

| ไฟล์                                           | หน้าที่                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [tsconfig.json](../../tsconfig.json)           | compile เฉพาะ src ลง dist; tests/seed อยู่นอก build                                                   |
| [tsconfig.test.json](../../tsconfig.test.json) | ตรวจ type ของ src/tests/Vitest config แบบ noEmit และ ESNext/bundler                                   |
| [vitest.config.mts](../../vitest.config.mts)   | เลือก tests/**/*.test.ts, Node environment และ setup; .mts ใช้ ESM config แยกจากแอป CommonJS          |
| [eslint.config.mjs](../../eslint.config.mjs)   | recommended TypeScript ESLint; ปิด no-explicit-any/no-unused-vars; ignore dist/node_modules           |
| [.gitignore](../../.gitignore)                 | ignore node_modules, dist, .env, coverage และ sql_backup                                              |
| [Dockerfile](../../Dockerfile)                 | install → generate Prisma MySQL → build; ตอน start ทำ migrate deploy → npm start                      |
| [docker-compose.yml](../../docker-compose.yml) | MySQL 8.4 + backend, ports 3306/3000 และ named volume; depends_on ยังไม่ได้ตั้ง healthcheck/readiness |

Swagger UI สร้างจาก object กลางโดยตรง จึงต้องแก้ document เองเมื่อเปลี่ยน route; comments/JSDoc ใน handler ไม่ได้แปลงเป็น OpenAPI โดยอัตโนมัติ
