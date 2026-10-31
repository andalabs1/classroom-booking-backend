# อธิบายฟังก์ชัน API handler ทีละตัว

[หน้าคู่มือ](./overview.md) · [API contract และ payload](./api.md) · [ฟังก์ชันที่ใช้ซ้ำ](./functions.md) · [Service/transaction](./services.md)

ตรวจ source วันที่ **31 ตุลาคม 2026** เอกสารนี้อธิบาย handler ทั้ง 60 ตัว ไม่ใช่เพียงรายการ URL แต่ระบุค่าที่อ่านจาก request ลำดับการทำงาน Prisma/service ที่เรียก ข้อมูลที่เขียน response และกรณีผิดเงื่อนไข

## คำว่า func API ในโครงการนี้หมายถึงอะไร

ใน source API ส่วนใหญ่ประกาศเป็น anonymous callback เช่น `router.post("/", async (req, res, next) => { ... })` จึงไม่มีชื่อ export แยกเป็น `createBookingController` คู่มือนี้ใช้ **HTTP method + URL เต็ม** ระบุฟังก์ชันนั้น แล้วเชื่อมกลับไปยัง callback ใน source โดยตรง ส่วน helper ที่ตั้งชื่อและ service ดู [functions.md](./functions.md)

- `req.params`: ส่วน URL เช่น id/key ส่วนมากแปลง BigInt โดยตรง
- `req.query`: ตัวกรอง ค้นหา ช่วงเวลา และ pagination ที่ route parse ด้วย Zod
- `req.body`: JSON ที่ผ่าน express.json; upload ใช้ `req.file` หลัง Multer
- `req.user`: id/role/email ที่ authenticate อ่านจาก database และแนบเข้าคำขอ
- `res`: ส่ง HTTP response ผ่าน ok/created หรือส่ง CSV โดยตรง
- `next(error)`: ส่งข้อผิดพลาดไป errorHandler กลาง; handler ที่เป็น async คืน Promise ของการทำงาน HTTP ไม่ได้คืน business object ให้ caller ใช้แทน res

## พฤติกรรมร่วมที่อ่านก่อนใช้รายละเอียด

1. Protected routes อาจถูกหยุดด้วย401ก่อนถึง handler ส่วน admin guard เพิ่ม403 เมื่อ role ไม่ตรง การตรวจ JWT ใช้ role/status/tokenVersion จาก database ล่าสุด
2. ok โดยปกติส่ง200พร้อม `{success,message,data,meta?}`; created ส่ง201 ส่วน jsonSafe แปลง BigInt เป็น string และ Date เป็น ISO string
3. Zod/Multer error เป็น400; AppError ใช้ status ที่กำหนด; error อื่นที่ไม่มีstatus เป็น500 ตัวอย่าง ID ที่ handler เรียก BigInt โดยตรงไม่ได้ถูกแปลงเป็น400อัตโนมัติทุก route
4. ตารางข้อผิดพลาดแต่ละตัวระบุกรณีเฉพาะ ส่วน error database/SDK ที่ไม่ได้ catch แยกจะส่ง errorHandler ตามข้อ3
5. Anonymous callbacks ภายใน map/filter/Promise และ callbacks ของ middleware เป็นส่วนหนึ่งของ flow ที่อธิบาย ไม่ใช่ endpoint เพิ่มอีกตัว
6. `/docs/` และ `/api-docs/` เป็น Swagger UI ผ่าน app.use จึงอธิบายแยกท้ายเอกสารจาก60 business/gateway handlers

## สารบัญฟังก์ชัน API

