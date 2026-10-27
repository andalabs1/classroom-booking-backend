import { vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

export const unexpectedQueries: string[] = [];
const operations = [
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "create",
  "createMany",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
  "groupBy",
  "aggregate",
];
const models = ["user", "classroom", "booking", "notification", "auditLog"];
/**
 * สร้าง default stub ที่บันทึก operation ที่ไม่ได้จำลองและโยน error เพื่อให้ setup ตรวจพบแม้แอป catch ไปแล้ว
 */
const fail = (name: string) => () => {
  unexpectedQueries.push(name);
  throw new Error(`Unstubbed database operation: ${name}`);
};
const stubs = new Map<string, ReturnType<typeof vi.fn>>();
/**
 * สร้าง vi.fn พร้อม default ที่ล้มเหลว แล้วลงทะเบียนเพื่อ reset กลับก่อนเทสต์ถัดไป
 */
const stub = (name: string) => {
  const fn = vi.fn(fail(name));
  stubs.set(name, fn);
  return fn;
};
// Only this test helper casts the fake client. It never constructs PrismaClient.
export const prismaMock = Object.fromEntries([
  ...models.map((model) => [
    model,
    Object.fromEntries(
      operations.map((operation) => [operation, stub(`${model}.${operation}`)]),
    ),
  ]),
  ...[
    "$transaction",
    "$connect",
    "$disconnect",
    "$queryRaw",
    "$executeRaw",
    "$queryRawUnsafe",
    "$executeRawUnsafe",
  ].map((name) => [name, stub(name)]),
]) as unknown as PrismaClient;

/**
 * ล้างรายการ query ที่ไม่คาดหมายและคืน default ของทุก stub ให้ล้มเหลวจนกว่าเทสต์จะกำหนดผลใหม่
 */
export function resetPrismaMock() {
  unexpectedQueries.length = 0;
  for (const [name, fn] of stubs) fn.mockReset().mockImplementation(fail(name));
}
