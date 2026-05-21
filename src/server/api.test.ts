import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app";
import { createUser } from "./auth";
import { createCompany, createItem, setStock } from "./services/catalog";
import { createMonthlyTarget, runTargetWorkflow } from "./services/workflow";

const prisma = new PrismaClient();
const app = createApp();

beforeEach(async () => {
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
});

afterAll(async () => {
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
  await prisma.$disconnect();
});

describe("api", () => {
  it("protects dashboard and returns summary for logged-in admin", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");

    await request(app).get("/api/dashboard/summary").expect(401);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const summary = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    expect(summary.body.counts.companies).toBe(0);
    expect(summary.body.overview.invoiceTotal).toBe("0");
    expect(summary.body.overview.stockByCompany).toEqual([]);
  });

  it("sets stock for a company and item through the protected API", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const company = await createCompany({
      name: "Dealzarabia",
      legalName: "Dealzarabia Trading LLC",
      location: "Dubai",
      email: "stock-api@example.com",
    });
    const item = await createItem({
      sku: "STOCK-API",
      name: "Stock API Item",
      unit: "pcs",
      expectedPrice: 25,
    });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const stock = await request(app)
      .post("/api/catalog/stock")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ companyId: company.id, itemId: item.id, quantity: 75 })
      .expect(201);

    expect(stock.body.quantity).toBe(75);
    expect(stock.body.company.name).toBe("Dealzarabia");
    expect(stock.body.item.sku).toBe("STOCK-API");

    const summary = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    expect(summary.body.overview.stockByCompany).toEqual([
      { companyId: company.id, companyName: "Dealzarabia", itemCount: 1, totalQuantity: 75 },
    ]);
  });

  it("updates company profile details used by PO and invoice documents", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const company = await createCompany({
      name: "Dealzarabia",
      legalName: "Dealzarabia Trading LLC",
      location: "Dubai",
      email: "profile-old@example.com",
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const updated = await request(app)
      .patch(`/api/catalog/companies/${company.id}`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        name: "Dealz",
        legalName: "Dealz Arabia FZ LLC",
        location: "Office 1201, Dubai, UAE",
        email: "profile-new@example.com",
        trn: "100123456789000",
        bankName: "ADCB",
        bankBeneficiaryName: "Dealz Arabia Electronics Trading LLC",
        bankAccountNumber: "14213322920001",
        bankIban: "AE470030014213322920001",
        bankCid: "14213322",
        bankBranch: "Al Rigga Road",
      })
      .expect(200);

    expect(updated.body.legalName).toBe("Dealz Arabia FZ LLC");
    expect(updated.body.location).toContain("Dubai");
    expect(updated.body.trn).toBe("100123456789000");
    expect(updated.body.bankName).toBe("ADCB");
    expect(updated.body.bankIban).toBe("AE470030014213322920001");

    const summary = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    expect(summary.body.companies[0].email).toBe("profile-new@example.com");
    expect(summary.body.companies[0].bankBeneficiaryName).toBe("Dealz Arabia Electronics Trading LLC");
  });

  it("deletes a clean company and removes setup data", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const company = await createCompany({
      name: "Temporary Company",
      legalName: "Temporary Company LLC",
      location: "Dubai",
      email: "delete-clean@example.com",
    });
    const item = await createItem({
      sku: "DELETE-STOCK",
      name: "Delete Stock Item",
      unit: "pcs",
      expectedPrice: 25,
    });
    await setStock(company.id, item.id, 10);
    await prisma.emailIntegration.create({
      data: {
        companyId: company.id,
        email: company.email,
        mode: "SIMULATION",
        status: "READY_TO_CONNECT",
      },
    });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const deleted = await request(app)
      .delete(`/api/catalog/companies/${company.id}`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    expect(deleted.body.deleted).toBe(true);
    expect(await prisma.company.count()).toBe(0);
    expect(await prisma.stock.count()).toBe(0);
    expect(await prisma.emailIntegration.count()).toBe(0);
    expect(await prisma.item.count()).toBe(1);
  });

  it("blocks deleting a company with transaction history", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const buyer = await createCompany({
      name: "Dealzarabia",
      legalName: "Dealzarabia Trading LLC",
      location: "Dubai",
      email: "delete-history-buyer@example.com",
    });
    const seller = await createCompany({
      name: "Buy2day",
      legalName: "Buy2day Distribution LLC",
      location: "Sharjah",
      email: "delete-history-seller@example.com",
    });
    const item = await createItem({
      sku: "DELETE-HISTORY",
      name: "Delete History Item",
      unit: "pcs",
      expectedPrice: 100,
    });
    await createMonthlyTarget({
      buyerCompanyId: buyer.id,
      sellerCompanyId: seller.id,
      month: "2026-05",
      lines: [{ itemId: item.id, quantity: 5, maxPrice: 120 }],
    });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const blocked = await request(app)
      .delete(`/api/catalog/companies/${buyer.id}`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(400);

    expect(blocked.body.error).toContain("transaction history");
    expect(await prisma.company.count()).toBe(2);
  });

  it("bulk uploads stock rows and creates missing items", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const company = await createCompany({
      name: "Buy2day",
      legalName: "Buy2day Distribution LLC",
      location: "Sharjah",
      email: "bulk@example.com",
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const result = await request(app)
      .post("/api/catalog/stock/bulk")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        companyId: company.id,
        mode: "SET",
        csvText: "sku,name,quantity,unit,expectedPrice,maxPrice\nBULK-1,Bulk Item One,12,pcs,50,55\nBULK-2,Bulk Item Two,8,box,80,90",
      })
      .expect(201);

    expect(result.body.imported).toBe(2);
    expect(await prisma.item.count()).toBe(2);
    expect(await prisma.stock.count()).toBe(2);
  });

  it("parses a purchase invoice and adds received stock", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const company = await createCompany({
      name: "Dealzarabia",
      legalName: "Dealzarabia Trading LLC",
      location: "Dubai",
      email: "invoice-stock@example.com",
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    await request(app)
      .post("/api/catalog/stock/from-purchase-invoice")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        companyId: company.id,
        invoiceText: "INV-STOCK-1,Invoice Stock Item,5,100\nINV-STOCK-1,Invoice Stock Item,3,100",
      })
      .expect(201);

    const item = await prisma.item.findUniqueOrThrow({ where: { sku: "INV-STOCK-1" } });
    const stock = await prisma.stock.findUniqueOrThrow({
      where: { companyId_itemId: { companyId: company.id, itemId: item.id } },
    });
    expect(stock.quantity).toBe(8);
  });

  it("updates and deletes an open monthly target", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const buyer = await createCompany({
      name: "Dealzarabia",
      legalName: "Dealzarabia Trading LLC",
      location: "Dubai",
      email: "target-buyer@example.com",
    });
    const seller = await createCompany({
      name: "Buy2day",
      legalName: "Buy2day Distribution LLC",
      location: "Sharjah",
      email: "target-seller@example.com",
    });
    const item = await createItem({
      sku: "TARGET-API",
      name: "Target API Item",
      unit: "pcs",
      expectedPrice: 100,
    });
    const target = await createMonthlyTarget({
      buyerCompanyId: buyer.id,
      sellerCompanyId: seller.id,
      month: "2026-05",
      lines: [{ itemId: item.id, quantity: 5, maxPrice: 120 }],
    });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const updated = await request(app)
      .patch(`/api/workflow/targets/${target.id}`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        buyerCompanyId: buyer.id,
        sellerCompanyId: seller.id,
        month: "2026-06",
        notes: "Updated target",
        lines: [{ itemId: item.id, quantity: 9, maxPrice: 115 }],
      })
      .expect(200);

    expect(updated.body.month).toBe("2026-06");
    expect(updated.body.lines[0].quantity).toBe(9);

    const deleted = await request(app)
      .delete(`/api/workflow/targets/${target.id}`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    expect(deleted.body.deleted).toBe(true);
    expect(await prisma.monthlyTarget.count()).toBe(0);
  });

  it("creates a random monthly target from seller stock and amount", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const buyer = await createCompany({
      name: "Dealzarabia",
      legalName: "Dealzarabia Trading LLC",
      location: "Dubai",
      email: "random-buyer@example.com",
    });
    const seller = await createCompany({
      name: "Buy2day",
      legalName: "Buy2day Distribution LLC",
      location: "Sharjah",
      email: "random-seller@example.com",
    });
    const itemA = await createItem({
      sku: "RANDOM-A",
      name: "Random Item A",
      unit: "pcs",
      expectedPrice: 50,
      maxPrice: 60,
    });
    const itemB = await createItem({
      sku: "RANDOM-B",
      name: "Random Item B",
      unit: "pcs",
      expectedPrice: 125,
      maxPrice: 140,
    });
    await setStock(seller.id, itemA.id, 20);
    await setStock(seller.id, itemB.id, 10);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const target = await request(app)
      .post("/api/workflow/targets/random")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        buyerCompanyId: buyer.id,
        sellerCompanyId: seller.id,
        month: "2026-05",
        amount: 500,
        lineCount: 2,
      })
      .expect(201);

    expect(target.body.lines.length).toBeGreaterThan(0);
    expect(target.body.lines.length).toBeLessThanOrEqual(2);
    expect(target.body.lines.every((line: { quantity: number }) => line.quantity > 0)).toBe(true);
    expect(target.body.lines.map((line: { item: { sku: string } }) => line.item.sku).sort()).toEqual(["RANDOM-A", "RANDOM-B"]);
  });

  it("creates a daily sales target with company as seller and counterparty as customer", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const seller = await createCompany({
      name: "Dealzarabia",
      legalName: "Dealzarabia Trading LLC",
      location: "Dubai",
      email: "daily-seller@example.com",
    });
    const customer = await createCompany({
      name: "Buy2day",
      legalName: "Buy2day Distribution LLC",
      location: "Sharjah",
      email: "daily-customer@example.com",
    });
    const item = await createItem({
      sku: "DAILY-SALE",
      name: "Daily Sale Item",
      unit: "code",
      expectedPrice: 100,
      maxPrice: 110,
    });
    await setStock(seller.id, item.id, 50);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const target = await request(app)
      .post("/api/workflow/targets/daily")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        companyId: seller.id,
        counterpartyId: customer.id,
        direction: "SALES",
        date: "2026-05-20",
        amount: 500,
        lineCount: 1,
      })
      .expect(201);

    expect(target.body.buyerCompany.id).toBe(customer.id);
    expect(target.body.sellerCompany.id).toBe(seller.id);
    expect(target.body.month).toBe("2026-05");
    expect(target.body.targetDate).toBe("2026-05-20");
    expect(target.body.lines[0].item.sku).toBe("DAILY-SALE");
  });

  it("creates a structured sales target with selected products and can stop it before running", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const seller = await createCompany({
      name: "Buy2day",
      legalName: "Buy2day Distribution LLC",
      location: "Sharjah",
      email: "structured-seller@example.com",
    });
    const customer = await createCompany({
      name: "Dealzarabia",
      legalName: "Dealzarabia Trading LLC",
      location: "Dubai",
      email: "structured-customer@example.com",
    });
    const item = await createItem({
      sku: "STRUCTURED-SALE",
      name: "Structured Sale Item",
      unit: "code",
      expectedPrice: 50,
      maxPrice: 60,
    });
    await setStock(seller.id, item.id, 100);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const response = await request(app)
      .post("/api/workflow/targets/transaction")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        companyId: seller.id,
        counterpartyId: customer.id,
        direction: "SALES",
        periodType: "DAILY",
        month: "2026-05",
        dateFrom: "2026-05-20",
        dateTo: "2026-05-20",
        hourFrom: "09:00",
        hourTo: "12:00",
        amount: 500,
        lineCount: 1,
        productMode: "SELECTED",
        itemIds: [item.id],
      })
      .expect(201);

    expect(response.body.target.buyerCompany.id).toBe(customer.id);
    expect(response.body.target.sellerCompany.id).toBe(seller.id);
    expect(response.body.target.periodType).toBe("DAILY");
    expect(response.body.target.direction).toBe("SALES");
    expect(response.body.target.hourFrom).toBe("09:00");
    expect(response.body.target.productMode).toBe("SELECTED");
    expect(response.body.target.lines[0].item.sku).toBe("STRUCTURED-SALE");

    const stopped = await request(app)
      .post(`/api/workflow/targets/${response.body.target.id}/stop`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    expect(stopped.body.status).toBe("STOPPED");
  });

  it("creates and runs an AI agent instruction target", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const buyer = await createCompany({
      name: "Buy2day",
      legalName: "Buy2day Distribution LLC",
      location: "Sharjah",
      email: "agent-buyer@example.com",
    });
    const seller = await createCompany({
      name: "Dealzarabia",
      legalName: "Dealzarabia Trading LLC",
      location: "Dubai",
      email: "agent-seller@example.com",
    });
    const item = await createItem({
      sku: "AGENT-PO",
      name: "Agent PO Item",
      unit: "code",
      expectedPrice: 100,
      maxPrice: 110,
    });
    await setStock(seller.id, item.id, 20);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const response = await request(app)
      .post("/api/workflow/targets/agent")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        companyId: buyer.id,
        counterpartyId: seller.id,
        direction: "PURCHASE",
        instruction: "Create purchase order from Dealzarabia for AED 500 with 1 product",
        autoStart: true,
      })
      .expect(201);

    expect(response.body.target.status).toBe("OPEN");
    expect(response.body.target.buyerCompany.id).toBe(buyer.id);
    expect(response.body.target.sellerCompany.id).toBe(seller.id);
    expect(response.body.workflow.order.poNumber).toContain("PO-");
    expect(response.body.workflow.invoice).toBeNull();

    const invoice = await request(app)
      .post(`/api/workflow/targets/${response.body.target.id}/vendor-invoice`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(201);

    expect(invoice.body.invoice.invoiceNumber).toContain("INV-");
  });

  it("splits multiple PO agent instructions into scheduled daily targets", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const buyer = await createCompany({
      name: "Dealzarabia",
      legalName: "Dealzarabia Trading LLC",
      location: "Dubai",
      email: "agent-multi-buyer@example.com",
    });
    const seller = await createCompany({
      name: "Buy2day",
      legalName: "Buy2day Distribution LLC",
      location: "Sharjah",
      email: "agent-multi-seller@example.com",
    });
    const item = await createItem({
      sku: "AGENT-MULTI-PO",
      name: "Agent Multi PO Item",
      unit: "code",
      expectedPrice: 100,
      maxPrice: 110,
    });
    await setStock(seller.id, item.id, 100);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const response = await request(app)
      .post("/api/workflow/targets/agent")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        companyId: buyer.id,
        counterpartyId: seller.id,
        direction: "PURCHASE",
        instruction: "Create multiple PO this week for AED 5000 with 1 product",
        autoStart: true,
      })
      .expect(201);

    expect(response.body.targets).toHaveLength(5);
    expect(response.body.workflow).toBeNull();
    expect(response.body.targets.every((target: { status: string; periodType: string }) => target.status === "OPEN" && target.periodType === "DAILY")).toBe(true);
    expect(new Set(response.body.targets.map((target: { targetDate: string }) => target.targetDate)).size).toBe(5);
    expect(await prisma.purchaseOrder.count()).toBe(0);
    expect(await prisma.monthlyTarget.count()).toBe(5);
  });

  it("runs separate same-day PO cycles and schedules invoices when requested today", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const buyer = await createCompany({
      name: "Dealzarabia",
      legalName: "Dealzarabia Trading LLC",
      location: "Dubai",
      email: "agent-today-buyer@example.com",
    });
    const seller = await createCompany({
      name: "Buy2day",
      legalName: "Buy2day Distribution LLC",
      location: "Sharjah",
      email: "agent-today-seller@example.com",
    });
    for (const [sku, price] of [["AGENT-TODAY-1", 100], ["AGENT-TODAY-2", 50], ["AGENT-TODAY-3", 20]] as const) {
      const item = await createItem({
        sku,
        name: `${sku} Item`,
        unit: "code",
        expectedPrice: price,
        maxPrice: price + 10,
      });
      await setStock(seller.id, item.id, 500);
    }

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const response = await request(app)
      .post("/api/workflow/targets/agent")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        companyId: buyer.id,
        counterpartyId: seller.id,
        direction: "PURCHASE",
        instruction: "Create 5 separate purchase order today for AED 1000 with 3 random products and send vendor invoice.",
        autoStart: true,
        invoiceDelayMode: "RANDOM",
        invoiceDelayMinMinutes: 1,
        invoiceDelayMaxMinutes: 3,
      })
      .expect(201);

    expect(response.body.targets).toHaveLength(5);
    expect(response.body.workflows).toHaveLength(5);
    expect(response.body.targets.every((target: { amountVolume: string }) => target.amountVolume === "1000")).toBe(true);
    expect(response.body.workflows.every((workflow: { order?: { poNumber: string }; invoice?: { invoiceNumber: string } }) => workflow.order?.poNumber && !workflow.invoice)).toBe(true);
    const targets = await prisma.monthlyTarget.findMany();
    expect(targets.every((target) => target.status === "PO_SENT")).toBe(true);
    expect(await prisma.purchaseOrder.count()).toBe(5);
    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.emailLog.count()).toBe(5);
    const auditSteps = await prisma.agentAuditLog.findMany({ orderBy: { createdAt: "asc" } });
    expect(auditSteps.some((entry) => entry.step === "PARSED_INSTRUCTION")).toBe(true);
    expect(auditSteps.filter((entry) => entry.step === "TARGET_CREATED")).toHaveLength(5);
    expect(auditSteps.filter((entry) => entry.step === "PO_SENT")).toHaveLength(5);
    const invoiceScheduleLogs = auditSteps.filter((entry) => entry.step === "INVOICE_SCHEDULED");
    expect(invoiceScheduleLogs).toHaveLength(5);
    expect(invoiceScheduleLogs.every((entry) => {
      const metadata = JSON.parse(entry.metadata ?? "{}") as { delayMs?: number };
      return typeof metadata.delayMs === "number" && metadata.delayMs >= 60000 && metadata.delayMs <= 180000;
    })).toBe(true);
  });

  it("blocks deleting a target after workflow starts", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const buyer = await createCompany({
      name: "Dealzarabia",
      legalName: "Dealzarabia Trading LLC",
      location: "Dubai",
      email: "started-buyer@example.com",
    });
    const seller = await createCompany({
      name: "Buy2day",
      legalName: "Buy2day Distribution LLC",
      location: "Sharjah",
      email: "started-seller@example.com",
    });
    const item = await createItem({
      sku: "STARTED-API",
      name: "Started API Item",
      unit: "pcs",
      expectedPrice: 100,
    });
    await setStock(seller.id, item.id, 20);
    const target = await createMonthlyTarget({
      buyerCompanyId: buyer.id,
      sellerCompanyId: seller.id,
      month: "2026-05",
      lines: [{ itemId: item.id, quantity: 2, maxPrice: 120 }],
    });
    await runTargetWorkflow(target.id);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    await request(app)
      .delete(`/api/workflow/targets/${target.id}`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(400);

    const pdf = await request(app)
      .get(`/api/workflow/targets/${target.id}/po-pdf`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    expect(pdf.headers["content-type"]).toContain("application/pdf");
  });

  it("returns invoice detail and logs invoice email sending", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const buyer = await createCompany({
      name: "Dealzarabia",
      legalName: "Dealzarabia Trading LLC",
      trn: "100000000000001",
      location: "Dubai",
      email: "dealzarabia-invoice@example.com",
    });
    const seller = await createCompany({
      name: "Buy2day",
      legalName: "Buy2day Distribution LLC",
      trn: "100000000000002",
      location: "Sharjah",
      email: "buy2day-invoice@example.com",
    });
    const item = await createItem({
      sku: "INV-API",
      name: "Invoice API Item",
      unit: "pcs",
      expectedPrice: 100,
      maxPrice: 120,
    });
    await setStock(seller.id, item.id, 20);
    const target = await createMonthlyTarget({
      buyerCompanyId: buyer.id,
      sellerCompanyId: seller.id,
      month: "2026-05",
      lines: [{ itemId: item.id, quantity: 5, maxPrice: 120 }],
    });
    await runTargetWorkflow(target.id);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const vendorInvoice = await request(app)
      .post(`/api/workflow/targets/${target.id}/vendor-invoice`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(201);

    const detail = await request(app)
      .get(`/api/invoices/${vendorInvoice.body.invoice.id}`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    expect(detail.body.invoiceNumber).toMatch(/^INV-/);
    expect(detail.body.lines[0].item.sku).toBe("INV-API");
    expect(detail.body.vatAmount).toBe("25");

    const pdf = await request(app)
      .get(`/api/invoices/${vendorInvoice.body.invoice.id}/pdf`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.body.subarray(0, 4).toString()).toBe("%PDF");

    const email = await request(app)
      .post(`/api/invoices/${vendorInvoice.body.invoice.id}/send`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(201);

    expect(email.body.subject).toContain("Tax Invoice");
    expect(email.body.body).toContain("VAT 5%");
    expect(email.body.body).toContain("PDF Attachment:");
    expect(email.body.attachmentPath).toContain(".pdf");
  });

  it("saves and tests a Gmail integration option", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const company = await createCompany({
      name: "Dealzarabia",
      legalName: "Dealzarabia Trading LLC",
      location: "Dubai",
      email: "procurement@dealzarabia.test",
    });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const status = await request(app)
      .get("/api/email-integrations/config/status")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    expect(status.body.provider).toBe("GMAIL");
    expect(status.body.oauthConfigured).toBe(false);

    const configured = await request(app)
      .post("/api/email-integrations/config")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        googleClientId: "test-client-id",
        googleClientSecret: "test-client-secret",
        googleRedirectUri: "https://example.com/api/email-integrations/oauth/callback",
        gmailTokenEncryptionKey: "test-token-key-with-at-least-32-characters",
      })
      .expect(201);

    expect(configured.body.oauthConfigured).toBe(true);

    const smtpConfigured = await request(app)
      .post("/api/email-integrations/config/smtp-imap")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        smtpHost: "smtp.gmail.com",
        smtpPort: 587,
        smtpEncryption: "TLS",
        smtpUsername: "procurement@dealzarabia.test",
        smtpPassword: "app-password-value",
        imapHost: "imap.gmail.com",
        imapPort: 993,
        imapEncryption: "SSL",
        imapUsername: "procurement@dealzarabia.test",
        imapPassword: "app-password-value",
      })
      .expect(201);

    expect(smtpConfigured.body.smtpConfigured).toBe(true);
    expect(smtpConfigured.body.imapConfigured).toBe(true);

    const integration = await request(app)
      .post("/api/email-integrations")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        companyId: company.id,
        email: "procurement@dealzarabia.test",
        mode: "SIMULATION",
        status: "READY_TO_CONNECT",
      })
      .expect(201);

    expect(integration.body.provider).toBe("GMAIL");
    expect(integration.body.company.name).toBe("Dealzarabia");

    const testLog = await request(app)
      .post(`/api/email-integrations/${company.id}/test`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(201);

    expect(testLog.body.subject).toContain("Gmail integration test");
    expect(testLog.body.status).toBe("SIMULATED");
  });
});
