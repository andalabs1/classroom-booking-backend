import { Request, Router } from "express";
import { BookingStatus, Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { env } from "../../shared/config/env";
import { prisma } from "../../shared/database/prisma";
import { jsonSafe } from "../../shared/utils/json";
import { newId } from "../../shared/utils/id";
import { authenticate } from "../../shared/middlewares/auth";
import { AppError } from "../../shared/middlewares/error";
import { created, ok } from "../../shared/utils/response";
import {
  notifyBookingCancelled,
  notifyBookingCheckedIn,
  notifyBookingCreated,
  notifyBookingUpdated,
} from "../notifications/notification.service";

const router = Router();
router.use(authenticate);

// รายการรออนุมัติจองช่วงเวลาไว้ด้วย เพื่อกันคำขอใหม่ทับช่วงที่ยังรอตรวจสอบ
const blockingStatuses: BookingStatus[] = ["PENDING", "CONFIRMED", "IN_USE"];
const delegatedRoles: Role[] = ["ADMIN"];
const equipmentSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(30)
  .default([]);
const bookingInput = z.object({
  classroomId: z.coerce.bigint().positive(),
  userId: z.coerce.bigint().positive().optional(),
  purpose: z.string().trim().min(1).max(255),
  attendeeCount: z.coerce.number().int().positive(),
  requestedEquipment: equipmentSchema,
  description: z.string().max(5000).optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
});
const listQuery = z
  .object({
    search: z.string().trim().max(255).optional(),
    status: z.nativeEnum(BookingStatus).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    view: z.enum(["daily", "weekly", "monthly"]).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    scope: z.enum(["mine", "all"]).default("mine"),
    userId: z.coerce.bigint().positive().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((query, ctx) => {
    if (query.date && !query.view)
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: "date requires view",
      });
    if (query.view && (query.startDate || query.endDate))
      ctx.addIssue({
        code: "custom",
        path: ["view"],
        message: "view cannot be combined with startDate or endDate",
      });
  });

type CalendarView = "daily" | "weekly" | "monthly";
/**
 * คืนวันที่ YYYY-MM-DD ตาม Asia/Bangkok สำหรับกำหนดวันอ้างอิงในปฏิทิน
 */
const bangkokDate = (value: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
/**
 * เลื่อนวันปฏิทิน YYYY-MM-DD ตามจำนวนวันที่กำหนด โดยคำนวณผ่าน UTC เพื่อไม่ผูกกับ timezone ของเครื่อง
 */
const shiftDate = (date: string, days: number) => {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
};
/**
 * คำนวณช่วงรายวัน/สัปดาห์/เดือนของวันไทย และปฏิเสธวันที่ไม่มีจริง
 * คืน anchor พร้อม startAt/endAt แบบไม่รวมขอบบน; สัปดาห์เริ่มวันจันทร์
 */
const calendarRange = (view: CalendarView, requestedDate?: string) => {
  const anchor = requestedDate ?? bangkokDate(new Date());
  const parsedAnchor = new Date(`${anchor}T00:00:00+07:00`);
  if (
    Number.isNaN(parsedAnchor.getTime()) ||
    bangkokDate(parsedAnchor) !== anchor
  )
    throw new AppError(400, "Invalid date");

  let startDate = anchor;
  let endDate: string;
  if (view === "daily") {
    endDate = shiftDate(anchor, 1);
  } else if (view === "weekly") {
    const [year, month, day] = anchor.split("-").map(Number);
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    startDate = shiftDate(anchor, -((dayOfWeek + 6) % 7));
    endDate = shiftDate(startDate, 7);
  } else {
    const [year, month] = anchor.split("-").map(Number);
    startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    endDate = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  }
  // คืนช่วง [startAt, endAt) ตามวันไทย; weekly เริ่มวันจันทร์ และไม่รวมต้นวันถัดจากช่วงที่เลือก
  return {
    anchor,
    startAt: new Date(`${startDate}T00:00:00+07:00`),
    endAt: new Date(`${endDate}T00:00:00+07:00`),
  };
};

/**
 * ตรวจเวลาเริ่ม/สิ้นสุด ระยะเวลาสูงสุด จำนวนวันจองล่วงหน้า และเวลาเปิดทำการในวันไทยเดียวกัน
 * โยน AppError 400 หากช่วงเวลาไม่ผ่านกติกาที่ตั้งไว้ใน env
 */
const ensureTime = (startAt: Date, endAt: Date) => {
  const now = new Date();
  if (endAt <= startAt || startAt < now)
    throw new AppError(400, "Invalid booking time");
  if (
    endAt.getTime() - startAt.getTime() >
    env.BOOKING_MAX_DURATION_HOURS * 60 * 60 * 1000
  )
    throw new AppError(
      400,
      `Booking duration cannot exceed ${env.BOOKING_MAX_DURATION_HOURS} hours`,
    );
  if (
    startAt.getTime() - now.getTime() >
    env.BOOKING_MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000
  )
    throw new AppError(
      400,
      `Booking cannot be made more than ${env.BOOKING_MAX_ADVANCE_DAYS} days in advance`,
    );
  // เทียบวันและเวลาเปิดทำการใน Asia/Bangkok เสมอ แม้เครื่อง server ใช้ timezone อื่น
  /**
   * แยกส่วนวันและเวลาไทยเพื่อเทียบกับกติกา HH:mm โดยไม่ขึ้นกับ timezone ของ server
   */
  const localParts = (value: Date) =>
    Object.fromEntries(
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
  const start = localParts(startAt);
  const end = localParts(endAt);
  const startDate = `${start.year}-${start.month}-${start.day}`;
  const endDate = `${end.year}-${end.month}-${end.day}`;
  const startTime = `${start.hour}:${start.minute}`;
  const endTime = `${end.hour}:${end.minute}`;
  if (
    startDate !== endDate ||
    startTime < env.BOOKING_OPEN_TIME ||
    endTime > env.BOOKING_CLOSE_TIME
  )
    throw new AppError(
      400,
      `Bookings are allowed between ${env.BOOKING_OPEN_TIME} and ${env.BOOKING_CLOSE_TIME} Asia/Bangkok`,
    );
};

/**
 * ให้ TypeScript มองรายการอุปกรณ์เป็น Prisma JSON input โดยใช้ array เดิม
 */
const requestedEquipmentData = (items: string[]) =>
  items as Prisma.InputJsonValue;
/**
 * ตรวจว่าอุปกรณ์ที่ร้องขอมีครบในข้อมูล JSON ของห้อง
 * โยน AppError 400 พร้อมชื่ออุปกรณ์ที่ห้องไม่มี
 */
const assertEquipmentAvailable = (
  roomEquipment: Prisma.JsonValue | null,
  requested: string[],
) => {
  const available = Array.isArray(roomEquipment)
    ? roomEquipment.map(String)
    : [];
  const unavailable = requested.filter((item) => !available.includes(item));
  if (unavailable.length)
    throw new AppError(
      400,
      `Equipment is not available in this classroom: ${unavailable.join(", ")}`,
    );
};
/**
 * ค้นหารายการแรกที่ทับช่วงเวลาและอยู่ในสถานะที่กันห้องไว้
 * รับ client ของ transaction ได้ และใช้ excludeId ข้ามรายการเดิมขณะแก้ไข
 */
const findConflict = (
  client: Prisma.TransactionClient | typeof prisma,
  classroomId: bigint,
  startAt: Date,
  endAt: Date,
  excludeId?: bigint,
) =>
  client.booking.findFirst({
    where: {
      ...(excludeId ? { id: { not: excludeId } } : {}),
      classroomId,
      status: { in: blockingStatuses },
      // ใช้ขอบเขตแบบไม่รวมปลายช่วง จึงจองต่อกันตรงเวลาสิ้นสุดเดิมได้
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });

/**
 * รัน callback ใน serializable transaction และลองใหม่สูงสุดสามครั้งเมื่อ Prisma แจ้ง P2034
 * คืนผลของ callback; ข้อผิดพลาดประเภทอื่นหรือครั้งสุดท้ายส่งกลับให้ caller จัดการ
 */
async function serializable<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  // P2034 คือ write conflict/deadlock: retry ทั้ง transaction และให้ callback ทำเฉพาะงานฐานข้อมูล
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt === 3
      )
        throw error;
    }
  }
  throw new AppError(409, "Booking transaction could not be completed");
}

