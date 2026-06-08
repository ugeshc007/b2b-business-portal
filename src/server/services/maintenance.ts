import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db";
import { clearApplicationLogs } from "./appLogger";
import { appDateTime } from "../../shared/timezone";

export const flushCategories = [
  "transactions",
  "communicationLogs",
  "generatedFiles",
  "applicationLogs",
  "businessTargets",
  "stock",
  "productMaster",
  "companyData",
  "emailConfiguration",
  "users",
] as const;

export type FlushCategory = typeof flushCategories[number];

export type FlushInput = {
  categories?: FlushCategory[];
};

const defaultFlushCategories: FlushCategory[] = ["transactions", "communicationLogs", "generatedFiles", "applicationLogs"];
const emailSettingKeys = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GMAIL_TOKEN_ENCRYPTION_KEY",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_ENCRYPTION",
  "SMTP_USERNAME",
  "SMTP_PASSWORD",
  "IMAP_HOST",
  "IMAP_PORT",
  "IMAP_ENCRYPTION",
  "IMAP_USERNAME",
  "IMAP_PASSWORD",
];

function databasePath() {
  const rawUrl = process.env.DATABASE_URL || "file:./dev.db";
  const filePath = rawUrl.startsWith("file:") ? rawUrl.slice(5) : "prisma/dev.db";
  if (path.isAbsolute(filePath)) return filePath;
  const rootRelative = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(rootRelative)) return rootRelative;
  return path.resolve(process.cwd(), "prisma", filePath);
}

