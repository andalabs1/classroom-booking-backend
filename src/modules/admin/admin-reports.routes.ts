import { Router } from "express";

import { BookingStatus, Prisma, Role } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../shared/database/prisma";
import { jsonSafe } from "../../shared/utils/json";
import { ok } from "../../shared/utils/response";

import { safeUser } from "./admin.schemas";

const r = Router();

const reportDate = z
  .string()
  .trim()
  .refine((value) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      // Date อาจเลื่อนวันที่ไม่มีจริงไปเดือนถัดไป จึงเทียบวันไทยกลับกับค่าที่รับมาอีกครั้ง
      const parsed = new Date(`${value}T00:00:00+07:00`);
      return (
        !Number.isNaN(parsed.getTime()) &&
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Bangkok",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(parsed) === value
      );
    }
    return !Number.isNaN(Date.parse(value));
  }, "Invalid date; use YYYY-MM-DD or an ISO 8601 date-time");
const reportFilter = z
  .object({
    startDate: reportDate.optional(),
    endDate: reportDate.optional(),
    status: z.nativeEnum(BookingStatus).optional(),
    classroomId: z.coerce.bigint().positive().optional(),
    userId: z.coerce.bigint().positive().optional(),
    userRole: z.nativeEnum(Role).optional(),
    building: z.string().trim().min(1).max(100).optional(),
    floor: z.string().trim().min(1).max(50).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    search: z.string().trim().min(1).max(255).optional(),
  })
  .superRefine((query, ctx) => {
    if (
      query.startDate &&
      query.endDate &&
      reportDateBoundary(query.startDate, "start").date >
        reportDateBoundary(query.endDate, "end").date
    )
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "endDate must be on or after startDate",
      });
  });
/**
 * แปลงวันที่ล้วนเป็นขอบเขตวันไทย หรือใช้เวลาจริงของ ISO ที่ระบุ
 * คืน date และ exclusive เพื่อให้ caller เลือกใช้ lt/lte กับขอบบนได้ถูกต้อง
 */
const reportDateBoundary = (value: string, side: "start" | "end") => {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!dateOnly) return { date: new Date(value), exclusive: false };
  // วันที่ล้วนรวมทั้งวันไทย โดยใช้ต้นวันถัดไปเป็นขอบบนแบบ exclusive; ISO ใช้เวลาที่ระบุโดยตรง
  const date = new Date(`${value}T00:00:00+07:00`);
  if (side === "end") date.setUTCDate(date.getUTCDate() + 1);
  return { date, exclusive: side === "end" };
};
/**
 * ประกอบ Prisma filters ของรายงาน และเลือก booking ที่ทับซ้อนช่วงเวลาที่ค้นหา
 * จึงรวมรายการที่เริ่มก่อนช่วงค้นหาแต่ยังไม่สิ้นสุดเมื่อเข้าช่วงด้วย
 */
const reportWhere = (
  q: z.infer<typeof reportFilter>,
): Prisma.BookingWhereInput => {
  const start = q.startDate ? reportDateBoundary(q.startDate, "start") : null;
  const end = q.endDate ? reportDateBoundary(q.endDate, "end") : null;
  return {
    ...(q.status ? { status: q.status } : {}),
    ...(q.classroomId ? { classroomId: q.classroomId } : {}),
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.userRole ? { user: { role: q.userRole } } : {}),
    ...(q.building || q.floor || q.category
      ? {
          classroom: {
            ...(q.building ? { building: q.building } : {}),
            ...(q.floor ? { floor: q.floor } : {}),
            ...(q.category ? { category: q.category } : {}),
          },
        }
      : {}),
    ...(start || end
      ? {
          AND: [
            ...(start ? [{ endAt: { gt: start.date } }] : []),
            ...(end
              ? [
                  {
                    startAt: end.exclusive
                      ? { lt: end.date }
                      : { lte: end.date },
                  },
                ]
              : []),
          ],
        }
      : {}),
    ...(q.search
      ? {
          OR: [
            { bookingCode: { contains: q.search } },
            { purpose: { contains: q.search } },
            { classroom: { code: { contains: q.search } } },
            { classroom: { name: { contains: q.search } } },
            { classroom: { building: { contains: q.search } } },
            { user: { name: { contains: q.search } } },
            { user: { email: { contains: q.search } } },
          ],
        }
      : {}),
  };
};
/**
 * แปลงเวลาเป็นคีย์วันไทย YYYY-MM-DD สำหรับจัดกลุ่มข้อมูลกราฟ
 */
