import { createApp } from "./app";
import { config } from "./config";
import { telegramService } from "./services/telegram.service";

const app = createApp();

app.listen(config.apiPort, async () => {
  console.log(`API listening on http://localhost:${config.apiPort}`);
  await telegramService.restoreConnectedSession().catch((error) => {
    console.warn("Telegram session restore skipped:", error.message);
  });
});