/**
 * ตรวจว่าผู้ร้องขอเป็นเจ้าของรายการหรือมี role ที่อนุญาตให้จัดการแทนผู้อื่น
 */
const canManageBooking = (
  requester: { id: bigint; role: Role },
  ownerId: bigint,
) => requester.id === ownerId || delegatedRoles.includes(requester.role);
/**
 * เลือกเจ้าของจาก requestedUserId หรือผู้ร้องขอ และตรวจว่าบัญชียัง active
 * การจองแทนต้องมี delegated role; คืน user ID หรือโยน 403/400 ตามเงื่อนไขที่ไม่ผ่าน
 */
const resolveOwner = async (
  requester: { id: bigint; role: Role },
  requestedUserId?: bigint,
) => {
  const ownerId = requestedUserId ?? requester.id;
  if (ownerId !== requester.id && !delegatedRoles.includes(requester.role))
    throw new AppError(
      403,
      "Only staff or admin can book on behalf of another user",
    );
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, status: true },
  });
  if (!owner || owner.status !== "ACTIVE")
    throw new AppError(400, "Booking user is inactive or does not exist");
  return owner.id;
};
/**
 * สร้างรหัส BK-YYYYMMDD-ID โดยใช้วันที่เริ่มจองตามเวลาไทยและ ID ของรายการ
 */