const bangkokDateKey = (value: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
/**
 * เลื่อนคีย์วันตามจำนวนวันที่กำหนด เพื่อสร้างช่วงกราฟเจ็ดวันข้ามเดือน/ปีได้
 */
const shiftCalendarDate = (date: string, days: number) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
};
// คืนยอดรวม กราฟจำนวน booking ตามวันเริ่มเจ็ดวันล่าสุดในเวลาไทย และสัดส่วนแต่ละสถานะ
r.get("/reports/summary", async (_req, res, next) => {
  try {
    const today = bangkokDateKey(new Date());
    const graphStartDate = shiftCalendarDate(today, -6);
    const graphEndDate = shiftCalendarDate(today, 1);
    const graphStartAt = new Date(`${graphStartDate}T00:00:00+07:00`);
    const graphEndAt = new Date(`${graphEndDate}T00:00:00+07:00`);
    const [users, classrooms, bookings, byStatus, recentBookings] =
      await Promise.all([
        prisma.user.count(),
        prisma.classroom.count(),
        prisma.booking.count(),
        prisma.booking.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        prisma.booking.findMany({
          where: { startAt: { gte: graphStartAt, lt: graphEndAt } },
          select: { startAt: true },
        }),
      ]);
    const graphCounts = new Map<string, number>();
    for (const booking of recentBookings) {
      const date = bangkokDateKey(booking.startAt);
      graphCounts.set(date, (graphCounts.get(date) ?? 0) + 1);
    }
    const statusCounts = new Map(
      byStatus.map((item) => [item.status, item._count._all]),
    );
    const statusPie = Object.values(BookingStatus).map((status) => {
      const count = statusCounts.get(status) ?? 0;
      return {
        status,
        count,
        percentage: bookings
          ? Number(((count / bookings) * 100).toFixed(2))
          : 0,
      };
    });
    ok(
      res,
      jsonSafe({
        users,
        classrooms,
        bookings,
        byStatus,
        bookingsGraph: {
          timezone: "Asia/Bangkok",
          startDate: graphStartDate,
          endDate: today,
          data: Array.from({ length: 7 }, (_, index) => {
            const date = shiftCalendarDate(graphStartDate, index);
            return { date, count: graphCounts.get(date) ?? 0 };
          }),
        },
        statusPie: {
          total: bookings,
          data: statusPie,
        },
      }),
    );
  } catch (error) {
    next(error);
  }
});
// คืนรายการจองและจำนวนแยกสถานะภายใต้ report filters ชุดเดียวกัน
r.get("/reports/bookings", async (req, res, next) => {
  try {
    const q = reportFilter.parse(req.query);
    const rows = await prisma.booking.findMany({
      where: reportWhere(q),
      include: { classroom: true, user: { select: safeUser } },
      orderBy: { startAt: "asc" },
    });
    const byStatus = await prisma.booking.groupBy({
      by: ["status"],
      where: reportWhere(q),
      _count: { _all: true },
    });
    ok(res, jsonSafe({ total: rows.length, byStatus, rows }));
  } catch (error) {
    next(error);
  }
});
// รวมจำนวนการจองและชั่วโมงตามระยะเวลาที่จองเต็มรายการ แยกตามห้องและเรียงจำนวนมากก่อน
r.get("/reports/classrooms", async (req, res, next) => {
  try {
    const q = reportFilter.parse(req.query);
    const rows = await prisma.booking.findMany({
      where: reportWhere(q),
      include: { classroom: true },
    });
    const map = new Map<
      string,
      { classroom: unknown; bookingCount: number; totalHours: number }
    >();
    for (const row of rows) {
      const key = row.classroomId.toString();
      const item = map.get(key) || {
        classroom: row.classroom,
        bookingCount: 0,
        totalHours: 0,
      };
      item.bookingCount++;
      item.totalHours +=
        (row.endAt.getTime() - row.startAt.getTime()) / 3600000;
      map.set(key, item);
    }
    ok(
      res,
      jsonSafe(
        [...map.values()].sort((a, b) => b.bookingCount - a.bookingCount),
      ),
    );
  } catch (error) {
    next(error);
  }
});
// รวมจำนวนการจองตามผู้ใช้ภายใต้ report filters แล้วแนบข้อมูลผู้ใช้ที่เลือกไว้
r.get("/reports/users", async (req, res, next) => {
  try {
    const q = reportFilter.parse(req.query);
    const groups = await prisma.booking.groupBy({
      by: ["userId"],
      where: reportWhere(q),
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
    });
    const users = await prisma.user.findMany({
      where: { id: { in: groups.map((g) => g.userId) } },
      select: safeUser,
    });
    ok(
      res,
      jsonSafe(
        groups.map((group) => ({
          user: users.find((user) => user.id === group.userId),
          bookingCount: group._count._all,
        })),
      ),
    );
  } catch (error) {
    next(error);
  }
});
// ส่ง CSV ภาษาไทยตาม report filters พร้อมเวลาไทยและ UTF-8 BOM สำหรับโปรแกรมตารางคำนวณ
r.get("/reports/export", async (req, res, next) => {
  try {
    const q = reportFilter.parse(req.query);
    const rows = await prisma.booking.findMany({
      where: reportWhere(q),
      include: { classroom: true, user: { select: safeUser } },
      orderBy: { startAt: "asc" },
    });
    /**
     * ครอบค่า CSV ด้วย double quote และ escape quote ภายใน; null/undefined แสดงเป็นช่องว่าง
     */
    const escape = (value: unknown) =>
      '"' + String(value ?? "").replace(/"/g, '""') + '"';
    const thaiMonths = [
      "ม.ค.",
      "ก.พ.",
      "มี.ค.",
      "เม.ย.",
      "พ.ค.",
      "มิ.ย.",
      "ก.ค.",
      "ส.ค.",
      "ก.ย.",
      "ต.ค.",
      "พ.ย.",
      "ธ.ค.",
    ];
    /**
     * แสดงวันเวลาใน Asia/Bangkok พร้อมเดือนย่อภาษาไทยและปี ค.ศ. สำหรับไฟล์ CSV
     */
    const formatBangkokDateTime = (value: Date) => {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Bangkok",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .formatToParts(value)
          .map((part) => [part.type, part.value]),
      );
      return `${parts.day} ${thaiMonths[Number(parts.month) - 1]} ${parts.year} ${parts.hour}:${parts.minute} น.`;
    };
    const csv = [
      [
        "รหัสการจอง",
        "รหัสผู้ใช้",
        "ชื่อผู้จอง",
        "อีเมลผู้จอง",
        "บทบาทผู้ใช้",
        "รหัสห้องในระบบ",
        "รหัสห้อง",
        "ชื่อห้อง",
        "อาคาร",
        "ชั้น",
        "ประเภทห้อง",
        "วัตถุประสงค์",
        "จำนวนผู้เข้าร่วม",
        "อุปกรณ์ที่ต้องการ",
        "วันเวลาเริ่มต้น (เวลาไทย)",
        "วันเวลาสิ้นสุด (เวลาไทย)",
        "สถานะการจอง",
        "วันที่สร้างรายการ (เวลาไทย)",
      ].join(","),
      ...rows.map((row) =>
        [
          row.bookingCode,
          row.userId,
          row.user.name,
          row.user.email,
          row.user.role,
          row.classroomId,
          row.classroom.code,
          row.classroom.name,
          row.classroom.building,
          row.classroom.floor,
          row.classroom.category,
          row.purpose,
          row.attendeeCount,
          Array.isArray(row.requestedEquipment)
            ? row.requestedEquipment.join(" | ")
            : "",
          formatBangkokDateTime(row.startAt),
          formatBangkokDateTime(row.endAt),
          row.status,
          formatBangkokDateTime(row.createdAt),
        ]
          .map(escape)
          .join(","),
      ),
    ].join("\n");
    const range = [q.startDate, q.endDate]
      .filter(Boolean)
      .map((value) => value!.slice(0, 10))
      .join("-to-");
    res
      .type("text/csv; charset=utf-8")
      .attachment(`booking-report${range ? `-${range}` : ""}.csv`)
      .send(`\uFEFF${csv}`);
  } catch (error) {
    next(error);
  }
});
export default r;
