# Classroom Reservation Backend

Node.js + TypeScript + Express + MySQL + Prisma REST API สำหรับระบบจองห้องเรียน

คู่มือรัน local, export ฐานข้อมูล และ restore SQLite/MySQL: [docs.md](docs.md)

`npm run dev` สร้าง Prisma client ให้ตรงกับ `DATABASE_URL` (`mysql://` หรือ `file:`)
ก่อนเปิด server อัตโนมัติ ส่วน `npm run dev:sqlite` ใช้ SQLite snapshot ล่าสุดที่ export สำเร็จ

## เริ่มใช้งานด้วย SQLite (Local)

SQLite ใช้ workflow แยกสำหรับ local โดยไม่กระทบ schema MySQL:

1. คัดลอก `.env.sqlite.example` เป็น `.env`
2. รัน `npm install`
3. รัน `npm run prisma:generate:sqlite`
4. รัน `npm run prisma:push:sqlite`
5. รัน `npm run prisma:seed:sqlite`
6. ใช้ `npm run dev`

ฐานข้อมูลจะถูกสร้างที่ `prisma/dev.db`

### สำรองข้อมูล MySQL มาใช้ในเครื่อง

เมื่อตั้ง `.env` ให้ชี้ MySQL ต้นทางแล้ว ให้รัน:

```powershell
npm run prisma:generate
npm run db:export:local
npm run dev:sqlite
```

แต่ละ snapshot อยู่ใน `sql_backup/<UTC timestamp>/` และมี `local.db`,
`sqlite.sql`, `mysql.sql` และ `manifest.json` พร้อมจำนวนแถวและผลตรวจสอบ
สคริปต์อ่านข้อมูล MySQL ภายใน transaction และตรวจ integrity, foreign keys
รวมทั้ง restore SQLite SQL แล้วเทียบข้อมูลทุกแถวก่อนยืนยันสำเร็จ
`mysql.sql` ใช้ import เข้า MySQL database ว่างในเครื่อง; `sqlite.sql` ใช้กับ SQLite
ทั้งสองไฟล์มี schema และข้อมูล ส่วน `dev:sqlite` เลือก snapshot ล่าสุดที่สำเร็จ
และรัน backend โดยไม่แก้ `.env` โดย worker ของ backend อาจปรับสถานะข้อมูลใน `local.db`
หลังเปิดใช้งาน ส่วนไฟล์ SQL ยังคงเป็น snapshot ตอน export
โฟลเดอร์ backup ไม่ถูกเก็บใน Git เพราะมีข้อมูลผู้ใช้และ password hashes
หากจะ export MySQL ใหม่หลังใช้ SQLite ให้รัน `npm run prisma:generate` ก่อนเสมอ

## เริ่มใช้งานด้วย MySQL

1. คัดลอก `.env.example` เป็น `.env` และตั้งค่า secrets/credentials
2. รัน `npm install`
3. Development ใช้ `npm run prisma:migrate`; production ใช้ `npm run prisma:deploy`; ฐานข้อมูลใหม่ใช้ `npm run prisma:seed`
4. ใช้ `npm run dev` หรือ `npm run build && npm start`

Swagger เปิดที่ `http://localhost:3000/api-docs`, health check อยู่ที่ `http://localhost:3000/health` และ business APIs อยู่ภายใต้ `/api`
ดู Database ER Diagram แบบ Mermaid ได้ที่ `docs/db-erd.md`

## Docker

`docker compose up --build`

ทุก response ใช้ `{ success, message, data, meta }`; error ใช้ `{ success:false, message, errors }`. Booking ที่ชนกันคืน 409 และใช้ transaction ตอนอนุมัติพร้อม audit/notification.

## Frontend API Path Guide

Base URL: http://localhost:3000/api

หลัง Login ให้เก็บ data.token และส่ง Header: Authorization: Bearer <token>

### 1. หน้าเข้าสู่ระบบ (Login)

    POST /api/auth/login
    Content-Type: application/json

Request: username (รับทั้งอีเมลหรือรหัสผู้ใช้งาน) และ password ระบบจะคืน data.token และ data.user

