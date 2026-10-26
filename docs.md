# คู่มือ Backend และฐานข้อมูลสำหรับ Local

Backend ใช้ Node.js, TypeScript, Express และ Prisma รองรับ MySQL และ SQLite
เอกสารนี้เน้นการนำข้อมูล MySQL มาใช้งานในเครื่อง พร้อม SQL สำหรับ restore
คำสั่งทั้งหมดให้รันจาก root ของโปรเจกต์ใน PowerShell

`npm run dev` จะสร้าง Prisma client ให้ตรงกับ `DATABASE_URL` ก่อนเปิด server
โดยเลือก MySQL schema เมื่อ URL เริ่มด้วย `mysql://` และ SQLite schema เมื่อเริ่มด้วย `file:`
หากต้องการใช้ snapshot ที่ export ไว้ ให้ใช้ `npm run dev:sqlite`

## 1. สิ่งที่ต้องเตรียม

- Node.js และ npm (งาน export นี้ใช้ Node.js 22)
- Python 3 ที่เรียกได้ด้วย `python` สำหรับสร้างและตรวจ SQLite โดยใช้ standard library
- ไฟล์ `.env` ที่ตั้งค่าตาม `.env.example` รวมถึง `DATABASE_URL`, JWT, admin และ storage configuration
- สิทธิ์เชื่อมต่อและอ่าน MySQL ต้นทาง เมื่อจะ export ข้อมูลชุดใหม่
- MySQL CLI หรือ SQLite CLI เฉพาะเมื่อจะ restore ผ่าน CLI ตามตัวอย่างด้านล่าง

ติดตั้ง dependencies:

```powershell
npm install
```

ไม่ต้องติดตั้ง SQLite server เพื่อใช้ `local.db`

## 2. เปิด Backend จาก snapshot ที่มีอยู่

```powershell
npm run dev:sqlite
```

คำสั่งนี้ค้นหาโฟลเดอร์ล่าสุดใน `sql_backup` ที่มี `manifest.json`, สร้าง Prisma
client สำหรับ SQLite แล้วเปิด backend ด้วย `local.db` ของโฟลเดอร์นั้น
ค่าการเชื่อมต่อ SQLite ถูกกำหนดเฉพาะ process โดยไม่แก้ `DATABASE_URL` ใน `.env`
ค่า environment อื่นยังอ่านจาก `.env` ตามปกติ

ค่าเริ่มต้นคือ port 3000 เปลี่ยนได้ด้วย `PORT` ใน `.env`
หยุด server ด้วย `Ctrl+C` ใน terminal ที่รันคำสั่ง
คำสั่งนี้ไม่เปิด watch mode; แก้โค้ดแล้วให้หยุดและรันใหม่

| จุดใช้งาน | URL เมื่อใช้ port 3000 |
| --- | --- |
| API Gateway | http://localhost:3000/ |
| Health check | http://localhost:3000/health |
| Swagger | http://localhost:3000/api-docs |
| รายการห้อง | http://localhost:3000/api/classrooms |
| Business APIs | http://localhost:3000/api |

ตรวจการทำงาน:

```powershell
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod http://localhost:3000/api/classrooms
```

Backend เปิด worker แจ้งเตือนและจัดการวงจรการจองพร้อม server ดังนั้นข้อมูลใน
`local.db` อาจเปลี่ยนหลังรัน เช่น สถานะการจองและการแจ้งเตือน
ไฟล์ `sqlite.sql` และ `mysql.sql` ยังคงเป็นข้อมูล ณ เวลา export

## 3. Export ข้อมูลล่าสุดจาก MySQL

หยุด backend ก่อนสลับ Prisma client ระหว่าง MySQL กับ SQLite
ตรวจว่า `DATABASE_URL` ใน `.env` ชี้ MySQL ต้นทางที่ต้องการ แล้วรัน:

```powershell
npm run prisma:generate
npm run db:export:local
npm run dev:sqlite
```

