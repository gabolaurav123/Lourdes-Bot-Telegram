import { createApp } from "./app";
import { config } from "./config";
import { telegramService } from "./services/telegram.service";
import { mediaService } from "./services/media.service";

const app = createApp();

app.listen(config.apiPort, async () => {
  console.log(`API listening on http://localhost:${config.apiPort}`);
  await telegramService.repairLegacyFalseStops().catch((error) => {
    console.warn("Legacy false-stop repair skipped:", error.message);
  });
  await telegramService.restoreConnectedSession().catch((error) => {
    console.warn("Telegram session restore skipped:", error.message);
  });
  await mediaService.cleanupExpiredTemporary().catch((error) => {
    console.warn("Temporary media cleanup skipped:", error.message);
  });
});

setInterval(() => {
  void mediaService.cleanupExpiredTemporary().catch((error) => {
    console.warn("Temporary media cleanup failed:", error.message);
  });
}, 60 * 60 * 1000);
