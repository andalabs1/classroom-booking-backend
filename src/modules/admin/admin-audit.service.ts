import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/database/prisma";
import { jsonSafe } from "../../shared/utils/json";
import { newId } from "../../shared/utils/id";

/**
 * บันทึกผู้กระทำ action และ entity พร้อม snapshot ค่าเก่า/ใหม่เมื่อมีค่า
 * แปลง BigInt ก่อนเก็บ JSON และคืน Promise ของ auditLog ที่สร้างด้วย Prisma client กลาง
 */
export const audit = (
  userId: bigint,
  action: string,
  entity: string,
  entityId: bigint,
  oldValue?: unknown,
  newValue?: unknown,
) =>
  prisma.auditLog.create({
    data: {
      id: newId(),
      userId,
      action,
      entity,
      entityId,
      oldValue: oldValue
        ? (jsonSafe(oldValue) as Prisma.InputJsonValue)
        : undefined,
      newValue: newValue
        ? (jsonSafe(newValue) as Prisma.InputJsonValue)
        : undefined,
    },
  });
