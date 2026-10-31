# API contract ของ Backend

ดู **[คำอธิบาย API functions ทีละ handler](./api-functions.md)** สำหรับ input, ลำดับทำงาน, Prisma/service, response, errors และผลข้างเคียงครบ60รายการ

[หน้าคู่มือ](./overview.md) · [ฟังก์ชัน](./functions.md) · [Services](./services.md) · [API](./api.md)

รายการนี้ตรวจจาก route registration ใน source ทั้ง 60 handlers รวม gateway/health เพิ่ม Swagger UI สองเส้นทางซึ่งใช้ app.use แยกไว้ท้ายส่วนต้น รายละเอียด validation ที่ runtime ใช้ดูจาก route/schema จริงควบคู่ [OpenAPI source](../../src/shared/config/swagger.ts)

## การเรียกและรูปแบบข้อมูล

- Base path สำหรับธุรกิจคือ `/api`; `/api` อย่างเดียวไม่มี handler ส่งรายการ endpoint และไม่มี prefix `/api/v1` แม้ข้อความ log เรียกว่า API v1
- ส่ง JSON ด้วย Content-Type application/json ยกเว้น upload ที่เป็น multipart/form-data
- route ที่ต้องเข้าสู่ระบบใช้ `Authorization: Bearer <token>`; role ใน token ไม่ใช้แทน role ล่าสุดใน database
- ID ใน JSON response ที่ผ่าน jsonSafe เป็น string เพื่อรักษาความแม่นยำของ BigInt ส่ง ID เป็นเลขฐานสิบใน string ได้
- วันเวลารับเป็นค่าที่ Date/Zod แปลงได้ ใช้ ISO ที่มี `Z` หรือ `+07:00` เพื่อระบุ timezone ชัดเจน
- Backend ใช้สถานะ CONFIRMED ไม่รับ APPROVED ซึ่งเป็นชื่อของ UI บางตัว

ตัวอย่าง response มาตรฐาน:

```json
{
  "success": true,
  "message": "Success",
  "data": [{ "id": "20" }],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```

