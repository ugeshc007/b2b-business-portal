import { createApp } from "./app";
import { env } from "./env";
import { processDueScheduledTargets } from "./services/businessPlanAgent";

const app = createApp();

const host = env.isProduction ? "0.0.0.0" : "127.0.0.1";

const server = app.listen(env.apiPort, host, () => {
  console.log(`B2B API running at http://${host}:${env.apiPort}`);
});

server.ref();

let scheduledTargetCheckRunning = false;
async function checkScheduledTargets() {
  if (scheduledTargetCheckRunning) return;
  scheduledTargetCheckRunning = true;
  try {
    const result = await processDueScheduledTargets();
    if (result.sent > 0) console.log(`Scheduled workflow sent ${result.sent} due PO(s).`);
  } catch (error) {
    console.error("Scheduled workflow check failed", error);
  } finally {
    scheduledTargetCheckRunning = false;
  }
}

const scheduledTargetInterval = setInterval(() => {
  void checkScheduledTargets();
}, 60_000);
scheduledTargetInterval.unref();
void checkScheduledTargets();

server.on("error", (error) => {
  console.error("B2B API server error", error);
});
server.on("close", () => {
  console.error("B2B API server closed");
});

process.on("beforeExit", (code) => {
  const getHandles = (process as unknown as { _getActiveHandles?: () => unknown[] })._getActiveHandles;
  const activeHandles = typeof getHandles === "function" ? getHandles.call(process).length : "unknown";
  console.error(`B2B API beforeExit code=${code} activeHandles=${activeHandles}`);
});
process.on("exit", (code) => {
  console.error(`B2B API exit code=${code}`);
});
process.on("uncaughtException", (error) => {
  console.error("B2B API uncaughtException", error);
  process.exitCode = 1;
});
process.on("unhandledRejection", (reason) => {
  console.error("B2B API unhandledRejection", reason);
  process.exitCode = 1;
});
