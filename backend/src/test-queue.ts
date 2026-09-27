import "dotenv/config";
import { emailQueue } from "./queues/email.queue.js";

async function main() {
  try {
    const job = await emailQueue.add("test-email", {
      recipient: "test@example.com",
      subject: "ReachInbox queue test",
      body: "Testing BullMQ with Upstash Redis",
    });

    console.log("Job added:", job.id);
    console.log("Job state:", await job.getState());
  } catch (error) {
    console.error("Queue error:", error);
  } finally {
    await emailQueue.close();
  }
}

main();