`meta` มีเฉพาะ endpoint ที่คืน pagination/ข้อมูลเสริม Create ใช้ 201 ตาม created helper; query/update/action ส่วนใหญ่ใช้ 200; CSV export คืนไฟล์แทน JSON

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "purpose", "message": "..." }]
}
```

| Status | ความหมายตามโค้ด                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| 400    | Zod/Multer หรือกติกา input ไม่ผ่าน เช่น เวลา/ความจุ/อุปกรณ์                                                      |
| 401    | ไม่มี/ใช้ token ไม่ได้, บัญชีไม่ active, tokenVersion ไม่ตรง                                                     |
| 403    | role/การดูหรือจองแทนไม่อนุญาต                                                                                    |
| 404    | route/record ไม่พบ; booking ที่ไม่มีสิทธิ์จัดการใช้ 404 ด้วย                                                     |
| 409    | เวลาชน, สถานะไม่อนุญาต, cutoff, unique conflict บาง route, ลบห้องที่มี booking หรือแอดมินคนสุดท้าย               |
| 429    | login เกิน 20 requests ต่อ 15 นาทีตาม rate limiter; รูปแบบ response ของ middleware นี้อาจต่างจาก JSON error กลาง |
| 500    | error อื่นที่ไม่ได้แปลง status เช่น Prisma บางประเภทหรือ SDK failure                                             |

## รายการ endpoint ตาม source

สิทธิ์ “เข้าสู่ระบบ” หมายถึงบัญชี ACTIVE ที่ tokenVersion ตรง; สิทธิ์ ADMIN ยังต้องผ่าน authenticate ทุกครั้ง

### src/app.ts

[เปิด source](../../src/app.ts)

| Method | Path      | สิทธิ์  | หน้าที่                                                                     |
| ------ | --------- | ------- | --------------------------------------------------------------------------- |
| GET    | `/`       | สาธารณะ | ส่งข้อมูล API gateway และลิงก์ endpoint หลักให้ตรวจว่ากำลังเรียก service ใด |
| GET    | `/health` | สาธารณะ | ตอบสถานะการทำงานของ HTTP app โดยไม่ได้ query ฐานข้อมูลหรือ storage          |

### src/modules/admin/admin-audit-logs.routes.ts

[เปิด source](../../src/modules/admin/admin-audit-logs.routes.ts)

| Method | Path                    | สิทธิ์ | หน้าที่                                                                                  |
| ------ | ----------------------- | ------ | ---------------------------------------------------------------------------------------- |
| GET    | `/api/admin/audit-logs` | ADMIN  | ค้นหา/แบ่งหน้า audit logs ตามผู้กระทำ action entity และเวลาที่สร้าง พร้อมโปรไฟล์ผู้กระทำ |

### src/modules/admin/admin-bookings.routes.ts

[เปิด source](../../src/modules/admin/admin-bookings.routes.ts)

| Method | Path                               | สิทธิ์ | หน้าที่                                                                                 |
| ------ | ---------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| GET    | `/api/admin/bookings`              | ADMIN  | ให้ ADMIN ค้นหา/แบ่งหน้าการจองทุกผู้ใช้ พร้อมตัวกรองสถานะ ห้อง เจ้าของ และเวลาเริ่ม     |
| GET    | `/api/admin/bookings/:id`          | ADMIN  | คืน booking พร้อมผู้จอง ห้อง ผู้อนุมัติ และ audit history เรียงตามเวลา                  |
| PATCH  | `/api/admin/bookings/:id/approve`  | ADMIN  | อนุมัติ PENDING เป็น CONFIRMED ผ่าน changeBookingStatus ซึ่งตรวจเวลาชนภายใน transaction |
| PATCH  | `/api/admin/bookings/:id/reject`   | ADMIN  | ปฏิเสธ PENDING โดยบังคับ adminNote แล้วบันทึก REJECTED พร้อมแจ้งเตือนและ audit          |
| PATCH  | `/api/admin/bookings/:id/cancel`   | ADMIN  | ให้ ADMIN ยกเลิก PENDING/CONFIRMED พร้อมเหตุผลถ้ามี ผ่าน service เปลี่ยนสถานะ           |
| PATCH  | `/api/admin/bookings/:id/start`    | ADMIN  | ให้ ADMIN เปลี่ยน CONFIRMED เป็น IN_USE และบันทึก checkedInAt ผ่าน changeBookingStatus  |
| PATCH  | `/api/admin/bookings/:id/complete` | ADMIN  | ให้ ADMIN ปิด CONFIRMED หรือ IN_USE เป็น COMPLETED พร้อม completedAt                    |
| PATCH  | `/api/admin/bookings/:id/no-show`  | ADMIN  | ให้ ADMIN ทำเครื่องหมาย NO_SHOW เฉพาะ CONFIRMED ที่ถึงเวลาเริ่มแล้ว พร้อมเหตุผลถ้ามี    |

### src/modules/admin/admin-classrooms.routes.ts

[เปิด source](../../src/modules/admin/admin-classrooms.routes.ts)

| Method | Path                               | สิทธิ์ | หน้าที่                                                                         |
| ------ | ---------------------------------- | ------ | ------------------------------------------------------------------------------- |
| GET    | `/api/admin/classrooms`            | ADMIN  | ค้นหา/แบ่งหน้าห้องสำหรับ ADMIN ตามชื่อ อาคาร และสถานะ                           |
| GET    | `/api/admin/classrooms/:id`        | ADMIN  | คืนห้องพร้อมประวัติการจองและโปรไฟล์ผู้จอง หรือส่ง 404 เมื่อไม่พบ                |
| POST   | `/api/admin/classrooms`            | ADMIN  | สร้างห้องจาก schema ของ admin และบันทึก audit; รหัสห้องซ้ำส่ง 409               |
| PATCH  | `/api/admin/classrooms/:id`        | ADMIN  | แก้ฟิลด์ห้องที่ส่งมาและบันทึก snapshot ก่อน/หลังลง audit; รหัสห้องซ้ำส่ง 409    |
| PATCH  | `/api/admin/classrooms/:id/status` | ADMIN  | เปลี่ยนสถานะห้องตาม ClassroomStatus และบันทึก audit ของการเปลี่ยนแปลง           |
| DELETE | `/api/admin/classrooms/:id`        | ADMIN  | ลบห้องจริงเมื่อยังไม่มีประวัติการจอง เพื่อไม่ทำลายข้อมูล booking ที่อ้างถึงห้อง |

### src/modules/admin/admin-dashboard.routes.ts

[เปิด source](../../src/modules/admin/admin-dashboard.routes.ts)

| Method | Path                                   | สิทธิ์ | หน้าที่                                                                                      |
| ------ | -------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| GET    | `/api/admin/dashboard/summary`         | ADMIN  | รวมจำนวนผู้ใช้ ห้อง การจองแต่ละสถานะ รายการเริ่มวันนี้ตามเวลาไทย และห้องที่มีการจองมากที่สุด |
| GET    | `/api/admin/dashboard/recent-bookings` | ADMIN  | คืนการจองที่สร้างล่าสุดตาม limit พร้อมข้อมูลห้องและโปรไฟล์ผู้จองที่เลือกไว้                  |

### src/modules/admin/admin-reports.routes.ts

[เปิด source](../../src/modules/admin/admin-reports.routes.ts)

| Method | Path                            | สิทธิ์ | หน้าที่                                                                             |
| ------ | ------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| GET    | `/api/admin/reports/summary`    | ADMIN  | คืนยอดรวม กราฟจำนวน booking ตามวันเริ่มเจ็ดวันล่าสุดในเวลาไทย และสัดส่วนแต่ละสถานะ  |
| GET    | `/api/admin/reports/bookings`   | ADMIN  | คืนรายการจองและจำนวนแยกสถานะภายใต้ report filters ชุดเดียวกัน                       |
| GET    | `/api/admin/reports/classrooms` | ADMIN  | รวมจำนวนการจองและชั่วโมงตามระยะเวลาที่จองเต็มรายการ แยกตามห้องและเรียงจำนวนมากก่อน  |
| GET    | `/api/admin/reports/users`      | ADMIN  | รวมจำนวนการจองตามผู้ใช้ภายใต้ report filters แล้วแนบข้อมูลผู้ใช้ที่เลือกไว้         |
| GET    | `/api/admin/reports/export`     | ADMIN  | ส่ง CSV ภาษาไทยตาม report filters พร้อมเวลาไทยและ UTF-8 BOM สำหรับโปรแกรมตารางคำนวณ |

### src/modules/admin/admin-users.routes.ts

[เปิด source](../../src/modules/admin/admin-users.routes.ts)

| Method | Path                                  | สิทธิ์ | หน้าที่                                                                                  |
| ------ | ------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| GET    | `/api/admin/users`                    | ADMIN  | ค้นหา/แบ่งหน้าผู้ใช้ตามชื่อ รหัส email role และสถานะ โดยเลือกข้อมูลที่ไม่มี passwordHash |
| POST   | `/api/admin/users`                    | ADMIN  | สร้างบัญชีด้วย role/status ที่ admin กำหนด hash รหัสผ่าน และบันทึก audit                 |
| GET    | `/api/admin/users/:id`                | ADMIN  | คืนโปรไฟล์ผู้ใช้และประวัติการจองพร้อมห้อง โดยไม่เลือก passwordHash                       |
| PATCH  | `/api/admin/users/:id`                | ADMIN  | แก้เฉพาะข้อมูลโปรไฟล์ที่ส่งมา และบันทึก snapshot เก่า/ใหม่ลง audit                       |
| PATCH  | `/api/admin/users/:id/role`           | ADMIN  | เปลี่ยน role พร้อม audit โดยกันการลดสิทธิ์แอดมินเมื่อเหลือ active admin ไม่เกินหนึ่งคน   |
| PATCH  | `/api/admin/users/:id/status`         | ADMIN  | เปลี่ยนสถานะบัญชีพร้อม audit โดยกันการปิดแอดมินเมื่อเหลือ active admin ไม่เกินหนึ่งคน    |
| PATCH  | `/api/admin/users/:id/reset-password` | ADMIN  | ให้ ADMIN ตั้งรหัสผ่านใหม่ที่ผ่าน schema โดยเก็บเฉพาะ hash และบันทึก action ใน audit     |
| DELETE | `/api/admin/users/:id`                | ADMIN  | ปิดบัญชีเป็น INACTIVE แบบ soft delete พร้อม audit และตรวจเงื่อนไข active admin คนสุดท้าย |

### src/modules/auth/auth.routes.ts

[เปิด source](../../src/modules/auth/auth.routes.ts)

| Method | Path                 | สิทธิ์      | หน้าที่                                                                                               |
| ------ | -------------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/register` | สาธารณะ     | สมัคร USER/STUDENT/TEACHER ด้วยรหัสผ่านที่ hash แล้ว; คืนข้อมูลผู้ใช้ที่เลือกไว้โดยไม่มี passwordHash |
| POST   | `/api/auth/login`    | สาธารณะ     | ตรวจ email หรือ user code และรหัสผ่านของบัญชี ACTIVE ก่อนคืน JWT พร้อมข้อมูลผู้ใช้                    |
| POST   | `/api/auth/logout`   | เข้าสู่ระบบ | เพิกถอน JWT เดิมทุก session ของผู้ใช้ด้วยการเพิ่ม tokenVersion                                        |
| GET    | `/api/auth/me`       | เข้าสู่ระบบ | คืนข้อมูลบัญชีที่ผ่าน authenticate โดยเลือกเฉพาะฟิลด์โปรไฟล์ที่เปิดเผยได้                             |

