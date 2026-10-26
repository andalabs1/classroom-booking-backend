import { env } from "../../shared/config/env";
import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/database/prisma";
import { newId } from "../../shared/utils/id";
import { jsonSafe } from "../../shared/utils/json";

// กัน reminder sweep ซ้อนเฉพาะ process นี้; การรันหลาย process อาศัย unique dedupeKey ในฐานข้อมูล
let running = false;

/**
 * ค้นหา CONFIRMED bookings ที่เริ่มหลัง now ภายในช่วงแจ้งเตือน แล้วสร้าง notification แบบ dedupe
 * คืนจำนวนแจ้งเตือนที่สร้างจริง หรือ 0 หาก reminder sweep ใน process นี้กำลังทำงาน
 */
export async function runBookingReminderSweep(now = new Date()) {
  if (running) return 0;
  running = true;
  try {
    const until = new Date(
      now.getTime() + env.BOOKING_REMINDER_MINUTES * 60_000,
    );
    const bookings = await prisma.booking.findMany({
      where: { status: "CONFIRMED", startAt: { gt: now, lte: until } },
      include: { classroom: { select: { name: true } } },
    });
    let created = 0;
    for (const booking of bookings) {
      const dedupeKey = `booking-reminder:${booking.id}`;
      const exists = await prisma.notification.findUnique({
        where: { dedupeKey },
      });
      if (exists) continue;
      try {
        await prisma.notification.create({
          data: {
            id: newId(),
            userId: booking.userId,
            bookingId: booking.id,
            title: "ใกล้ถึงเวลาใช้ห้อง",
            message:
              "อีกไม่เกิน " +
              env.BOOKING_REMINDER_MINUTES +
              " นาทีจะถึงเวลาใช้ห้อง " +
              booking.classroom.name,
            type: "BOOKING_REMINDER",
            dedupeKey,
          },
        });
        created++;
      } catch (error) {
        // อีก worker อาจสร้างหลัง findUnique ไปแล้ว จึงข้ามเฉพาะ unique conflict (P2002)
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002"
        )
          throw error;
      }
    }
    return created;
  } finally {
    // คืน guard แม้ query ล้มเหลว เพื่อให้รอบถัดไปยังทำงานได้
    running = false;
  }
}

/**
 * เปลี่ยน CONFIRMED ที่เลยเวลา check-in เป็น NO_SHOW และ IN_USE ที่หมดเวลาเป็น COMPLETED
 * บันทึก notification/audit หลังเปลี่ยนสำเร็จ และคืนจำนวน noShow/completed ที่เปลี่ยนจริง
 * แต่ละการเขียนเป็นคำสั่งแยกกัน; ข้อผิดพลาดอาจเกิดหลังเปลี่ยนสถานะไปแล้ว
 */
export async function runBookingLifecycleSweep(now = new Date()) {
  const noShowBefore = new Date(
    now.getTime() - env.BOOKING_CHECKIN_LATE_MINUTES * 60_000,
  );
  const [noShowCandidates, completionCandidates] = await Promise.all([
    prisma.booking.findMany({
      where: { status: "CONFIRMED", startAt: { lt: noShowBefore } },
    }),
    prisma.booking.findMany({
      where: { status: "IN_USE", endAt: { lte: now } },
    }),
  ]);
  let noShow = 0;
  let completed = 0;
  // updateMany ตรวจสถานะซ้ำตอนเขียน; สร้าง side effects เฉพาะรอบที่เปลี่ยนสถานะได้จริง
  // ใช้หลักเดียวกันกับ completionCandidates เพื่อไม่ทับการ check-in หรือสถานะที่เพิ่งเปลี่ยน
  for (const booking of noShowCandidates) {
    const result = await prisma.booking.updateMany({
      where: { id: booking.id, status: "CONFIRMED" },
      data: { status: "NO_SHOW", completedAt: now },
    });
    if (!result.count) continue;
    noShow++;
    await Promise.all([
      prisma.notification
        .create({
          data: {
            id: newId(),
            userId: booking.userId,
            bookingId: booking.id,
            title: "ไม่ได้ check-in",
            message: `Booking ${booking.bookingCode} ถูกบันทึกเป็น NO_SHOW`,
            type: "BOOKING_NO_SHOW",
            dedupeKey: `booking-no-show:${booking.id}`,
          },
        })
        .catch((error) => {
          if (
            !(error instanceof Prisma.PrismaClientKnownRequestError) ||
            error.code !== "P2002"
          )
            throw error;
        }),
      prisma.auditLog.create({
        data: {
          id: newId(),
          action: "NO_SHOW",
          entity: "BOOKING",
          entityId: booking.id,
          oldValue: jsonSafe(booking) as Prisma.InputJsonValue,
        },
      }),
    ]);
  }
  for (const booking of completionCandidates) {
    const result = await prisma.booking.updateMany({
      where: { id: booking.id, status: "IN_USE" },
      data: { status: "COMPLETED", completedAt: now },
    });
    if (!result.count) continue;
    completed++;
    await Promise.all([
      prisma.notification
        .create({
          data: {
            id: newId(),
            userId: booking.userId,
            bookingId: booking.id,
            title: "การใช้งานเสร็จสิ้น",
            message: `Booking ${booking.bookingCode} เสร็จสิ้นแล้ว`,
            type: "BOOKING_COMPLETED",
            dedupeKey: `booking-completed:${booking.id}`,
          },
        })
        .catch((error) => {
          if (
            !(error instanceof Prisma.PrismaClientKnownRequestError) ||
            error.code !== "P2002"
          )
            throw error;
        }),
      prisma.auditLog.create({
        data: {
          id: newId(),
          action: "COMPLETED",
          entity: "BOOKING",
          entityId: booking.id,
          oldValue: jsonSafe(booking) as Prisma.InputJsonValue,
        },
      }),
    ]);
  }
  return { noShow, completed };
}

/**
 * เริ่ม reminder/lifecycle sweep ทันที และเรียกซ้ำตาม REMINDER_POLL_INTERVAL_MS
 * บันทึก error ลง console โดยให้ interval ทำงานต่อ; คืน timer สำหรับ clearInterval
 */
export function startBookingReminderWorker() {
  /**
   * เรียกทั้งสอง sweep ในรอบเดียว โดยใช้ guard ของ reminder sweep จัดการการรันซ้อนของส่วนนั้น
   */
  const run = () =>
    Promise.all([runBookingReminderSweep(), runBookingLifecycleSweep()]);
  void run().catch((error) =>
    console.error("Booking background sweep failed", error),
  );
  const timer = setInterval(
    () =>
      void run().catch((error) =>
        console.error("Booking background sweep failed", error),
      ),
    env.REMINDER_POLL_INTERVAL_MS,
  );
  // ไม่ให้ interval เพียงตัวเดียวรั้ง process ไว้หลัง HTTP server ปิด
  timer.unref();
  return timer;
}
