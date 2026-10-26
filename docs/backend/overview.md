# คู่มือพัฒนาต่อ: Backend

เอกสารนี้อ้างอิง backend ปัจจุบัน ซึ่งใช้ Express 5, TypeScript, Prisma 6 และ Vitest 5 โดยใช้ MySQL เป็น schema หลัก และมี SQLite สำหรับการพัฒนาในเครื่อง

- [โครงสร้างโฟลเดอร์และกติกาการเพิ่มโค้ด](./structure.md)
- [วิธีรันและเพิ่มชุดทดสอบ](./testing.md)
- [กระบวนการทำงานของระบบ](../business-system-flow.md)
- [แบบจำลองฐานข้อมูล](../db-erd.md)
- [รายละเอียด API เดิม](../../docs.md)

## เส้นทางการทำงาน

`src/server.ts` เริ่ม HTTP server และ background worker ส่วน `src/app.ts` ประกอบ Express middleware และ router โดยไม่เริ่ม worker การ import `app` จึงใช้ทดสอบ HTTP ผ่าน Supertest ได้

คำขอทั่วไปไหลผ่าน `app → module router → authenticate/requireRole (กรณีที่ต้องตรวจสิทธิ์) → validation → Prisma/service → response` ข้อผิดพลาดส่งเข้า `next(error)` และแปลงเป็น JSON ที่ error middleware ส่วน `/` และ `/health` ประกาศก่อน middleware หลัก

## โมดูลและขอบเขต

| โมดูล           | API หลัก             | หน้าที่                                                               |
| --------------- | -------------------- | --------------------------------------------------------------------- |
| `auth`          | `/api/auth`          | สมัครสมาชิก, เข้าสู่ระบบ, ออกจากระบบ, ตรวจผู้ใช้ปัจจุบัน              |
| `classrooms`    | `/api/classrooms`    | ค้นหาห้อง, ตรวจห้องว่าง, ตารางใช้งานแบบสาธารณะ                        |
| `bookings`      | `/api/bookings`      | จอง, แก้ไข, ยกเลิก, check-in และตรวจเงื่อนไขเวลา/อุปกรณ์              |
| `users`         | `/api/users`         | โปรไฟล์, เปลี่ยนรหัสผ่าน, ประวัติการจอง, directory สำหรับ admin       |
| `notifications` | `/api/notifications` | แจ้งเตือนของผู้ใช้, จำนวนที่ยังไม่อ่าน, ทำเครื่องหมายอ่าน             |
| `config`        | `/api/config`        | ส่งกติกาการจองให้ frontend                                            |
| `uploads`       | `/api/admin/uploads` | รับรูปในหน่วยความจำและส่งไป Cloudflare R2, ลบรูป                      |
| `admin`         | `/api/admin`         | dashboard, ห้อง, การอนุมัติ/สถานะ booking, ผู้ใช้, รายงาน, audit logs |

## Service สำคัญ

- `modules/bookings/booking-reminder.service.ts`: `runBookingReminderSweep()` สร้างแจ้งเตือนก่อนเวลาและป้องกันการรันซ้อนใน process เดียว; `runBookingLifecycleSweep()` เปลี่ยนรายการที่หมดเวลาเป็น `NO_SHOW` หรือ `COMPLETED`; `startBookingReminderWorker()` เรียกทันทีและตั้ง interval ที่ `unref()` ไว้
- `modules/notifications/notification.service.ts`: `createNotification()` บันทึกแจ้งเตือน; `notifyActiveAdmins()` ส่งถึง admin ที่ active; `notifyBookingCreated/Updated/Cancelled/CheckedIn()` แจ้งเจ้าของและ admin หลังเหตุการณ์จอง
- `modules/uploads/image-storage.service.ts`: `R2ImageStorage.save/remove()` สื่อสารกับ R2 ผ่าน S3 SDK; ตรวจ MIME และ key ก่อนส่งคำขอ; `imageStorage` เป็น instance ที่ upload router ใช้
- `modules/admin/admin-audit.service.ts`: `audit()` บันทึกผู้กระทำ, entity, action และค่าเก่า/ใหม่ โดยแปลง BigInt ก่อนเก็บ JSON

## จุดที่ต้องคำนึงเมื่อพัฒนาต่อ

- `shared/database/prisma.ts` สร้าง Prisma client กลาง ส่วน `shared/utils/id.ts` และ `json.ts` ใช้สร้าง ID/แปลง BigInt โดยไม่ต้อง import database
- JWT ตรวจผู้ใช้, สถานะ และ `tokenVersion` จากฐานข้อมูลทุกครั้ง สิทธิ์ใช้ role จากฐานข้อมูล การ logout เพิ่ม `tokenVersion` เพื่อยกเลิก token เดิม
- เงื่อนไขเวลาอ้างอิง `Asia/Bangkok` การสร้างและแก้ไข booking ใช้ serializable transaction พร้อม retry เมื่อ Prisma แจ้ง `P2034`
- การอนุมัติและเปลี่ยนสถานะโดย admin บันทึก booking, notification และ audit ภายใน transaction
- รูปจัดเก็บที่ R2 โดยตรง ไม่บันทึกลง local disk; ต้องตั้งค่า R2 ก่อน import แอปในการรันจริง
- เมื่อเพิ่ม endpoint ให้แก้ `shared/config/swagger.ts` และเพิ่ม HTTP tests ใน `tests/integration/`

เอกสารชุดนี้เป็นคู่มือโครงสร้างและการทดสอบปัจจุบัน โดยเก็บ root `README.md` ไว้ตามคำขอเดิมของโครงการ
