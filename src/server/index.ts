import { createApp } from "./app";
import { env } from "./env";

const app = createApp();

const host = env.isProduction ? "0.0.0.0" : "127.0.0.1";

const server = app.listen(env.apiPort, host, () => {
  console.log(`B2B API running at http://${host}:${env.apiPort}`);
});

server.ref();
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
