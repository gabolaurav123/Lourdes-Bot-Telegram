import "dotenv/config";
import { pollAutomations } from "./processors/automations";
import { pollCampaigns } from "./processors/campaigns";
import { cleanupTemporaryMedia } from "./processors/media";

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await pollAutomations();
    await pollCampaigns();
    await cleanupTemporaryMedia();
  } catch (error) {
    console.error("Worker tick failed:", error instanceof Error ? error.message : error);
  } finally {
    running = false;
  }
}

void tick();
setInterval(() => void tick(), Number(process.env.WORKER_POLL_INTERVAL_MS ?? 10_000));

console.log("CRM worker running with PostgreSQL polling");