ต้องสร้าง MySQL client ด้วย `prisma:generate` ก่อน export ทุกครั้งที่เพิ่งใช้
SQLite เพราะทั้งสอง schema ใช้ตำแหน่ง generated client เดียวกัน
export อ่านข้อมูลต้นทางโดยไม่ seed, migrate หรือแก้ข้อมูล MySQL

ตารางที่ export คือ `User`, `Classroom`, `Booking`, `AuditLog` และ `Notification`
ไม่รวม `_prisma_migrations`, รูปภาพ, ไฟล์ uploads หรือข้อมูลใน object storage
URL รูปภาพที่เก็บในตารางจะยังเป็น URL เดิม

## 4. ไฟล์ที่ได้

```text
sql_backup/
  <UTC timestamp>/
    local.db
    sqlite.sql
    mysql.sql
    manifest.json
```

| ไฟล์ | การใช้งาน |
| --- | --- |
| `local.db` | SQLite พร้อม schema และข้อมูลสำหรับ backend |
| `sqlite.sql` | SQL schema และ INSERT สำหรับ restore เข้า SQLite |
| `mysql.sql` | SQL schema และ INSERT สำหรับ restore เข้า MySQL database ว่าง |
| `manifest.json` | จำนวนแถวแต่ละตารางและผลตรวจ SQLite |

ชื่อโฟลเดอร์ใช้เวลา UTC โดยตัว `Z` หมายถึง UTC
export แต่ละครั้งสร้างโฟลเดอร์ใหม่และไม่เขียนทับ snapshot เดิม
หาก export ล้มเหลว อาจเหลือโฟลเดอร์บางส่วนที่ไม่มี `manifest.json`
คำสั่ง `dev:sqlite` จะข้ามโฟลเดอร์เหล่านั้น

การตรวจสอบก่อนสร้าง manifest:

1. อ่านข้อมูลทุกตารางภายใน transaction MySQL ระดับ `RepeatableRead`
2. สร้าง SQLite และเทียบจำนวนแถวกับข้อมูลที่อ่านมา
3. ตรวจ `PRAGMA integrity_check` และ `PRAGMA foreign_key_check`
4. สร้าง SQL แล้ว restore เข้า SQLite ในหน่วยความจำ
5. เทียบจำนวนและค่าข้อมูลทุกแถวระหว่าง SQLite ที่สร้างกับฐานที่ restore

ผล `sql_restore: ok` ใน manifest หมายถึงการ restore **SQLite SQL**
ขั้นตอนนี้ยังไม่ได้ทดสอบ import `mysql.sql` กับ MySQL instance แยก

### Snapshot ที่สร้างเมื่อ 26 ตุลาคม 2026

โฟลเดอร์: `sql_backup/2026-10-26T11-17-00-412Z/` เวลา 18:17 น. ประเทศไทย

| ตาราง | จำนวนแถว ณ เวลา export |
| --- | ---: |
| User | 11 |
| Classroom | 5 |
| Booking | 2 |
| AuditLog | 105 |
| Notification | 60 |

## 5. Restore SQLite SQL

ใช้ SQLite CLI เปิดฐานข้อมูล **ไฟล์ใหม่** เพื่อไม่ให้ชนกับตารางเดิม:

```powershell
sqlite3 sql_backup/restored-local.db
```

จาก prompt ของ SQLite ให้รัน:

```sql
.read sql_backup/2026-10-26T11-17-00-412Z/sqlite.sql
PRAGMA integrity_check;
PRAGMA foreign_key_check;
SELECT COUNT(*) FROM "User";
.quit
```

`integrity_check` ควรคืน `ok` และ `foreign_key_check` ควรไม่มีแถวผลลัพธ์
เปลี่ยน path ของ `.read` เป็น snapshot ที่ต้องการ

หากจะรัน backend กับไฟล์ที่ restore เอง ใช้คำสั่งต่อไปนี้ใน PowerShell:

```powershell
$env:DATABASE_URL = 'file:../sql_backup/restored-local.db'
npm run prisma:generate:sqlite
npm run dev
```