### 2. หน้าสมัครสมาชิก

    POST /api/auth/register
    Content-Type: application/json

Request:

    {
      "userCode": "65010001",
      "firstName": "สมชาย",
      "lastName": "ใจดี",
      "phone": "0891234567",
      "email": "student@example.com",
      "password": "Student12345",
      "role": "USER"
    }

Role ที่สมัครเองได้คือ USER, STUDENT และ TEACHER

### 3. หน้ารายการห้องเรียน (ไม่ต้อง Login)

    GET /api/classrooms?page=1&limit=20
    GET /api/classrooms?search=A101&building=Building%20A&minCapacity=30&page=1&limit=20

ใช้ data แสดงรหัสห้อง ชื่อห้อง อาคาร ชั้น จำนวนที่นั่ง รายละเอียด ประเภท อุปกรณ์ และสถานะ รองรับ filter `floor`, `category`, `status` และ `sort=code|capacity|name`

### 4. หน้าตารางการใช้ห้อง

ตรวจหลายห้องพร้อมกันและเลือกให้คืนเฉพาะห้องว่างได้:

    GET /api/classrooms/availability?startAt=2026-10-01T09:00:00.000Z&endAt=2026-10-01T10:00:00.000Z&classroomIds=3,4,5&availableOnly=true

โหลดตารางของห้องที่เลือก สูงสุดครั้งละ 31 วัน:

    GET /api/classrooms/schedule?startAt=2026-10-01T00:00:00.000Z&endAt=2026-10-08T00:00:00.000Z&classroomIds=3,4,5

ยังรองรับการตรวจทีละห้อง:

    GET /api/classrooms/{classroomId}/availability?startAt=2026-10-01T09:00:00.000Z&endAt=2026-10-01T10:00:00.000Z

ตรวจสอบ data.available หากเป็น false แปลว่าช่วงเวลานี้ถูกจองแล้ว

### 5. หน้าจองห้องเรียน

    POST /api/bookings

Request ต้องมี classroomId, purpose, attendeeCount, startAt และ endAt และส่ง `requestedEquipment` เป็นรายการอุปกรณ์ที่เลือกได้ ระบบตรวจความจุ อุปกรณ์ ระยะเวลาสูงสุด ระยะเวลาจองล่วงหน้า และเวลาชนก่อนบันทึก หากซ้ำคืน HTTP 409

ADMIN สามารถส่ง `userId` เพื่อจองแทนผู้ใช้อื่น และดูรายการทั้งหมดด้วย `GET /api/bookings?scope=all`

รายการจองรองรับมุมมองรายวัน รายสัปดาห์ (จันทร์-อาทิตย์) และรายเดือน โดยใช้วันอ้างอิงตามเวลา Asia/Bangkok:

    GET /api/bookings?view=daily&date=2026-09-20
    GET /api/bookings?view=weekly&date=2026-09-20
    GET /api/bookings?view=monthly&date=2026-09-20

หากไม่ส่ง `date` ระบบจะใช้วันปัจจุบัน และไม่สามารถใช้ `view` ร่วมกับ `startDate` หรือ `endDate` ได้

### 6. หน้ายืนยันการจอง

ใช้ข้อมูลจาก response ของ POST /api/bookings เพื่อแสดง bookingCode, ชื่อห้อง, วัตถุประสงค์, ช่วงเวลา และสถานะ PENDING

โหลดรายละเอียดซ้ำได้ด้วย:

    GET /api/bookings/{bookingId}

### 7. หน้าประวัติการจอง

    GET /api/users/me/bookings?page=1&limit=20

    # ออกจากระบบ ส่ง Bearer token; ระบบจะเพิ่ม tokenVersion เพื่อยกเลิก JWT เดิมทั้งหมดของบัญชี
    POST /api/auth/logout

    # รายการจอง: ค้นหา + แบ่งหน้า (search ครอบคลุมรหัส/วัตถุประสงค์/ห้อง/ผู้จอง)
    GET /api/bookings?search=A101&status=PENDING&page=1&limit=10

    # ADMIN: รายชื่อผู้ใช้ Active สำหรับเลือกจองแทน
    GET /api/users/directory?search=somchai&limit=100

    # ค่ากฎธุรกิจที่ Frontend ใช้แสดงผลและ validate เบื้องต้น
    GET /api/config/business-rules
    GET /api/bookings?page=1&limit=20&status=PENDING

