import type { Job } from "bullmq";
import { createWorker } from "../queues";
import { sendToLead } from "../telegram";

export function startFollowupWorker() {
  return createWorker("followups", async (job: Job<{ leadId: string; text: string; mediaAssetId?: string; sensitive?: boolean }>) => {
    await sendToLead({
      leadId: job.data.leadId,
      text: job.data.text,
      mediaAssetId: job.data.mediaAssetId,
      sensitive: job.data.sensitive,
      intent: "follow_up"
    });
  });
}
