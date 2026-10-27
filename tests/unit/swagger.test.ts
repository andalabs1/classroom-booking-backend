import { describe, it, expect } from "vitest";
import { swaggerDocument } from "../../src/shared/config/swagger";

describe("Swagger coverage", () => {
  it("documents every business-flow route", () => {
    const paths = swaggerDocument.paths as Record<string, unknown>;
    const expected = [
      "/api/auth/logout",
      "/api/config/business-rules",
      "/api/users/directory",
      "/api/classrooms/availability",
      "/api/classrooms/schedule",
      "/api/bookings",
      "/api/bookings/{id}",
      "/api/bookings/{id}/cancel",
      "/api/bookings/{id}/check-in",
      "/api/notifications",
      "/api/admin/bookings/{id}/approve",
      "/api/admin/bookings/{id}/reject",
      "/api/admin/bookings/{id}/start",
      "/api/admin/bookings/{id}/complete",
      "/api/admin/bookings/{id}/no-show",
      "/api/admin/users",
      "/api/admin/users/{id}/role",
      "/api/admin/reports/export",
      "/api/admin/uploads/images",
    ];
    expect(expected.filter((path) => !paths[path])).toEqual([]);
  });

  it("defines schemas referenced by shared responses", () => {
    expect(swaggerDocument.components.schemas.Error).toBeDefined();
    expect(swaggerDocument.components.schemas.Booking).toBeDefined();
  });
});
