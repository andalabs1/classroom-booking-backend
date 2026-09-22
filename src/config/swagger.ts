const bearer = [{ bearerAuth: [] }];
const id = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "integer", format: "int64" },
};
const page = {
  name: "page",
  in: "query",
  schema: { type: "integer", minimum: 1, default: 1 },
};
const limit = {
  name: "limit",
  in: "query",
  schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
};
const dateRange = [
  {
    name: "startAt",
    in: "query",
    required: true,
    schema: { type: "string", format: "date-time" },
  },
  {
    name: "endAt",
    in: "query",
    required: true,
    schema: { type: "string", format: "date-time" },
  },
];
const jsonBody = (schema: object, required = true) => ({
  required,
  content: { "application/json": { schema } },
});
const success = (description = "Success") => ({
  200: { description },
  400: { $ref: "#/components/responses/BadRequest" },
  401: { $ref: "#/components/responses/Unauthorized" },
  403: { $ref: "#/components/responses/Forbidden" },
  404: { $ref: "#/components/responses/NotFound" },
  409: { $ref: "#/components/responses/Conflict" },
});

const bookingInput = {
  type: "object",
  required: ["classroomId", "purpose", "attendeeCount", "startAt", "endAt"],
  properties: {
    classroomId: { type: "integer", format: "int64" },
    userId: {
      type: "integer",
      format: "int64",
      description: "ADMIN เท่านั้น สำหรับจองแทนผู้อื่น",
    },
    purpose: { type: "string", maxLength: 255 },
    attendeeCount: { type: "integer", minimum: 1 },
    requestedEquipment: {
      type: "array",
      items: { type: "string" },
      example: ["Projector", "Microphone"],
    },
    description: { type: "string", maxLength: 5000 },
    startAt: { type: "string", format: "date-time" },
    endAt: { type: "string", format: "date-time" },
  },
};

