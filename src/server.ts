import { app } from "./app";
import { env } from "./shared/config/env";
import { startBookingReminderWorker } from "./modules/bookings/booking-reminder.service";
app.listen(env.PORT, () => {
  console.log(`API listening on ${env.PORT}`);
  startBookingReminderWorker();
});
