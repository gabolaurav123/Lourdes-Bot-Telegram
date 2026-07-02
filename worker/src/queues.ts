import { Worker, type Processor } from "bullmq";
import { config } from "./config";

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

export const connection = redisConnectionOptions();

export function createWorker<T>(name: string, processor: Processor<T>) {
  return new Worker<T>(name, processor, { connection, concurrency: 3 });
}