export const swaggerDocument = {
  openapi: "3.0.3",
  info: {
    title: "Classroom Reservation API",
    version: "2.0.0",
    description: "REST API ครบ Business Flow สำหรับระบบจองห้องเรียน",
  },
  servers: [{ url: "/", description: "Current server" }],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Users" },
    { name: "Classrooms" },
    { name: "Bookings" },
    { name: "Notifications" },
    { name: "Admin" },
    { name: "Uploads" },
    { name: "Reports" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["success", "message"],
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string" },
          errors: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int64" },
          userCode: { type: "string", nullable: true },
          name: { type: "string" },
          firstName: { type: "string", nullable: true },
          lastName: { type: "string", nullable: true },
          phone: { type: "string", nullable: true },
          email: { type: "string", format: "email" },
          role: {
            type: "string",
            enum: ["USER", "STUDENT", "TEACHER", "ADMIN"],
          },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE", "SUSPENDED"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Classroom: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int64" },
          code: { type: "string", nullable: true },
          name: { type: "string" },
          building: { type: "string" },
          floor: { type: "string" },
          capacity: { type: "integer" },
          description: { type: "string", nullable: true },
          category: { type: "string", nullable: true },
          equipment: { type: "array", items: { type: "string" } },
          imageUrl: { type: "string", format: "uri", nullable: true },
          status: {
            type: "string",
            enum: ["ACTIVE", "INACTIVE", "MAINTENANCE"],
          },
        },
      },
      BookingInput: bookingInput,
      Booking: {
        allOf: [
          {
            type: "object",
            properties: {
              id: { type: "integer", format: "int64" },
              bookingCode: {
                type: "string",
                example: "BK-20260914-1789322606421513",
              },
              status: {
                type: "string",
                enum: [
                  "PENDING",
                  "CONFIRMED",
                  "IN_USE",
                  "COMPLETED",
                  "REJECTED",
                  "CANCELLED",
                  "NO_SHOW",
                ],
              },
              approvedAt: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              checkedInAt: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              completedAt: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              cancelledAt: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              cancelReason: { type: "string", nullable: true },
            },
          },
          bookingInput,
        ],
      },
      Notification: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int64" },
          bookingId: { type: "integer", format: "int64", nullable: true },
          title: { type: "string" },
          message: { type: "string" },
          type: { type: "string" },
          isRead: { type: "boolean" },
          readAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
    responses: {
      BadRequest: {
        description: "ข้อมูลไม่ถูกต้อง",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      Unauthorized: {
        description: "Token ไม่ถูกต้องหรือผู้ใช้ถูกปิดใช้งาน",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      Forbidden: {
        description: "ไม่มีสิทธิ์",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      NotFound: {
        description: "ไม่พบข้อมูล",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      Conflict: {
        description: "สถานะไม่ถูกต้องหรือเวลาจองชนกัน",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "ตรวจสอบสถานะ API",
        responses: { 200: { description: "Healthy" } },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "สมัครสมาชิกด้วยข้อมูลโปรไฟล์และรหัสผู้ใช้งาน",
        requestBody: jsonBody({
          type: "object",
          required: [
            "firstName",
            "lastName",
            "userCode",
            "phone",
            "email",
            "password",
          ],
          properties: {
            name: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            userCode: { type: "string" },
            phone: { type: "string" },
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
            role: {
              type: "string",
              enum: ["USER", "STUDENT", "TEACHER"],
              default: "USER",
            },
          },
        }),
        responses: { 201: { description: "Registered" }, ...success() },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "เข้าสู่ระบบและรับ JWT",
        requestBody: jsonBody({
          type: "object",
          required: ["username", "password"],
          properties: {
            username: {
              type: "string",
              description: "Email หรือรหัสผู้ใช้งาน",
            },
            email: { type: "string", format: "email" },
            password: { type: "string" },
          },
        }),
        responses: success("Logged in"),
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary:
          "ออกจากระบบ ยกเลิก JWT เดิมทั้งหมดของบัญชี และให้ Frontend ลบ token",
        security: bearer,
        responses: success("Logged out"),
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "ข้อมูลผู้ใช้จาก token",
        security: bearer,
        responses: success(),
      },
    },
    "/api/config/business-rules": {
      get: {
        tags: ["Users"],
        summary: "ค่ากฎการจองสำหรับ Frontend validation",
        security: bearer,
        responses: success(),
      },
    },
    "/api/users/directory": {
      get: {
        tags: ["Users"],
        summary: "รายชื่อผู้ใช้ Active สำหรับ ADMIN จองแทน",
        security: bearer,
        parameters: [
          { name: "search", in: "query", schema: { type: "string" } },
          limit,
        ],
        responses: success(),
      },
    },
    "/api/users/me": {
      get: {
        tags: ["Users"],
        summary: "โปรไฟล์ตัวเอง",
        security: bearer,
        responses: success(),
      },
      patch: {
        tags: ["Users"],
        summary: "แก้ไขโปรไฟล์",
        security: bearer,
        requestBody: jsonBody({
          type: "object",
          properties: {
            name: { type: "string" },
            firstName: { type: "string", nullable: true },
            lastName: { type: "string", nullable: true },
            phone: { type: "string", nullable: true },
            email: { type: "string", format: "email" },
          },
        }),
        responses: success(),
      },
    },
    "/api/users/me/password": {
      patch: {
        tags: ["Users"],
        summary: "เปลี่ยนรหัสผ่าน",
        security: bearer,
        requestBody: jsonBody({
          type: "object",
          required: ["currentPassword", "newPassword"],
          properties: {
            currentPassword: { type: "string" },
            newPassword: { type: "string", minLength: 8 },
          },
        }),
        responses: success(),
      },
    },
    "/api/users/me/bookings": {
      get: {
        tags: ["Users"],
        summary: "ประวัติการจองของตัวเอง",
        security: bearer,
        parameters: [
          page,
          limit,
          {
            name: "status",
            in: "query",
            schema: { $ref: "#/components/schemas/Booking/properties/status" },
          },
        ],
        responses: success(),
      },
    },
    "/api/classrooms": {
      get: {
        tags: ["Classrooms"],
        summary: "ค้นหาและดูห้องทั้งหมด",
        parameters: [
          page,
          limit,
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "building", in: "query", schema: { type: "string" } },
          { name: "floor", in: "query", schema: { type: "string" } },
          { name: "category", in: "query", schema: { type: "string" } },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE", "MAINTENANCE"],
            },
          },
          {
            name: "sort",
            in: "query",
            schema: { type: "string", enum: ["code", "capacity", "name"] },
          },
          { name: "minCapacity", in: "query", schema: { type: "integer" } },
          {
            name: "equipment",
            in: "query",
            description: "comma-separated หรือส่งซ้ำได้",
            schema: { type: "string" },
          },
        ],
        responses: success(),
      },
    },
    "/api/classrooms/availability": {
      get: {
        tags: ["Classrooms"],
        summary: "ตรวจห้องว่างทั้งหมดหรือหลายห้อง",
        parameters: [
          ...dateRange,
          {
            name: "classroomIds",
            in: "query",
            description: "เช่น 1,2,3",
            schema: { type: "string" },
          },
          {
            name: "availableOnly",
            in: "query",
            schema: { type: "boolean", default: false },
          },
          { name: "building", in: "query", schema: { type: "string" } },
          { name: "minCapacity", in: "query", schema: { type: "integer" } },
          { name: "equipment", in: "query", schema: { type: "string" } },
        ],
        responses: success(),
      },
    },
    "/api/classrooms/schedule": {
      get: {
        tags: ["Classrooms"],
        summary: "ตารางการใช้ห้องทั้งหมดหรือหลายห้อง สูงสุด 31 วัน",
        parameters: [
          ...dateRange,
          {
            name: "classroomIds",
            in: "query",
            schema: { type: "string" },
            example: "1,2,3",
          },
        ],
        responses: success(),
      },
    },
    "/api/classrooms/{id}": {
      get: {
        tags: ["Classrooms"],
        summary: "รายละเอียดห้อง",
        parameters: [id],
        responses: success(),
      },
    },
    "/api/classrooms/{id}/availability": {
      get: {
        tags: ["Classrooms"],
        summary: "ตรวจห้องว่างรายห้อง",
        parameters: [id, ...dateRange],
        responses: success(),
      },
    },
    "/api/bookings": {
      get: {
        tags: ["Bookings"],
        summary: "รายการจอง; ADMIN ใช้ scope=all ได้",
        security: bearer,
        parameters: [
          page,
          limit,
          {
            name: "search",
            in: "query",
            description: "ค้นหารหัส วัตถุประสงค์ ห้อง อาคาร หรือผู้จอง",
            schema: { type: "string" },
          },
          { name: "status", in: "query", schema: { type: "string" } },
          {
            name: "scope",
            in: "query",
            schema: { type: "string", enum: ["mine", "all"], default: "mine" },
          },
          {
            name: "userId",
            in: "query",
            schema: { type: "integer", format: "int64" },
          },
          {
            name: "startDate",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "endDate",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "view",
            in: "query",
            description: "กรองตามวัน สัปดาห์ (จันทร์-อาทิตย์) หรือเดือน",
            schema: {
              type: "string",
              enum: ["daily", "weekly", "monthly"],
            },
          },
          {
            name: "date",
            in: "query",
            description:
              "วันอ้างอิงรูปแบบ YYYY-MM-DD สำหรับ view; ค่าเริ่มต้นคือวันปัจจุบันตามเวลา Asia/Bangkok",
            schema: { type: "string", format: "date", example: "2026-09-20" },
          },
        ],
        responses: success(),
      },
      post: {
        tags: ["Bookings"],
        summary: "สร้าง Booking และตรวจ conflict ซ้ำใน transaction",
        security: bearer,
        requestBody: jsonBody({ $ref: "#/components/schemas/BookingInput" }),
        responses: { 201: { description: "Booking created" }, ...success() },
      },
    },
    "/api/bookings/{id}": {
      get: {
        tags: ["Bookings"],
        summary: "รายละเอียด Booking",
        security: bearer,
        parameters: [id],
        responses: success(),
      },
      patch: {
        tags: ["Bookings"],
        summary: "แก้ไข Booking สถานะ PENDING",
        security: bearer,
        parameters: [id],
        requestBody: jsonBody(
          { $ref: "#/components/schemas/BookingInput" },
          false,
        ),
        responses: success(),
      },
      delete: {
        tags: ["Bookings"],
        summary: "ยกเลิก Booking แบบ soft delete",
        security: bearer,
        parameters: [id],
        requestBody: jsonBody(
          { type: "object", properties: { reason: { type: "string" } } },
          false,
        ),
        responses: success(),
      },
    },
    "/api/bookings/{id}/cancel": {
      patch: {
        tags: ["Bookings"],
        summary: "ยกเลิกก่อนเวลาเริ่มตาม BOOKING_CANCEL_MINUTES",
        security: bearer,
        parameters: [id],
        requestBody: jsonBody(
          { type: "object", properties: { reason: { type: "string" } } },
          false,
        ),
        responses: success(),
      },
    },
    "/api/bookings/{id}/check-in": {
      post: {
        tags: ["Bookings"],
        summary: "Check-in Booking เป็น IN_USE ภายในช่วงเวลาที่กำหนด",
        security: bearer,
        parameters: [id],
        responses: success(),
      },
    },
    "/api/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "Notification Center",
        security: bearer,
        parameters: [
          page,
          limit,
          { name: "isRead", in: "query", schema: { type: "boolean" } },
        ],
        responses: success(),
      },
    },
    "/api/notifications/unread-count": {
      get: {
        tags: ["Notifications"],
        summary: "จำนวนที่ยังไม่อ่าน",
        security: bearer,
        responses: success(),
      },
    },
    "/api/notifications/read-all": {
      patch: {
        tags: ["Notifications"],
        summary: "อ่านทั้งหมด",
        security: bearer,
        responses: success(),
      },
    },
    "/api/notifications/{id}/read": {
      patch: {
        tags: ["Notifications"],
        summary: "อ่านหนึ่งรายการ",
        security: bearer,
        parameters: [id],
        responses: success(),
      },
    },
    "/api/admin/dashboard/summary": {
      get: {
        tags: ["Admin"],
        summary: "Dashboard และจำนวนผู้ใช้งาน/Booking ทุกสถานะ",
        security: bearer,
        responses: success(),
      },
    },
    "/api/admin/dashboard/recent-bookings": {
      get: {
        tags: ["Admin"],
        summary: "Booking ล่าสุด",
        security: bearer,
        parameters: [limit],
        responses: success(),
      },
    },
    "/api/admin/classrooms": {
      get: {
        tags: ["Admin"],
        summary: "ห้องทั้งหมดรวม inactive",
        security: bearer,
        parameters: [page, limit],
        responses: success(),
      },
      post: {
        tags: ["Admin"],
        summary: "สร้างห้อง",
        security: bearer,
        requestBody: jsonBody({ $ref: "#/components/schemas/Classroom" }),
        responses: { 201: { description: "Created" }, ...success() },
      },
    },
    "/api/admin/classrooms/{id}": {
      get: {
        tags: ["Admin"],
        summary: "รายละเอียดและประวัติห้อง",
        security: bearer,
        parameters: [id],
        responses: success(),
      },
      patch: {
        tags: ["Admin"],
        summary: "แก้ไขห้อง",
        security: bearer,
        parameters: [id],
        requestBody: jsonBody(
          { $ref: "#/components/schemas/Classroom" },
          false,
        ),
        responses: success(),
      },
      delete: {
        tags: ["Admin"],
        summary: "ปิดใช้งานห้อง",
        security: bearer,
        parameters: [id],
        responses: success(),
      },
    },
    "/api/admin/classrooms/{id}/status": {
      patch: {
        tags: ["Admin"],
        summary: "เปลี่ยนสถานะห้อง",
        security: bearer,
        parameters: [id],
        requestBody: jsonBody({
          type: "object",
          required: ["status"],
          properties: {
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE", "MAINTENANCE"],
            },
          },
        }),
        responses: success(),
      },
    },
    "/api/admin/bookings": {
      get: {
        tags: ["Admin"],
        summary: "Booking ทั้งหมดพร้อม filter",
        security: bearer,
        parameters: [
          page,
          limit,
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "classroomId", in: "query", schema: { type: "integer" } },
          { name: "userId", in: "query", schema: { type: "integer" } },
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: success(),
      },
    },
    "/api/admin/bookings/{id}": {
      get: {
        tags: ["Admin"],
        summary: "รายละเอียดและ Audit history",
        security: bearer,
        parameters: [id],
        responses: success(),
      },
    },
    "/api/admin/bookings/{id}/approve": {
      patch: {
        tags: ["Admin"],
        summary: "PENDING → CONFIRMED",
        security: bearer,
        parameters: [id],
        responses: success(),
      },
    },
    "/api/admin/bookings/{id}/reject": {
      patch: {
        tags: ["Admin"],
        summary: "PENDING → REJECTED โดยบังคับเหตุผล",
        security: bearer,
        parameters: [id],
        requestBody: jsonBody({
          type: "object",
          required: ["adminNote"],
          properties: { adminNote: { type: "string", minLength: 1 } },
        }),
        responses: success(),
      },
    },
    "/api/admin/bookings/{id}/cancel": {
      patch: {
        tags: ["Admin"],
        summary: "Admin ยกเลิกและบังคับเหตุผล",
        security: bearer,
        parameters: [id],
        requestBody: jsonBody({
          type: "object",
          required: ["reason"],
          properties: { reason: { type: "string", minLength: 1 } },
        }),
        responses: success(),
      },
    },
    "/api/admin/bookings/{id}/start": {
      patch: {
        tags: ["Admin"],
        summary: "CONFIRMED → IN_USE",
        security: bearer,
        parameters: [id],
        responses: success(),
      },
    },
    "/api/admin/bookings/{id}/complete": {
      patch: {
        tags: ["Admin"],
        summary: "IN_USE → COMPLETED",
        security: bearer,
        parameters: [id],
        responses: success(),
      },
    },
    "/api/admin/bookings/{id}/no-show": {
      patch: {
        tags: ["Admin"],
        summary: "CONFIRMED → NO_SHOW",
        security: bearer,
        parameters: [id],
        requestBody: jsonBody(
          { type: "object", properties: { reason: { type: "string" } } },
          false,
        ),
        responses: success(),
      },
    },
    "/api/admin/users": {
      get: {
        tags: ["Admin"],
        summary: "ผู้ใช้ทั้งหมด",
        security: bearer,
        parameters: [page, limit],
        responses: success(),
      },
      post: {
        tags: ["Admin"],
        summary: "สร้าง User/Student/Teacher/Staff/Admin",
        security: bearer,
        requestBody: jsonBody({
          type: "object",
          required: ["name", "email", "password"],
          properties: {
            name: { type: "string" },
            userCode: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            phone: { type: "string" },
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
            role: {
              type: "string",
              enum: ["USER", "STUDENT", "TEACHER", "ADMIN"],
            },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE", "SUSPENDED"],
            },
          },
        }),
        responses: { 201: { description: "Created" }, ...success() },
      },
    },
    "/api/admin/users/{id}": {
      get: {
        tags: ["Admin"],
        summary: "รายละเอียดและประวัติ User",
        security: bearer,
        parameters: [id],
        responses: success(),
      },
      patch: {
        tags: ["Admin"],
        summary: "แก้ไข User",
        security: bearer,
        parameters: [id],
        requestBody: jsonBody({
          type: "object",
          properties: {
            name: { type: "string" },
            userCode: { type: "string", nullable: true },
            firstName: { type: "string", nullable: true },
            lastName: { type: "string", nullable: true },
            phone: { type: "string", nullable: true },
            email: { type: "string", format: "email" },
          },
        }),
        responses: success(),
      },
      delete: {
        tags: ["Admin"],
        summary: "ปิดใช้งาน User",
        security: bearer,
        parameters: [id],
        responses: success(),
      },
    },
    "/api/admin/users/{id}/role": {
      patch: {
        tags: ["Admin"],
        summary: "เปลี่ยน Role",
        security: bearer,
        parameters: [id],
        requestBody: jsonBody({
          type: "object",
          required: ["role"],
          properties: {
            role: {
              type: "string",
              enum: ["USER", "STUDENT", "TEACHER", "ADMIN"],
            },
          },
        }),
        responses: success(),
      },
    },
    "/api/admin/users/{id}/status": {
      patch: {
        tags: ["Admin"],
        summary: "เปิด/ปิด User",
        security: bearer,
        parameters: [id],
        requestBody: jsonBody({
          type: "object",
          required: ["status"],
          properties: {
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE", "SUSPENDED"],
            },
          },
        }),
        responses: success(),
      },
    },
    "/api/admin/users/{id}/reset-password": {
      patch: {
        tags: ["Admin"],
        summary: "รีเซ็ตรหัสผ่าน",
        security: bearer,
        parameters: [id],
        requestBody: jsonBody({
          type: "object",
          required: ["newPassword"],
          properties: { newPassword: { type: "string", minLength: 8 } },
        }),
        responses: success(),
      },
    },
    "/api/admin/reports/summary": {
      get: {
        tags: ["Reports"],
        summary: "รายงานสรุป พร้อมกราฟการจอง 7 วันและสัดส่วนสถานะ",
        security: bearer,
        responses: success(),
      },
    },
    "/api/admin/reports/bookings": {
      get: {
        tags: ["Reports"],
        summary: "รายงาน Booking",
        security: bearer,
        responses: success(),
      },
    },
    "/api/admin/reports/classrooms": {
      get: {
        tags: ["Reports"],
        summary: "สถิติการใช้ห้อง",
        security: bearer,
        responses: success(),
      },
    },
    "/api/admin/reports/users": {
      get: {
        tags: ["Reports"],
        summary: "สถิติผู้ใช้",
        security: bearer,
        responses: success(),
      },
    },
    "/api/admin/reports/export": {
      get: {
        tags: ["Reports"],
        summary: "Export CSV พร้อมช่วงวันที่และตัวกรอง",
        security: bearer,
        parameters: [
          {
            name: "startDate",
            in: "query",
            description: "วันเริ่มต้น (รวมวัน) รูปแบบ YYYY-MM-DD หรือ ISO 8601",
            schema: { type: "string", example: "2026-09-01" },
          },
          {
            name: "endDate",
            in: "query",
            description:
              "วันสิ้นสุด (รวมทั้งวัน) รูปแบบ YYYY-MM-DD หรือ ISO 8601",
            schema: { type: "string", example: "2026-09-30" },
          },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: [
                "PENDING",
                "CONFIRMED",
                "IN_USE",
                "REJECTED",
                "CANCELLED",
                "COMPLETED",
                "NO_SHOW",
              ],
            },
          },
          { name: "classroomId", in: "query", schema: { type: "integer" } },
          { name: "userId", in: "query", schema: { type: "integer" } },
          {
            name: "userRole",
            in: "query",
            schema: {
              type: "string",
              enum: ["USER", "STUDENT", "TEACHER", "ADMIN"],
            },
          },
          { name: "building", in: "query", schema: { type: "string" } },
          { name: "floor", in: "query", schema: { type: "string" } },
          { name: "category", in: "query", schema: { type: "string" } },
          {
            name: "search",
            in: "query",
            description:
              "ค้นหารหัสจอง วัตถุประสงค์ ห้อง อาคาร ชื่อหรืออีเมลผู้จอง",
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "CSV",
            content: { "text/csv": { schema: { type: "string" } } },
          },
        },
      },
    },
    "/api/admin/audit-logs": {
      get: {
        tags: ["Admin"],
        summary: "Audit logs",
        security: bearer,
        parameters: [page, limit],
        responses: success(),
      },
    },
    "/api/admin/uploads/images": {
      post: {
        tags: ["Uploads"],
        summary: "อัปโหลด JPEG/PNG/WebP/GIF สูงสุด 5 MB",
        security: bearer,
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["image"],
                properties: { image: { type: "string", format: "binary" } },
              },
            },
          },
        },
        responses: { 201: { description: "Uploaded" }, ...success() },
      },
    },
    "/api/admin/uploads/images/{key}": {
      delete: {
        tags: ["Uploads"],
        summary: "ลบรูปที่อัปโหลด (local/R2)",
        security: bearer,
        parameters: [
          {
            name: "key",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: success(),
      },
    },
  },
};