const bookingCodeFor = (id: bigint, date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  /**
   * อ่านส่วนปี/เดือน/วันที่จาก Intl parts เพื่อประกอบ booking code
   */
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `BK-${value("year")}${value("month")}${value("day")}-${id}`;
};

// ตรวจผู้จอง ห้อง เวลา ความจุ อุปกรณ์ และรายการทับซ้อน ก่อนสร้าง booking ใน transaction และส่งแจ้งเตือน
router.post("/", async (req, res, next) => {
  try {
    const input = bookingInput.parse(req.body);
    ensureTime(input.startAt, input.endAt);
    const userId = await resolveOwner(req.user!, input.userId);
    const booking = await serializable(async (tx) => {
      const classroom = await tx.classroom.findUnique({
        where: { id: input.classroomId },
      });
      if (!classroom || classroom.status !== "ACTIVE")
        throw new AppError(400, "Classroom is unavailable");
      if (input.attendeeCount > classroom.capacity)
        throw new AppError(400, "Attendee count exceeds classroom capacity");
      assertEquipmentAvailable(classroom.equipment, input.requestedEquipment);
      if (await findConflict(tx, input.classroomId, input.startAt, input.endAt))
        throw new AppError(409, "Booking time conflicts");
      const id = newId();
      return tx.booking.create({
        data: {
          id,
          bookingCode: bookingCodeFor(id, input.startAt),
          userId,
          classroomId: input.classroomId,
          purpose: input.purpose,
          attendeeCount: input.attendeeCount,
          requestedEquipment: requestedEquipmentData(input.requestedEquipment),
          description: input.description,
          startAt: input.startAt,
          endAt: input.endAt,
        },
        include: {
          classroom: true,
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      });
    });
    // จองสำเร็จและ commit แล้ว; แจ้งเตือนล้มเหลวต้องไม่ทำให้ผู้ใช้เข้าใจว่าจองไม่สำเร็จ
    await notifyBookingCreated(booking).catch((error) =>
      console.error("Booking notification failed", error),
    );
    created(res, jsonSafe(booking), "Booking created");
  } catch (error) {
    next(error);
  }
});

// ค้นหาและแบ่งหน้าการจองของตนเอง; scope=all และการกรอง userId ใช้ได้เฉพาะ delegated role
router.get("/", async (req, res, next) => {
  try {
    const query = listQuery.parse(req.query);
    const viewRange = query.view ? calendarRange(query.view, query.date) : null;
    if (
      (query.scope === "all" || query.userId) &&
      !delegatedRoles.includes(req.user!.role)
    )
      throw new AppError(
        403,
        "Only staff or admin can view other users bookings",
      );
    const where: Prisma.BookingWhereInput = {
      userId: query.scope === "all" ? query.userId : req.user!.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { bookingCode: { contains: query.search } },
              { purpose: { contains: query.search } },
              { classroom: { name: { contains: query.search } } },
              { classroom: { building: { contains: query.search } } },
              { user: { name: { contains: query.search } } },
              { user: { email: { contains: query.search } } },
            ],
          }
        : {}),
      // ปฏิทินเลือกทุก booking ที่ทับช่วง แต่ custom startDate/endDate กรองเฉพาะเวลาเริ่ม
      ...(viewRange
        ? {
            startAt: { lt: viewRange.endAt },
            endAt: { gt: viewRange.startAt },
          }
        : query.startDate || query.endDate
          ? {
              startAt: {
                ...(query.startDate ? { gte: query.startDate } : {}),
                ...(query.endDate ? { lte: query.endDate } : {}),
              },
            }
          : {}),
    };
    const [data, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: "desc" },
        include: {
          classroom: true,
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
      prisma.booking.count({ where }),
    ]);
    ok(res, jsonSafe(data), "Success", {
      page: query.page,
      limit: query.limit,
      total,
      ...(viewRange
        ? {
            view: query.view,
            date: viewRange.anchor,
            startAt: viewRange.startAt.toISOString(),
            endAt: viewRange.endAt.toISOString(),
          }
        : {}),
    });
  } catch (error) {
    next(error);
  }
});

