import { Router } from "express";
import { authenticate, requireRole } from "../../shared/middlewares/auth";
import dashboard from "./admin-dashboard.routes";
import classrooms from "./admin-classrooms.routes";
import bookings from "./admin-bookings.routes";
import users from "./admin-users.routes";
import reports from "./admin-reports.routes";
import auditlogs from "./admin-audit-logs.routes";

const router = Router();
// Child routers ด้านล่างพึ่ง guard นี้ จึงต้อง mount ผ่าน router หลักเสมอ
router.use(authenticate, requireRole("ADMIN"));
router.use(dashboard);
router.use(classrooms);
router.use(bookings);
router.use(users);
router.use(reports);
router.use(auditlogs);
export default router;