path แบบ relative ของ SQLite อ้างอิงจากโฟลเดอร์ `prisma` ที่มี schema
ตัวแปร environment นี้มีผลใน terminal ปัจจุบัน และมีลำดับเหนือ `.env`
ล้าง override ก่อนกลับไปใช้ MySQL หรือ export:

```powershell
Remove-Item Env:DATABASE_URL
```

## 6. Restore SQL เข้า MySQL Local

เปิด MySQL CLI โดยให้ถามรหัสผ่าน:

```powershell
mysql -h 127.0.0.1 -u root -p
```

จาก prompt ของ MySQL สร้าง database ใหม่แล้ว import:

```sql
CREATE DATABASE classroom_booking_local CHARACTER SET utf8mb4;
USE classroom_booking_local;
SOURCE sql_backup/2026-10-26T11-17-00-412Z/mysql.sql;
SHOW TABLES;
SELECT COUNT(*) FROM `User`;
SELECT COUNT(*) FROM `Classroom`;
```

เปิด CLI จาก root ของโปรเจกต์เพื่อใช้ relative path ตามตัวอย่าง
ไฟล์ SQL ใช้กับ database ว่างและไม่ได้ลบตารางเดิมก่อน import
ตรวจจำนวนแถวเทียบ `manifest.json` หลัง import

หากต้องการรัน backend กับ MySQL local ให้ตั้ง `DATABASE_URL` ใน `.env`
เป็นฐาน local ที่เพิ่งสร้าง แล้วรัน:

```powershell
npm run prisma:generate
npm run dev
```

ไม่ต้อง seed ทับข้อมูลที่ import และอย่ารัน migration โดยอัตโนมัติบนฐานที่ restore
เนื่องจาก SQL backup นี้ไม่มีประวัติ `_prisma_migrations`

## 7. คำสั่งที่ใช้บ่อย

| คำสั่ง | หน้าที่ |
| --- | --- |
| `npm run prisma:generate` | สร้าง MySQL Prisma client |
| `npm run db:export:local` | อ่าน MySQL แล้วสร้าง SQLite และ SQL backup |
| `npm run dev:sqlite` | เปิด backend กับ snapshot SQLite ล่าสุดที่สำเร็จ |
| `npm run prisma:generate:sqlite` | สร้าง SQLite Prisma client สำหรับตั้งค่าเอง |
| `npm run dev` | เปิด backend แบบ watch โดยใช้ environment ปัจจุบัน |
| `npm run build` | compile TypeScript |

## 8. แก้ปัญหาเบื้องต้น

| อาการ | วิธีตรวจและแก้ |
| --- | --- |
| ไม่พบ snapshot หรือ `sql_backup` | export ให้สำเร็จก่อนรัน `dev:sqlite` |
| Prisma แจ้ง provider หรือ URL ไม่ตรง | หยุด server แล้ว generate client ให้ตรงกับ MySQL หรือ SQLite |
| ต่อ MySQL ไม่ได้ | ตรวจ host, port, credentials, firewall และสิทธิ์ network |
| Port 3000 ถูกใช้อยู่ | หยุด server เดิม หรือเปลี่ยน `PORT` ใน `.env` |
| `EPERM` ตอนติดตั้งหรือ generate | ตรวจสิทธิ์โฟลเดอร์และ process ที่ล็อกไฟล์ Prisma แล้วลองใหม่ |
| ไม่พบ `python` | ติดตั้ง Python 3 และเพิ่มคำสั่ง `python` ใน PATH |
| Export ไปผิดฐาน | ตรวจ override `$env:DATABASE_URL` และค่าใน `.env` |

โฟลเดอร์ `sql_backup` ถูก ignore จาก Git เพราะมีข้อมูลผู้ใช้และ password hashes
เก็บไฟล์สำรองในพื้นที่ที่จำกัดสิทธิ์ และไม่ใส่ credentials จริงลงในเอกสาร

ดูรายละเอียด business API เพิ่มเติมใน [README.md](README.md)
และ Swagger ของ backend ที่กำลังรัน
