import { Router } from "express";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../shared/database/prisma";
import { jsonSafe } from "../../shared/utils/json";
import { ok } from "../../shared/utils/response";

import { pageQuery, safeUser } from "./admin.schemas";
import { audit } from "./admin-audit.service";

const r = Router();

// ค้นหา/แบ่งหน้า audit logs ตามผู้กระทำ action entity และเวลาที่สร้าง พร้อมโปรไฟล์ผู้กระทำ
r.get("/audit-logs", async (req, res, next) => {
  try {
    const q = pageQuery
      .extend({
        userId: z.coerce.bigint().optional(),
        action: z.string().optional(),
        entity: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      })
      .parse(req.query);
    const where: Prisma.AuditLogWhereInput = {
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.startDate || q.endDate
        ? {
            createdAt: {
              ...(q.startDate ? { gte: q.startDate } : {}),
              ...(q.endDate ? { lte: q.endDate } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { createdAt: "desc" },
        include: { user: { select: safeUser } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    ok(res, jsonSafe(data), "Success", { page: q.page, limit: q.limit, total });
  } catch (error) {
    next(error);
  }
});
export default r;