// คืนรายละเอียดให้เจ้าของหรือผู้มี delegated role; ใช้ 404 เช่นเดียวกับไม่พบรายการเมื่อไม่มีสิทธิ์
router.get("/:id", async (req, res, next) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: BigInt(req.params.id) },
      include: {
        classroom: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
          },
        },
      },
    });
    if (!booking || !canManageBooking(req.user!, booking.userId))
      throw new AppError(404, "Booking not found");
    ok(res, jsonSafe(booking));
  } catch (error) {
    next(error);
  }
});

// แก้เฉพาะ PENDING booking โดยตรวจค่าที่รวมกับข้อมูลเดิมใหม่ แล้วล้างข้อมูลอนุมัติและบันทึก audit/แจ้งเตือน
router.patch("/:id", async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const current = await prisma.booking.findUnique({ where: { id } });
    if (!current || !canManageBooking(req.user!, current.userId))
      throw new AppError(404, "Booking not found");
    if (current.status !== "PENDING")
      throw new AppError(409, "Only pending bookings can be edited");
    const input = bookingInput.partial().parse(req.body);
    const userId = input.userId
      ? await resolveOwner(req.user!, input.userId)
      : current.userId;
    const classroomId = input.classroomId ?? current.classroomId;
    const startAt = input.startAt ?? current.startAt;
    const endAt = input.endAt ?? current.endAt;
    const attendeeCount = input.attendeeCount ?? current.attendeeCount;
    const requestedEquipment =
      input.requestedEquipment ??
      (Array.isArray(current.requestedEquipment)
        ? current.requestedEquipment.map(String)
        : []);
    ensureTime(startAt, endAt);
    const booking = await serializable(async (tx) => {
      const classroom = await tx.classroom.findUnique({
        where: { id: classroomId },
      });
      if (!classroom || classroom.status !== "ACTIVE")
        throw new AppError(400, "Classroom is unavailable");
      if (attendeeCount > classroom.capacity)
        throw new AppError(400, "Attendee count exceeds classroom capacity");
      assertEquipmentAvailable(classroom.equipment, requestedEquipment);
      if (await findConflict(tx, classroomId, startAt, endAt, id))
        throw new AppError(409, "Booking time conflicts");
      return tx.booking.update({
        where: { id },
        data: {
          ...input,
          userId,
          requestedEquipment: requestedEquipmentData(requestedEquipment),
          approvedAt: null,
          approvedBy: null,
          adminNote: null,
        },
        include: { classroom: true },
      });
    });
    await prisma.auditLog.create({
      data: {
        id: newId(),
        userId: req.user!.id,
        action: "UPDATE",
        entity: "BOOKING",
        entityId: id,
        oldValue: jsonSafe(current) as Prisma.InputJsonValue,
        newValue: jsonSafe(booking) as Prisma.InputJsonValue,
      },
    });
    await notifyBookingUpdated(booking).catch((error) =>
      console.error("Booking notification failed", error),
    );
    ok(res, jsonSafe(booking), "Booking updated");
  } catch (error) {
    next(error);
  }
});

/**
 * ตรวจเจ้าของ สถานะ และ cutoff ก่อนเปลี่ยนรายการเป็น CANCELLED พร้อมเวลา/เหตุผล
 * คืน booking ที่แก้แล้ว; audit และ notification เรียกต่อจาก cancelAndNotify
 */
