import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db";
import { clearApplicationLogs } from "./appLogger";

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