### src/modules/bookings/bookings.routes.ts

[เปิด source](../../src/modules/bookings/bookings.routes.ts)

| Method | Path                         | สิทธิ์      | หน้าที่                                                                                                   |
| ------ | ---------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| POST   | `/api/bookings`              | เข้าสู่ระบบ | ตรวจผู้จอง ห้อง เวลา ความจุ อุปกรณ์ และรายการทับซ้อน ก่อนสร้าง booking ใน transaction และส่งแจ้งเตือน     |
| GET    | `/api/bookings`              | เข้าสู่ระบบ | ค้นหาและแบ่งหน้าการจองของตนเอง; scope=all และการกรอง userId ใช้ได้เฉพาะ delegated role                    |
| GET    | `/api/bookings/:id`          | เข้าสู่ระบบ | คืนรายละเอียดให้เจ้าของหรือผู้มี delegated role; ใช้ 404 เช่นเดียวกับไม่พบรายการเมื่อไม่มีสิทธิ์          |
| PATCH  | `/api/bookings/:id`          | เข้าสู่ระบบ | แก้เฉพาะ PENDING booking โดยตรวจค่าที่รวมกับข้อมูลเดิมใหม่ แล้วล้างข้อมูลอนุมัติและบันทึก audit/แจ้งเตือน |
| PATCH  | `/api/bookings/:id/cancel`   | เข้าสู่ระบบ | ยกเลิกการจองผ่าน cancelAndNotify พร้อมเก็บเหตุผล ประวัติ และแจ้งผู้เกี่ยวข้อง                             |
| DELETE | `/api/bookings/:id`          | เข้าสู่ระบบ | DELETE ใช้ยกเลิกเป็น CANCELLED เช่นเดียวกับ /cancel โดยเก็บ record และประวัติการจองไว้                    |
| POST   | `/api/bookings/:id/check-in` | เข้าสู่ระบบ | เปลี่ยน CONFIRMED เป็น IN_USE ภายในช่วง check-in ที่กำหนด และก่อนเวลาสิ้นสุด พร้อม audit/แจ้งเตือน        |