const cancelBooking = async (req: Request) => {
  const id = BigInt(String(req.params.id));
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking || !canManageBooking(req.user!, booking.userId))
    throw new AppError(404, "Booking not found");
  if (!["PENDING", "CONFIRMED"].includes(booking.status))
    throw new AppError(409, "Booking cannot be cancelled");
  // Admin ยกเลิกแทนผู้ใช้ได้แม้เลย cutoff แต่ยังต้องผ่านเงื่อนไขสถานะการจองด้านบน
  if (
    req.user!.role !== "ADMIN" &&
    booking.startAt.getTime() - Date.now() < env.BOOKING_CANCEL_MINUTES * 60_000
  )
    throw new AppError(
      409,
      `Booking must be cancelled at least ${env.BOOKING_CANCEL_MINUTES} minutes before start time`,
    );
  const reason = z
    .object({ reason: z.string().trim().min(1).max(2000).optional() })
    .parse(req.body ?? {}).reason;
  return prisma.booking.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: reason,
    },
    include: { classroom: true },
  });
};
/**
 * ยกเลิก booking แล้วบันทึก audit ก่อนส่งแจ้งเตือนให้เจ้าของและ admin
 * คืน booking แม้การส่งแจ้งเตือนล้มเหลว; ข้อผิดพลาดจากการยกเลิกหรือ audit ส่งกลับ caller
 */
const cancelAndNotify = async (req: Request) => {
  const booking = await cancelBooking(req);
  await prisma.auditLog.create({
    data: {
      id: newId(),
      userId: req.user!.id,
      action: "CANCELLED",
      entity: "BOOKING",
      entityId: booking.id,
      newValue: jsonSafe(booking) as Prisma.InputJsonValue,
    },
  });
  await notifyBookingCancelled(booking).catch((error) =>
    console.error("Booking notification failed", error),
  );
  return booking;
};
// ยกเลิกการจองผ่าน cancelAndNotify พร้อมเก็บเหตุผล ประวัติ และแจ้งผู้เกี่ยวข้อง
router.patch("/:id/cancel", async (req, res, next) => {
  try {
    ok(res, jsonSafe(await cancelAndNotify(req)), "Booking cancelled");
  } catch (error) {
    next(error);
  }
});
// DELETE ใช้ยกเลิกเป็น CANCELLED เช่นเดียวกับ /cancel โดยเก็บ record และประวัติการจองไว้
router.delete("/:id", async (req, res, next) => {
  try {
    ok(res, jsonSafe(await cancelAndNotify(req)), "Booking cancelled");
  } catch (error) {
    next(error);
  }
});

// เปลี่ยน CONFIRMED เป็น IN_USE ภายในช่วง check-in ที่กำหนด และก่อนเวลาสิ้นสุด พร้อม audit/แจ้งเตือน
router.post("/:id/check-in", async (req, res, next) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: BigInt(req.params.id) },
    });
    if (!booking || !canManageBooking(req.user!, booking.userId))
      throw new AppError(404, "Booking not found");
    if (booking.status !== "CONFIRMED")
      throw new AppError(409, "Only confirmed bookings can be checked in");
    const now = new Date();
    const earliest =
      booking.startAt.getTime() - env.BOOKING_CHECKIN_EARLY_MINUTES * 60_000;
    const latest =
      booking.startAt.getTime() + env.BOOKING_CHECKIN_LATE_MINUTES * 60_000;
    if (
      now.getTime() < earliest ||
      now.getTime() > latest ||
      now >= booking.endAt
    )
      throw new AppError(409, "Booking is outside the check-in window");
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "IN_USE", checkedInAt: now },
    });
    await prisma.auditLog.create({
      data: {
        id: newId(),
        userId: req.user!.id,
        action: "CHECK_IN",
        entity: "BOOKING",
        entityId: booking.id,
        oldValue: jsonSafe(booking) as Prisma.InputJsonValue,
        newValue: jsonSafe(updated) as Prisma.InputJsonValue,
      },
    });
    await notifyBookingCheckedIn(updated).catch((error) =>
      console.error("Booking notification failed", error),
    );
    ok(res, jsonSafe(updated), "Booking checked in");
  } catch (error) {
    next(error);
  }
});

export default router;
