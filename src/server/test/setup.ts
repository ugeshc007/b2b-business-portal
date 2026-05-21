import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

process.env.DATABASE_URL = "file:./test.db";
process.env.JWT_SECRET = "test-secret-with-at-least-32-characters";
process.env.API_PORT = process.env.API_PORT || "4322";

const testDbPath = path.join(process.cwd(), "prisma/test.db");

if (!fs.existsSync(testDbPath)) {
  execFileSync(process.execPath, [path.join(process.cwd(), "node_modules/tsx/dist/cli.mjs"), "scripts/init-db.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, SQLITE_DB_PATH: testDbPath },
    stdio: "ignore",
  });
}
