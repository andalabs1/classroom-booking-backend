# ทะเบียนฟังก์ชันและตัวตรวจข้อมูลของ Backend

ฟังก์ชันของ API routes เป็น anonymous callbacks และอธิบายแยกอย่างละเอียดใน **[api-functions.md](./api-functions.md)** ครบ60 handlers ส่วนหน้านี้เป็นทะเบียน helper/service ที่มีชื่อ

[หน้าคู่มือ](./overview.md) · [ฟังก์ชัน](./functions.md) · [Services](./services.md) · [API](./api.md)

ครอบคลุมฟังก์ชันที่ตั้งชื่อใน `src/`, `prisma/seed.ts` และ test helpers รวมถึง method/interface ของ image storage ส่วน anonymous HTTP handlers ทั้งหมดแสดงใน [API contract](./api.md) callback ย่อยของ map/filter/Promise ไม่ถือเป็น public function แยก

ฟังก์ชันที่ไม่ได้ export ใช้ภายในไฟล์นั้น หากต้องใช้ข้ามโมดูลให้พิจารณาย้ายเป็น service/helper โดยรักษา input/output และขอบเขต transaction เดิม ลิงก์ชื่อฟังก์ชันพาไป source; เลขบรรทัดเป็นตำแหน่ง ณ วันที่จัดทำคู่มือ

## src/modules/admin/admin-audit.service.ts

[เปิด source](../../src/modules/admin/admin-audit.service.ts)

