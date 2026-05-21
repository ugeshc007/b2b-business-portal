import fs from "node:fs";
import { env } from "../src/server/env";
import { prisma } from "../src/server/db";

const failures: string[] = [];

async function main() {
  if (!env.isProduction) failures.push("NODE_ENV must be production for production check.");
  if (env.jwtSecret.length < 32) failures.push("JWT_SECRET must be at least 32 characters.");
  if (env.jwtSecret.includes("dev-secret") || env.jwtSecret.includes("change-this") || env.jwtSecret.includes("replace-with")) {
    failures.push("JWT_SECRET is still a placeholder.");
  }
  if (env.appOrigin.includes("127.0.0.1") || env.appOrigin.includes("localhost")) {
    failures.push("APP_ORIGIN must be the real HTTPS production URL.");
  }
  if (!env.appOrigin.startsWith("https://")) failures.push("APP_ORIGIN should use HTTPS.");
  if (!env.gmail.oauthConfigured) {
    failures.push("Gmail OAuth env is missing: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, GMAIL_TOKEN_ENCRYPTION_KEY.");
  }
  if (!fs.existsSync("dist/index.html")) failures.push("Frontend build missing. Run npm run build.");

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    failures.push("Database readiness query failed.");
  }

  await prisma.$disconnect();

  if (failures.length) {
    console.error("Production readiness failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("Production readiness checks passed.");
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
