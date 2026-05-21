import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, login } from "./auth";
import { createCompany, createItem, setStock } from "./services/catalog";
import { createMonthlyTarget, runTargetWorkflow, vendorCreateInvoiceForTarget } from "./services/workflow";

const prisma = new PrismaClient();

async function clearDb() {
  await prisma.appSetting.deleteMany();
  await prisma.agentAuditLog.deleteMany();
  await prisma.emailLog.deleteMany();
  await prisma.agentDecision.deleteMany();
  await prisma.emailIntegration.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.purchaseOrderLine.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.quotationLine.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.requirementLine.deleteMany();
  await prisma.requirement.deleteMany();
  await prisma.monthlyTargetLine.deleteMany();
  await prisma.monthlyTarget.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.item.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();
}

async function setupScenario() {
  const buyer = await createCompany({
    name: "Company A",
    legalName: "Company A Trading LLC",
    location: "Dubai",
    email: "a@example.com",
  });
  const seller = await createCompany({
    name: "Company B",
    legalName: "Company B Distribution LLC",
    location: "Abu Dhabi",
    email: "b@example.com",
  });
  const item = await createItem({
    sku: "SKU-1",
    name: "Test Item",
    unit: "pcs",
    expectedPrice: 100,
    maxPrice: 120,
  });
  await setStock(seller.id, item.id, 50);
  return { buyer, seller, item };
}

beforeEach(async () => {
  await clearDb();
});

afterAll(async () => {
  await clearDb();
  await prisma.$disconnect();
});

describe("auth", () => {
  it("creates and logs in the admin user", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const session = await login("admin@example.com", "ChangeMe123!");
    expect(session.token.length).toBeGreaterThan(20);
    expect(session.user.email).toBe("admin@example.com");
  });
});

describe("target workflow", () => {
  it("runs buyer PO, then vendor invoice and stock movement", async () => {
    const { buyer, seller, item } = await setupScenario();
    const target = await createMonthlyTarget({
      buyerCompanyId: buyer.id,
      sellerCompanyId: seller.id,
      month: "2026-05",
      lines: [{ itemId: item.id, quantity: 10, maxPrice: 120 }],
    });

    const result = await runTargetWorkflow(target.id);
    expect(result.approval.approved).toBe(true);
    expect(result.invoice).toBeNull();

    const sellerStock = await prisma.stock.findUniqueOrThrow({
      where: { companyId_itemId: { companyId: seller.id, itemId: item.id } },
    });
    const buyerStock = await prisma.stock.findUniqueOrThrow({
      where: { companyId_itemId: { companyId: buyer.id, itemId: item.id } },
    });

    expect(sellerStock.quantity).toBe(40);
    expect(buyerStock.quantity).toBe(10);
    expect(await prisma.emailLog.count()).toBe(1);
    const emails = await prisma.emailLog.findMany({ orderBy: { createdAt: "asc" } });
    expect(emails[0].subject).toContain("Purchase Order");

    const poSentTarget = await prisma.monthlyTarget.findUniqueOrThrow({ where: { id: target.id } });
    expect(poSentTarget.status).toBe("PO_SENT");
    await expect(runTargetWorkflow(target.id)).rejects.toThrow("Workflow already ran for this target");

    const vendorResult = await vendorCreateInvoiceForTarget(target.id);
    expect(vendorResult.invoice.total.toFixed(2)).toBe("1050.00");
    const completedTarget = await prisma.monthlyTarget.findUniqueOrThrow({ where: { id: target.id } });
    expect(completedTarget.status).toBe("COMPLETED");
    const allEmails = await prisma.emailLog.findMany({ orderBy: { createdAt: "asc" } });
    expect(allEmails[1].subject).toContain("Tax Invoice");
    const auditSteps = await prisma.agentAuditLog.findMany({ orderBy: { createdAt: "asc" } });
    expect(auditSteps.some((entry) => entry.step === "PO_SENT")).toBe(true);
    expect(auditSteps.some((entry) => entry.step === "INVOICE_SENT")).toBe(true);
  });

  it("runs the reverse flow with Buy2day buying and Dealzarabia issuing invoice", async () => {
    const buy2day = await createCompany({
      name: "Buy2day",
      legalName: "Buy2day Distribution LLC",
      location: "Sharjah",
      email: "b2dfinance01@example.com",
    });
    const dealz = await createCompany({
      name: "Dealzarabia",
      legalName: "Dealzarabia Trading LLC",
      location: "Dubai",
      email: "dealzinvoice@example.com",
    });
    const item = await createItem({
      sku: "REVERSE-PO",
      name: "Reverse Flow Gift Card",
      unit: "code",
      expectedPrice: 50,
      maxPrice: 55,
    });
    await setStock(dealz.id, item.id, 30);

    const target = await createMonthlyTarget({
      buyerCompanyId: buy2day.id,
      sellerCompanyId: dealz.id,
      month: "2026-05",
      lines: [{ itemId: item.id, quantity: 4, maxPrice: 55 }],
    });

    const poResult = await runTargetWorkflow(target.id);
    expect(poResult.order?.buyerCompanyId).toBe(buy2day.id);
    expect(poResult.order?.sellerCompanyId).toBe(dealz.id);

    const poEmail = await prisma.emailLog.findFirstOrThrow({ where: { subject: { contains: "Purchase Order" } } });
    expect(poEmail.fromEmail).toBe("b2dfinance01@example.com");
    expect(poEmail.toEmail).toBe("dealzinvoice@example.com");

    const invoiceResult = await vendorCreateInvoiceForTarget(target.id);
    expect(invoiceResult.invoice.buyerCompanyId).toBe(buy2day.id);
    expect(invoiceResult.invoice.sellerCompanyId).toBe(dealz.id);

    const invoiceEmail = await prisma.emailLog.findFirstOrThrow({ where: { subject: { contains: "Tax Invoice" } } });
    expect(invoiceEmail.fromEmail).toBe("dealzinvoice@example.com");
    expect(invoiceEmail.toEmail).toBe("b2dfinance01@example.com");
  });

  it("holds the workflow when seller stock is insufficient", async () => {
    const { buyer, seller, item } = await setupScenario();
    const target = await createMonthlyTarget({
      buyerCompanyId: buyer.id,
      sellerCompanyId: seller.id,
      month: "2026-05",
      lines: [{ itemId: item.id, quantity: 60, maxPrice: 120 }],
    });

    await expect(runTargetWorkflow(target.id)).rejects.toThrow("Insufficient seller stock");

    const heldTarget = await prisma.monthlyTarget.findUniqueOrThrow({ where: { id: target.id } });
    expect(heldTarget.status).toBe("HELD");
  });
});
