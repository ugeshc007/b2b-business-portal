import fs from "node:fs";
import path from "node:path";

const source = process.env.SQLITE_DB_PATH
  ? path.resolve(process.env.SQLITE_DB_PATH)
  : path.resolve("prisma/dev.db");

if (!fs.existsSync(source)) {
  console.error(`Database file not found: ${source}`);
  process.exit(1);
}

const backupDir = path.resolve("backups");
fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(backupDir, `${path.basename(source, ".db")}-${stamp}.db`);

fs.copyFileSync(source, target);
console.log(`Backup created: ${target}`);