ยกเลิกการจอง:

    PATCH /api/bookings/{bookingId}/cancel

Check-in เมื่อถึงช่วงเวลาใช้งาน:

    POST /api/bookings/{bookingId}/check-in

สถานะทั้งหมดคือ PENDING, CONFIRMED, IN_USE, COMPLETED, REJECTED, CANCELLED และ NO_SHOW

## Admin Frontend API Path Guide

ทุกหน้าส่วน Admin ต้องส่ง Header:

    Authorization: Bearer <admin-token>

ผู้ใช้ต้องมี role เป็น ADMIN มิฉะนั้น API จะคืน HTTP 403

### 8. หน้า Dashboard

สรุปข้อมูลหลัก:

    GET /api/admin/dashboard/summary

ข้อมูลที่ใช้แสดง:

- จำนวนผู้ใช้งานทั้งหมด
- จำนวนห้องเรียนทั้งหมด
- จำนวนการจองทั้งหมด
- จำนวนรายการรออนุมัติ
- จำนวนรายการ CONFIRMED
- จำนวนรายการ IN_USE, COMPLETED และ NO_SHOW
- จำนวนรายการ CANCELLED
- ห้องที่ถูกจองบ่อยที่สุด

รายการจองล่าสุด:

    GET /api/admin/dashboard/recent-bookings?limit=10

### 9. หน้าจัดการห้องเรียน

ดูห้องเรียนทั้งหมด รวม INACTIVE:

    GET /api/admin/classrooms

เพิ่มห้องเรียน:

    POST /api/admin/classrooms
    Content-Type: application/json

Request:

    {
      "name": "A101",
      "building": "Building A",
      "floor": "1",
      "capacity": 40,
      "equipment": ["Projector", "Whiteboard"]
    }

เปลี่ยนสถานะห้องเรียน:

    PATCH /api/admin/classrooms/{classroomId}/status

Request:

    {
      "status": "INACTIVE"
    }

### 10. หน้าจัดการการจอง

ดูรายการจองทั้งหมด:

    GET /api/admin/bookings

อนุมัติการจอง:

    PATCH /api/admin/bookings/{bookingId}/approve

ปฏิเสธการจอง:

    PATCH /api/admin/bookings/{bookingId}/reject
    Content-Type: application/json

Request:

    {
      "adminNote": "ช่วงเวลานี้ไม่ว่าง"
    }

เมื่ออนุมัติ ระบบจะตรวจสอบเวลาชน, บันทึกผู้อนุมัติ, สร้าง Notification และ Audit Log

ควบคุมวงจรการใช้งาน:

    PATCH /api/admin/bookings/{bookingId}/start
    PATCH /api/admin/bookings/{bookingId}/complete
    PATCH /api/admin/bookings/{bookingId}/no-show
    PATCH /api/admin/bookings/{bookingId}/cancel

### 11. หน้าจัดการผู้ใช้งาน

ดูผู้ใช้งานทั้งหมด:

    GET /api/admin/users

สร้างผู้ใช้ รวมถึง ADMIN:

    POST /api/admin/users

เปลี่ยนสถานะผู้ใช้งาน:

    PATCH /api/admin/users/{userId}/status
    Content-Type: application/json

Request:

    {
      "status": "INACTIVE"
    }

Role และ Status ที่รองรับ:

- Role: USER, STUDENT, TEACHER, ADMIN
- Status: ACTIVE, INACTIVE

### 12. หน้ารายงานและสถิติ

รายงานสรุป:

    GET /api/admin/reports/summary