### src/modules/classrooms/classrooms.routes.ts

[เปิด source](../../src/modules/classrooms/classrooms.routes.ts)

| Method | Path                               | สิทธิ์  | หน้าที่                                                                                       |
| ------ | ---------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| GET    | `/api/classrooms`                  | สาธารณะ | ค้นหา/เรียงห้องแบบสาธารณะ แล้วกรองอุปกรณ์ก่อนแบ่งหน้าและคำนวณ total                           |
| GET    | `/api/classrooms/availability`     | สาธารณะ | คืนห้อง ACTIVE พร้อมรายการชนและ available ในช่วงที่เลือก; availableOnly ใช้ซ่อนห้องที่ไม่ว่าง |
| GET    | `/api/classrooms/schedule`         | สาธารณะ | คืนตารางใช้งานของห้อง ACTIVE แบบจัดกลุ่มตามห้อง โดยอนุญาตช่วงค้นหาสูงสุด 31 วัน               |
| GET    | `/api/classrooms/:id`              | สาธารณะ | คืนรายละเอียดห้องตาม ID แบบสาธารณะ หรือส่ง 404 เมื่อไม่พบ                                     |
| GET    | `/api/classrooms/:id/availability` | สาธารณะ | ตรวจห้อง ACTIVE รายห้องว่ามี PENDING/CONFIRMED/IN_USE ที่ทับช่วงหรือไม่ แล้วคืน available     |

