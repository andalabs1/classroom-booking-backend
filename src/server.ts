import { app } from "./app";
import { env } from "./shared/config/env";
import { startBookingReminderWorker } from "./modules/bookings/booking-reminder.service";
app.listen(env.PORT, () => {
  const baseUrl = `http://localhost:${env.PORT}`;

  console.log(`API listening on ${baseUrl}`);
  console.log(`API:     ${baseUrl}/`);
  console.log(`Health:  ${baseUrl}/health`);
  console.log(`Docs:    ${baseUrl}/docs`);
  console.log(`OpenAPI: ${baseUrl}/api-docs`);
  console.log(`API v1:  ${baseUrl}/api`);
  startBookingReminderWorker();
});