function backupDirectory() {
  const dir = path.resolve(process.cwd(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeBackupFileName(fileName: string) {
  const baseName = path.basename(fileName);
  if (!/^db-\d{8}-\d{6}\.db$|^pre-restore-\d{8}-\d{6}\.db$/.test(baseName)) {
    throw new Error("Invalid backup file name");
  }
  return baseName;
}

function clearDirectory(relativePath: string) {
  const dir = path.resolve(process.cwd(), relativePath);
  fs.mkdirSync(dir, { recursive: true });
  let deleted = 0;
  for (const file of fs.readdirSync(dir)) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
      deleted += 1;
    } else {
      fs.unlinkSync(filePath);
      deleted += 1;
    }
  }
  return deleted;
}

function normalizeCategories(input?: FlushInput) {
  const requested = input?.categories?.length ? input.categories : defaultFlushCategories;
  const allowed = new Set<FlushCategory>(flushCategories);
  const selected = new Set(requested.filter((category): category is FlushCategory => allowed.has(category as FlushCategory)));
  if (selected.has("companyData") || selected.has("productMaster")) {
    selected.add("transactions");
    selected.add("communicationLogs");
    selected.add("stock");
  }
  if (selected.has("companyData")) {
    selected.add("businessTargets");
    selected.add("emailConfiguration");
  }
  return selected;
}

export async function flushTransactionalData(input?: FlushInput) {
  const selected = normalizeCategories(input);
  const counts = await prisma.$transaction(async (tx) => {
    const before: Record<string, number> = {};

    if (selected.has("transactions")) {
      before.ecommerceOrders = await tx.ecommerceOrder.count();
      before.agentDecisions = await tx.agentDecision.count();
      before.invoices = await tx.invoice.count();
      before.purchaseOrders = await tx.purchaseOrder.count();
      before.quotations = await tx.quotation.count();
      before.requirements = await tx.requirement.count();
      before.monthlyTargets = await tx.monthlyTarget.count();
      before.stockMovements = await tx.stockMovement.count();
      before.businessPlans = await tx.appSetting.count({ where: { key: { startsWith: "businessPlan:" } } });

      await tx.stockMovement.deleteMany();
      await tx.ecommerceOrder.deleteMany();
      await tx.agentDecision.deleteMany();
      await tx.emailLog.updateMany({ data: { requirementId: null } });
      await tx.invoiceLine.deleteMany();
      await tx.invoice.deleteMany();
      await tx.purchaseOrderLine.deleteMany();
      await tx.purchaseOrder.deleteMany();
      await tx.quotationLine.deleteMany();
      await tx.quotation.deleteMany();
      await tx.requirementLine.deleteMany();
      await tx.requirement.deleteMany();
      await tx.monthlyTargetLine.deleteMany();
      await tx.monthlyTarget.deleteMany();
      await tx.appSetting.deleteMany({ where: { key: { startsWith: "businessPlan:" } } });
    }

    if (selected.has("communicationLogs")) {
      before.emailLogs = await tx.emailLog.count();
      before.agentAuditLogs = await tx.agentAuditLog.count();
      await tx.agentAuditLog.deleteMany();
      await tx.emailLog.deleteMany();
    }

    if (selected.has("businessTargets")) {
      before.turnoverTargets = await tx.turnoverTarget.count();
      await tx.turnoverTarget.deleteMany();
    }

    if (selected.has("stock")) {
      before.stock = await tx.stock.count();
      before.stockMovements = before.stockMovements ?? await tx.stockMovement.count();
      await tx.stockMovement.deleteMany();
      await tx.stock.deleteMany();
    }

    if (selected.has("productMaster")) {
      before.products = await tx.item.count();
      await tx.item.deleteMany();
    }

    if (selected.has("emailConfiguration")) {
      before.emailIntegrations = await tx.emailIntegration.count();
      before.emailSettings = await tx.appSetting.count({
        where: {
          OR: [
            { key: { in: emailSettingKeys } },
            { key: { startsWith: "COMPANY_EMAIL:" } },
          ],
        },
      });
      await tx.emailIntegration.deleteMany();
      await tx.appSetting.deleteMany({
        where: {
          OR: [
            { key: { in: emailSettingKeys } },
            { key: { startsWith: "COMPANY_EMAIL:" } },
          ],
        },
      });
    }

    if (selected.has("companyData")) {
      before.companies = await tx.company.count();
      await tx.company.deleteMany();
    }

    if (selected.has("users")) {
      const users = await tx.user.findMany({ orderBy: { createdAt: "asc" } });
      before.users = Math.max(users.length - 1, 0);
      if (users.length > 1) {
        await tx.user.deleteMany({ where: { id: { in: users.slice(1).map((user) => user.id) } } });
      }
    }

    return before;
  });

  const deletedFiles: Record<string, number> = {};
  if (selected.has("generatedFiles")) {
    deletedFiles.purchaseOrderPdfs = clearDirectory("storage/purchase-orders");
    deletedFiles.invoicePdfs = clearDirectory("storage/invoices");
  }
  if (selected.has("companyData")) {
    deletedFiles.companyLogos = clearDirectory("storage/company-logos");
  }
  if (selected.has("applicationLogs")) {
    deletedFiles.logs = clearApplicationLogs();
  }

  return {
    flushed: true,
    selectedCategories: [...selected],
    preserved: ["unselected categories", "environment secrets", "first admin user when users are selected"],
    deletedRecords: counts,
    deletedFiles,
  };
}

export async function createDatabaseBackup(prefix = "db") {
  await prisma.$queryRaw`SELECT 1`;
  const source = databasePath();
  if (!fs.existsSync(source)) throw new Error("SQLite database file not found");
  const stamp = appDateTime().replace(/[^0-9]/g, "").slice(0, 14);
  const fileName = `${prefix}-${stamp.slice(0, 8)}-${stamp.slice(8, 14)}.db`;
  const target = path.join(backupDirectory(), fileName);
  fs.copyFileSync(source, target);
  const stat = fs.statSync(target);
  return { fileName, path: target, bytes: stat.size, createdAt: new Date(stat.mtimeMs).toISOString() };
}

export async function listDatabaseBackups() {
  const dir = backupDirectory();
  const backups = fs.readdirSync(dir)
    .filter((file) => /^db-\d{8}-\d{6}\.db$|^pre-restore-\d{8}-\d{6}\.db$/.test(file))
    .map((file) => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      return { fileName: file, bytes: stat.size, createdAt: new Date(stat.mtimeMs).toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { backups };
}

export async function restoreDatabaseBackup(input: { fileName: string; typedConfirmation: string }) {
  if (input.typedConfirmation !== "RESTORE DATABASE") {
    throw new Error("Type RESTORE DATABASE to confirm database restore");
  }
  const fileName = safeBackupFileName(input.fileName);
  const backupPath = path.join(backupDirectory(), fileName);
  if (!fs.existsSync(backupPath)) throw new Error("Backup file not found");
  await createDatabaseBackup("pre-restore");
  const target = databasePath();
  fs.copyFileSync(backupPath, target);
  return { restored: true, fileName };
}