| ฟังก์ชัน                                                      | รับค่า                                                 | คืนค่า / ผลต่อระบบ                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| [`audit`](../../src/modules/admin/admin-audit.service.ts#L10) | userId, action, entity, entityId, oldValue?, newValue? | `Promise<AuditLog>`; เขียนผ่าน prisma กลาง และ jsonSafe snapshot เมื่อมีค่า |

## src/modules/admin/admin-bookings.routes.ts

[เปิด source](../../src/modules/admin/admin-bookings.routes.ts)

| ฟังก์ชัน                                                                      | รับค่า                     | คืนค่า / ผลต่อระบบ                                                                                     |
| ----------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| [`changeBookingStatus`](../../src/modules/admin/admin-bookings.routes.ts#L94) | id, adminId, status, note? | `Promise<Booking>`; precheck สถานะก่อน transaction, เขียน booking/notification/audit ภายใน transaction |

## src/modules/admin/admin-reports.routes.ts

[เปิด source](../../src/modules/admin/admin-reports.routes.ts)

| ฟังก์ชัน                                                                        | รับค่า                         | คืนค่า / ผลต่อระบบ                                                                  |
| ------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| [`reportDateBoundary`](../../src/modules/admin/admin-reports.routes.ts#L63)     | value: string, side: start/end | { date: Date, exclusive: boolean }; YYYY-MM-DD สิ้นวันแปลงเป็นต้นวันถัดไป           |
| [`reportWhere`](../../src/modules/admin/admin-reports.routes.ts#L75)            | ผล parse reportFilter          | Prisma.BookingWhereInput; รวม filters และเงื่อนไขทับช่วงเวลา                        |
| [`bangkokDateKey`](../../src/modules/admin/admin-reports.routes.ts#L128)        | value: Date                    | string YYYY-MM-DD ใน Asia/Bangkok                                                   |
| [`shiftCalendarDate`](../../src/modules/admin/admin-reports.routes.ts#L138)     | date: YYYY-MM-DD, days: number | วันที่หลังเลื่อนจำนวนวัน โดยคำนวณผ่าน UTC                                           |
| [`escape`](../../src/modules/admin/admin-reports.routes.ts#L302)                | value: unknown                 | ข้อความช่อง CSV ที่ครอบ quote และ escape quote ภายใน; เป็น helper ใน export handler |
| [`formatBangkokDateTime`](../../src/modules/admin/admin-reports.routes.ts#L321) | value: Date                    | ข้อความวัน/เดือนย่อไทย/ปี ค.ศ./HH:mm น.; helper ใน export handler                   |

## src/modules/bookings/booking-reminder.service.ts

[เปิด source](../../src/modules/bookings/booking-reminder.service.ts)

| ฟังก์ชัน                                                                                    | รับค่า                                     | คืนค่า / ผลต่อระบบ                                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| [`runBookingReminderSweep`](../../src/modules/bookings/booking-reminder.service.ts#L14)     | now = new Date()                           | `Promise<number>`; จำนวน notification ที่สร้างจริง; 0 หาก process นี้กำลัง sweep อยู่ |
| [`runBookingLifecycleSweep`](../../src/modules/bookings/booking-reminder.service.ts#L70)    | now = new Date()                           | `Promise<{ noShow, completed }>`; จำนวนสถานะที่ updateMany เปลี่ยนได้จริง             |
| [`startBookingReminderWorker`](../../src/modules/bookings/booking-reminder.service.ts#L169) | ไม่มี                                      | Node interval timer สำหรับ clearInterval; รันทันทีและเรียกซ้ำ พร้อม log error         |
| [`run`](../../src/modules/bookings/booking-reminder.service.ts#L173)                        | ไม่มี; local ใน startBookingReminderWorker | Promise ของผลสอง sweep ที่เรียกด้วย Promise.all                                       |

## src/modules/bookings/bookings.routes.ts

[เปิด source](../../src/modules/bookings/bookings.routes.ts)

| ฟังก์ชัน                                                                         | รับค่า                                             | คืนค่า / ผลต่อระบบ                                                                         |
| -------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`bangkokDate`](../../src/modules/bookings/bookings.routes.ts#L73)               | value: Date                                        | string วันที่ไทย; ใช้เป็น anchor ของ calendarRange                                         |
| [`shiftDate`](../../src/modules/bookings/bookings.routes.ts#L83)                 | date: YYYY-MM-DD, days: number                     | string วันปฏิทินหลังเลื่อนวัน                                                              |
| [`calendarRange`](../../src/modules/bookings/bookings.routes.ts#L92)             | view: daily/weekly/monthly, requestedDate?         | { anchor, startAt, endAt }; ช่วง [startAt,endAt) แบบวันไทย; วันที่ไม่จริงเป็น 400          |
| [`ensureTime`](../../src/modules/bookings/bookings.routes.ts#L127)               | startAt: Date, endAt: Date                         | void หรือ AppError 400; ตรวจอนาคต ระยะเวลา วันล่วงหน้า และเวลาเปิดในวันไทยเดียวกัน         |
| [`localParts`](../../src/modules/bookings/bookings.routes.ts#L151)               | value: Date; local ใน ensureTime                   | object ของ year/month/day/hour/minute จาก Intl parts ในเวลาไทย                             |
| [`requestedEquipmentData`](../../src/modules/bookings/bookings.routes.ts#L185)   | items: string[]                                    | Prisma.InputJsonValue; type assertion ของ array เดิม ไม่มี runtime transformation          |
| [`assertEquipmentAvailable`](../../src/modules/bookings/bookings.routes.ts#L191) | roomEquipment: JsonValue/null, requested: string[] | void หรือ 400 พร้อมรายการที่ขาด; เทียบชื่อแบบตรงตัว                                        |
| [`findConflict`](../../src/modules/bookings/bookings.routes.ts#L209)             | client, classroomId, startAt, endAt, excludeId?    | `Promise<Booking/null>`; ใช้ PENDING/CONFIRMED/IN_USE และรองรับ transaction client         |
| [`serializable`](../../src/modules/bookings/bookings.routes.ts#L231)             | operation: (tx) => `Promise<T>`                    | `Promise<T>`; retry เฉพาะ Prisma P2034 สูงสุดสาม attempts รวมครั้งแรก                      |
| [`canManageBooking`](../../src/modules/bookings/bookings.routes.ts#L255)         | requester: { id, role }, ownerId                   | boolean; เจ้าของหรือ ADMIN ตาม delegatedRoles                                              |
| [`resolveOwner`](../../src/modules/bookings/bookings.routes.ts#L263)             | requester, requestedUserId?                        | `Promise<bigint>`; ตรวจจองแทนและบัญชี ACTIVE; เงื่อนไขไม่ผ่านเป็น 403 หรือ 400             |
| [`bookingCodeFor`](../../src/modules/bookings/bookings.routes.ts#L284)           | id: bigint, date: Date                             | string BK-YYYYMMDD-ID โดยวันที่เป็นเวลาไทย                                                 |
| [`value`](../../src/modules/bookings/bookings.routes.ts#L294)                    | type: string; local ใน bookingCodeFor              | ส่วนวันจาก Intl parts หรือข้อความว่างเมื่อไม่พบ                                            |
| [`cancelBooking`](../../src/modules/bookings/bookings.routes.ts#L517)            | req ที่ผ่าน authenticate                           | `Promise<Booking>`; ตรวจเจ้าของ สถานะ cutoff และเขียน CANCELLED; ยังไม่บันทึก audit/notify |
| [`cancelAndNotify`](../../src/modules/bookings/bookings.routes.ts#L550)          | req ที่ผ่าน authenticate                           | `Promise<Booking>`; cancel → audit → notify; catch เฉพาะ notification failure              |

## src/modules/classrooms/classrooms.routes.ts

[เปิด source](../../src/modules/classrooms/classrooms.routes.ts)

| ฟังก์ชัน                                                               | รับค่า                     | คืนค่า / ผลต่อระบบ                            |
| ---------------------------------------------------------------------- | -------------------------- | --------------------------------------------- |
| [`ensureRange`](../../src/modules/classrooms/classrooms.routes.ts#L47) | startAt: Date, endAt: Date | void หรือ AppError 400 เมื่อ endAt <= startAt |

## src/modules/notifications/notification.service.ts

[เปิด source](../../src/modules/notifications/notification.service.ts)

| ฟังก์ชัน                                                                                 | รับค่า                                                                 | คืนค่า / ผลต่อระบบ                                                     |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`createNotification`](../../src/modules/notifications/notification.service.ts#L17)      | NotificationInput: userId, title, message, type; bookingId?/dedupeKey? | `Promise<Notification>`; สร้าง ID ใหม่และ record; error ส่งกลับ caller |
| [`notifyActiveAdmins`](../../src/modules/notifications/notification.service.ts#L24)      | NotificationInput ที่ไม่ต้องมี userId                                  | `Promise<void>`; สร้างให้ ADMIN/ACTIVE ทุกคนแบบขนาน                    |
| [`notifyBookingCreated`](../../src/modules/notifications/notification.service.ts#L40)    | booking: { id, userId, bookingCode }                                   | `Promise<void>`; เจ้าของ BOOKING_CREATED + admin BOOKING_PENDING       |
| [`notifyBookingUpdated`](../../src/modules/notifications/notification.service.ts#L66)    | booking: { id, userId, bookingCode }                                   | `Promise<void>`; เจ้าของและ admin BOOKING_UPDATED                      |
| [`notifyBookingCancelled`](../../src/modules/notifications/notification.service.ts#L91)  | booking: { id, userId, bookingCode }                                   | `Promise<void>`; เจ้าของและ admin BOOKING_CANCELLED                    |
| [`notifyBookingCheckedIn`](../../src/modules/notifications/notification.service.ts#L116) | booking: { id, userId, bookingCode }                                   | `Promise<void>`; เจ้าของและ admin BOOKING_IN_USE                       |

## src/modules/uploads/image-storage.service.ts

[เปิด source](../../src/modules/uploads/image-storage.service.ts)

| ฟังก์ชัน                                                                                | รับค่า                          | คืนค่า / ผลต่อระบบ                                                                         |
| --------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| [`ImageStorage.save`](../../src/modules/uploads/image-storage.service.ts#L18)           | file: Express.Multer.File       | `Promise<{ key, url }>`; interface contract ของการจัดเก็บรูป                               |
| [`ImageStorage.remove`](../../src/modules/uploads/image-storage.service.ts#L22)         | key: string                     | `Promise<void>`; interface contract ของการลบรูป                                            |
| [`resolveExtension`](../../src/modules/uploads/image-storage.service.ts#L42)            | mimetype: string                | นามสกุล .jpg/.png/.webp/.gif หรือ AppError 400                                             |
| [`assertSafeKey`](../../src/modules/uploads/image-storage.service.ts#L53)               | key: string                     | void หรือ 400; ต้องเป็น basename และตรง pattern ชื่อไฟล์รูปของระบบ                         |
| [`managedImageKey`](../../src/modules/uploads/image-storage.service.ts#L64)             | imageUrl: string/null/undefined | string key หรือ null; ตรวจ origin เทียบ public base, path ชั้นเดียว และ safe key           |
| [`resolveR2Endpoint`](../../src/modules/uploads/image-storage.service.ts#L83)           | ไม่มี; อ่าน env                 | URL endpoint ที่ตัด slash ท้าย หรือ 500 หากไม่มี endpoint/account                          |
| [`R2ImageStorage.constructor`](../../src/modules/uploads/image-storage.service.ts#L107) | ไม่มี; อ่าน env                 | R2ImageStorage instance; สร้าง S3 client แต่ยังไม่ส่ง network request                      |
| [`R2ImageStorage.save`](../../src/modules/uploads/image-storage.service.ts#L123)        | file: Express.Multer.File       | `Promise<{ key, url }>`; PutObject ด้วย UUID key, buffer, content type และ immutable cache |
| [`R2ImageStorage.remove`](../../src/modules/uploads/image-storage.service.ts#L143)      | key: string                     | `Promise<void>`; validate key แล้ว DeleteObject ใน bucket ของ env                          |

## src/shared/config/swagger.ts

[เปิด source](../../src/shared/config/swagger.ts)

| ฟังก์ชัน                                             | รับค่า                          | คืนค่า / ผลต่อระบบ                                                                 |
| ---------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| [`jsonBody`](../../src/shared/config/swagger.ts#L35) | schema: object, required = true | OpenAPI requestBody object สำหรับ application/json; ไม่ทำ validation ของ HTTP จริง |
| [`success`](../../src/shared/config/swagger.ts#L43)  | description = Success           | OpenAPI responses object สำหรับ 200 และ error refs; runtime status อยู่ที่ handler |

## src/shared/middlewares/auth.ts

[เปิด source](../../src/shared/middlewares/auth.ts)

| ฟังก์ชัน                                                     | รับค่า           | คืนค่า / ผลต่อระบบ                                                           |
| ------------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------- |
| [`authenticate`](../../src/shared/middlewares/auth.ts#L12)   | req, res, next   | `Promise<void>`; แนบ req.user หรือ next(AppError 401); อ่าน user ทุก request |
| [`requireRole`](../../src/shared/middlewares/auth.ts#L54)    | role: Role       | Express middleware ที่ใช้ requireAnyRole กับ role เดียว                      |
| [`requireAnyRole`](../../src/shared/middlewares/auth.ts#L59) | ...roles: Role[] | Express middleware; next เมื่อ role อยู่ในรายการ มิฉะนั้น 403                |

## src/shared/middlewares/error.ts

[เปิด source](../../src/shared/middlewares/error.ts)

| ฟังก์ชัน                                                            | รับค่า                                              | คืนค่า / ผลต่อระบบ                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| [`AppError.constructor`](../../src/shared/middlewares/error.ts#L12) | status: number, message: string, errors?: unknown[] | AppError พร้อมข้อมูลที่ errorHandler ใช้สร้าง response             |
| [`notFound`](../../src/shared/middlewares/error.ts#L23)             | req, res, next                                      | ส่ง AppError 404 ต่อไป; ไม่สร้าง response โดยตรง                   |
| [`errorHandler`](../../src/shared/middlewares/error.ts#L29)         | err, req, res, next                                 | ส่ง JSON error; Zod/Multer เป็น 400, ค่า status ของ error หรือ 500 |

## src/shared/utils/id.ts

[เปิด source](../../src/shared/utils/id.ts)

| ฟังก์ชัน                                   | รับค่า | คืนค่า / ผลต่อระบบ                                                                |
| ------------------------------------------ | ------ | --------------------------------------------------------------------------------- |
| [`newId`](../../src/shared/utils/id.ts#L5) | ไม่มี  | bigint = Date.now() * 1000 + random(0..999); database unique constraint ตรวจการชน |

## src/shared/utils/json.ts

[เปิด source](../../src/shared/utils/json.ts)

| ฟังก์ชัน                                        | รับค่า                                | คืนค่า / ผลต่อระบบ                                                                           |
| ----------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`jsonSafe`](../../src/shared/utils/json.ts#L5) | value: unknown ที่ JSON serialize ได้ | ข้อมูล JSON-compatible; BigInt เป็น string, Date เป็น ISO; undefined/circular ยังทำให้ throw |

## src/shared/utils/response.ts

[เปิด source](../../src/shared/utils/response.ts)

| ฟังก์ชัน                                            | รับค่า                              | คืนค่า / ผลต่อระบบ                                                  |
| --------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| [`ok`](../../src/shared/utils/response.ts#L6)       | res, data, message = Success, meta? | Express Response.json; คง status ปัจจุบันและเพิ่ม meta เมื่อ truthy |
| [`created`](../../src/shared/utils/response.ts#L16) | res, data, message = Created        | Express Response status 201 พร้อม success/message/data              |

## prisma/seed.ts

[เปิด source](../../prisma/seed.ts)

| ฟังก์ชัน                                 | รับค่า                                | คืนค่า / ผลต่อระบบ                                                                             |
| ---------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`bangkokDate`](../../prisma/seed.ts#L7) | daysFromToday: number                 | string YYYY-MM-DD ตามเวลาไทยเทียบกับวันนี้; ใช้สร้างวันที่ของ demo bookings                    |
| [`main`](../../prisma/seed.ts#L17)       | ไม่มี; entry point ของ prisma/seed.ts | `Promise<void>`; upsert demo users/rooms/bookings/welcome notification แล้ว finally disconnect |

## tests/helpers/auth.ts

[เปิด source](../../tests/helpers/auth.ts)

| ฟังก์ชัน                                             | รับค่า                    | คืนค่า / ผลต่อระบบ                                                                           |
| ---------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| [`activeUser`](../../tests/helpers/auth.ts#L10)      | role = STUDENT            | fixture ACTIVE/tokenVersion 0 สำหรับเทสต์                                                    |
| [`token`](../../tests/helpers/auth.ts#L21)           | id = 10, tokenVersion = 0 | JWT string ที่ sign ด้วย test env secret                                                     |
| [`authenticateAs`](../../tests/helpers/auth.ts#L27)  | role = STUDENT            | Bearer header string; stub user.findUnique ของเทสต์ให้คืน active fixture                     |
| [`mockTransaction`](../../tests/helpers/auth.ts#L37) | ไม่มี                     | Vitest spy ของ $transaction; callback ใช้ mock client เดียว ไม่มี transaction semantics จริง |

## tests/helpers/prisma.ts

[เปิด source](../../tests/helpers/prisma.ts)

| ฟังก์ชัน                                               | รับค่า       | คืนค่า / ผลต่อระบบ                                                         |
| ------------------------------------------------------ | ------------ | -------------------------------------------------------------------------- |
| [`fail`](../../tests/helpers/prisma.ts#L26)            | name: string | default stub ที่บันทึก unexpectedQueries และ throw; ใช้ในเทสต์เท่านั้น     |
| [`stub`](../../tests/helpers/prisma.ts#L34)            | name: string | vi.fn ที่ลงทะเบียนใน Map เพื่อ reset ภายหลัง                               |
| [`resetPrismaMock`](../../tests/helpers/prisma.ts#L61) | ไม่มี        | void; ล้าง unexpectedQueries และคืน default fail ของทุก stub ก่อนเทสต์ใหม่ |

## Bootstrap และ instance ที่มี side effect ตอน import

| ชื่อ / ไฟล์                                                                                     | หน้าที่และผลต่อระบบ                                                                        |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `app` / [app.ts](../../src/app.ts)                                                              | สร้าง Express app, ผูก middleware/router และ export default; import แล้วไม่ listen         |
| listener callback / [server.ts](../../src/server.ts)                                            | log URLs หลังเปิด port สำเร็จ และเริ่ม booking worker                                      |
| `env` / [env.ts](../../src/shared/config/env.ts)                                                | parse process.env ทันทีและ throw หาก configuration ไม่ครบ                                  |
| `prisma` / [database/prisma.ts](../../src/shared/database/prisma.ts)                            | instance PrismaClient กลาง; query จริงเกิดเมื่อเรียก delegate                              |
| `imageStorage` / [image-storage.service.ts](../../src/modules/uploads/image-storage.service.ts) | สร้าง R2ImageStorage ทันที; ต้องระบุ endpoint/account ได้ก่อน import app                   |
| `swaggerDocument` / [swagger.ts](../../src/shared/config/swagger.ts)                            | OpenAPI object ที่เขียนเอง; ไม่ใช่ route validation หรือ runtime response transformer      |
| `Express.Request.user` / [express.d.ts](../../src/shared/types/express.d.ts)                    | type augmentation ของ id: bigint, role: Role, email: string; middleware เป็นผู้เติมค่าจริง |

## Schema, constants และ selections ที่เกี่ยวกับสัญญาข้อมูล

| ที่มา                                                                          | ชื่อ                                        | เงื่อนไข / หน้าที่                                                                                                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [bookings.routes.ts](../../src/modules/bookings/bookings.routes.ts)            | `blockingStatuses`, `delegatedRoles`        | กันห้องด้วย PENDING/CONFIRMED/IN_USE; ผู้จัดการแทนมี ADMIN เท่านั้น                                                                               |
| ไฟล์เดียวกัน                                                                   | `equipmentSchema`, `bookingInput`           | อุปกรณ์สูงสุด 30 ชิ้น ค่าเริ่มต้น []; purpose 1–255, description <=5000, จำนวนคนบวก, coercion ของ ID/Date                                         |
| ไฟล์เดียวกัน                                                                   | `listQuery`                                 | page/limit, scope, view/date; date ต้องมี view และ view ใช้พร้อม custom range ไม่ได้                                                              |
| [classrooms.routes.ts](../../src/modules/classrooms/classrooms.routes.ts)      | `csvStrings`, `csvIds`, `rangeQuery`        | รับ comma/array, trim/ตัดค่าว่าง, จำกัดรายการไม่เกิน 100; rangeQuery รับ startAt/endAt                                                            |
| [auth.routes.ts](../../src/modules/auth/auth.routes.ts)                        | `registration`, `login`, `publicUser`       | register ต้องมี name หรือ firstName+lastName; role สมัครได้ USER/STUDENT/TEACHER; login ต้องมี username หรือ email; selection ไม่รวม passwordHash |
| [users.routes.ts](../../src/modules/users/users.routes.ts)                     | `publicUser`, schemas ภายใน handlers        | โปรไฟล์ที่เปิดเผยได้; update ใช้ partial fields; password ใหม่อย่างน้อย 8 ตัว                                                                     |
| [admin.schemas.ts](../../src/modules/admin/admin.schemas.ts)                   | `pageQuery`                                 | page เริ่ม 1, limit เริ่ม 20 และสูงสุด 100                                                                                                        |
| ไฟล์เดียวกัน                                                                   | `classroomInput`                            | code/name/building/floor/capacity/description/category ต้องมีตอนสร้าง; floor เป็นเลขบวกใน string; status default ACTIVE; imageUrl optional/null   |
| ไฟล์เดียวกัน                                                                   | `adminUserInput`                            | สร้างบัญชีต้องมี name/email/password; role default USER, status default ACTIVE; password >=8                                                      |
| ไฟล์เดียวกัน                                                                   | `safeUser`                                  | Prisma selection กลางของ admin; ไม่รวม passwordHash/tokenVersion                                                                                  |
| [admin-bookings.routes.ts](../../src/modules/admin/admin-bookings.routes.ts)   | `adminBookingQuery`                         | status, classroomId, userId, startDate/endDate และ search พร้อม pagination                                                                        |
| [admin-reports.routes.ts](../../src/modules/admin/admin-reports.routes.ts)     | `reportDate`, `reportFilter`                | ยืนยันวันจริงสำหรับ YYYY-MM-DD, parse ISO, cross-check range และตัวกรองรายงาน                                                                     |
| ไฟล์เดียวกัน                                                                   | `thaiMonths`                                | เดือนย่อภาษาไทยภายใน CSV handler; ปีในไฟล์ยังเป็น ค.ศ.                                                                                            |
| [common.ts](../../src/shared/validators/common.ts)                             | `idSchema`, `pagination`                    | shared Zod validators: BigInt บวก, page/limit default 1/20; source ปัจจุบัน route ส่วนใหญ่ประกาศ schema ของตนเอง                                  |
| [env.ts](../../src/shared/config/env.ts)                                       | `schema`                                    | กติกา environment ทั้งหมดใน [tech stack](./tech-stack.md#environment-variables)                                                                   |
| [uploads.routes.ts](../../src/modules/uploads/uploads.routes.ts)               | `upload` และ `fileFilter`                   | Multer memoryStorage, field image, 5 MB; MIME ที่รองรับ JPEG/PNG/WebP/GIF; MIME ไม่รองรับทำให้ไม่มี req.file และ handler ส่ง 400                  |
| [image-storage.service.ts](../../src/modules/uploads/image-storage.service.ts) | `extensionByMime`, `contentTypeByExtension` | mapping MIME/นามสกุลและค่า content type สำหรับ PutObject                                                                                          |

Schema ย่อยใน API อื่น เช่น notification query, admin status/role และ audit log filters อธิบาย input ที่รับใน [API contract](./api.md) การมี type ของ TypeScript อย่างเดียวไม่ได้ตรวจข้อมูลที่ผู้เรียกส่งมาตอน runtime

## ฟังก์ชันและขั้นตอนใน scripts

| ไฟล์ / ฟังก์ชัน                                                | Input → output                                                | การทำงานและขอบเขต                                                                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [export-local.cjs](../../scripts/export-local.cjs) / `main()`  | MySQL จาก env → snapshot directory                            | อ่าน SHOW CREATE TABLE ของ 5 models, อ่าน rows ใน RepeatableRead transaction, เขียน mysql.sql, เรียก Prisma diff และ Python restore; finally disconnect |
| ไฟล์เดียวกัน / `literal(value)`                                | ค่า SQL → SQL literal string                                  | null, number/BigInt, boolean, Date และ JSON; string ใช้ hex UTF-8 literal เพื่อลดปัญหา escaping                                                         |
| [prepare-dev.cjs](../../scripts/prepare-dev.cjs) / top-level   | DATABASE_URL → generated Prisma client                        | เลือก schema จาก file:/mysql:// และ exec Prisma generate; URL อื่นหรือ command fail ทำให้ exit nonzero                                                  |
| [start-local.cjs](../../scripts/start-local.cjs) / top-level   | sql_backup snapshots → tsx server process                     | เลือก directory ล่าสุดที่มี manifest, ตั้ง absolute file: URL ของ local.db, generate SQLite client และส่งสัญญาณ/exit code ระหว่าง process               |
| [restore-local.py](../../scripts/restore-local.py) / top-level | JSON stdin จาก exporter → local.db, sqlite.sql, manifest.json | ปฏิเสธการทับ local.db, สร้าง schema, แปลงชนิดและ INSERT ด้วย placeholders, ตรวจจำนวน/integrity/FK และ restore dump ลง memory เพื่อเทียบข้อมูล           |

`seed.main()` เป็นการ upsert ซึ่งแก้ข้อมูลที่ ID/code ตรงอยู่แล้ว ไม่ใช่เพียงเพิ่มแถวเมื่อว่าง รายละเอียดและคำสั่งใช้งานอยู่ใน [development](./development.md)
