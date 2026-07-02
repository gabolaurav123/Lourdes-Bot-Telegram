import { Queue } from "bullmq";
import { config } from "../config";

function redisConnectionOptions() {
  const url = new URL(config.redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number(url.pathname.replace("/", "") || 0),
    maxRetriesPerRequest: null
  };
}

export const redisConnection = redisConnectionOptions();

export const campaignQueue = new Queue("campaigns", { connection: redisConnection });
export const automationQueue = new Queue("automations", { connection: redisConnection });
export const followupQueue = new Queue("followups", { connection: redisConnection });