| ฟังก์ชัน (Method + URL)                                                                         | Source                                                                                                           |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [GET `/`](#handler-get)                                                                         | [src/app.ts](../../src/app.ts#L19)                                                                               |
| [GET `/health`](#handler-get-health)                                                            | [src/app.ts](../../src/app.ts#L36)                                                                               |
| [POST `/api/auth/register`](#handler-post-api-auth-register)                                    | [src/modules/auth/auth.routes.ts](../../src/modules/auth/auth.routes.ts#L54)                                     |
| [POST `/api/auth/login`](#handler-post-api-auth-login)                                          | [src/modules/auth/auth.routes.ts](../../src/modules/auth/auth.routes.ts#L81)                                     |
| [POST `/api/auth/logout`](#handler-post-api-auth-logout)                                        | [src/modules/auth/auth.routes.ts](../../src/modules/auth/auth.routes.ts#L113)                                    |
| [GET `/api/auth/me`](#handler-get-api-auth-me)                                                  | [src/modules/auth/auth.routes.ts](../../src/modules/auth/auth.routes.ts#L127)                                    |
| [GET `/api/classrooms`](#handler-get-api-classrooms)                                            | [src/modules/classrooms/classrooms.routes.ts](../../src/modules/classrooms/classrooms.routes.ts#L52)             |
| [GET `/api/classrooms/availability`](#handler-get-api-classrooms-availability)                  | [src/modules/classrooms/classrooms.routes.ts](../../src/modules/classrooms/classrooms.routes.ts#L117)            |
| [GET `/api/classrooms/schedule`](#handler-get-api-classrooms-schedule)                          | [src/modules/classrooms/classrooms.routes.ts](../../src/modules/classrooms/classrooms.routes.ts#L186)            |
| [GET `/api/classrooms/:id`](#handler-get-api-classrooms-id)                                     | [src/modules/classrooms/classrooms.routes.ts](../../src/modules/classrooms/classrooms.routes.ts#L241)            |
| [GET `/api/classrooms/:id/availability`](#handler-get-api-classrooms-id-availability)           | [src/modules/classrooms/classrooms.routes.ts](../../src/modules/classrooms/classrooms.routes.ts#L254)            |
| [POST `/api/bookings`](#handler-post-api-bookings)                                              | [src/modules/bookings/bookings.routes.ts](../../src/modules/bookings/bookings.routes.ts#L300)                    |
| [GET `/api/bookings`](#handler-get-api-bookings)                                                | [src/modules/bookings/bookings.routes.ts](../../src/modules/bookings/bookings.routes.ts#L347)                    |
| [GET `/api/bookings/:id`](#handler-get-api-bookings-id)                                         | [src/modules/bookings/bookings.routes.ts](../../src/modules/bookings/bookings.routes.ts#L421)                    |
| [PATCH `/api/bookings/:id`](#handler-patch-api-bookings-id)                                     | [src/modules/bookings/bookings.routes.ts](../../src/modules/bookings/bookings.routes.ts#L447)                    |
| [PATCH `/api/bookings/:id/cancel`](#handler-patch-api-bookings-id-cancel)                       | [src/modules/bookings/bookings.routes.ts](../../src/modules/bookings/bookings.routes.ts#L568)                    |
| [DELETE `/api/bookings/:id`](#handler-delete-api-bookings-id)                                   | [src/modules/bookings/bookings.routes.ts](../../src/modules/bookings/bookings.routes.ts#L576)                    |
| [POST `/api/bookings/:id/check-in`](#handler-post-api-bookings-id-check-in)                     | [src/modules/bookings/bookings.routes.ts](../../src/modules/bookings/bookings.routes.ts#L585)                    |
| [GET `/api/users/directory`](#handler-get-api-users-directory)                                  | [src/modules/users/users.routes.ts](../../src/modules/users/users.routes.ts#L26)                                 |
| [GET `/api/users/me`](#handler-get-api-users-me)                                                | [src/modules/users/users.routes.ts](../../src/modules/users/users.routes.ts#L57)                                 |
| [PATCH `/api/users/me`](#handler-patch-api-users-me)                                            | [src/modules/users/users.routes.ts](../../src/modules/users/users.routes.ts#L70)                                 |
| [PATCH `/api/users/me/password`](#handler-patch-api-users-me-password)                          | [src/modules/users/users.routes.ts](../../src/modules/users/users.routes.ts#L101)                                |
| [GET `/api/users/me/bookings`](#handler-get-api-users-me-bookings)                              | [src/modules/users/users.routes.ts](../../src/modules/users/users.routes.ts#L122)                                |
| [GET `/api/notifications`](#handler-get-api-notifications)                                      | [src/modules/notifications/notifications.routes.ts](../../src/modules/notifications/notifications.routes.ts#L12) |
| [GET `/api/notifications/unread-count`](#handler-get-api-notifications-unread-count)            | [src/modules/notifications/notifications.routes.ts](../../src/modules/notifications/notifications.routes.ts#L52) |
| [PATCH `/api/notifications/read-all`](#handler-patch-api-notifications-read-all)                | [src/modules/notifications/notifications.routes.ts](../../src/modules/notifications/notifications.routes.ts#L64) |
| [PATCH `/api/notifications/:id/read`](#handler-patch-api-notifications-id-read)                 | [src/modules/notifications/notifications.routes.ts](../../src/modules/notifications/notifications.routes.ts#L76) |
| [GET `/api/config/business-rules`](#handler-get-api-config-business-rules)                      | [src/modules/config/config.routes.ts](../../src/modules/config/config.routes.ts#L10)                             |
| [POST `/api/admin/uploads/images`](#handler-post-api-admin-uploads-images)                      | [src/modules/uploads/uploads.routes.ts](../../src/modules/uploads/uploads.routes.ts#L24)                         |
| [DELETE `/api/admin/uploads/images/:key`](#handler-delete-api-admin-uploads-images-key)         | [src/modules/uploads/uploads.routes.ts](../../src/modules/uploads/uploads.routes.ts#L33)                         |
| [GET `/api/admin/dashboard/summary`](#handler-get-api-admin-dashboard-summary)                  | [src/modules/admin/admin-dashboard.routes.ts](../../src/modules/admin/admin-dashboard.routes.ts#L14)             |
| [GET `/api/admin/dashboard/recent-bookings`](#handler-get-api-admin-dashboard-recent-bookings)  | [src/modules/admin/admin-dashboard.routes.ts](../../src/modules/admin/admin-dashboard.routes.ts#L93)             |
| [GET `/api/admin/classrooms`](#handler-get-api-admin-classrooms)                                | [src/modules/admin/admin-classrooms.routes.ts](../../src/modules/admin/admin-classrooms.routes.ts#L19)           |
| [GET `/api/admin/classrooms/:id`](#handler-get-api-admin-classrooms-id)                         | [src/modules/admin/admin-classrooms.routes.ts](../../src/modules/admin/admin-classrooms.routes.ts#L48)           |
| [POST `/api/admin/classrooms`](#handler-post-api-admin-classrooms)                              | [src/modules/admin/admin-classrooms.routes.ts](../../src/modules/admin/admin-classrooms.routes.ts#L66)           |
| [PATCH `/api/admin/classrooms/:id`](#handler-patch-api-admin-classrooms-id)                     | [src/modules/admin/admin-classrooms.routes.ts](../../src/modules/admin/admin-classrooms.routes.ts#L95)           |
| [PATCH `/api/admin/classrooms/:id/status`](#handler-patch-api-admin-classrooms-id-status)       | [src/modules/admin/admin-classrooms.routes.ts](../../src/modules/admin/admin-classrooms.routes.ts#L120)          |
| [DELETE `/api/admin/classrooms/:id`](#handler-delete-api-admin-classrooms-id)                   | [src/modules/admin/admin-classrooms.routes.ts](../../src/modules/admin/admin-classrooms.routes.ts#L144)          |
| [GET `/api/admin/bookings`](#handler-get-api-admin-bookings)                                    | [src/modules/admin/admin-bookings.routes.ts](../../src/modules/admin/admin-bookings.routes.ts#L25)               |
| [GET `/api/admin/bookings/:id`](#handler-get-api-admin-bookings-id)                             | [src/modules/admin/admin-bookings.routes.ts](../../src/modules/admin/admin-bookings.routes.ts#L67)               |
| [PATCH `/api/admin/bookings/:id/approve`](#handler-patch-api-admin-bookings-id-approve)         | [src/modules/admin/admin-bookings.routes.ts](../../src/modules/admin/admin-bookings.routes.ts#L197)              |
| [PATCH `/api/admin/bookings/:id/reject`](#handler-patch-api-admin-bookings-id-reject)           | [src/modules/admin/admin-bookings.routes.ts](../../src/modules/admin/admin-bookings.routes.ts#L215)              |
| [PATCH `/api/admin/bookings/:id/cancel`](#handler-patch-api-admin-bookings-id-cancel)           | [src/modules/admin/admin-bookings.routes.ts](../../src/modules/admin/admin-bookings.routes.ts#L235)              |
| [PATCH `/api/admin/bookings/:id/start`](#handler-patch-api-admin-bookings-id-start)             | [src/modules/admin/admin-bookings.routes.ts](../../src/modules/admin/admin-bookings.routes.ts#L255)              |
| [PATCH `/api/admin/bookings/:id/complete`](#handler-patch-api-admin-bookings-id-complete)       | [src/modules/admin/admin-bookings.routes.ts](../../src/modules/admin/admin-bookings.routes.ts#L273)              |
| [PATCH `/api/admin/bookings/:id/no-show`](#handler-patch-api-admin-bookings-id-no-show)         | [src/modules/admin/admin-bookings.routes.ts](../../src/modules/admin/admin-bookings.routes.ts#L291)              |
| [GET `/api/admin/users`](#handler-get-api-admin-users)                                          | [src/modules/admin/admin-users.routes.ts](../../src/modules/admin/admin-users.routes.ts#L19)                     |
| [POST `/api/admin/users`](#handler-post-api-admin-users)                                        | [src/modules/admin/admin-users.routes.ts](../../src/modules/admin/admin-users.routes.ts#L57)                     |
| [GET `/api/admin/users/:id`](#handler-get-api-admin-users-id)                                   | [src/modules/admin/admin-users.routes.ts](../../src/modules/admin/admin-users.routes.ts#L80)                     |
| [PATCH `/api/admin/users/:id`](#handler-patch-api-admin-users-id)                               | [src/modules/admin/admin-users.routes.ts](../../src/modules/admin/admin-users.routes.ts#L99)                     |
| [PATCH `/api/admin/users/:id/role`](#handler-patch-api-admin-users-id-role)                     | [src/modules/admin/admin-users.routes.ts](../../src/modules/admin/admin-users.routes.ts#L133)                    |
| [PATCH `/api/admin/users/:id/status`](#handler-patch-api-admin-users-id-status)                 | [src/modules/admin/admin-users.routes.ts](../../src/modules/admin/admin-users.routes.ts#L163)                    |
| [PATCH `/api/admin/users/:id/reset-password`](#handler-patch-api-admin-users-id-reset-password) | [src/modules/admin/admin-users.routes.ts](../../src/modules/admin/admin-users.routes.ts#L192)                    |
| [DELETE `/api/admin/users/:id`](#handler-delete-api-admin-users-id)                             | [src/modules/admin/admin-users.routes.ts](../../src/modules/admin/admin-users.routes.ts#L207)                    |
| [GET `/api/admin/reports/summary`](#handler-get-api-admin-reports-summary)                      | [src/modules/admin/admin-reports.routes.ts](../../src/modules/admin/admin-reports.routes.ts#L145)                |
| [GET `/api/admin/reports/bookings`](#handler-get-api-admin-reports-bookings)                    | [src/modules/admin/admin-reports.routes.ts](../../src/modules/admin/admin-reports.routes.ts#L211)                |
| [GET `/api/admin/reports/classrooms`](#handler-get-api-admin-reports-classrooms)                | [src/modules/admin/admin-reports.routes.ts](../../src/modules/admin/admin-reports.routes.ts#L230)                |
| [GET `/api/admin/reports/users`](#handler-get-api-admin-reports-users)                          | [src/modules/admin/admin-reports.routes.ts](../../src/modules/admin/admin-reports.routes.ts#L264)                |
| [GET `/api/admin/reports/export`](#handler-get-api-admin-reports-export)                        | [src/modules/admin/admin-reports.routes.ts](../../src/modules/admin/admin-reports.routes.ts#L291)                |
| [GET `/api/admin/audit-logs`](#handler-get-api-admin-audit-logs)                                | [src/modules/admin/admin-audit-logs.routes.ts](../../src/modules/admin/admin-audit-logs.routes.ts#L16)           |

## ระบบและการตรวจสถานะ

<a id="handler-get"></a>

### GET /

| หัวข้อ                           | รายละเอียด                                     |
| -------------------------------- | ---------------------------------------------- |
| Source                           | [callback ใน src/app.ts](../../src/app.ts#L19) |
| สิทธิ์                           | สาธารณะ                                        |
| ค่าที่รับจาก request             | ไม่มี body/query/params                        |
| Prisma / helper / service ที่ใช้ | res.json                                       |

ลำดับการทำงาน:

1. สร้าง object ระบุชื่อ service และสถานะ online
2. ใส่ลิงก์ health/documentation/API ใต้ data.endpoints
3. ส่ง res.json โดยตรงก่อน middleware หลัก

- **Response:** 200; success=true, message=Classroom Reservation API Gateway และ data ของ gateway
- **กรณีไม่สำเร็จ:** ไม่มีเงื่อนไข business error ใน handler นี้
- **การเปลี่ยนข้อมูล / transaction:** ไม่ query database/R2 และไม่ยืนยัน readiness ของ dependency

<a id="handler-get-health"></a>

### GET /health

| หัวข้อ                           | รายละเอียด                                     |
| -------------------------------- | ---------------------------------------------- |
| Source                           | [callback ใน src/app.ts](../../src/app.ts#L36) |
| สิทธิ์                           | สาธารณะ                                        |
| ค่าที่รับจาก request             | ไม่มี body/query/params                        |
| Prisma / helper / service ที่ใช้ | res.json                                       |

ลำดับการทำงาน:

1. สร้างข้อความ Healthy และชื่อ service
2. ส่ง JSON ก่อน Helmet/CORS/logger ที่ประกาศถัดมา

- **Response:** 200; success=true, message=Healthy, data.service
- **กรณีไม่สำเร็จ:** ไม่มีการตรวจ connection ใน handler นี้
- **การเปลี่ยนข้อมูล / transaction:** ไม่อ่าน/เขียนฐานข้อมูลหรือ R2

## Authentication

<a id="handler-post-api-auth-register"></a>

### POST /api/auth/register

| หัวข้อ                           | รายละเอียด                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/auth/auth.routes.ts](../../src/modules/auth/auth.routes.ts#L54)                                           |
| สิทธิ์                           | สาธารณะ                                                                                                                            |
| ค่าที่รับจาก request             | req.body: email, password>=8, name หรือ firstName+lastName; userCode?/phone?/role? โดย role=USER/STUDENT/TEACHER (default STUDENT) |
| Prisma / helper / service ที่ใช้ | registration, bcrypt.hash, newId, prisma.user.create, publicUser, jsonSafe, created                                                |

ลำดับการทำงาน:

1. registration.parse ตรวจ input และตัด password ออกจาก profile
2. ใช้ name ที่รับมา หรือประกอบ firstName กับ lastName
3. hash password ด้วย bcrypt cost12 และสร้าง User ด้วย newId
4. เลือก publicUser แล้วแปลง BigInt ก่อนส่งกลับ

- **Response:** 201; message=Registered, data=User ตาม publicUser selection ไม่มี passwordHash
- **กรณีไม่สำเร็จ:** 400 เมื่อ Zod ไม่ผ่าน; 409 เมื่อข้อความ error มี Unique constraint โดยตอบ Email or user code already exists
- **การเปลี่ยนข้อมูล / transaction:** เขียน User หนึ่ง record; ไม่ได้สร้าง session/JWT หรือ notification

<a id="handler-post-api-auth-login"></a>

### POST /api/auth/login

| หัวข้อ                           | รายละเอียด                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/auth/auth.routes.ts](../../src/modules/auth/auth.routes.ts#L81) |
| สิทธิ์                           | สาธารณะ; จำกัด20 requests ต่อ15นาทีก่อนเข้า handler                                      |
| ค่าที่รับจาก request             | req.body: password และ username หรือ email; ใช้ username ก่อนหากส่งมาทั้งสอง             |
| Prisma / helper / service ที่ใช้ | login, prisma.user.findUnique/findFirst, bcrypt.compare, jwt.sign, env, jsonSafe, ok     |

ลำดับการทำงาน:

1. login.parse แล้วเลือก identifier
2. ถ้า identifier มี @ ใช้ user.findUnique(email) มิฉะนั้น user.findFirst(userCode)
3. ตรวจว่าพบผู้ใช้ ACTIVE และ bcrypt.compare ผ่าน
4. sign JWT ด้วย id/role/email/tokenVersion และ expiresIn จาก env
5. ตัด passwordHash จาก user แล้วตอบ token พร้อม user

- **Response:** 200; message=Logged in, data={token,user}; user คือ record ที่ตัด passwordHash แล้ว
- **กรณีไม่สำเร็จ:** 400 validation; 401 ไม่พบบัญชี/inactive/password ผิด; limiter อาจตอบ429 ก่อนเข้า handler เมื่อเกิน20ครั้ง/15นาที
- **การเปลี่ยนข้อมูล / transaction:** อ่าน User และสร้าง token; ไม่เพิ่ม tokenVersion หรือเขียน login session ลง DB

<a id="handler-post-api-auth-logout"></a>

### POST /api/auth/logout

| หัวข้อ                           | รายละเอียด                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/auth/auth.routes.ts](../../src/modules/auth/auth.routes.ts#L113)     |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง |
| ค่าที่รับจาก request             | req.user จาก authenticate; ไม่ต้องมี body                                                     |
| Prisma / helper / service ที่ใช้ | authenticate, prisma.user.update, ok                                                          |

ลำดับการทำงาน:

1. ใช้ req.user.id เป็นเป้าหมาย
2. user.update เพิ่ม tokenVersion ด้วย increment1
3. ส่งผลสำเร็จพร้อม data null

- **Response:** 200; message=Logged out, data=null
- **กรณีไม่สำเร็จ:** 401 จาก authenticate; error ของ update ส่งผ่าน errorHandler
- **การเปลี่ยนข้อมูล / transaction:** JWT เก่าทุก session ของบัญชีนี้จะไม่ตรง version เมื่อ authenticate ครั้งถัดไป

<a id="handler-get-api-auth-me"></a>

### GET /api/auth/me

| หัวข้อ                           | รายละเอียด                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/auth/auth.routes.ts](../../src/modules/auth/auth.routes.ts#L127)     |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง |
| ค่าที่รับจาก request             | req.user.id จาก authenticate                                                                  |
| Prisma / helper / service ที่ใช้ | authenticate, prisma.user.findUnique, publicUser, jsonSafe, ok                                |

ลำดับการทำงาน:

1. query ผู้ใช้เดิมอีกครั้งด้วย publicUser selection
2. jsonSafe แล้วส่งข้อมูลกลับ

- **Response:** 200; data=โปรไฟล์ที่เลือก หรือ null หาก record หายระหว่าง authenticate กับ query นี้
- **กรณีไม่สำเร็จ:** 401 จาก authenticate; handler นี้ไม่มีเงื่อนไข AppError404 แยก
- **การเปลี่ยนข้อมูล / transaction:** อ่าน User อย่างเดียว

## Classrooms

<a id="handler-get-api-classrooms"></a>

### GET /api/classrooms

| หัวข้อ                           | รายละเอียด                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Source                           | [callback ใน src/modules/classrooms/classrooms.routes.ts](../../src/modules/classrooms/classrooms.routes.ts#L52)   |
| สิทธิ์                           | สาธารณะ                                                                                                            |
| ค่าที่รับจาก request             | req.query: search/building/floor/category/status/minCapacity/equipment/sort/page/limit; page=1, limit=20 สูงสุด100 |
| Prisma / helper / service ที่ใช้ | csvStrings, prisma.classroom.findMany, jsonSafe, ok                                                                |

ลำดับการทำงาน:

1. parse query แล้วประกอบ Prisma where สำหรับข้อความ ตำแหน่ง สถานะ และความจุ
2. โหลดห้องตาม sort: capacity มากก่อน, name น้อยก่อน หรือ code/name
3. ตรวจ equipment JSON ใน memory ให้มีครบทุกชิ้นที่เลือก
4. slice ตาม page/limit และใช้จำนวนหลังกรองเป็น meta.total

- **Response:** 200; data=Classroom[], meta={page,limit,total}
- **กรณีไม่สำเร็จ:** 400 เมื่อ query ไม่ผ่าน schema; ไม่ส่ง status จะไม่ได้กรอง ACTIVE ให้อัตโนมัติ
- **การเปลี่ยนข้อมูล / transaction:** อ่าน Classroom; การกรองอุปกรณ์เกิดก่อนแบ่งหน้า ไม่มี write

<a id="handler-get-api-classrooms-availability"></a>

### GET /api/classrooms/availability

| หัวข้อ                           | รายละเอียด                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/classrooms/classrooms.routes.ts](../../src/modules/classrooms/classrooms.routes.ts#L117) |
| สิทธิ์                           | สาธารณะ                                                                                                           |
| ค่าที่รับจาก request             | req.query: startAt/endAt บังคับ; classroomIds?/building?/minCapacity?/equipment?/availableOnly=true\|false        |
| Prisma / helper / service ที่ใช้ | rangeQuery, csvIds/csvStrings, ensureRange, prisma.classroom.findMany, prisma.booking.findMany, jsonSafe, ok      |

ลำดับการทำงาน:

1. parse range และ ensureRange ว่า endAt>startAt
2. โหลดเฉพาะห้อง ACTIVE ตามตัวกรอง แล้วกรองอุปกรณ์ใน memory
3. หากมีห้องจึง query bookings สถานะ PENDING/CONFIRMED/IN_USE ที่ startAt<query.endAt และ endAt>query.startAt
4. จัด conflicts ต่อห้อง สร้าง available และกรองเฉพาะว่างเมื่อ availableOnly=true

- **Response:** 200; data={startAt,endAt,rooms:[...classroom,available,conflicts]}
- **กรณีไม่สำเร็จ:** 400 range/query ไม่ผ่าน; ไม่พบห้องคืน rooms=[] ไม่ใช่404
- **การเปลี่ยนข้อมูล / transaction:** อ่าน Classroom/Booking; ผลเป็น snapshot ณ ตอน query ไม่ได้ล็อกเวลาหรือสร้าง booking

<a id="handler-get-api-classrooms-schedule"></a>

### GET /api/classrooms/schedule

| หัวข้อ                           | รายละเอียด                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/classrooms/classrooms.routes.ts](../../src/modules/classrooms/classrooms.routes.ts#L186) |
| สิทธิ์                           | สาธารณะ                                                                                                           |
| ค่าที่รับจาก request             | req.query: startAt/endAt บังคับ; classroomIds? แบบ comma หรือ array                                               |
| Prisma / helper / service ที่ใช้ | rangeQuery, ensureRange, prisma.classroom.findMany, prisma.booking.findMany, jsonSafe, ok                         |

ลำดับการทำงาน:

1. parse และ ensureRange
2. ตรวจช่วงไม่เกิน31วัน
3. โหลดห้อง ACTIVE ที่เลือก
4. โหลด booking ที่ทับช่วงใน blocking statuses โดย select เฉพาะ id/classroomId/startAt/endAt/status และเรียง startAt
5. จัด bookings ใต้แต่ละห้อง

- **Response:** 200; data={startAt,endAt,rooms:[...classroom,bookings]}
- **กรณีไม่สำเร็จ:** 400 query/range ไม่ถูกหรือช่วงเกิน31วัน; ไม่พบห้องคืนrooms=[]
- **การเปลี่ยนข้อมูล / transaction:** อ่านข้อมูล; selection ของ booking ไม่รวม purpose หรือข้อมูลผู้จอง

<a id="handler-get-api-classrooms-id"></a>

### GET /api/classrooms/:id

| หัวข้อ                           | รายละเอียด                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/classrooms/classrooms.routes.ts](../../src/modules/classrooms/classrooms.routes.ts#L241) |
| สิทธิ์                           | สาธารณะ                                                                                                           |
| ค่าที่รับจาก request             | req.params.id แปลงด้วย BigInt โดยตรง                                                                              |
| Prisma / helper / service ที่ใช้ | prisma.classroom.findUnique, AppError, jsonSafe, ok                                                               |

ลำดับการทำงาน:

1. classroom.findUnique ตาม ID
2. ถ้าไม่พบส่ง AppError404
3. แปลงผลผ่าน jsonSafe และตอบ

- **Response:** 200; data=Classroom ทั้ง record
- **กรณีไม่สำเร็จ:** 404 ไม่พบห้อง; ID ที่แปลง BigInt ไม่ได้เป็น exception ปกติ ดูข้อผิดพลาดร่วม
- **การเปลี่ยนข้อมูล / transaction:** อ่าน Classroom; route รายละเอียดไม่ได้บังคับ ACTIVE

<a id="handler-get-api-classrooms-id-availability"></a>

### GET /api/classrooms/:id/availability

| หัวข้อ                           | รายละเอียด                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/classrooms/classrooms.routes.ts](../../src/modules/classrooms/classrooms.routes.ts#L254) |
| สิทธิ์                           | สาธารณะ                                                                                                           |
| ค่าที่รับจาก request             | req.params.id และ req.query.startAt/endAt                                                                         |
| Prisma / helper / service ที่ใช้ | rangeQuery.omit, ensureRange, prisma.classroom.findUnique, prisma.booking.count, ok                               |

ลำดับการทำงาน:

1. parse range และตรวจลำดับเวลา
2. โหลดห้องตาม ID และกำหนดให้ต้อง ACTIVE
3. booking.count ของห้องใน blocking statuses ที่ทับช่วง
4. ส่ง available ตาม count===0

- **Response:** 200; data={available:boolean}
- **กรณีไม่สำเร็จ:** 400 query/range; 404 ไม่พบห้องหรือห้องไม่ ACTIVE
- **การเปลี่ยนข้อมูล / transaction:** อ่าน Classroom และนับ Booking ไม่สร้างการจอง

## Bookings

<a id="handler-post-api-bookings"></a>

### POST /api/bookings

| หัวข้อ                           | รายละเอียด                                                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/bookings/bookings.routes.ts](../../src/modules/bookings/bookings.routes.ts#L300)                                          |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง                                                      |
| ค่าที่รับจาก request             | req.body: classroomId/purpose/attendeeCount/startAt/endAt; requestedEquipment default[]; description?/userId?; req.user                            |
| Prisma / helper / service ที่ใช้ | bookingInput, ensureTime, resolveOwner, serializable, assertEquipmentAvailable, findConflict, newId, bookingCodeFor, notifyBookingCreated, created |

ลำดับการทำงาน:

1. bookingInput.parse และ ensureTime ตรวจอนาคต ระยะเวลา advance limit และเวลาเปิดในวันไทยเดียวกัน
2. resolveOwner เลือกเจ้าของ ACTIVE และตรวจสิทธิ์จองแทน
3. serializable transaction โหลดห้อง ACTIVE ตรวจ capacity/equipment และ findConflict
4. newId/bookingCodeFor แล้ว tx.booking.create โดย status ใช้ default PENDING
5. หลัง commit เรียก notifyBookingCreated; catch เฉพาะ notification failure แล้วตอบสำเร็จ

- **Response:** 201; message=Booking created, data=Booking พร้อม classroom และ user ที่เลือก
- **กรณีไม่สำเร็จ:** 400 input/time/ห้องไม่พร้อม/ความจุ/อุปกรณ์/เจ้าของ inactive; 403 จองแทนโดยไม่มีสิทธิ์; 409 conflict; Prisma P2034 retryสูงสุด3attempts
- **การเปลี่ยนข้อมูล / transaction:** เขียน Booking ใน transaction แล้วเขียน notifications แยก; flow create นี้ไม่มี audit CREATE

<a id="handler-get-api-bookings"></a>

### GET /api/bookings

| หัวข้อ                           | รายละเอียด                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/bookings/bookings.routes.ts](../../src/modules/bookings/bookings.routes.ts#L347)              |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง                          |
| ค่าที่รับจาก request             | req.query: search/status/page/limit, view/date หรือ startDate/endDate, scope=mine\|all(defaultmine), userId?; req.user |
| Prisma / helper / service ที่ใช้ | listQuery, calendarRange, delegatedRoles, prisma.booking.findMany/count, jsonSafe, ok                                  |

ลำดับการทำงาน:

1. listQuery.parse; หากเลือก view ให้ calendarRange คำนวณวันไทย
2. ตรวจ delegated role เมื่อ scope=all หรือส่ง userId
3. ประกอบ where: scope mine ใช้ req.user.id; scope all จึงใช้ userId ที่ส่งหรือทุกคน
4. calendar view ใช้ overlap แต่ custom range ใช้ startAt gte/lte
5. findMany/count แบบขนานและคืน pagination พร้อม calendar meta เมื่อเลือก view

- **Response:** 200; data=Booking[] พร้อมห้อง/user; meta=page/limit/total และ view/date/startAt/endAt เมื่อเป็นปฏิทิน
- **กรณีไม่สำเร็จ:** 400 query/วันไม่มีจริง/date ไม่มีview/view ผสมcustom range; 403 ขอข้อมูลผู้อื่นโดยไม่ใช่ADMIN
- **การเปลี่ยนข้อมูล / transaction:** อ่าน Booking; userId เพียงอย่างเดียวขณะscope=mineยังคงกรองตัวเอง

<a id="handler-get-api-bookings-id"></a>

### GET /api/bookings/:id

| หัวข้อ                           | รายละเอียด                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/bookings/bookings.routes.ts](../../src/modules/bookings/bookings.routes.ts#L421) |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง             |
| ค่าที่รับจาก request             | req.params.id และ req.user                                                                                |
| Prisma / helper / service ที่ใช้ | prisma.booking.findUnique, canManageBooking, jsonSafe, ok                                                 |

ลำดับการทำงาน:

1. โหลด booking พร้อมห้องและ user fields ที่เลือก
2. canManageBooking ตรวจเจ้าของหรือADMIN
3. ถ้าไม่พบหรือไม่มีสิทธิ์ใช้404เหมือนกัน
4. ส่งรายละเอียด

- **Response:** 200; data=Booking พร้อม classroom และ user ที่เลือก
- **กรณีไม่สำเร็จ:** 404 ไม่พบหรือไม่ใช่เจ้าของ/ADMIN; 401จากauthenticate
- **การเปลี่ยนข้อมูล / transaction:** อ่านข้อมูล ไม่มี write

<a id="handler-patch-api-bookings-id"></a>

### PATCH /api/bookings/:id

| หัวข้อ                           | รายละเอียด                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/bookings/bookings.routes.ts](../../src/modules/bookings/bookings.routes.ts#L447)                                      |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง                                                  |
| ค่าที่รับจาก request             | req.params.id, partial bookingInput ใน req.body และ req.user                                                                                   |
| Prisma / helper / service ที่ใช้ | bookingInput.partial, canManageBooking, resolveOwner, ensureTime, serializable, findConflict, prisma.auditLog.create, notifyBookingUpdated, ok |

ลำดับการทำงาน:

1. โหลดรายการ ตรวจเจ้าของ/ADMIN และบังคับสถานะ PENDING
2. parse partial และรวมค่าที่ไม่ส่งกับข้อมูลเดิม; userIdใหม่ต้องผ่านresolveOwner
3. ensureTime แล้วทำ serializable transaction ตรวจห้อง capacity/equipment/conflict โดยexclude IDตัวเอง
4. tx.booking.update พร้อมล้าง approvedAt/approvedBy/adminNote
5. หลังcommit เขียน audit UPDATE แล้ว notifyBookingUpdated โดยcatch notification error

- **Response:** 200; message=Booking updated, data=Booking พร้อม classroom
- **กรณีไม่สำเร็จ:** 404 ไม่พบ/ไม่มีสิทธิ์; 409 ไม่ใช่PENDINGหรือconflict; 400 input/time/ห้อง/อุปกรณ์/จำนวนคน; 403โอนเจ้าของโดยไม่มีสิทธิ์
- **การเปลี่ยนข้อมูล / transaction:** Booking อยู่ใน transaction; audit และ notifications อยู่หลังcommit แยกกัน auditล้มเหลวอาจตอบerrorแม้แก้bookingแล้ว

<a id="handler-patch-api-bookings-id-cancel"></a>

### PATCH /api/bookings/:id/cancel

| หัวข้อ                           | รายละเอียด                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/bookings/bookings.routes.ts](../../src/modules/bookings/bookings.routes.ts#L568)                   |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง                               |
| ค่าที่รับจาก request             | req.params.id, req.body.reason? (trim 1–2000 เมื่อส่งมา), req.user                                                          |
| Prisma / helper / service ที่ใช้ | cancelAndNotify, cancelBooking, canManageBooking, prisma.booking.update, prisma.auditLog.create, notifyBookingCancelled, ok |

ลำดับการทำงาน:

1. cancelAndNotify เรียก cancelBooking โหลดรายการและตรวจเจ้าของ/ADMIN
2. ยอมรับเฉพาะPENDING/CONFIRMED และตรวจ BOOKING_CANCEL_MINUTES สำหรับผู้ใช้; ADMINข้ามcutoff
3. booking.update เป็นCANCELLED พร้อมcancelledAt/cancelReason
4. เขียน audit CANCELLED แล้วแจ้งเจ้าของ/active admins

- **Response:** 200; message=Booking cancelled, data=Booking หลังยกเลิกพร้อม classroom
- **กรณีไม่สำเร็จ:** 404ไม่พบ/ไม่มีสิทธิ์; 409สถานะไม่อนุญาตหรือเลยcutoff; 400เหตุผลไม่ผ่านschema
- **การเปลี่ยนข้อมูล / transaction:** เก็บ record เดิมไว้ทั้งสอง endpoint; update/audit/notifications ไม่ได้อยู่ในtransactionเดียวกัน; notification failureถูกlog

<a id="handler-delete-api-bookings-id"></a>

### DELETE /api/bookings/:id

| หัวข้อ                           | รายละเอียด                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/bookings/bookings.routes.ts](../../src/modules/bookings/bookings.routes.ts#L576)                   |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง                               |
| ค่าที่รับจาก request             | req.params.id, req.body.reason? (trim 1–2000 เมื่อส่งมา), req.user                                                          |
| Prisma / helper / service ที่ใช้ | cancelAndNotify, cancelBooking, canManageBooking, prisma.booking.update, prisma.auditLog.create, notifyBookingCancelled, ok |

ลำดับการทำงาน:

1. cancelAndNotify เรียก cancelBooking โหลดรายการและตรวจเจ้าของ/ADMIN
2. ยอมรับเฉพาะPENDING/CONFIRMED และตรวจ BOOKING_CANCEL_MINUTES สำหรับผู้ใช้; ADMINข้ามcutoff
3. booking.update เป็นCANCELLED พร้อมcancelledAt/cancelReason
4. เขียน audit CANCELLED แล้วแจ้งเจ้าของ/active admins

- **Response:** 200; message=Booking cancelled, data=Booking หลังยกเลิกพร้อม classroom
- **กรณีไม่สำเร็จ:** 404ไม่พบ/ไม่มีสิทธิ์; 409สถานะไม่อนุญาตหรือเลยcutoff; 400เหตุผลไม่ผ่านschema
- **การเปลี่ยนข้อมูล / transaction:** เก็บ record เดิมไว้ทั้งสอง endpoint; update/audit/notifications ไม่ได้อยู่ในtransactionเดียวกัน; notification failureถูกlog

<a id="handler-post-api-bookings-id-check-in"></a>

### POST /api/bookings/:id/check-in

| หัวข้อ                           | รายละเอียด                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/bookings/bookings.routes.ts](../../src/modules/bookings/bookings.routes.ts#L585) |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง             |
| ค่าที่รับจาก request             | req.params.id, req.user; ไม่มีbodyบังคับ                                                                  |
| Prisma / helper / service ที่ใช้ | canManageBooking, env, prisma.booking.update, prisma.auditLog.create, notifyBookingCheckedIn, ok          |

ลำดับการทำงาน:

1. โหลดรายการและตรวจ canManageBooking
2. บังคับCONFIRMED
3. ตรวจ now ให้อยู่ตั้งแต่ startAt-early ถึง startAt+late รวมสองขอบ และต้องก่อนendAt
4. updateเป็นIN_USE/checkedInAt
5. เขียน audit CHECK_IN แล้ว notifyBookingCheckedIn

- **Response:** 200; message=Booking checked in, data=Booking ที่อัปเดต
- **กรณีไม่สำเร็จ:** 404ไม่พบ/ไม่มีสิทธิ์; 409ไม่CONFIRMEDหรืออยู่นอกcheck-in window
- **การเปลี่ยนข้อมูล / transaction:** update/audit/notification แยกคำสั่ง; notification failureถูกcatch แต่audit failureส่งerrorหลังupdateได้

## Users

<a id="handler-get-api-users-directory"></a>

### GET /api/users/directory

| หัวข้อ                           | รายละเอียด                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/users/users.routes.ts](../../src/modules/users/users.routes.ts#L26) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                        |
| ค่าที่รับจาก request             | req.query.search? <=150, limit 1–100 default100; req.userต้องADMIN                           |
| Prisma / helper / service ที่ใช้ | requireAnyRole, prisma.user.findMany, publicUser, jsonSafe, ok                               |

ลำดับการทำงาน:

1. parsequery
2. ค้นเฉพาะACTIVE users โดย ORของname/userCode/email
3. จำกัดจำนวน เรียงname และselect publicUser

- **Response:** 200; data=รายชื่อผู้ใช้ที่เลือก fields โปรไฟล์
- **กรณีไม่สำเร็จ:** 403ไม่ใช่ADMIN; 400queryไม่ผ่านschema
- **การเปลี่ยนข้อมูล / transaction:** อ่านUserเท่านั้น

<a id="handler-get-api-users-me"></a>

### GET /api/users/me

| หัวข้อ                           | รายละเอียด                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/users/users.routes.ts](../../src/modules/users/users.routes.ts#L57)  |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง |
| ค่าที่รับจาก request             | req.user.id                                                                                   |
| Prisma / helper / service ที่ใช้ | prisma.user.findUnique, publicUser, jsonSafe, ok                                              |

ลำดับการทำงาน:

1. โหลดผู้ใช้ด้วยpublicUser
2. ถ้าไม่พบหลังauthenticateส่ง404
3. jsonSafeและตอบโปรไฟล์

- **Response:** 200; data=Userตามselection
- **กรณีไม่สำเร็จ:** 404Userหายหลังauthenticate; 401จากauthenticate
- **การเปลี่ยนข้อมูล / transaction:** อ่านUser; ต่างจากauth/meที่ไม่มีเงื่อนไข404ในhandler

<a id="handler-patch-api-users-me"></a>

### PATCH /api/users/me

| หัวข้อ                           | รายละเอียด                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/users/users.routes.ts](../../src/modules/users/users.routes.ts#L70)  |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง |
| ค่าที่รับจาก request             | req.body partial: name/firstName/lastName/phone/email; req.user.id                            |
| Prisma / helper / service ที่ใช้ | Zod partial schema, prisma.user.update, publicUser, jsonSafe, ok                              |

ลำดับการทำงาน:

1. parseเฉพาะfieldsโปรไฟล์
2. user.updateด้วยIDจากreq.userและselect publicUser
3. ส่งข้อมูลล่าสุด

- **Response:** 200; message=Profile updated, data=Userตามselection
- **กรณีไม่สำเร็จ:** 400schemaไม่ผ่าน; Prisma errorอื่นส่งerrorHandler ไม่มีmappingunique409เฉพาะในhandlerนี้
- **การเปลี่ยนข้อมูล / transaction:** เขียนUser; เปลี่ยนชื่อย่อยไม่ได้ประกอบnameอัตโนมัติ และไม่เปลี่ยนrole/status

<a id="handler-patch-api-users-me-password"></a>

### PATCH /api/users/me/password

| หัวข้อ                           | รายละเอียด                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/users/users.routes.ts](../../src/modules/users/users.routes.ts#L101) |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง |
| ค่าที่รับจาก request             | req.body.currentPassword และ newPassword>=8; req.user.id                                      |
| Prisma / helper / service ที่ใช้ | prisma.user.findUnique/update, bcrypt.compare/hash, ok                                        |

ลำดับการทำงาน:

1. parsebodyแล้วโหลดUser
2. bcrypt.compareกับhashเดิม; ไม่พบหรือไม่ตรงส่ง400
3. hashรหัสใหม่cost12และuser.update
4. ส่งdata null

- **Response:** 200; message=Password changed, data=null
- **กรณีไม่สำเร็จ:** 400schemaไม่ผ่านหรือCurrent password is incorrect
- **การเปลี่ยนข้อมูล / transaction:** เปลี่ยนpasswordHash; pathนี้ไม่ได้เพิ่มtokenVersionเพื่อrevokeJWTเดิม

<a id="handler-get-api-users-me-bookings"></a>

### GET /api/users/me/bookings

| หัวข้อ                           | รายละเอียด                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/users/users.routes.ts](../../src/modules/users/users.routes.ts#L122) |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง |
| ค่าที่รับจาก request             | req.query.status?/page?/limit?; req.user.id                                                   |
| Prisma / helper / service ที่ใช้ | prisma.booking.findMany/count, jsonSafe, ok                                                   |

ลำดับการทำงาน:

1. parseสถานะและpagination
2. whereผูกuserId=req.user.idเสมอ
3. findMany/countแบบขนาน เรียงcreatedAtใหม่ก่อนและinclude classroom
4. ส่งmeta

- **Response:** 200; data=Booking[], meta={page,limit,total}
- **กรณีไม่สำเร็จ:** 400queryหรือstatusไม่ถูก
- **การเปลี่ยนข้อมูล / transaction:** อ่านbookingของตัวเอง ไม่มีscopeสำหรับคนอื่น

## Notifications

<a id="handler-get-api-notifications"></a>

### GET /api/notifications

| หัวข้อ                           | รายละเอียด                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/notifications/notifications.routes.ts](../../src/modules/notifications/notifications.routes.ts#L12) |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง                                |
| ค่าที่รับจาก request             | req.query.isRead=true\|false?, page/limit; req.user.id                                                                       |
| Prisma / helper / service ที่ใช้ | prisma.notification.findMany/count, jsonSafe, ok                                                                             |

ลำดับการทำงาน:

1. parsefilterและpagination
2. whereผูกuserIdและเพิ่มisReadเมื่อส่งมา
3. โหลดnotificationพร้อมbookingที่เลือกและจำนวนรวมแบบขนาน
4. เรียงcreatedAtใหม่ก่อนแล้วตอบ

- **Response:** 200; data=Notification[]พร้อมbooking, meta={page,limit,total}
- **กรณีไม่สำเร็จ:** 400queryไม่ผ่านschema
- **การเปลี่ยนข้อมูล / transaction:** อ่านข้อมูลของเจ้าของเท่านั้น

<a id="handler-get-api-notifications-unread-count"></a>

### GET /api/notifications/unread-count

| หัวข้อ                           | รายละเอียด                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/notifications/notifications.routes.ts](../../src/modules/notifications/notifications.routes.ts#L52) |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง                                |
| ค่าที่รับจาก request             | req.user.id                                                                                                                  |
| Prisma / helper / service ที่ใช้ | prisma.notification.count, ok                                                                                                |

ลำดับการทำงาน:

1. notification.countโดยuserIdและisRead=false
2. ส่งจำนวนภายใต้data.count

- **Response:** 200; data={count:number}
- **กรณีไม่สำเร็จ:** 401จากauthenticate; databaseerrorผ่านerrorHandler
- **การเปลี่ยนข้อมูล / transaction:** นับข้อมูลอย่างเดียว

<a id="handler-patch-api-notifications-read-all"></a>

### PATCH /api/notifications/read-all

| หัวข้อ                           | รายละเอียด                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/notifications/notifications.routes.ts](../../src/modules/notifications/notifications.routes.ts#L64) |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง                                |
| ค่าที่รับจาก request             | req.user.id; ไม่ต้องมีbody                                                                                                   |
| Prisma / helper / service ที่ใช้ | prisma.notification.updateMany, ok                                                                                           |

ลำดับการทำงาน:

1. updateManyเฉพาะnotificationของเจ้าของที่isRead=false
2. ตั้งisRead=true/readAt=new Date
3. ส่งจำนวนrecordที่อัปเดต

- **Response:** 200; message=Notifications marked read, data={updated:number}
- **กรณีไม่สำเร็จ:** 401จากauthenticate; databaseerrorผ่านerrorHandler
- **การเปลี่ยนข้อมูล / transaction:** เขียนเฉพาะรายการยังไม่อ่าน ไม่เปลี่ยนreadAtของรายการที่อ่านก่อนแล้ว

<a id="handler-patch-api-notifications-id-read"></a>

### PATCH /api/notifications/:id/read

| หัวข้อ                           | รายละเอียด                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/notifications/notifications.routes.ts](../../src/modules/notifications/notifications.routes.ts#L76) |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง                                |
| ค่าที่รับจาก request             | req.params.idและreq.user.id                                                                                                  |
| Prisma / helper / service ที่ใช้ | prisma.notification.findFirst/update, jsonSafe, ok                                                                           |

ลำดับการทำงาน:

1. findFirstด้วยidและuserIdพร้อมกัน
2. ไม่พบของผู้ใช้ส่ง404
3. updateisRead=true และใช้readAtเดิมหากมี มิฉะนั้นnew Date
4. ส่งrecordล่าสุด

- **Response:** 200; data=Notificationล่าสุด
- **กรณีไม่สำเร็จ:** 404ไม่พบหรือเป็นของผู้อื่น
- **การเปลี่ยนข้อมูล / transaction:** เก็บเวลาอ่านครั้งแรกไว้เมื่อเรียกซ้ำ

## Business configuration

<a id="handler-get-api-config-business-rules"></a>

### GET /api/config/business-rules

| หัวข้อ                           | รายละเอียด                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| Source                           | [callback ใน src/modules/config/config.routes.ts](../../src/modules/config/config.routes.ts#L10) |
| สิทธิ์                           | ผู้ใช้ ACTIVE ที่ผ่าน authenticate; สิทธิ์เจ้าของ/จองแทนตรวจเพิ่มใน handler ตามรายการด้านล่าง    |
| ค่าที่รับจาก request             | req.userจากauthenticate; ไม่มีquery/body                                                         |
| Prisma / helper / service ที่ใช้ | env, ok                                                                                          |

ลำดับการทำงาน:

1. อ่านbooking rulesจากenv
2. ประกอบrolesและbookingStatusesที่ระบบประกาศรองรับ
3. ส่งobjectผ่านok

- **Response:** 200; data มี bookingCancelMinutes, bookingMaxDurationHours, bookingMaxAdvanceDays, bookingOpenTime, bookingCloseTime, bookingCheckinEarlyMinutes, bookingCheckinLateMinutes, bookingReminderMinutes, roles และ bookingStatuses
- **กรณีไม่สำเร็จ:** 401เมื่อยังไม่ผ่านauthenticate
- **การเปลี่ยนข้อมูล / transaction:** ไม่querybusinessdata; การโหลดenvเกิดตอนimportก่อนrequest

## Uploads

<a id="handler-post-api-admin-uploads-images"></a>

### POST /api/admin/uploads/images

| หัวข้อ                           | รายละเอียด                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/uploads/uploads.routes.ts](../../src/modules/uploads/uploads.routes.ts#L24) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                |
| ค่าที่รับจาก request             | multipart req.fileจากfield image; MIME JPEG/PNG/WebP/GIF, สูงสุด5MB                                  |
| Prisma / helper / service ที่ใช้ | multer, upload.single, imageStorage.save, created                                                    |

ลำดับการทำงาน:

1. authenticateและrequireRole ADMIN
2. Multer memoryStorageรับไฟล์และfileFilterตรวจMIME
3. ไม่มีreq.fileส่ง400
4. imageStorage.saveสร้างUUID keyและPutObject
5. ส่งkey/urlที่ได้

- **Response:** 201; message=Image uploaded, data={key,url}
- **กรณีไม่สำเร็จ:** 400ไม่มีไฟล์/MIMEไม่รองรับ/ไฟล์เกิน5MB; SDKerrorส่งerrorHandler
- **การเปลี่ยนข้อมูล / transaction:** เขียนR2ทันที; ไม่สร้างหรือแก้Classroomในhandlerนี้

<a id="handler-delete-api-admin-uploads-images-key"></a>

### DELETE /api/admin/uploads/images/:key

| หัวข้อ                           | รายละเอียด                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/uploads/uploads.routes.ts](../../src/modules/uploads/uploads.routes.ts#L33) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                |
| ค่าที่รับจาก request             | req.params.key; req.userต้องADMIN                                                                    |
| Prisma / helper / service ที่ใช้ | imageStorage.remove, ok                                                                              |

ลำดับการทำงาน:

1. ส่งkeyให้imageStorage.removeตรวจbasename/patternและDeleteObject
2. รอSDKตอบสำเร็จ
3. ส่งdata null

- **Response:** 200; message=Image deleted, data=null
- **กรณีไม่สำเร็จ:** 400keyไม่ผ่าน; SDKerrorผ่านerrorHandler
- **การเปลี่ยนข้อมูล / transaction:** ลบR2object; ไม่อัปเดตimageUrlของClassroomที่อาจอ้างkeyนี้

## Admin dashboard

<a id="handler-get-api-admin-dashboard-summary"></a>

### GET /api/admin/dashboard/summary

| หัวข้อ                           | รายละเอียด                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-dashboard.routes.ts](../../src/modules/admin/admin-dashboard.routes.ts#L14) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                            |
| ค่าที่รับจาก request             | req.userต้องADMIN; ไม่มีqueryที่handlerใช้                                                                       |
| Prisma / helper / service ที่ใช้ | prisma.user.count, prisma.classroom.count/findUnique, prisma.booking.count/groupBy, jsonSafe, ok                 |

ลำดับการทำงาน:

1. นับusers/activeUsers/classrooms/bookingsและสถานะแต่ละกลุ่มแบบขนาน
2. todayBookingsนับรายการที่startAtอยู่ในวันไทยปัจจุบัน
3. groupBy classroomIdเลือกห้องที่มีbookingมากสุด1ห้อง
4. ถ้ามีอันดับโหลดห้องแล้วแนบbookingCount
5. ส่งสรุปทั้งหมด

- **Response:** 200; data={users,activeUsers,classrooms,bookings,pending,confirmed,inUse,completed,noShow,cancelled,todayBookings,mostBookedClassroom}
- **กรณีไม่สำเร็จ:** 401/403จากguard; databaseerrorผ่านerrorHandler
- **การเปลี่ยนข้อมูล / transaction:** อ่านข้อมูล; mostBookedClassroomเป็นnullเมื่อไม่มีอันดับ และไม่ได้จำกัดเฉพาะการจองสำเร็จ

<a id="handler-get-api-admin-dashboard-recent-bookings"></a>

### GET /api/admin/dashboard/recent-bookings

| หัวข้อ                           | รายละเอียด                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-dashboard.routes.ts](../../src/modules/admin/admin-dashboard.routes.ts#L93) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                            |
| ค่าที่รับจาก request             | req.query.limit integer1–100 default10                                                                           |
| Prisma / helper / service ที่ใช้ | prisma.booking.findMany, safeUser, jsonSafe, ok                                                                  |

ลำดับการทำงาน:

1. parse limit
2. booking.findManyเรียงcreatedAt descและtakeตามlimit
3. includeuserตามsafeUserและclassroom
4. ส่งรายการ

- **Response:** 200; data=Booking[]พร้อมuser/classroom ไม่มีpaginationmeta
- **กรณีไม่สำเร็จ:** 400limitไม่ผ่านschema
- **การเปลี่ยนข้อมูล / transaction:** อ่านรายการล่าสุด; ไม่กรองสถานะหรือช่วงวันที่

## Admin classrooms

<a id="handler-get-api-admin-classrooms"></a>

### GET /api/admin/classrooms

| หัวข้อ                           | รายละเอียด                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Source                           | [callback ใน src/modules/admin/admin-classrooms.routes.ts](../../src/modules/admin/admin-classrooms.routes.ts#L19) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                              |
| ค่าที่รับจาก request             | req.query.page/limit/search/building/status                                                                        |
| Prisma / helper / service ที่ใช้ | pageQuery, prisma.classroom.findMany/count, jsonSafe, ok                                                           |

ลำดับการทำงาน:

1. pageQuery.extend parsefilter
2. ประกอบwhere: searchค้นname, building/statusเทียบตรง
3. classroom.findMany/countแบบขนาน เรียงid desc
4. ส่งdataและmeta

- **Response:** 200; data=Classroom[], meta={page,limit,total}
- **กรณีไม่สำเร็จ:** 400query/statusไม่ผ่านschema
- **การเปลี่ยนข้อมูล / transaction:** อ่านข้อมูล; ต่างจากpubliclistที่มีfiltersและsortมากกว่า

<a id="handler-get-api-admin-classrooms-id"></a>

### GET /api/admin/classrooms/:id

| หัวข้อ                           | รายละเอียด                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Source                           | [callback ใน src/modules/admin/admin-classrooms.routes.ts](../../src/modules/admin/admin-classrooms.routes.ts#L48) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                              |
| ค่าที่รับจาก request             | req.params.id                                                                                                      |
| Prisma / helper / service ที่ใช้ | prisma.classroom.findUnique, safeUser, jsonSafe, ok                                                                |

ลำดับการทำงาน:

1. แปลงIDและโหลดห้อง
2. includebookingsเรียงstartAt descพร้อมuserตามsafeUser
3. ไม่พบส่ง404
4. ส่งห้องและประวัติ

- **Response:** 200; data=Classroomพร้อมbookings[]
- **กรณีไม่สำเร็จ:** 404ไม่พบห้อง
- **การเปลี่ยนข้อมูล / transaction:** อ่านข้อมูล; ไม่จำกัดจำนวนประวัติด้วยpaginationในhandlerนี้

<a id="handler-post-api-admin-classrooms"></a>

### POST /api/admin/classrooms

| หัวข้อ                           | รายละเอียด                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-classrooms.routes.ts](../../src/modules/admin/admin-classrooms.routes.ts#L66)    |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                                 |
| ค่าที่รับจาก request             | req.bodyตามclassroomInput: code/name/building/floor/capacity/description/categoryบังคับ; equipment?/imageUrl?/status? |
| Prisma / helper / service ที่ใช้ | classroomInput, newId, prisma.classroom.create, audit, jsonSafe, created                                              |

ลำดับการทำงาน:

1. classroomInput.parse
2. สร้างClassroomด้วยnewIdและequipmentเป็นPrismaJSON
3. audit CREATE/CLASSROOMพร้อมsnapshotใหม่
4. ส่งห้องที่สร้าง

- **Response:** 201; data=Classroom
- **กรณีไม่สำเร็จ:** 400schema; 409ข้อความUnique constraint โดยตอบClassroom code already exists
- **การเปลี่ยนข้อมูล / transaction:** เขียนClassroomแล้วAuditLogแยกคำสั่ง; ไม่อัปโหลดรูปให้จากimageUrl

<a id="handler-patch-api-admin-classrooms-id"></a>

### PATCH /api/admin/classrooms/:id

| หัวข้อ                           | รายละเอียด                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Source                           | [callback ใน src/modules/admin/admin-classrooms.routes.ts](../../src/modules/admin/admin-classrooms.routes.ts#L95) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                              |
| ค่าที่รับจาก request             | req.params.id; req.body partial classroomInput                                                                     |
| Prisma / helper / service ที่ใช้ | classroomInput.partial, prisma.classroom.findUnique/update, audit, jsonSafe, ok                                    |

ลำดับการทำงาน:

1. โหลดห้องเดิมก่อนและส่ง404หากไม่พบ
2. parsepartialbody
3. classroom.updateค่าที่ส่งและequipmentJSON
4. audit UPDATEพร้อมค่าเก่า/ใหม่
5. ส่งrecordล่าสุด

- **Response:** 200; message=Classroom updated, data=Classroom
- **กรณีไม่สำเร็จ:** 404ไม่พบ; 400schema; 409codeซ้ำจากข้อความUnique constraint
- **การเปลี่ยนข้อมูล / transaction:** updateและauditแยกคำสั่ง; เปลี่ยนimageUrlไม่ลบรูปเก่าอัตโนมัติ

<a id="handler-patch-api-admin-classrooms-id-status"></a>

### PATCH /api/admin/classrooms/:id/status

| หัวข้อ                           | รายละเอียด                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-classrooms.routes.ts](../../src/modules/admin/admin-classrooms.routes.ts#L120) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                               |
| ค่าที่รับจาก request             | req.params.id; req.body.status=ACTIVE/INACTIVE/MAINTENANCE                                                          |
| Prisma / helper / service ที่ใช้ | prisma.classroom.findUnique/update, z.nativeEnum, audit, jsonSafe, ok                                               |

ลำดับการทำงาน:

1. โหลดค่าเก่าและตรวจพบrecord
2. parseClassroomStatus
3. updateเฉพาะstatus
4. audit STATUS_CHANGE
5. ส่งห้องล่าสุด

- **Response:** 200; data=Classroom
- **กรณีไม่สำเร็จ:** 404ไม่พบห้อง; 400statusไม่ถูก
- **การเปลี่ยนข้อมูล / transaction:** ปิดห้องได้ด้วยINACTIVEโดยยังเก็บrecord/bookings; handlerไม่ได้เปลี่ยนสถานะbookingที่มีอยู่

<a id="handler-delete-api-admin-classrooms-id"></a>

### DELETE /api/admin/classrooms/:id

| หัวข้อ                           | รายละเอียด                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-classrooms.routes.ts](../../src/modules/admin/admin-classrooms.routes.ts#L144) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                               |
| ค่าที่รับจาก request             | req.params.id                                                                                                       |
| Prisma / helper / service ที่ใช้ | prisma.classroom.findUnique/delete, prisma.booking.count, managedImageKey, imageStorage.remove, audit, jsonSafe, ok |

ลำดับการทำงาน:

1. โหลดห้องเดิมและส่ง404หากไม่พบ
2. booking.countทุกสถานะตามclassroomId; ถ้ามีประวัติส่ง409
3. managedImageKeyเลือกkeyที่เป็นรูปของระบบ
4. ถ้ามีkeyเรียกimageStorage.remove; errorจากR2ใช้console.warnแล้วทำต่อ
5. classroom.deleteจริงแล้วaudit DELETEพร้อมoldValue
6. ส่งข้อมูลห้องก่อนลบ

- **Response:** 200; message=Classroom deleted, data=Classroomก่อนลบ
- **กรณีไม่สำเร็จ:** 404ไม่พบ; 409มีbooking; database/auditerrorผ่านerrorHandler; R2cleanupfailureถูกlogแต่ไม่บล็อกการลบ
- **การเปลี่ยนข้อมูล / transaction:** R2/ลบClassroom/auditเป็นคนละขั้นไม่มีtransactionร่วม; ต้องการเพียงปิดห้องให้ใช้PATCH status INACTIVE

## Admin bookings

<a id="handler-get-api-admin-bookings"></a>

### GET /api/admin/bookings

| หัวข้อ                           | รายละเอียด                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-bookings.routes.ts](../../src/modules/admin/admin-bookings.routes.ts#L25) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                          |
| ค่าที่รับจาก request             | req.query: page/limit/status/classroomId/userId/startDate/endDate/search                                       |
| Prisma / helper / service ที่ใช้ | adminBookingQuery, prisma.booking.findMany/count, safeUser, jsonSafe, ok                                       |

ลำดับการทำงาน:

1. adminBookingQuery.parse
2. ประกอบwhereตามสถานะ/ห้อง/ผู้ใช้และstartAt gte/lte
3. searchเป็นORของbookingCode/purpose/user.name/classroom.name
4. findMany/countพร้อมกันและincludefieldsuser/classroom
5. เรียงcreatedAtใหม่ก่อนแล้วตอบmeta

- **Response:** 200; data=Booking[]พร้อมuser/classroom, meta={page,limit,total}
- **กรณีไม่สำเร็จ:** 400queryไม่ผ่านschema
- **การเปลี่ยนข้อมูล / transaction:** อ่านการจองทุกผู้ใช้ตามfilter; ช่วงวันที่อิงเวลาเริ่มไม่ใช่overlap

<a id="handler-get-api-admin-bookings-id"></a>

### GET /api/admin/bookings/:id

| หัวข้อ                           | รายละเอียด                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-bookings.routes.ts](../../src/modules/admin/admin-bookings.routes.ts#L67) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                          |
| ค่าที่รับจาก request             | req.params.id                                                                                                  |
| Prisma / helper / service ที่ใช้ | prisma.booking.findUnique, prisma.auditLog.findMany, safeUser, jsonSafe, ok                                    |

ลำดับการทำงาน:

1. โหลดbookingพร้อมuser/classroom/approver
2. ไม่พบส่ง404
3. โหลดauditLogที่entity=BOOKINGและentityIdตรงกัน เรียงcreatedAt ascพร้อมผู้กระทำ
4. ส่งbookingรวมhistory

- **Response:** 200; data={...booking,history:AuditLog[]}
- **กรณีไม่สำเร็จ:** 404ไม่พบbooking
- **การเปลี่ยนข้อมูล / transaction:** อ่านBookingและAuditLogโดยไม่ได้ครอบreadtransactionเดียว

<a id="handler-patch-api-admin-bookings-id-approve"></a>

### PATCH /api/admin/bookings/:id/approve

| หัวข้อ                           | รายละเอียด                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source                           | [callback ใน src/modules/admin/admin-bookings.routes.ts](../../src/modules/admin/admin-bookings.routes.ts#L197)                                  |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                                                            |
| ค่าที่รับจาก request             | req.params.id; ไม่มีbodyบังคับ; req.user.idเป็นadminผู้กระทำ                                                                                     |
| Prisma / helper / service ที่ใช้ | changeBookingStatus, prisma.booking.findUnique, prisma.$transaction, tx.booking.update, tx.notification.create, tx.auditLog.create, jsonSafe, ok |

ลำดับการทำงาน:

1. parse ID/bodyตามaction
2. เรียกchangeBookingStatusซึ่งอ่านbookingและตรวจเงื่อนไข: ต้องเป็นPENDING และตรวจconflictกับCONFIRMED/IN_USE
3. ในserializable transaction updateเป็นCONFIRMEDและfield approvedBy/approvedAt
4. สร้างnotificationให้เจ้าของชนิดBOOKING_CONFIRMEDและauditพร้อมold/new snapshotsในtransactionเดียว
5. ส่งbookingที่อัปเดต

- **Response:** 200; message=Booking approved, data=Bookingหลังเปลี่ยนสถานะ
- **กรณีไม่สำเร็จ:** 404ไม่พบbooking; 409transitionไม่ผ่าน; 409เวลาชน
- **การเปลี่ยนข้อมูล / transaction:** booking/notification/auditเขียนในtransactionเดียว แต่precheckสถานะอ่านก่อนเข้าtransaction; ไม่มีserializable retry helperของฝั่งผู้ใช้

<a id="handler-patch-api-admin-bookings-id-reject"></a>

### PATCH /api/admin/bookings/:id/reject

| หัวข้อ                           | รายละเอียด                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source                           | [callback ใน src/modules/admin/admin-bookings.routes.ts](../../src/modules/admin/admin-bookings.routes.ts#L215)                                  |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                                                            |
| ค่าที่รับจาก request             | req.params.id; req.body.adminNote stringอย่างน้อย1ตัว; req.user.idเป็นadminผู้กระทำ                                                              |
| Prisma / helper / service ที่ใช้ | changeBookingStatus, prisma.booking.findUnique, prisma.$transaction, tx.booking.update, tx.notification.create, tx.auditLog.create, jsonSafe, ok |

ลำดับการทำงาน:

1. parse ID/bodyตามaction
2. เรียกchangeBookingStatusซึ่งอ่านbookingและตรวจเงื่อนไข: ต้องเป็นPENDING
3. ในserializable transaction updateเป็นREJECTEDและfield adminNote
4. สร้างnotificationให้เจ้าของชนิดBOOKING_REJECTEDและauditพร้อมold/new snapshotsในtransactionเดียว
5. ส่งbookingที่อัปเดต

- **Response:** 200; message=Booking rejected, data=Bookingหลังเปลี่ยนสถานะ
- **กรณีไม่สำเร็จ:** 404ไม่พบbooking; 409transitionไม่ผ่าน; 400bodyไม่ผ่านschema
- **การเปลี่ยนข้อมูล / transaction:** booking/notification/auditเขียนในtransactionเดียว แต่precheckสถานะอ่านก่อนเข้าtransaction; ไม่มีserializable retry helperของฝั่งผู้ใช้

<a id="handler-patch-api-admin-bookings-id-cancel"></a>

### PATCH /api/admin/bookings/:id/cancel

| หัวข้อ                           | รายละเอียด                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source                           | [callback ใน src/modules/admin/admin-bookings.routes.ts](../../src/modules/admin/admin-bookings.routes.ts#L235)                                  |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                                                            |
| ค่าที่รับจาก request             | req.params.id; req.body.reason? trimไม่ว่างเมื่อส่ง; req.user.idเป็นadminผู้กระทำ                                                                |
| Prisma / helper / service ที่ใช้ | changeBookingStatus, prisma.booking.findUnique, prisma.$transaction, tx.booking.update, tx.notification.create, tx.auditLog.create, jsonSafe, ok |

ลำดับการทำงาน:

1. parse ID/bodyตามaction
2. เรียกchangeBookingStatusซึ่งอ่านbookingและตรวจเงื่อนไข: ต้องเป็นPENDINGหรือCONFIRMED; ไม่ใช้cutoffของผู้ใช้
3. ในserializable transaction updateเป็นCANCELLEDและfield adminNote,cancelledAt,cancelReason
4. สร้างnotificationให้เจ้าของชนิดBOOKING_CANCELLEDและauditพร้อมold/new snapshotsในtransactionเดียว
5. ส่งbookingที่อัปเดต

- **Response:** 200; message=Booking cancelled, data=Bookingหลังเปลี่ยนสถานะ
- **กรณีไม่สำเร็จ:** 404ไม่พบbooking; 409transitionไม่ผ่าน; 400bodyไม่ผ่านschema
- **การเปลี่ยนข้อมูล / transaction:** booking/notification/auditเขียนในtransactionเดียว แต่precheckสถานะอ่านก่อนเข้าtransaction; ไม่มีserializable retry helperของฝั่งผู้ใช้

<a id="handler-patch-api-admin-bookings-id-start"></a>

### PATCH /api/admin/bookings/:id/start

| หัวข้อ                           | รายละเอียด                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source                           | [callback ใน src/modules/admin/admin-bookings.routes.ts](../../src/modules/admin/admin-bookings.routes.ts#L255)                                  |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                                                            |
| ค่าที่รับจาก request             | req.params.id; ไม่มีbodyบังคับ; req.user.idเป็นadminผู้กระทำ                                                                                     |
| Prisma / helper / service ที่ใช้ | changeBookingStatus, prisma.booking.findUnique, prisma.$transaction, tx.booking.update, tx.notification.create, tx.auditLog.create, jsonSafe, ok |

ลำดับการทำงาน:

1. parse ID/bodyตามaction
2. เรียกchangeBookingStatusซึ่งอ่านbookingและตรวจเงื่อนไข: ต้องเป็นCONFIRMED; ADMINstartไม่ได้ใช้check-in early/late window
3. ในserializable transaction updateเป็นIN_USEและfield checkedInAt
4. สร้างnotificationให้เจ้าของชนิดBOOKING_IN_USEและauditพร้อมold/new snapshotsในtransactionเดียว
5. ส่งbookingที่อัปเดต

- **Response:** 200; message=Booking started, data=Bookingหลังเปลี่ยนสถานะ
- **กรณีไม่สำเร็จ:** 404ไม่พบbooking; 409transitionไม่ผ่าน
- **การเปลี่ยนข้อมูล / transaction:** booking/notification/auditเขียนในtransactionเดียว แต่precheckสถานะอ่านก่อนเข้าtransaction; ไม่มีserializable retry helperของฝั่งผู้ใช้

<a id="handler-patch-api-admin-bookings-id-complete"></a>

### PATCH /api/admin/bookings/:id/complete

| หัวข้อ                           | รายละเอียด                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source                           | [callback ใน src/modules/admin/admin-bookings.routes.ts](../../src/modules/admin/admin-bookings.routes.ts#L273)                                  |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                                                            |
| ค่าที่รับจาก request             | req.params.id; ไม่มีbodyบังคับ; req.user.idเป็นadminผู้กระทำ                                                                                     |
| Prisma / helper / service ที่ใช้ | changeBookingStatus, prisma.booking.findUnique, prisma.$transaction, tx.booking.update, tx.notification.create, tx.auditLog.create, jsonSafe, ok |

ลำดับการทำงาน:

1. parse ID/bodyตามaction
2. เรียกchangeBookingStatusซึ่งอ่านbookingและตรวจเงื่อนไข: ต้องเป็นCONFIRMEDหรือIN_USE; ไม่ได้บังคับรอendAtในhandlerนี้
3. ในserializable transaction updateเป็นCOMPLETEDและfield completedAt
4. สร้างnotificationให้เจ้าของชนิดBOOKING_COMPLETEDและauditพร้อมold/new snapshotsในtransactionเดียว
5. ส่งbookingที่อัปเดต

- **Response:** 200; message=Booking completed, data=Bookingหลังเปลี่ยนสถานะ
- **กรณีไม่สำเร็จ:** 404ไม่พบbooking; 409transitionไม่ผ่าน
- **การเปลี่ยนข้อมูล / transaction:** booking/notification/auditเขียนในtransactionเดียว แต่precheckสถานะอ่านก่อนเข้าtransaction; ไม่มีserializable retry helperของฝั่งผู้ใช้

<a id="handler-patch-api-admin-bookings-id-no-show"></a>

### PATCH /api/admin/bookings/:id/no-show

| หัวข้อ                           | รายละเอียด                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source                           | [callback ใน src/modules/admin/admin-bookings.routes.ts](../../src/modules/admin/admin-bookings.routes.ts#L291)                                  |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                                                            |
| ค่าที่รับจาก request             | req.params.id; req.body.reason? stringอย่างน้อย1ตัวเมื่อส่ง; req.user.idเป็นadminผู้กระทำ                                                        |
| Prisma / helper / service ที่ใช้ | changeBookingStatus, prisma.booking.findUnique, prisma.$transaction, tx.booking.update, tx.notification.create, tx.auditLog.create, jsonSafe, ok |

ลำดับการทำงาน:

1. parse ID/bodyตามaction
2. เรียกchangeBookingStatusซึ่งอ่านbookingและตรวจเงื่อนไข: ต้องเป็นCONFIRMEDและstartAt<=now; ไม่ต้องรอlate cutoffเหมือนworker
3. ในserializable transaction updateเป็นNO_SHOWและfield completedAtและadminNoteถ้ามี
4. สร้างnotificationให้เจ้าของชนิดBOOKING_NO_SHOWและauditพร้อมold/new snapshotsในtransactionเดียว
5. ส่งbookingที่อัปเดต

- **Response:** 200; message=Booking marked no-show, data=Bookingหลังเปลี่ยนสถานะ
- **กรณีไม่สำเร็จ:** 404ไม่พบbooking; 409transitionไม่ผ่าน; 400bodyไม่ผ่านschema
- **การเปลี่ยนข้อมูล / transaction:** booking/notification/auditเขียนในtransactionเดียว แต่precheckสถานะอ่านก่อนเข้าtransaction; ไม่มีserializable retry helperของฝั่งผู้ใช้

## Admin users

<a id="handler-get-api-admin-users"></a>

### GET /api/admin/users

| หัวข้อ                           | รายละเอียด                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-users.routes.ts](../../src/modules/admin/admin-users.routes.ts#L19) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                    |
| ค่าที่รับจาก request             | req.query.page/limit/search/role/status                                                                  |
| Prisma / helper / service ที่ใช้ | pageQuery, prisma.user.findMany/count, safeUser, jsonSafe, ok                                            |

ลำดับการทำงาน:

1. pageQuery.extend parse
2. whereกรองrole/statusและsearch ORname/userCode/email
3. user.findMany/countแบบขนาน เรียงcreatedAt desc
4. selectsafeUserแล้วตอบmeta

- **Response:** 200; data=User[]ตามsafeUser, meta={page,limit,total}
- **กรณีไม่สำเร็จ:** 400query/enumไม่ผ่านschema
- **การเปลี่ยนข้อมูล / transaction:** อ่านUser ไม่ส่งpasswordHash/tokenVersionในselection

<a id="handler-post-api-admin-users"></a>

### POST /api/admin/users

| หัวข้อ                           | รายละเอียด                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-users.routes.ts](../../src/modules/admin/admin-users.routes.ts#L57) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                    |
| ค่าที่รับจาก request             | req.bodyตามadminUserInput: name/email/password>=8; userCode?/firstName?/lastName?/phone?/role?/status?   |
| Prisma / helper / service ที่ใช้ | adminUserInput, bcrypt.hash, newId, prisma.user.create, safeUser, audit, jsonSafe, created               |

ลำดับการทำงาน:

1. adminUserInput.parseและแยกpassword
2. hashcost12และuser.createพร้อมnewId/role/status
3. selectsafeUser
4. audit CREATE/USER
5. ส่งผู้ใช้ใหม่

- **Response:** 201; message=User created, data=UserตามsafeUser
- **กรณีไม่สำเร็จ:** 400schema; 409เมื่อข้อความerrorมีUnique constraint โดยตอบEmail already existsแม้constraintจริงอาจเป็นuserCode
- **การเปลี่ยนข้อมูล / transaction:** สร้างUserแล้วauditแยกคำสั่ง; roledefaultUSER/statusdefaultACTIVE

<a id="handler-get-api-admin-users-id"></a>

### GET /api/admin/users/:id

| หัวข้อ                           | รายละเอียด                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-users.routes.ts](../../src/modules/admin/admin-users.routes.ts#L80) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                    |
| ค่าที่รับจาก request             | req.params.id                                                                                            |
| Prisma / helper / service ที่ใช้ | prisma.user.findUnique, safeUser, jsonSafe, ok                                                           |

ลำดับการทำงาน:

1. user.findUniqueตามID
2. selectsafeUserและbookingsเรียงcreatedAt descพร้อมclassroom
3. ไม่พบส่ง404
4. ส่งโปรไฟล์พร้อมประวัติ

- **Response:** 200; data=Userพร้อมbookings[]
- **กรณีไม่สำเร็จ:** 404ไม่พบUser
- **การเปลี่ยนข้อมูล / transaction:** อ่านข้อมูล ไม่มีpaginationของประวัติในhandlerนี้

<a id="handler-patch-api-admin-users-id"></a>

### PATCH /api/admin/users/:id

| หัวข้อ                           | รายละเอียด                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Source                           | [callback ใน src/modules/admin/admin-users.routes.ts](../../src/modules/admin/admin-users.routes.ts#L99)           |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                              |
| ค่าที่รับจาก request             | req.params.id; req.body partial name/userCode/firstName/lastName/phone/email; optionalfieldsบางตัวรับnullเพื่อล้าง |
| Prisma / helper / service ที่ใช้ | Zod profile schema, prisma.user.findUnique/update, safeUser, audit, jsonSafe, ok                                   |

ลำดับการทำงาน:

1. parsepartialprofile
2. โหลดค่าเก่าด้วยsafeUserและส่ง404หากไม่พบ
3. user.updateเฉพาะprofileที่ส่งมา
4. audit UPDATE/USERพร้อมsnapshot
5. ส่งผู้ใช้ล่าสุด

- **Response:** 200; data=UserตามsafeUser
- **กรณีไม่สำเร็จ:** 400schema; 404ไม่พบUser; uniqueerrorไม่ได้map409เฉพาะในhandlerนี้
- **การเปลี่ยนข้อมูล / transaction:** แก้profileและauditแยก; role/status/passwordใช้endpointอื่น

<a id="handler-patch-api-admin-users-id-role"></a>

### PATCH /api/admin/users/:id/role

| หัวข้อ                           | รายละเอียด                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-users.routes.ts](../../src/modules/admin/admin-users.routes.ts#L133) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                     |
| ค่าที่รับจาก request             | req.params.id; req.body.role=USER/STUDENT/TEACHER/ADMIN                                                   |
| Prisma / helper / service ที่ใช้ | z.nativeEnum(Role), prisma.user.findUnique/count/update, safeUser, audit, jsonSafe, ok                    |

ลำดับการทำงาน:

1. parseIDและrole
2. โหลดuserเดิมตามsafeUserและส่ง404หากไม่พบ
3. ถ้าเดิมADMINแต่เปลี่ยนออก ให้นับACTIVE ADMINและส่ง409เมื่อ<=1
4. user.update role
5. audit ROLE_CHANGEและส่งข้อมูลล่าสุด

- **Response:** 200; data=UserตามsafeUser
- **กรณีไม่สำเร็จ:** 400roleไม่ถูก; 404ไม่พบ; 409Cannot change the last active admin
- **การเปลี่ยนข้อมูล / transaction:** writeUserแล้วaudit; count/precheck/updateไม่ได้อยู่transactionเดียวกัน; authenticateครั้งต่อไปจะอ่านroleใหม่นี้

<a id="handler-patch-api-admin-users-id-status"></a>

### PATCH /api/admin/users/:id/status

| หัวข้อ                           | รายละเอียด                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-users.routes.ts](../../src/modules/admin/admin-users.routes.ts#L163) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                     |
| ค่าที่รับจาก request             | req.params.id; req.body.status=ACTIVE/INACTIVE/SUSPENDED                                                  |
| Prisma / helper / service ที่ใช้ | prisma.user.findUnique/count/update, z.nativeEnum(UserStatus), audit, jsonSafe, ok                        |

ลำดับการทำงาน:

1. parseIDและstatus
2. โหลดuserเดิม
3. ถ้าเป้าหมายADMINและจะเปลี่ยนออกจากACTIVE นับactiveadminsแล้วกันกรณี<=1
4. updateสถานะ
5. audit STATUS_CHANGEแล้วตอบ

- **Response:** 200; data=UserตามsafeUser
- **กรณีไม่สำเร็จ:** 400statusไม่ถูก; 404ไม่พบ; 409Cannot deactivate the last active admin
- **การเปลี่ยนข้อมูล / transaction:** สถานะไม่ACTIVEทำให้authenticateครั้งต่อไปถูกปฏิเสธ; writeและauditแยกกัน

<a id="handler-patch-api-admin-users-id-reset-password"></a>

### PATCH /api/admin/users/:id/reset-password

| หัวข้อ                           | รายละเอียด                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-users.routes.ts](../../src/modules/admin/admin-users.routes.ts#L192) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                     |
| ค่าที่รับจาก request             | req.params.id; req.body.newPassword>=8                                                                    |
| Prisma / helper / service ที่ใช้ | bcrypt.hash, prisma.user.update, audit, ok                                                                |

ลำดับการทำงาน:

1. parseรหัสใหม่
2. hashด้วยcost12
3. user.updatepasswordHashโดยตรงตามID
4. audit RESET_PASSWORD
5. ส่งdata null

- **Response:** 200; message=Password reset, data=null
- **กรณีไม่สำเร็จ:** 400passwordไม่ผ่านschema; ไม่ได้findUnique/ส่ง404เอง หากupdateไม่พบจะเป็นPrismaerrorผ่านerrorHandler
- **การเปลี่ยนข้อมูล / transaction:** เปลี่ยนhashแล้วaudit; ไม่เพิ่มtokenVersionจึงไม่revokeJWTเดิมผ่านflowนี้

<a id="handler-delete-api-admin-users-id"></a>

### DELETE /api/admin/users/:id

| หัวข้อ                           | รายละเอียด                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-users.routes.ts](../../src/modules/admin/admin-users.routes.ts#L207) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                     |
| ค่าที่รับจาก request             | req.params.id                                                                                             |
| Prisma / helper / service ที่ใช้ | prisma.user.findUnique/count/update, audit, safeUser, jsonSafe, ok                                        |

ลำดับการทำงาน:

1. โหลดผู้ใช้เดิมด้วยsafeUserและส่ง404หากไม่พบ
2. ถ้าเป็นADMIN นับACTIVE ADMINแล้วกันกรณี<=1
3. user.update status INACTIVE
4. audit SOFT_DELETE/USERพร้อมค่าเก่าและใหม่
5. ส่งบัญชีที่ปิดแล้ว

- **Response:** 200; message=User deactivated, data=UserตามsafeUser
- **กรณีไม่สำเร็จ:** 404ไม่พบ; 409activeadminคนสุดท้าย
- **การเปลี่ยนข้อมูล / transaction:** softdeleteเก็บบัญชีและrelationsไว้; ไม่เรียกuser.delete

## Admin reports

<a id="handler-get-api-admin-reports-summary"></a>

### GET /api/admin/reports/summary

| หัวข้อ                           | รายละเอียด                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-reports.routes.ts](../../src/modules/admin/admin-reports.routes.ts#L145)         |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                                 |
| ค่าที่รับจาก request             | ไม่มีreportfilterที่handlerอ่าน; req.userต้องADMIN                                                                    |
| Prisma / helper / service ที่ใช้ | bangkokDateKey, shiftCalendarDate, prisma.user/classroom/booking.count, prisma.booking.groupBy/findMany, jsonSafe, ok |

ลำดับการทำงาน:

1. กำหนดtodayเป็นวันไทย และช่วงเจ็ดวันรวมวันนี้
2. นับUser/Classroom/Bookingทุกข้อมูลและgroupByสถานะ
3. โหลดstartAtที่เริ่มในช่วงกราฟ
4. เติมbucketที่ไม่มีรายการเป็นศูนย์
5. คำนวณcount/percentageทุกBookingStatus

- **Response:** 200; data={users,classrooms,bookings,byStatus,bookingsGraph:{timezone,startDate,endDate,data},statusPie:{total,data}}
- **กรณีไม่สำเร็จ:** 401/403จากguard; databaseerrorผ่านerrorHandler
- **การเปลี่ยนข้อมูล / transaction:** อ่านยอดรวมไม่กรองตามfilterหน้ารายงาน; เปอร์เซ็นต์0เมื่อbookings=0

<a id="handler-get-api-admin-reports-bookings"></a>

### GET /api/admin/reports/bookings

| หัวข้อ                           | รายละเอียด                                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-reports.routes.ts](../../src/modules/admin/admin-reports.routes.ts#L211)                                              |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                                                                      |
| ค่าที่รับจาก request             | req.query.startDate/endDate/status/classroomId/userId/userRole/building/floor/category/search ตามreportFilter; date-onlyเป็นวันไทยและขอบบนendDateexclusive |
| Prisma / helper / service ที่ใช้ | reportFilter, reportWhere, prisma.booking.findMany/groupBy, safeUser, jsonSafe, ok                                                                         |

ลำดับการทำงาน:

1. reportFilter.parseและreportWhereประกอบwhere
2. โหลดbookingที่overlapช่วงพร้อมclassroom/userและเรียงstartAt asc
3. groupByสถานะด้วยwhereเดียวกัน
4. ส่งtotalจากrows.lengthพร้อมbyStatusและrows

- **Response:** 200; data={total,byStatus,rows:Booking[]}; ไม่มีpage/limit
- **กรณีไม่สำเร็จ:** 400date/filter/ช่วงเวลาสลับไม่ผ่านschema
- **การเปลี่ยนข้อมูล / transaction:** อ่านรายงาน; rowsและgroupByแยกqueryจึงไม่ใช่snapshottransactionเดียว

<a id="handler-get-api-admin-reports-classrooms"></a>

### GET /api/admin/reports/classrooms

| หัวข้อ                           | รายละเอียด                                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-reports.routes.ts](../../src/modules/admin/admin-reports.routes.ts#L230)                                              |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                                                                      |
| ค่าที่รับจาก request             | req.query.startDate/endDate/status/classroomId/userId/userRole/building/floor/category/search ตามreportFilter; date-onlyเป็นวันไทยและขอบบนendDateexclusive |
| Prisma / helper / service ที่ใช้ | reportFilter, reportWhere, prisma.booking.findMany, Map, jsonSafe, ok                                                                                      |

ลำดับการทำงาน:

1. parsefilterและโหลดbookingพร้อมห้อง
2. groupในMapด้วยclassroomId
3. เพิ่มbookingCountและdurationเต็มของแต่ละรายการเป็นชั่วโมง
4. เรียงbookingCountมากก่อน

- **Response:** 200; data=[{classroom,bookingCount,totalHours}]
- **กรณีไม่สำเร็จ:** 400reportFilterไม่ผ่าน
- **การเปลี่ยนข้อมูล / transaction:** อ่านข้อมูล; totalHoursรวมระยะเต็มของbookingที่ผ่านfilter ไม่ตัดเฉพาะส่วนที่overlapช่วงรายงาน

<a id="handler-get-api-admin-reports-users"></a>

### GET /api/admin/reports/users

| หัวข้อ                           | รายละเอียด                                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-reports.routes.ts](../../src/modules/admin/admin-reports.routes.ts#L264)                                              |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                                                                      |
| ค่าที่รับจาก request             | req.query.startDate/endDate/status/classroomId/userId/userRole/building/floor/category/search ตามreportFilter; date-onlyเป็นวันไทยและขอบบนendDateexclusive |
| Prisma / helper / service ที่ใช้ | reportFilter, reportWhere, prisma.booking.groupBy, prisma.user.findMany, safeUser, jsonSafe, ok                                                            |

ลำดับการทำงาน:

1. parsefilter
2. booking.groupByuserIdพร้อมcountเรียงมากก่อน
3. โหลดuserที่อยู่ในgroupด้วยsafeUser
4. จับคู่groupกับuserแล้วส่ง

- **Response:** 200; data=[{user?,bookingCount}]
- **กรณีไม่สำเร็จ:** 400reportFilterไม่ผ่าน
- **การเปลี่ยนข้อมูล / transaction:** อ่านBooking/User; userอาจไม่ปรากฏในserializedrowเมื่อfindในผลqueryไม่พบ

<a id="handler-get-api-admin-reports-export"></a>

### GET /api/admin/reports/export

| หัวข้อ                           | รายละเอียด                                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source                           | [callback ใน src/modules/admin/admin-reports.routes.ts](../../src/modules/admin/admin-reports.routes.ts#L291)                                              |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                                                                      |
| ค่าที่รับจาก request             | req.query.startDate/endDate/status/classroomId/userId/userRole/building/floor/category/search ตามreportFilter; date-onlyเป็นวันไทยและขอบบนendDateexclusive |
| Prisma / helper / service ที่ใช้ | reportFilter, reportWhere, prisma.booking.findMany, escape, formatBangkokDateTime, res.type/attachment/send                                                |

ลำดับการทำงาน:

1. parsefilterแล้วโหลดbookingพร้อมclassroom/userเรียงstartAt asc
2. escapeแต่ละช่องด้วยdoublequotesและformatเวลาไทยพร้อมเดือนย่อไทย/ปีค.ศ.
3. ประกอบหัวตารางภาษาไทยและแถวข้อมูล
4. ตั้งtext/csvและattachmentfilenameรวมช่วงวันถ้ามี
5. ส่งเนื้อหาพร้อมUTF-8 BOM

- **Response:** 200; ไฟล์CSV (ไม่ใช้success/data JSON envelope)
- **กรณีไม่สำเร็จ:** 400reportFilterไม่ผ่าน; queryหรือformatfailureผ่านerrorHandler
- **การเปลี่ยนข้อมูล / transaction:** อ่านข้อมูลและสร้างข้อความCSVในmemory ไม่เขียนไฟล์ลงdiskและไม่แก้database

## Admin audit logs

<a id="handler-get-api-admin-audit-logs"></a>

### GET /api/admin/audit-logs

| หัวข้อ                           | รายละเอียด                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Source                           | [callback ใน src/modules/admin/admin-audit-logs.routes.ts](../../src/modules/admin/admin-audit-logs.routes.ts#L16) |
| สิทธิ์                           | ADMIN ที่ ACTIVE และผ่าน authenticate                                                                              |
| ค่าที่รับจาก request             | req.query.page/limit/userId/action/entity/startDate/endDate                                                        |
| Prisma / helper / service ที่ใช้ | pageQuery, prisma.auditLog.findMany/count, safeUser, jsonSafe, ok                                                  |

ลำดับการทำงาน:

1. parsefilterจากpageQuery.extend
2. whereกรองuserId/action/entityและcreatedAt gte/lte
3. auditLog.findMany/countแบบขนาน
4. เรียงcreatedAtใหม่ก่อนและincludeuserตามsafeUser
5. ส่งข้อมูลกับmeta

- **Response:** 200; data=AuditLog[]พร้อมuser, meta={page,limit,total}
- **กรณีไม่สำเร็จ:** 400queryไม่ผ่านschema
- **การเปลี่ยนข้อมูล / transaction:** อ่านAuditLog ไม่สร้างauditใหม่เมื่อเปิดดูรายการ

## Swagger UI ที่ mount ด้วย middleware

`app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument))` และ `/api-docs` เปิด UI สาธารณะจาก document เดียวกันและให้บริการ assets ภายใน path เหล่านั้น ไม่มีการ query หรือเขียน business data และไม่ได้หมายความว่า `/api-docs` คืน OpenAPI JSON โดยตรง

## วิธีใช้เอกสารนี้เมื่อต้องแก้ API

เปิด source ของ method/path ที่ต้องแก้ แล้วไล่ค่าที่รับและลำดับก่อน/หลัง write โดยเฉพาะ transaction กับ side effects หลัง commit เมื่อเปลี่ยน input, selection, status code หรือ error ให้แก้ทั้ง handler, swaggerDocument, HTTP tests และรายการในเอกสารนี้ เพื่อไม่ให้คำอธิบายฟังก์ชันกับสัญญา API แยกจากกัน
