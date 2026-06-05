import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db";
import { clearApplicationLogs } from "./appLogger";

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

export async function flushTransactionalData() {
  const counts = await prisma.$transaction(async (tx) => {
    const before = {
      ecommerceOrders: await tx.ecommerceOrder.count(),
      emailLogs: await tx.emailLog.count(),
      agentAuditLogs: await tx.agentAuditLog.count(),
      agentDecisions: await tx.agentDecision.count(),
      invoices: await tx.invoice.count(),
      purchaseOrders: await tx.purchaseOrder.count(),
      quotations: await tx.quotation.count(),
      requirements: await tx.requirement.count(),
      monthlyTargets: await tx.monthlyTarget.count(),
    };

    await tx.agentAuditLog.deleteMany();
    await tx.emailLog.deleteMany();
    await tx.ecommerceOrder.deleteMany();
    await tx.agentDecision.deleteMany();
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

    return before;
  });

  const deletedFiles = {
    purchaseOrderPdfs: clearDirectory("storage/purchase-orders"),
    invoicePdfs: clearDirectory("storage/invoices"),
    logs: clearApplicationLogs(),
  };

  return {
    flushed: true,
    preserved: ["companies", "products", "stock", "email configuration", "users", "app settings"],
    deletedRecords: counts,
    deletedFiles,
  };
}
