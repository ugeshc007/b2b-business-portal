import { createApp } from "./app";
import { env } from "./env";

const app = createApp();

const host = env.isProduction ? "0.0.0.0" : "127.0.0.1";

app.listen(env.apiPort, host, () => {
  console.log(`B2B API running at http://${host}:${env.apiPort}`);
});
