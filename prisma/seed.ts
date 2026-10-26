import bcrypt from "bcryptjs";
import { BookingStatus, PrismaClient } from "@prisma/client";
import { env } from "../src/shared/config/env";

const prisma = new PrismaClient();

const bangkokDate = (daysFromToday: number) => {
  const value = new Date(Date.now() + daysFromToday * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
};

async function main() {
  const passwordHash = await bcrypt.hash("Demo1234!", 12);
  const admin = await prisma.user.upsert({
    where: { id: 1n },
    update: {
      userCode: "admin",
      name: "System Admin",
      firstName: "System",
      lastName: "Admin",
      email: env.ADMIN_EMAIL,
      phone: "0890000000",
      passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 12),
      role: "ADMIN",
      status: "ACTIVE",
    },
    create: {
      id: 1n,
      userCode: "admin",
      name: "System Admin",
      firstName: "System",
      lastName: "Admin",
      email: env.ADMIN_EMAIL,
      phone: "0890000000",
      passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 12),
      role: "ADMIN",
    },
  });
  const student = await prisma.user.upsert({
    where: { id: 2n },
    update: {
      userCode: "65010001",
      name: "ธนกร ใจดี",
      firstName: "ธนกร",
      lastName: "ใจดี",
      email: "student@university.ac.th",
      phone: "0891234501",
      passwordHash,
      role: "USER",
      status: "ACTIVE",
    },
    create: {
      id: 2n,
      userCode: "65010001",
      name: "ธนกร ใจดี",
      firstName: "ธนกร",
      lastName: "ใจดี",
      email: "student@university.ac.th",
      phone: "0891234501",
      passwordHash,
      role: "USER",
    },
  });

  const roomSeed = [
    ["A201", "ห้องเรียนอัจฉริยะ", "อาคารเรียนรวม A", "2", 40, "ห้องเรียน"],
    ["A202", "ห้องเรียนบรรยาย", "อาคารเรียนรวม A", "2", 60, "ห้องเรียน"],
    ["A203", "ห้องปฏิบัติการคอมพิวเตอร์", "อาคารเรียนรวม A", "2", 35, "ห้องปฏิบัติการ"],
    ["A301", "ห้องเรียนบรรยาย", "อาคารเรียนรวม A", "3", 50, "ห้องเรียน"],
    ["A302", "ห้องประชุมกลุ่มย่อย", "อาคารเรียนรวม A", "3", 12, "ห้องประชุม"],
    ["A303", "ห้องเรียนอัจฉริยะ", "อาคารเรียนรวม A", "3", 40, "ห้องเรียน"],
    ["B401", "ห้องปฏิบัติการภาษา", "อาคารวิทยบริการ B", "4", 30, "ห้องปฏิบัติการ"],
    ["B402", "ห้องสัมมนา", "อาคารวิทยบริการ B", "4", 25, "ห้องประชุม"],
    ["B403", "ห้องเรียนบรรยาย", "อาคารวิทยบริการ B", "4", 80, "ห้องเรียน"],
    ["B501", "ห้องประชุมใหญ่", "อาคารวิทยบริการ B", "5", 120, "ห้องประชุม"],
  ] as const;
  const rooms = [];
  for (const [index, item] of roomSeed.entries()) {
    const [code, name, building, floor, capacity, category] = item;
    const status = index === 5 ? "MAINTENANCE" : index === 9 ? "INACTIVE" : "ACTIVE";
    rooms.push(
      await prisma.classroom.upsert({
        where: { id: BigInt(index + 3) },
        update: {
          code,
          name,
          building,
          floor,
          capacity,
          category,
          description: "พื้นที่การเรียนรู้พร้อมอุปกรณ์ เหมาะสำหรับการเรียนและกิจกรรมกลุ่ม",
          equipment: ["Projector", "Whiteboard", "Wi-Fi", "Air Conditioner"],
          status,
        },
        create: {
          id: BigInt(index + 3),
          code,
          name,
          building,
          floor,
          capacity,
          category,
          description: "พื้นที่การเรียนรู้พร้อมอุปกรณ์ เหมาะสำหรับการเรียนและกิจกรรมกลุ่ม",
          equipment: ["Projector", "Whiteboard", "Wi-Fi", "Air Conditioner"],
          status,
        },
      }),
    );
  }

  const statuses: BookingStatus[] = [
    "PENDING",
    "CONFIRMED",
    "COMPLETED",
    "REJECTED",
    "CANCELLED",
    "CONFIRMED",
  ];
  for (let index = 0; index < statuses.length; index++) {
    const date = bangkokDate(index - 2);
    const hour = String(9 + (index % 3) * 2).padStart(2, "0");
    const startAt = new Date(`${date}T${hour}:00:00+07:00`);
    const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);
    await prisma.booking.upsert({
      where: { bookingCode: `DEMO-${index + 1}` },
      update: { startAt, endAt, status: statuses[index] },
      create: {
        id: BigInt(1001 + index),
        bookingCode: `DEMO-${index + 1}`,
        userId: student.id,
        classroomId: rooms[index % 5].id,
        purpose: "กิจกรรมการเรียนรู้ตัวอย่าง",
        attendeeCount: 10,
        requestedEquipment: ["Projector"],
        description: "ข้อมูลตัวอย่างสำหรับหน้า dashboard และรายงาน",
        startAt,
        endAt,
        status: statuses[index],
        ...(statuses[index] === "REJECTED" ? { adminNote: "ข้อมูลตัวอย่าง" } : {}),
      },
    });
  }

  await prisma.notification.upsert({
    where: { dedupeKey: `welcome:${student.id}` },
    update: {},
    create: {
      id: 9001n,
      userId: student.id,
      title: "ยินดีต้อนรับ",
      message: "ยินดีต้อนรับสู่ระบบจองห้องเรียน",
      type: "SYSTEM",
      dedupeKey: `welcome:${student.id}`,
    },
  });
  console.log({ admin: admin.email, student: student.email, rooms: rooms.length });
}

main().finally(() => prisma.$disconnect());
