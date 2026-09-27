import "dotenv/config";
import IORedis from "ioredis";

const redis = new IORedis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD,
  tls: {},
  maxRetriesPerRequest: null,
  retryStrategy: () => null,
});

redis.on("error", (err) => {
  console.error("Redis error:", err.message);
});

async function main() {
  try {
    console.log("Host loaded:", !!process.env.REDIS_HOST);
    console.log("Password loaded:", !!process.env.REDIS_PASSWORD);
    console.log("Port:", process.env.REDIS_PORT);

    console.log("PING:", await redis.ping());
    await redis.set("reachinbox-test", "connected");
    console.log("VALUE:", await redis.get("reachinbox-test"));
  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await redis.quit();
  }
}

main();