Response ของ summary มี `bookingsGraph.data` สำหรับจำนวนการจองตามวันย้อนหลัง 7 วัน (นับจาก `startAt`) และ `statusPie.data` สำหรับจำนวนกับเปอร์เซ็นต์แยกตามสถานะ โดยใช้ timezone Asia/Bangkok

Export CSV สามารถระบุช่วงวันที่ (รวมวันสิ้นสุดตามเวลา Asia/Bangkok) และกรองตามสถานะ ห้อง ผู้ใช้ บทบาท อาคาร ชั้น ประเภทห้อง หรือคำค้นได้:

    GET /api/admin/reports/export?startDate=2026-09-01&endDate=2026-09-30&status=CONFIRMED&building=อาคารเรียนรวม%20A

ข้อมูลที่ใช้แสดง:

- จำนวนผู้ใช้งาน
- จำนวนห้องเรียน
- จำนวนการจองทั้งหมด
- จำนวนการจองแยกตามสถานะ

Audit Logs สำหรับตรวจสอบการเปลี่ยนแปลง:

    GET /api/admin/audit-logs

หน้า Admin ควรแสดง Loading, Empty State และ Error State และ refresh ข้อมูลหลัง Approve, Reject หรือเปลี่ยนสถานะสำเร็จ

## Image Upload

ปัจจุบันระบบเก็บรูปภาพไว้ที่ public/assets และเปิดอ่านผ่าน /assets/{filename}

อัปโหลดรูปภาพ (Admin):

    POST /api/admin/uploads/images
    Authorization: Bearer <admin-token>
    Content-Type: multipart/form-data
    Field name: image

รองรับ JPEG, PNG, WebP และ GIF ขนาดสูงสุด 5 MB ระบบจะคืน key และ url จากนั้นนำ url ไปบันทึกกับห้อง:

    PATCH /api/admin/classrooms/{classroomId}
    {
      "imageUrl": "http://localhost:3000/assets/example.webp"
    }

ลบรูป local:

    DELETE /api/admin/uploads/images/{key}

Storage abstraction อยู่ที่ src/services/image-storage.ts เมื่อต้องการใช้ Cloudflare R2 ให้สร้าง R2ImageStorage ที่ implements ImageStorage แล้วเลือก provider จาก STORAGE_DRIVER โดยไม่ต้องเปลี่ยน Upload Route

## In-App Notifications and Booking Reminders

รายการแจ้งเตือนของผู้ใช้:

    GET /api/notifications?page=1&limit=20
    GET /api/notifications?isRead=false
    GET /api/notifications/unread-count
    PATCH /api/notifications/{id}/read
    PATCH /api/notifications/read-all

ระบบสร้าง In-App Notification เมื่อสร้าง Booking, แก้ไข, ยกเลิก, อนุมัติ, ปฏิเสธ และใกล้ถึงเวลาใช้งาน

ตั้งเวลาแจ้งเตือนผ่าน environment:

    BOOKING_REMINDER_MINUTES=60
    REMINDER_POLL_INTERVAL_MS=60000
    BOOKING_CANCEL_MINUTES=120
    BOOKING_MAX_DURATION_HOURS=8
    BOOKING_MAX_ADVANCE_DAYS=90
    BOOKING_OPEN_TIME=06:00
    BOOKING_CLOSE_TIME=20:00
    BOOKING_CHECKIN_EARLY_MINUTES=30
    BOOKING_CHECKIN_LATE_MINUTES=30

Worker เริ่มพร้อม Backend โดยแจ้งเตือน Booking สถานะ CONFIRMED แบบไม่สร้างซ้ำ, เปลี่ยน CONFIRMED ที่ไม่ check-in เป็น NO_SHOW หลังพ้นช่วงเวลา และเปลี่ยน IN_USE เป็น COMPLETED เมื่อสิ้นสุดเวลา

Middleware ตรวจ Role และสถานะผู้ใช้กับฐานข้อมูลทุก request ดังนั้น token เก่าจะใช้ต่อไม่ได้ทันทีเมื่อผู้ใช้ถูกปิดบัญชีหรือถูกเปลี่ยน Role
