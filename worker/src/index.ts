import "dotenv/config";
import { startAutomationWorker } from "./processors/automations";
import { startCampaignWorker } from "./processors/campaigns";
import { startFollowupWorker } from "./processors/followups";

const workers = [startCampaignWorker(), startAutomationWorker(), startFollowupWorker()];

for (const worker of workers) {
  worker.on("completed", (job) => console.log(`Job completed: ${worker.name}:${job.id}`));
  worker.on("failed", (job, error) => console.error(`Job failed: ${worker.name}:${job?.id}`, error.message));
}

console.log("CRM worker running");