### src/modules/config/config.routes.ts

[เปิด source](../../src/modules/config/config.routes.ts)

| Method | Path                         | สิทธิ์      | หน้าที่                                                                                         |
| ------ | ---------------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| GET    | `/api/config/business-rules` | เข้าสู่ระบบ | คืนกติกาจาก env และรายการ role/status ให้ frontend ใช้แสดงผลและตรวจฟอร์มของผู้ใช้ที่เข้าสู่ระบบ |

### src/modules/notifications/notifications.routes.ts

[เปิด source](../../src/modules/notifications/notifications.routes.ts)

| Method | Path                              | สิทธิ์      | หน้าที่                                                                                                  |
| ------ | --------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/api/notifications`              | เข้าสู่ระบบ | คืนแจ้งเตือนเฉพาะเจ้าของ พร้อมตัวกรองอ่าน/ยังไม่อ่านและข้อมูล booking ที่เกี่ยวข้อง                      |
| GET    | `/api/notifications/unread-count` | เข้าสู่ระบบ | คืนจำนวนแจ้งเตือนที่ยังไม่อ่านของผู้ใช้ปัจจุบัน                                                          |
| PATCH  | `/api/notifications/read-all`     | เข้าสู่ระบบ | ทำเครื่องหมายอ่านเฉพาะรายการของเจ้าของที่ยังไม่อ่าน และคืนจำนวนที่อัปเดต                                 |
| PATCH  | `/api/notifications/:id/read`     | เข้าสู่ระบบ | ตรวจเจ้าของก่อนทำเครื่องหมายอ่านรายรายการ; เก็บ readAt เดิมเมื่อเคยอ่านแล้ว และใช้ 404 หากไม่พบของผู้ใช้ |

### src/modules/uploads/uploads.routes.ts

[เปิด source](../../src/modules/uploads/uploads.routes.ts)

| Method | Path                             | สิทธิ์ | หน้าที่                                                                                          |
| ------ | -------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| POST   | `/api/admin/uploads/images`      | ADMIN  | รับ multipart field image สำหรับ ADMIN ขนาดไม่เกิน 5 MB แล้วส่ง buffer ไป storage และคืน key/URL |
| DELETE | `/api/admin/uploads/images/:key` | ADMIN  | ให้ ADMIN ลบรูปด้วย key ผ่าน storage; การตรวจ key และข้อผิดพลาด R2 จัดการใน service              |

### src/modules/users/users.routes.ts

[เปิด source](../../src/modules/users/users.routes.ts)

| Method | Path                     | สิทธิ์      | หน้าที่                                                                      |
| ------ | ------------------------ | ----------- | ---------------------------------------------------------------------------- |
| GET    | `/api/users/directory`   | ADMIN       | ให้ ADMIN ค้นหารายชื่อบัญชี ACTIVE สำหรับเลือกผู้ใช้ โดยคืนเฉพาะฟิลด์โปรไฟล์ |
| GET    | `/api/users/me`          | เข้าสู่ระบบ | โหลดโปรไฟล์ของผู้ใช้ที่ผ่าน authenticate และส่ง 404 หากไม่พบบัญชี            |
| PATCH  | `/api/users/me`          | เข้าสู่ระบบ | แก้เฉพาะฟิลด์โปรไฟล์ที่ส่งมาและผ่าน schema โดยใช้ ID จาก req.user            |
| PATCH  | `/api/users/me/password` | เข้าสู่ระบบ | ตรวจรหัสผ่านปัจจุบันก่อน hash และบันทึกรหัสผ่านใหม่ให้บัญชีตนเอง             |
| GET    | `/api/users/me/bookings` | เข้าสู่ระบบ | คืนประวัติการจองของผู้ใช้ปัจจุบัน พร้อมตัวกรองสถานะและข้อมูลแบ่งหน้า         |

Swagger UI เปิดแบบสาธารณะที่ `GET /docs/` และ `GET /api-docs/` ทั้งสองเป็น UI จาก document เดียวกัน ไม่ใช่ endpoint JSON ของ OpenAPI โดยตรง ปัจจุบันไม่มี route `/openapi.json`

## Auth และ user profile

| Endpoint                       | Body / query                                                              | สิ่งที่คืนหรือข้อกำหนด                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| POST /api/auth/register        | email, password >=8, name หรือ firstName+lastName; userCode?/phone?/role? | role รับ USER/STUDENT/TEACHER default STUDENT; ชื่อ <=150, userCode 3–50; phone 0 ตามด้วยเลข 8–9 หลัก; ไม่เลือก passwordHash กลับ |
| POST /api/auth/login           | password และ username หรือ email                                          | username มี @ ค้นด้วย email มิฉะนั้น userCode; ต้อง ACTIVE; คืน token และ user ที่ตัด passwordHash                                |
| POST /api/auth/logout          | ไม่ต้องมี body                                                            | เพิ่ม tokenVersion; ส่ง data null; token เดิมทุก session ใช้ไม่ได้                                                                |
| PATCH /api/users/me            | partial name/firstName/lastName/email/phone                               | name 1–150; ชื่อย่อย <=100 หรือ null; phone/email ตรวจรูปแบบ; field ที่ไม่ส่งคงเดิม                                               |
| PATCH /api/users/me/password   | currentPassword, newPassword >=8                                          | ตรวจ hash เดิมก่อนเปลี่ยน; path นี้ไม่เพิ่ม tokenVersion                                                                          |
| GET /api/users/directory       | search? <=150, limit 1–100 default100                                     | เฉพาะ ADMIN; คืนบัญชี ACTIVE เรียง name                                                                                           |
| GET /api/users/me/bookings     | status?, page?, limit?                                                    | รายการของ req.user เท่านั้น เรียง createdAt ใหม่ก่อน พร้อมห้อง                                                                    |
| GET /api/config/business-rules | ไม่มี                                                                     | คืน booking rules จาก env พร้อม roles และ bookingStatuses                                                                         |

GET `/api/auth/me` และ `/api/users/me` ใช้เลือกฟิลด์โปรไฟล์โดยไม่รวม passwordHash ส่วน `/api/users/me` มีเงื่อนไข 404 เมื่อ user หายหลัง authenticate; การแก้ชื่อย่อยไม่ได้ประกอบ name ให้ใหม่อัตโนมัติใน profile endpoint

## ห้องและช่วงเวลา

| Endpoint                             | Query                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| GET /api/classrooms                  | search, building, floor, category, status, minCapacity, equipment, sort, page, limit                            |
| GET /api/classrooms/availability     | startAt/endAt บังคับ; classroomIds?, building?, minCapacity?, equipment?, availableOnly=true/false defaultfalse |
| GET /api/classrooms/schedule         | startAt/endAt บังคับ; classroomIds?; ช่วงไม่เกิน 31 วัน                                                         |
| GET /api/classrooms/:id/availability | startAt/endAt บังคับ; ห้องต้อง ACTIVE                                                                           |

- `sort` เป็น code(default)/capacity/name; capacity เรียงมากก่อน
- classroomIds และ equipment รับ comma หรือ array ไม่เกิน 100 ค่า
- ถ้าไม่ส่ง status ให้รายการห้อง ไม่ได้บังคับกรองเฉพาะ ACTIVE แต่ availability/schedule อ่านเฉพาะ ACTIVE
- รายการห้องกรอง equipment ใน memory ก่อน paginate เพื่อให้ total ตรงผลที่กรอง
- endpoint availability หลายห้องคืน `{ startAt, endAt, rooms: [{ ...room, available, conflicts }] }`
- schedule คืน rooms พร้อม bookings เฉพาะ id/classroomId/startAt/endAt/status ไม่มี purpose หรือข้อมูลผู้จองใน selection
- ช่วง booking ที่กันห้องคือ PENDING/CONFIRMED/IN_USE และใช้เงื่อนไขทับซ้อนแบบไม่รวมขอบปลาย

## Booking payload และรายการค้นหา

POST บังคับ classroomId, purpose, attendeeCount, startAt, endAt; requestedEquipment default [] และส่ง description/userId เพิ่มได้ PATCH ใช้ partial payload ของ schema เดียวกัน

```json
{
  "classroomId": "20",
  "purpose": "เรียนกลุ่ม",
  "attendeeCount": 10,
  "requestedEquipment": ["Projector"],
  "description": "ใช้ประกอบกิจกรรม",
  "startAt": "2030-01-15T09:00:00+07:00",
  "endAt": "2030-01-15T10:00:00+07:00"
}
```

วันที่ตัวอย่างเป็นรูปแบบ payload เท่านั้น ต้องเปลี่ยนเป็นอนาคตที่อยู่ภายใน BOOKING_MAX_ADVANCE_DAYS ของวันที่เรียกจริง

| ฟิลด์              | เงื่อนไข                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| classroomId/userId | coercion เป็น BigInt บวก; userId ของผู้อื่นใช้ได้เฉพาะ ADMIN และต้อง ACTIVE                     |
| purpose            | trim, 1–255                                                                                     |
| attendeeCount      | integer บวกและไม่เกิน capacity ห้อง                                                             |
| requestedEquipment | array ชื่อที่ trim ไม่ว่าง <=100 ต่อชื่อ สูงสุด30; ต้องมีในห้องทุกชิ้น                          |
| description        | optional <=5000                                                                                 |
| startAt/endAt      | end > start, start ไม่ก่อน now, จำกัด duration/advance และอยู่ในวันไทยเดียวกันภายในเวลาเปิด/ปิด |

GET `/api/bookings` ใช้ search/status/page/limit, startDate/endDate หรือ view/date, scope=mine/all และ userId:

- default scope=mine ผูกกับ req.user; ต้องใช้ scope=all คู่กับ userId เมื่อ ADMIN ต้องการกรองคนอื่น หากส่ง userId แต่ยัง scope=mine จะยังใช้ ID ตัวเอง
- view เป็น daily/weekly/monthly; date เป็น YYYY-MM-DD ต้องใช้พร้อม view; ไม่มี date ใช้วันนี้ตามเวลาไทย
- weekly เริ่มจันทร์ calendar views คืนรายการที่ทับช่วงและ meta.startAt/endAt แบบ exclusive
- startDate/endDate แบบ custom กรองเวลาเริ่มแบบ gte/lte ไม่ใช่ overlap และใช้พร้อม view ไม่ได้
- page default1, limit default20 สูงสุด100; คืนเรียง createdAt ใหม่ก่อน

PATCH cancel และ DELETE booking ส่ง `{ "reason": "..." }` เพิ่มได้ เหตุผล trim 1–2000 ตัวเมื่อส่งมาและไม่ได้บังคับทุกครั้ง เงื่อนไขของ check-in และสถานะดู [services](./services.md)

## Admin payloads

| งาน                 | Input สำคัญ / ผล                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| สร้างห้อง           | code <=50, name/building <=100, floor string เลขบวก, capacity integer บวก, description 1–5000, category 1–100; equipment <=100 รายการ optional; imageUrl URL/null; status default ACTIVE |
| แก้ห้อง             | partial ของ classroomInput; เปลี่ยน imageUrl ไม่ได้ลบรูปเดิมให้อัตโนมัติ                                                                                                                 |
| เปลี่ยนสถานะห้อง    | `{ status: ACTIVE/INACTIVE/MAINTENANCE }`                                                                                                                                                |
| ลบห้อง              | ไม่มี body; booking.count ต้อง0ทุกสถานะ; พยายามลบรูปที่ managedImageKey ยอมรับ แล้ว delete record/audit; คืน oldValue พร้อมข้อความ Classroom deleted                                     |
| สร้างผู้ใช้         | name/email/password>=8; userCode?/firstName?/lastName?/phone?; role defaultUSER/status defaultACTIVE                                                                                     |
| แก้ผู้ใช้           | partial name/userCode/firstName/lastName/phone/email; ใช้ null ล้าง optional field ที่ schema อนุญาต                                                                                     |
| เปลี่ยน role/status | `{ role }` หรือ `{ status }`; guard ป้องกันเปลี่ยน/ปิด ADMIN เมื่อจำนวน active admins เหลือ <=1 ตามโค้ด                                                                                  |
| รีเซ็ตรหัสผ่าน      | `{ newPassword }` >=8; เก็บ hash และ audit; ไม่ได้เพิ่ม tokenVersion                                                                                                                     |
| DELETE ผู้ใช้       | soft delete เป็น INACTIVE พร้อม audit                                                                                                                                                    |
| อนุมัติ/เริ่ม/เสร็จ | ไม่มี body บังคับ; transition ตรวจใน changeBookingStatus                                                                                                                                 |
| ปฏิเสธ booking      | adminNote string อย่างน้อย1ตัว                                                                                                                                                           |
| Admin cancel        | reason string trim ไม่ว่างเมื่อส่ง; optional                                                                                                                                             |
| Admin no-show       | reason string อย่างน้อย1ตัวเมื่อส่ง; optional และ booking ต้องถึงเวลาเริ่มแล้ว                                                                                                           |
| Upload              | multipart field image, JPEG/PNG/WebP/GIF สูงสุด5 MB; คืน key/url                                                                                                                         |

GET admin classrooms กรอง search/building/status; users กรอง search/role/status; bookings กรอง search/status/classroomId/userId/startDate/endDate; audit-logs กรอง userId/action/entity/startDate/endDate ทั้งหมดใช้ page/limit default1/20 และคืน meta เวลาของ bookings list เป็นตัวกรอง startAt ส่วน audit ใช้ createdAt

## Reports และ CSV

`/api/admin/reports/bookings`, `/classrooms`, `/users`, `/export` ใช้ filters เดียวกัน:

- startDate/endDate: YYYY-MM-DD ที่เป็นวันจริง หรือข้อความ date-time ที่ Date parse ได้
- status, classroomId, userId, userRole
- building/floor/category, search
- ID ที่ระบุต้องบวก; search trim 1–255; room fields trim 1–100 ยกเว้น floor <=50
- ช่วงเวลารายงานเป็น overlap โดยวันที่ล้วนรวมทั้งวันไทย; endDate ISO ใช้เวลานั้นเป็น lte

summary ไม่รับ filters: คืน users/classrooms/bookings/byStatus, bookingsGraph ของเจ็ดวัน และ statusPie ของทุกสถานะ ส่วน export คืน `text/csv; charset=utf-8`, attachment filename พร้อมช่วงวันถ้ามี และ UTF-8 BOM

## Notifications

GET list ใช้ isRead=true/false, page/limit; ไม่ส่ง isRead หมายถึงทุกสถานะ คืนเฉพาะ userId ปัจจุบันและ include booking ที่เกี่ยวข้อง unread-count คืน `{ count }` ส่วน read-all คืน `{ updated }` การอ่านรายรายการคืน notification ล่าสุดโดยเก็บ readAt เดิมเมื่อเคยอ่านแล้ว

## ตัวอย่างทดสอบ API ในเครื่อง

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/classrooms
curl http://localhost:3000/api/users/me \
  -H 'Authorization: Bearer <TOKEN_ของบัญชีทดสอบ>'
```

OpenAPI เป็นเอกสารที่ดูแลด้วยมือ การเปลี่ยน route จึงต้องตรวจทั้ง document และ [HTTP tests](./testing.md) โดยเฉพาะ HTTP status, error body, field selection และ semantics ของ DELETE
