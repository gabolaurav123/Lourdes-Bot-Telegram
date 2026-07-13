import "dotenv/config";
import { pollAutomations } from "./processors/automations";
import { pollCampaigns } from "./processors/campaigns";
import { config, workerConfigurationError } from "./config";
import { writeWorkerStatus } from "./status";

let running = false;
let lastSuccessAt: string | undefined;

async function tick() {
  if (running) return;
  running = true;
  try {
    const configurationError = workerConfigurationError();
    if (configurationError) throw new Error(configurationError);
    await pollAutomations();
    await pollCampaigns();
    lastSuccessAt = new Date().toISOString();
    await writeWorkerStatus({ state: "RUNNING", lastSuccessAt, lastError: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Worker tick failed:", message);
    await writeWorkerStatus({ state: "ERROR", lastSuccessAt, lastError: message }).catch(() => undefined);
  } finally {
    running = false;
  }
}

await writeWorkerStatus({ state: "STARTING", lastError: null }).catch((error) => {
  console.error("Worker heartbeat failed:", error instanceof Error ? error.message : error);
});
void tick();
setInterval(() => void tick(), config.pollIntervalMs);

console.log("CRM worker running with PostgreSQL polling");
