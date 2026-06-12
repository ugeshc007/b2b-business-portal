import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
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
  await prisma.stockMovement.deleteMany();
  await prisma.ecommerceOrder.deleteMany();
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
  await prisma.ecommerceOrder.deleteMany();
  await prisma.agentDecision.deleteMany();
  await prisma.emailIntegration.deleteMany();
  await prisma.stockMovement.deleteMany();
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

  it("enables a company portal user and allows that company to login", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin", "ADMIN");
    const company = await createCompany({
      name: "Famco Mobile",
      legalName: "Famco Mobile and Electronics",
      role: "BOTH",
      location: "Dubai, UAE",
      email: "famco@example.com",
    });
    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const portal = await request(app)
      .post(`/api/catalog/companies/${company.id}/portal-user`)
      .set("Authorization", `Bearer ${adminLogin.body.token}`)
      .send({})
      .expect(201);

    expect(portal.body.user.email).toBe("famco@example.com");
    expect(portal.body.user.companyId).toBe(company.id);
    expect(portal.body.temporaryPassword).toMatch(/^Portal#/);
    expect(portal.body.emailDelivery.status).toBe("EMAIL_NOT_CONFIGURED");

    const companyLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "famco@example.com", password: portal.body.temporaryPassword })
      .expect(200);
    expect(companyLogin.body.user.role).toBe("COMPANY_USER");
    expect(companyLogin.body.user.companyId).toBe(company.id);

    const reset = await request(app)
      .post(`/api/catalog/companies/${company.id}/portal-user`)
      .set("Authorization", `Bearer ${adminLogin.body.token}`)
      .send({ resetPassword: true })
      .expect(201);
    expect(reset.body.temporaryPassword).toMatch(/^Portal#/);
    expect(reset.body.temporaryPassword).not.toBe(portal.body.temporaryPassword);
    await request(app)
      .post("/api/auth/login")
      .send({ email: "famco@example.com", password: portal.body.temporaryPassword })
      .expect(400);
    await request(app)
      .post("/api/auth/login")
      .send({ email: "famco@example.com", password: reset.body.temporaryPassword })
      .expect(200);
    expect(await prisma.emailLog.count({ where: { toEmail: "famco@example.com", subject: { contains: "B2B Portal Login" } } })).toBe(2);

    const summary = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${adminLogin.body.token}`)
      .expect(200);
    expect(summary.body.portalUsers).toEqual([
      expect.objectContaining({ email: "famco@example.com", companyId: company.id, role: "COMPANY_USER" }),
    ]);
    expect(JSON.stringify(summary.body.portalUsers)).not.toContain("passwordHash");
  });

  it("does not send HTTPS-only browser isolation headers on HTTP deployments", async () => {
    const response = await request(app).get("/api/health").expect(200);
    expect(response.headers["cross-origin-opener-policy"]).toBeUndefined();
    expect(response.headers["origin-agent-cluster"]).toBeUndefined();
  });

  it("records request and error logs for admin review", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    await request(app)
      .delete("/api/catalog/stock/missing-stock-id")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(404);

    const logs = await request(app)
      .get("/api/system-logs?level=ERROR&limit=20")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    expect(logs.body.status.retentionDays).toBeGreaterThan(0);
    expect(logs.body.logs.some((entry: { event: string; message?: string }) =>
      entry.event === "application_error" && entry.message?.includes("Stock row not found")
    )).toBe(true);
  });

  it("enforces roles for production safety routes and supports backups/log download", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin", "ADMIN");
    await createUser("finance@example.com", "ChangeMe123!", "Finance", "FINANCE");
    await createUser("viewer@example.com", "ChangeMe123!", "Viewer", "VIEWER");
    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);
    const financeLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "finance@example.com", password: "ChangeMe123!" })
      .expect(200);
    const viewerLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "viewer@example.com", password: "ChangeMe123!" })
      .expect(200);

    expect(adminLogin.body.user.role).toBe("ADMIN");
    expect(financeLogin.body.user.role).toBe("FINANCE");

    await request(app)
      .post("/api/maintenance/flush-transactional-data")
      .set("Authorization", `Bearer ${viewerLogin.body.token}`)
      .send({ categories: ["transactions"] })
      .expect(403);

    const backup = await request(app)
      .post("/api/maintenance/backups")
      .set("Authorization", `Bearer ${financeLogin.body.token}`)
      .expect(201);
    expect(backup.body.fileName).toMatch(/^db-\d{8}-\d{6}\.db$/);

    const backups = await request(app)
      .get("/api/maintenance/backups")
      .set("Authorization", `Bearer ${financeLogin.body.token}`)
      .expect(200);
    expect(backups.body.backups.length).toBeGreaterThan(0);

    await request(app)
      .post("/api/maintenance/restore")
      .set("Authorization", `Bearer ${financeLogin.body.token}`)
      .send({ fileName: backup.body.fileName, typedConfirmation: "RESTORE DATABASE" })
      .expect(403);

    await request(app)
      .post("/api/maintenance/restore")
      .set("Authorization", `Bearer ${adminLogin.body.token}`)
      .send({ fileName: backup.body.fileName, typedConfirmation: "WRONG" })
      .expect(400);

    const logs = await request(app)
      .get("/api/system-logs/download")
      .set("Authorization", `Bearer ${financeLogin.body.token}`)
      .expect(200);
    expect(logs.headers["content-disposition"]).toContain("b2b-logs");
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

  it("creates a company profile with bank details through the protected API", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const owner = await createCompany({
      name: "Owner Company",
      legalName: "Owner Company LLC",
      location: "Dubai, UAE",
      email: "owner-company@example.com",
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const created = await request(app)
      .post("/api/catalog/companies")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        name: "New Company",
        legalName: "New Company Trading LLC",
        role: "BUYER",
        managedByCompanyId: owner.id,
        location: "Abu Dhabi, UAE",
        email: "new-company@example.com",
        active: true,
        vatEnabled: false,
        bankName: "RAK Bank",
        bankBeneficiaryName: "New Company Trading LLC",
        bankAccountNumber: "123456789",
        bankIban: "AE000000000000000000000",
        bankBranch: "Mussafah",
      })
      .expect(201);

    expect(created.body.name).toBe("New Company");
    expect(created.body.role).toBe("BUYER");
    expect(created.body.managedByCompanyId).toBe(owner.id);
    expect(created.body.active).toBe(true);
    expect(created.body.vatEnabled).toBe(false);
    expect(created.body.bankName).toBe("RAK Bank");
    expect(created.body.bankIban).toBe("AE000000000000000000000");

    const summary = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    const partner = summary.body.companies.find((company: { id: string }) => company.id === created.body.id);
    expect(partner.legalName).toBe("New Company Trading LLC");
    expect(partner.role).toBe("BUYER");
    expect(partner.managedByCompanyId).toBe(owner.id);
    expect(partner.managedByCompany.name).toBe("Owner Company");
    expect(partner.vatEnabled).toBe(false);

    const updated = await request(app)
      .patch(`/api/catalog/companies/${created.body.id}`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        name: "New Company",
        legalName: "New Company Trading LLC",
        role: "SELLER",
        managedByCompanyId: owner.id,
        location: "Abu Dhabi, UAE",
        email: "new-company@example.com",
        active: true,
        vatEnabled: false,
      })
      .expect(200);

    expect(updated.body.role).toBe("SELLER");
    expect(updated.body.managedByCompanyId).toBe(owner.id);

    const duplicateByName = await request(app)
      .post("/api/catalog/companies")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        name: "New Company Trading",
        legalName: "New Company Trading LLC",
        role: "BOTH",
        managedByCompanyId: owner.id,
        location: "Sharjah, UAE",
        email: "new-company-updated@example.com",
        active: true,
        vatEnabled: true,
      })
      .expect(201);

    expect(duplicateByName.body.id).toBe(created.body.id);
    expect(duplicateByName.body.email).toBe("new-company-updated@example.com");
    expect(await prisma.company.count()).toBe(2);
  });

  it("creates separate company profiles for different branches with similar names", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const ajman = await request(app)
      .post("/api/catalog/companies")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        name: "Dealzarabia Electronics Trading L.L.C Ajman",
        legalName: "Dealzarabia Electronics Trading L.L.C Ajman",
        role: "BOTH",
        location: "Ajman, UAE",
        email: "dealz-ajman@example.com",
        active: true,
        vatEnabled: true,
      })
      .expect(201);

    const auh = await request(app)
      .post("/api/catalog/companies")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        name: "Dealzarabia Electronics Trading L.L.C - AUH",
        legalName: "Dealzarabia Electronics Trading L.L.C - AUH Branch",
        role: "BOTH",
        location: "Abu Dhabi, UAE",
        email: "dealz-auh@example.com",
        active: true,
        vatEnabled: true,
      })
      .expect(201);

    expect(auh.body.id).not.toBe(ajman.body.id);

    const summary = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    const mainCompanies = summary.body.companies.filter((company: { managedByCompanyId?: string | null }) => !company.managedByCompanyId);
    expect(mainCompanies.map((company: { name: string }) => company.name)).toEqual(expect.arrayContaining([
      "Dealzarabia Electronics Trading L.L.C Ajman",
      "Dealzarabia Electronics Trading L.L.C - AUH",
    ]));
    expect(mainCompanies).toHaveLength(2);
  });

  it("uploads a company logo and exposes the preview path", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const company = await createCompany({
      name: "Logo Company",
      legalName: "Logo Company LLC",
      location: "Dubai",
      email: "logo-company@example.com",
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const uploaded = await request(app)
      .put(`/api/catalog/companies/${company.id}/logo`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .set("Content-Type", "image/png")
      .send(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64"))
      .expect(200);

    expect(uploaded.body.logoPath).toMatch(/^\/uploads\/company-logos\/.+\.png$/);

    const summary = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    expect(summary.body.companies[0].logoPath).toBe(uploaded.body.logoPath);
  });

  it("previews an uploaded business plan workbook without importing data", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
      Index: 1,
      "Company Name ": "Example Trading LLC; Email:example@example.com; Address:Dubai, UAE",
      "Product specification ": "Electronic Card",
      "Price for Buying and Selling ": "Check the Sheet E.Card",
      "Customer (B2B)": "Retail customer",
      "Vendor (B2B)": "Vendor A",
      "Bank Account ": "Company Name: Example Trading LLC\nBank Name: Test Bank\nBeneficiary Account Name: Example Trading LLC\nAccount Number: 123\nIBAN Number: AE00123\nBranch: Dubai",
      "Revenue Target Details in AED/Month ": "2 million",
      "Targeted Number of Invoice /Week": "50-80 Invoice.Per Invoice below 10k",
    }]), "Sheet1");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
      DenominationTitle: "Amazon UAE - 100",
      Currency: "AED",
      DENOMINATION: 100,
      "Denomination in AED ": 100,
      "BUYING PRICE": 96,
      PROFIT: 4,
      "%": 0.04,
      "SELLING PRICE ": 99,
    }]), "E.CARD");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
      "Company Name ": "EDGETECH DIGITAL FZE",
      "Owner ": "Owner",
      "Bank Account ": "Applying",
    }]), "Sheet2");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const preview = await request(app)
      .post("/api/business-plan-import/preview")
      .set("Authorization", `Bearer ${login.body.token}`)
      .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(buffer)
      .expect(200);

    expect(preview.body.counts.companies).toBe(1);
    expect(preview.body.counts.products).toBe(1);
    expect(preview.body.counts.bankStatusRows).toBe(1);
    expect(preview.body.fieldMappings[0].detected).toBe(true);
    expect(preview.body.fieldMappings[1].detected).toBe(true);
    expect(preview.body.products[0].sku).toBe("AMAZON-UAE-100");
    expect(preview.body.counts.salesCustomers).toBe(1);
    expect(preview.body.counts.checklistItems).toBe(1);
    expect(preview.body.companies[0].email).toBe("example@example.com");
    expect(preview.body.companies[0].revenueTargetMin).toBe(2000000);
    expect(preview.body.products[0].title).toBe("Amazon UAE - 100");
  });

  it("previews and imports a single-company business plan scenario", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      {
        Plan: "Purchase",
        Index: 1,
        "Company Name ": "Dealzarabia Electronics Trading L.L.C -AUH Branch; Email:dealzinvoice@gmail.com; Address:Abu Dhabi Industrial City",
        "Product specification ": "Purchase Stock page Products 90% of Revenue Target",
        "Price for Buying and Selling ": "Stock page Product Price buying",
        "Vendor (B2B)": "70% purchase on Buy2Day Electronic Trading LLC Dubai, 30% Purchase on Buy2Day Electronic Trading LLC AUH",
        "Bank Account of Company": "Company Name: Dealzarabia Electronics Trading L.L.C Ajman\nBank Name: ADCB\nBeneficiary Account Name: DEALZARABIA ELECTRONICS TRADING L.L.C\nAccount Number: 14163970920001\nIBAN Number: AE640030014163970920001\nBranch: AJMAN BRANCH",
        "Revenue Target Details in AED/Month ": "2 million",
        "Targeted Number of Invoice /Week": "50-80 Invoice.Per Invoice below 10k some time can be more .Total should be500K Per week",
      },
      {
        Plan: "Sales",
        "Company Name ": "Dealzarabia Electronics Trading L.L.C -AUH Branch; Email:dealzinvoice@gmail.com; Address:Abu Dhabi Industrial City",
        "Product specification ": "Sales Stock Use selling price",
        "Price for Buying and Selling ": "Stock page Product Price Selling",
        "Customer (B2B)": "1, NOOR AL WATAN SALE OF E-CARDS AND SLICES AND OUTFITS (S.P.S - L.L.C) ; Address Business bin hareb center, Ajman, UAE\n\n2, Joy Basket Trading LLC; Address: Office No. 307, Dubai",
        "Vendor (B2B)": "1, NOOR AL WATAN SALE OF E-CARDS AND SLICES AND OUTFITS (S.P.S - L.L.C) sales 25%\n2, Joy Basket Trading LLC sales 25%",
      },
    ]), "Business Plan");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const preview = await request(app)
      .post("/api/business-plan-import/preview")
      .set("Authorization", `Bearer ${login.body.token}`)
      .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(buffer)
      .expect(200);

    expect(preview.body.workbook.companySheetFound).toBe(true);
    expect(preview.body.counts.companies).toBe(2);
    expect(preview.body.counts.purchaseVendors).toBe(2);
    expect(preview.body.counts.salesCustomers).toBe(2);
    expect(preview.body.scenario.mainCompany.email).toBe("dealzinvoice@gmail.com");
    expect(preview.body.scenario.purchasePlan.transactionPercent).toBe(0.9);
    expect(preview.body.scenario.purchasePlan.transactionAmountMin).toBe(1800000);
    expect(preview.body.scenario.purchaseVendors[0].allocationPercent).toBe(70);
    expect(preview.body.scenario.salesAllocations[0].allocationPercent).toBe(25);

    const imported = await request(app)
      .post("/api/business-plan-import/import-scenario")
      .set("Authorization", `Bearer ${login.body.token}`)
      .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(buffer)
      .expect(200);

    expect(imported.body.company).toBe("CREATED");
    expect(imported.body.partnersCreated).toBe(4);
    expect(imported.body.turnoverTargetsCreated).toBe(1);
    expect(imported.body.rulesSaved).toBe(1);
    expect(imported.body.companyId).toBeTruthy();
    expect(imported.body.planId).toMatch(/^businessPlan:/);
    expect(await prisma.company.count()).toBe(5);

    const mainCompany = await prisma.company.findUnique({ where: { email: "dealzinvoice@gmail.com" } });
    expect(mainCompany).toBeTruthy();
    expect(mainCompany?.bankName).toBe("ADCB");
    expect(mainCompany?.bankIban).toBe("AE640030014163970920001");
    expect(await prisma.turnoverTarget.count({ where: { companyId: mainCompany!.id, type: "PURCHASE" } })).toBe(1);
    const purchaseTarget = await prisma.turnoverTarget.findFirst({ where: { companyId: mainCompany!.id, type: "PURCHASE" } });
    expect(Number(purchaseTarget?.amount)).toBe(1800000);
    expect(purchaseTarget?.notes).toContain("90% of revenue target");
    expect(await prisma.appSetting.count({ where: { key: `businessPlan:${mainCompany!.id}` } })).toBe(1);
  });

  it("imports a business plan under a selected existing company instead of creating a duplicate owner", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const existingCompany = await createCompany({
      name: "Dealzarabia",
      legalName: "Dealzarabia Electronics Trading L.L.C",
      role: "BOTH",
      location: "Dubai, UAE",
      email: "existing-dealz@example.com",
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      {
        Plan: "Purchase",
        "Company Name ": "Different Excel Owner LLC; Email:excel-owner@example.com; Address:Abu Dhabi",
        "Vendor (B2B)": "60% purchase on Buy2Day Electronic Trading LLC Dubai",
        "Revenue Target Details in AED/Month ": "2 million",
        "Product specification ": "Purchase Stock page Products 90% of Revenue Target",
      },
      {
        Plan: "Sales",
        "Company Name ": "Different Excel Owner LLC; Email:excel-owner@example.com; Address:Abu Dhabi",
        "Customer (B2B)": "1, Joy Basket Trading LLC; Address: Office No. 307, Dubai",
        "Vendor (B2B)": "1, Joy Basket Trading LLC sales 40%",
      },
    ]), "Business Plan");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const imported = await request(app)
      .post(`/api/business-plan-import/import-scenario?companyId=${existingCompany.id}&planPeriodDateFrom=2027-06-01&planPeriodDateTo=2027-06-30`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(buffer)
      .expect(200);

    expect(imported.body.company).toBe("UPDATED");
    expect(imported.body.companyId).toBe(existingCompany.id);
    expect(imported.body.planId).toMatch(new RegExp(`^businessPlan:${existingCompany.id}:`));
    expect(imported.body.planPeriodDateFrom).toBe("2027-06-01");
    expect(imported.body.planPeriodDateTo).toBe("2027-06-30");
    expect(await prisma.company.count({ where: { managedByCompanyId: null } })).toBe(1);
    expect(await prisma.company.count({ where: { name: "Different Excel Owner LLC" } })).toBe(0);
    expect(await prisma.appSetting.count({ where: { key: `businessPlan:${existingCompany.id}` } })).toBe(1);
    expect(await prisma.turnoverTarget.count({ where: { companyId: existingCompany.id, type: "PURCHASE", month: "2027-06" } })).toBe(1);
    expect(await prisma.company.count({ where: { managedByCompanyId: existingCompany.id } })).toBe(2);
    const savedPlan = await prisma.appSetting.findUniqueOrThrow({ where: { key: `businessPlan:${existingCompany.id}` } });
    expect(JSON.parse(savedPlan.value).planPeriodDateFrom).toBe("2027-06-01");
    expect(JSON.parse(savedPlan.value).planPeriodDateTo).toBe("2027-06-30");
  });

  it("shows saved business plan under recreated matching company name", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const company = await createCompany({
      name: "Recreated Workflow Company - AUH Branch",
      legalName: "Recreated Workflow Company LLC - AUH Branch",
      location: "Dubai",
      email: "recreated-workflow@example.com",
    });
    await prisma.appSetting.create({
      data: {
        key: "businessPlan:deleted-company-id",
        value: JSON.stringify({
          importedAt: new Date().toISOString(),
          mainCompanyId: "deleted-company-id",
          excelMainCompanyName: "Recreated Workflow Company LLC - AUH",
          purchaseVendors: [{ name: "Vendor A", allocationPercent: 100 }],
          salesCustomers: [],
          salesAllocations: [],
          purchasePlan: { revenueTargetText: "AED 1000", transactionAmountMin: 1000 },
          salesPlan: {},
        }),
      },
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const summary = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    const plan = summary.body.businessPlans.find((entry: { planId: string }) => entry.planId === "businessPlan:deleted-company-id");
    expect(plan.companyId).toBe(company.id);
    expect(plan.companyName).toBe(company.name);
    expect(plan.mainCompanyId).toBe(company.id);
  });

  it("imports product price rows from the business plan product sheet", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
      Index: 1,
      "Company Name ": "Not Imported LLC; Email:not-imported@example.com; Address:Dubai",
    }]), "Sheet1");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      {
        DenominationTitle: "Amazon UAE - 100",
        Currency: "AED",
        DENOMINATION: 100,
        Conversion: 1,
        "Denomination in AED ": 100,
        "BUYING PRICE": 96,
        PROFIT: 4,
        "%": 0.04,
        "SELLING PRICE ": 99,
      },
      {
        DenominationTitle: "App Store US - 10",
        Currency: "USD",
        DENOMINATION: 10,
        Conversion: 3.9,
        "Denomination in AED ": 39,
        "BUYING PRICE": 34.5,
        PROFIT: 4.5,
        "%": 0.115,
        "SELLING PRICE ": 37.05,
      },
    ]), "E.CARD");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const imported = await request(app)
      .post("/api/business-plan-import/import-products")
      .set("Authorization", `Bearer ${login.body.token}`)
      .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(buffer)
      .expect(200);

    expect(imported.body.created).toBe(2);
    expect(imported.body.updated).toBe(0);
    expect(imported.body.rows[0].sku).toBe("AMAZON-UAE-100");

    const item = await prisma.item.findUnique({ where: { sku: "AMAZON-UAE-100" } });
    expect(item?.name).toBe("Amazon UAE - 100");
    expect(String(item?.unit)).toBe("code");
    expect(item?.currency).toBe("AED");
    expect(Number(item?.denomination)).toBe(100);
    expect(Number(item?.conversionRate)).toBe(1);
    expect(Number(item?.denominationAed)).toBe(100);
    expect(Number(item?.buyingPrice)).toBe(96);
    expect(Number(item?.profit)).toBe(4);
    expect(Number(item?.marginPercent)).toBe(0.04);
    expect(Number(item?.minPrice)).toBe(96);
    expect(Number(item?.expectedPrice)).toBe(99);
    expect(Number(item?.maxPrice)).toBe(99);
    expect(await prisma.company.count()).toBe(0);
  });

  it("imports product price rows from a separate product-only workbook", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
      DenominationTitle: "Xbox UAE Top Up 50USD",
      Currency: "USD",
      DENOMINATION: 50,
      "Denomination in AED ": 195,
      "BUYING PRICE": 189.05,
      PROFIT: 1.95,
      "%": 0.01,
      "SELLING PRICE ": 191,
    }]), "Products");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const imported = await request(app)
      .post("/api/business-plan-import/import-products")
      .set("Authorization", `Bearer ${login.body.token}`)
      .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(buffer)
      .expect(200);

    expect(imported.body.created).toBe(1);
    expect(imported.body.rows[0].sku).toBe("XBOX-UAE-TOP-UP-50USD");
    expect(await prisma.item.count()).toBe(1);
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

  it("creates an ecommerce buy order and marks it delivered", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const buyer = await createCompany({
      name: "Ecom Buyer",
      legalName: "Ecom Buyer LLC",
      location: "Dubai",
      email: "ecom-buyer@example.com",
    });
    const seller = await createCompany({
      name: "Ecom Seller",
      legalName: "Ecom Seller LLC",
      location: "Sharjah",
      email: "ecom-seller@example.com",
    });
    const item = await createItem({
      sku: "ECOM-GC-50",
      name: "Ecom Gift Card",
      unit: "code",
      expectedPrice: 50,
    });
    await setStock(seller.id, item.id, 5);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const order = await request(app)
      .post("/api/ecommerce/orders")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        buyerCompanyId: buyer.id,
        sellerCompanyId: seller.id,
        itemId: item.id,
        quantity: 2,
      })
      .expect(201);

    expect(order.body.status).toBe("PENDING_DELIVERY");
    expect(order.body.total).toBe("105");

    const stock = await prisma.stock.findUniqueOrThrow({
      where: { companyId_itemId: { companyId: seller.id, itemId: item.id } },
    });
    expect(stock.quantity).toBe(3);

    const delivered = await request(app)
      .patch(`/api/ecommerce/orders/${order.body.id}/deliver`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    expect(delivered.body.status).toBe("DELIVERED");

    const summary = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);
    expect(summary.body.ecommerceOrders[0].id).toBe(order.body.id);
  });

  it("generates stock from purchase target and reports movement values", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const company = await createCompany({
      name: "Plan Stock Company",
      legalName: "Plan Stock Company LLC",
      location: "Dubai",
      email: "plan-stock@example.com",
    });
    const buyer = await createCompany({
      name: "Plan Stock Buyer",
      legalName: "Plan Stock Buyer LLC",
      location: "Abu Dhabi",
      email: "plan-stock-buyer@example.com",
    });
    const itemA = await prisma.item.create({
      data: {
        sku: "PLAN-A",
        name: "Plan Product A",
        unit: "code",
        expectedPrice: 80,
        buyingPrice: 50,
        vatRate: 0.05,
      },
    });
    await prisma.item.create({
      data: {
        sku: "PLAN-B",
        name: "Plan Product B",
        unit: "code",
        expectedPrice: 150,
        buyingPrice: 100,
        vatRate: 0.05,
      },
    });
    await prisma.turnoverTarget.create({
      data: {
        companyId: company.id,
        type: "PURCHASE",
        month: "2026-06",
        amount: 1000,
        notes: "90% transaction stock target",
      },
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const generated = await request(app)
      .post("/api/catalog/stock/from-business-plan")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ companyId: company.id, month: "2026-06" })
      .expect(201);

    expect(generated.body.generated).toBe(true);
    expect(generated.body.productCount).toBe(2);
    expect(generated.body.generatedPurchaseValue).toBe("1000");

    await request(app)
      .post("/api/ecommerce/orders")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        buyerCompanyId: buyer.id,
        sellerCompanyId: company.id,
        itemId: itemA.id,
        quantity: 2,
      })
      .expect(201);

    const report = await request(app)
      .get("/api/catalog/stock/movement-report")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);
    const planA = report.body.find((row: { sku: string }) => row.sku === "PLAN-A");
    expect(planA.purchasedQuantity).toBe(10);
    expect(planA.soldQuantity).toBe(2);
    expect(planA.balanceQuantity).toBe(8);
    expect(planA.purchaseValue).toBe("500");
    expect(planA.salesValue).toBe("160");
    expect(planA.balanceBuyingValue).toBe("400");
    expect(planA.balanceSellingValue).toBe("640");

    const summary = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);
    expect(summary.body.stockMovementReport.some((row: { sku: string }) => row.sku === "PLAN-B")).toBe(true);
  });

  it("runs imported business plan agent across vendor purchases and customer sales", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const main = await createCompany({
      name: "Plan Main",
      legalName: "Plan Main LLC",
      location: "Dubai",
      email: "plan-main@example.com",
    });
    const vendor = await createCompany({
      name: "Plan Vendor",
      legalName: "Plan Vendor LLC",
      role: "SELLER",
      managedByCompanyId: main.id,
      location: "Sharjah",
      email: "plan-vendor@example.com",
    });
    const customer = await createCompany({
      name: "Plan Customer",
      legalName: "Plan Customer LLC",
      role: "BUYER",
      managedByCompanyId: main.id,
      location: "Abu Dhabi",
      email: "plan-customer@example.com",
    });
    await prisma.item.create({
      data: {
        sku: "AGENT-A",
        name: "Agent Product A",
        unit: "code",
        expectedPrice: 80,
        buyingPrice: 50,
        maxPrice: 80,
        vatRate: 0.05,
      },
    });
    await prisma.item.create({
      data: {
        sku: "AGENT-B",
        name: "Agent Product B",
        unit: "code",
        expectedPrice: 120,
        buyingPrice: 60,
        maxPrice: 120,
        vatRate: 0.05,
      },
    });
    await prisma.turnoverTarget.createMany({
      data: [
        { companyId: main.id, type: "PURCHASE", month: "2026-06", amount: 200, notes: "Purchase test target" },
        { companyId: main.id, type: "SALES", month: "2026-06", amount: 160, notes: "Sales test target" },
      ],
    });
    await prisma.appSetting.create({
      data: {
        key: `businessPlan:${main.id}`,
        value: JSON.stringify({
          mainCompanyId: main.id,
          purchaseVendors: [{ name: vendor.name, allocationPercent: 100 }],
          salesCustomers: [{ name: customer.name, allocationPercent: 100 }],
          salesAllocations: [{ name: customer.name, allocationPercent: 100 }],
          purchasePlan: { invoiceRuleText: "Per invoice below AED 100", invoiceCountMin: 2, invoiceCountMax: 2 },
          salesPlan: { invoiceRuleText: "Per invoice below AED 80", invoiceCountMin: 2, invoiceCountMax: 2 },
        }),
      },
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const result = await request(app)
      .post("/api/workflow/business-plan-agent/run")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        companyId: main.id,
        month: "2026-06",
        dateFrom: "2026-06-01",
        dateTo: "2026-06-02",
        lineCount: 1,
      })
      .expect(201);

    expect(result.body.purchase.invoices).toBe(2);
    expect(result.body.sales.invoices).toBe(2);
    expect(result.body.targetIds).toHaveLength(4);
    expect(await prisma.invoice.count()).toBe(4);
    expect(await prisma.stockMovement.count({ where: { companyId: main.id, type: "PURCHASE" } })).toBe(2);
    expect(await prisma.stockMovement.count({ where: { companyId: main.id, type: "SALE" } })).toBe(2);

    const report = await request(app)
      .get("/api/catalog/stock/movement-report")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);
    const mainRows = report.body.filter((row: { companyId: string }) => row.companyId === main.id);
    expect(mainRows.reduce((sum: number, row: { purchasedQuantity: number }) => sum + row.purchasedQuantity, 0)).toBeGreaterThan(0);
    expect(mainRows.reduce((sum: number, row: { soldQuantity: number }) => sum + row.soldQuantity, 0)).toBeGreaterThan(0);
    expect(await prisma.agentAuditLog.count({ where: { step: "BUSINESS_PLAN_AGENT_COMPLETED" } })).toBe(1);

    const reports = await request(app)
      .get(`/api/reports?companyId=${main.id}&month=2026-06`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);
    expect(reports.body.purchase.vendorWise[0].vendorName).toBe("Plan Vendor");
    expect(reports.body.purchase.productWise.length).toBeGreaterThan(0);
    expect(reports.body.purchase.invoiceWise).toHaveLength(2);
    expect(reports.body.sales.customerWise[0].customerName).toBe("Plan Customer");
    expect(reports.body.sales.productWise.length).toBeGreaterThan(0);
    expect(reports.body.sales.invoiceWise).toHaveLength(2);
    expect(reports.body.profit.rows.length).toBeGreaterThan(0);
    expect(Number(reports.body.profit.rows[0].margin)).toBeGreaterThanOrEqual(0);
    expect(reports.body.profit.vat.outputVat).toBeDefined();
    expect(reports.body.stock.rows.length).toBeGreaterThan(0);
    expect(reports.body.stock.rows.some((row: { purchased: number; sold: number; closing: number }) => row.purchased > 0 || row.sold > 0 || row.closing > 0)).toBe(true);
    expect(reports.body.targetAchievement.rows).toHaveLength(2);
    expect(reports.body.targetAchievement.rows.every((row: { plannedValue: string; actualValue: string }) => row.plannedValue !== undefined && row.actualValue !== undefined)).toBe(true);
    expect(reports.body.audit.events.some((event: { type: string }) => event.type === "AGENT_STEP")).toBe(true);
    expect(reports.body.audit.events.some((event: { type: string }) => event.type === "EMAIL_SENT")).toBe(true);
    expect(reports.body.audit.events.some((event: { type: string }) => event.type === "INVOICE_GENERATED")).toBe(true);
  });

  it("runs business plan agent from product master when stock rows are not created yet", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const main = await createCompany({
      name: "Plan No Stock Main",
      legalName: "Plan No Stock Main LLC",
      location: "Dubai",
      email: "plan-no-stock-main@example.com",
    });
    const customer = await createCompany({
      name: "Plan No Stock Customer",
      legalName: "Plan No Stock Customer LLC",
      role: "BUYER",
      managedByCompanyId: main.id,
      location: "Abu Dhabi",
      email: "plan-no-stock-customer@example.com",
    });
    await prisma.item.create({
      data: {
        sku: "NO-STOCK-A",
        name: "No Stock Product A",
        unit: "code",
        expectedPrice: 100,
        buyingPrice: 90,
        maxPrice: 100,
        vatRate: 0.05,
      },
    });
    await prisma.turnoverTarget.create({
      data: { companyId: main.id, type: "SALES", month: "2026-06", amount: 500, notes: "Sales only target" },
    });
    await prisma.appSetting.create({
      data: {
        key: `businessPlan:${main.id}`,
        value: JSON.stringify({
          mainCompanyId: main.id,
          salesCustomers: [{ name: customer.name, allocationPercent: 100 }],
          salesAllocations: [{ name: customer.name, allocationPercent: 100 }],
          salesPlan: { invoiceRuleText: "Per invoice below AED 500", invoiceCountMin: 1, invoiceCountMax: 1 },
        }),
      },
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const result = await request(app)
      .post("/api/workflow/business-plan-agent/run")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        companyId: main.id,
        month: "2026-06",
        dateFrom: "2026-06-01",
        dateTo: "2026-06-01",
        lineCount: 1,
      })
      .expect(201);

    expect(result.body.sales.invoices).toBe(1);
    expect(await prisma.stockMovement.count({ where: { companyId: main.id, type: "SALE" } })).toBe(1);
    expect(await prisma.agentAuditLog.count({ where: { step: "BUSINESS_PLAN_STOCK_PREPARED" } })).toBe(1);
  });

  it("auto-decides product count for business plan invoices", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const main = await createCompany({
      name: "Plan Auto Products Main",
      legalName: "Plan Auto Products Main LLC",
      location: "Dubai",
      email: "plan-auto-products-main@example.com",
    });
    const customer = await createCompany({
      name: "Plan Auto Products Customer",
      legalName: "Plan Auto Products Customer LLC",
      role: "BUYER",
      managedByCompanyId: main.id,
      location: "Dubai",
      email: "plan-auto-products-customer@example.com",
    });
    for (let index = 1; index <= 5; index += 1) {
      await prisma.item.create({
        data: {
          sku: `AUTO-PRODUCT-${index}`,
          name: `Auto Product ${index}`,
          unit: "code",
          expectedPrice: 100,
          buyingPrice: 90,
          maxPrice: 100,
          vatRate: 0.05,
        },
      });
    }
    await prisma.turnoverTarget.create({
      data: { companyId: main.id, type: "SALES", month: "2026-06", amount: 10000, notes: "Auto product count target" },
    });
    await prisma.appSetting.create({
      data: {
        key: `businessPlan:${main.id}`,
        value: JSON.stringify({
          mainCompanyId: main.id,
          salesCustomers: [{ name: customer.name, allocationPercent: 100 }],
          salesAllocations: [{ name: customer.name, allocationPercent: 100 }],
          salesPlan: { invoiceRuleText: "Per invoice below AED 10000", invoiceCountMin: 1, invoiceCountMax: 1 },
        }),
      },
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    await request(app)
      .post("/api/workflow/business-plan-agent/run")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        companyId: main.id,
        month: "2026-06",
        dateFrom: "2026-06-01",
        dateTo: "2026-06-01",
      })
      .expect(201);

    const target = await prisma.monthlyTarget.findFirst({
      where: { sellerCompanyId: main.id },
      include: { lines: true },
    });
    expect(target?.lines).toHaveLength(4);
  });

  it("spreads business plan invoices across the selected date range", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const main = await createCompany({
      name: "Plan Schedule Main",
      legalName: "Plan Schedule Main LLC",
      location: "Dubai",
      email: "plan-schedule-main@example.com",
    });
    const customerA = await createCompany({
      name: "Plan Schedule Customer A",
      legalName: "Plan Schedule Customer A LLC",
      role: "BUYER",
      managedByCompanyId: main.id,
      location: "Dubai",
      email: "plan-schedule-a@example.com",
    });
    const customerB = await createCompany({
      name: "Plan Schedule Customer B",
      legalName: "Plan Schedule Customer B LLC",
      role: "BUYER",
      managedByCompanyId: main.id,
      location: "Dubai",
      email: "plan-schedule-b@example.com",
    });
    await prisma.item.create({
      data: {
        sku: "SCHEDULE-A",
        name: "Schedule Product A",
        unit: "code",
        expectedPrice: 100,
        buyingPrice: 90,
        maxPrice: 100,
        vatRate: 0.05,
      },
    });
    await prisma.turnoverTarget.create({
      data: { companyId: main.id, type: "SALES", month: "2026-06", amount: 400, notes: "Schedule sales target" },
    });
    await prisma.appSetting.create({
      data: {
        key: `businessPlan:${main.id}`,
        value: JSON.stringify({
          mainCompanyId: main.id,
          salesCustomers: [
            { name: customerA.name, allocationPercent: 50 },
            { name: customerB.name, allocationPercent: 50 },
          ],
          salesAllocations: [
            { name: customerA.name, allocationPercent: 50 },
            { name: customerB.name, allocationPercent: 50 },
          ],
          salesPlan: { invoiceRuleText: "Per invoice below AED 100", invoiceCountMin: 2, invoiceCountMax: 2 },
        }),
      },
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    await request(app)
      .post("/api/workflow/business-plan-agent/run")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        companyId: main.id,
        month: "2026-06",
        dateFrom: "2026-06-01",
        dateTo: "2026-06-10",
        lineCount: 1,
      })
      .expect(201);

    const targets = await prisma.monthlyTarget.findMany({
      where: { sellerCompanyId: main.id },
      orderBy: { targetDate: "asc" },
    });
    expect(targets).toHaveLength(4);
    expect(new Set(targets.map((target) => target.targetDate))).toEqual(new Set(["2026-06-01", "2026-06-04", "2026-06-07", "2026-06-10"]));
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

  it("deletes an existing stock row", async () => {
    const company = await createCompany({
      name: "Stock Delete Company",
      legalName: "Stock Delete Company LLC",
      location: "Dubai",
      email: "stock-delete@example.com",
    });
    const item = await createItem({
      sku: "STOCK-DELETE",
      name: "Stock Delete Item",
      unit: "code",
      expectedPrice: 50,
    });
    const stock = await setStock(company.id, item.id, 9);
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    await request(app)
      .delete(`/api/catalog/stock/${stock.id}`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    expect(await prisma.stock.count()).toBe(0);
  });

  it("flushes transactional data and logs while preserving master data", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const buyer = await createCompany({
      name: "Flush Buyer",
      legalName: "Flush Buyer LLC",
      location: "Dubai",
      email: "flush-buyer@example.com",
    });
    const seller = await createCompany({
      name: "Flush Seller",
      legalName: "Flush Seller LLC",
      location: "Sharjah",
      email: "flush-seller@example.com",
    });
    const item = await createItem({
      sku: "FLUSH-ITEM",
      name: "Flush Item",
      unit: "code",
      expectedPrice: 100,
    });
    await setStock(seller.id, item.id, 20);
    await prisma.emailIntegration.create({
      data: {
        companyId: seller.id,
        email: seller.email,
        mode: "SIMULATION",
        status: "READY_TO_CONNECT",
      },
    });
    const target = await createMonthlyTarget({
      buyerCompanyId: buyer.id,
      sellerCompanyId: seller.id,
      month: "2026-06",
      lines: [{ itemId: item.id, quantity: 2, maxPrice: 110 }],
    });
    await prisma.agentAuditLog.create({ data: { targetId: target.id, step: "TEST", status: "OK", message: "flush test" } });
    await prisma.emailLog.create({
      data: {
        requirementId: null,
        direction: "OUTBOUND",
        fromEmail: buyer.email,
        toEmail: seller.email,
        subject: "Flush test",
        body: "Flush test",
        status: "SENT",
      },
    });
    const poDir = path.resolve(process.cwd(), "storage", "purchase-orders");
    const invoiceDir = path.resolve(process.cwd(), "storage", "invoices");
    const logsDir = path.resolve(process.cwd(), "storage", "logs");
    fs.mkdirSync(poDir, { recursive: true });
    fs.mkdirSync(invoiceDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(poDir, "flush-po.pdf"), "test");
    fs.writeFileSync(path.join(invoiceDir, "flush-invoice.pdf"), "test");
    fs.writeFileSync(path.join(logsDir, "app-2026-06-05.log"), "{}\n");

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const flushed = await request(app)
      .post("/api/maintenance/flush-transactional-data")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    expect(flushed.body.flushed).toBe(true);
    expect(flushed.body.deletedRecords.monthlyTargets).toBe(1);
    expect(flushed.body.deletedRecords.emailLogs).toBe(1);
    expect(flushed.body.deletedRecords.agentAuditLogs).toBe(1);
    expect(await prisma.company.count()).toBe(2);
    expect(await prisma.item.count()).toBe(1);
    expect(await prisma.stock.count()).toBe(1);
    expect(await prisma.emailIntegration.count()).toBe(1);
    expect(await prisma.monthlyTarget.count()).toBe(0);
    expect(await prisma.emailLog.count()).toBe(0);
    expect(await prisma.agentAuditLog.count()).toBe(0);
    expect(fs.readdirSync(poDir)).toEqual([]);
    expect(fs.readdirSync(invoiceDir)).toEqual([]);
    expect(fs.readdirSync(logsDir).filter((file) => file.endsWith(".log"))).toEqual([]);
  });

  it("flushes only selected maintenance categories", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const buyer = await createCompany({
      name: "Dealzarabia",
      legalName: "Dealzarabia Trading LLC",
      location: "Dubai",
      email: "selective-buyer@example.com",
    });
    const seller = await createCompany({
      name: "Buy2day",
      legalName: "Buy2day Distribution LLC",
      location: "Sharjah",
      email: "selective-seller@example.com",
    });
    const item = await createItem({ sku: "SEL-001", name: "Selective Item", unit: "code", expectedPrice: 100 });
    const target = await createMonthlyTarget({
      buyerCompanyId: buyer.id,
      sellerCompanyId: seller.id,
      month: "2026-06",
      lines: [{ itemId: item.id, quantity: 2, maxPrice: 110 }],
    });
    const requirement = await prisma.requirement.create({
      data: {
        targetId: target.id,
        buyerCompanyId: buyer.id,
        sellerCompanyId: seller.id,
        subject: "Selective flush requirement",
        body: "Selective flush requirement",
      },
    });
    await prisma.emailLog.create({
      data: {
        requirementId: requirement.id,
        direction: "OUTBOUND",
        fromEmail: buyer.email,
        toEmail: seller.email,
        subject: "Selective flush test",
        body: "Selective flush test",
        status: "SENT",
      },
    });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const flushed = await request(app)
      .post("/api/maintenance/flush-transactional-data")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ categories: ["transactions"] })
      .expect(200);

    expect(flushed.body.selectedCategories).toEqual(["transactions"]);
    expect(flushed.body.deletedRecords.monthlyTargets).toBe(1);
    expect(flushed.body.deletedRecords.emailLogs).toBeUndefined();
    expect(await prisma.monthlyTarget.count()).toBe(0);
    expect(await prisma.emailLog.count()).toBe(1);
    expect((await prisma.emailLog.findFirstOrThrow()).requirementId).toBeNull();
    expect(await prisma.item.count()).toBe(1);
    expect(await prisma.company.count()).toBe(2);
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

    const deleted = await request(app)
      .delete(`/api/workflow/targets/${target.id}`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    expect(deleted.body.deleted).toBe(true);
    expect(deleted.body.requirements).toBe(1);
    expect(deleted.body.purchaseOrders).toBe(1);
    expect(await prisma.monthlyTarget.count()).toBe(0);
    expect(await prisma.requirement.count()).toBe(0);
    expect(await prisma.purchaseOrder.count()).toBe(0);
    expect(await prisma.stockMovement.count()).toBe(0);
    expect((await prisma.stock.findUnique({ where: { companyId_itemId: { companyId: seller.id, itemId: item.id } } }))?.quantity).toBe(20);
    expect((await prisma.stock.findUnique({ where: { companyId_itemId: { companyId: buyer.id, itemId: item.id } } }))?.quantity ?? 0).toBe(0);
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

  it("uses the buyer company VAT setting on PO and vendor invoice", async () => {
    await createUser("admin@example.com", "ChangeMe123!", "Admin");
    const buyer = await createCompany({
      name: "No VAT Buyer",
      legalName: "No VAT Buyer LLC",
      location: "Dubai",
      email: "no-vat-buyer@example.com",
      vatEnabled: false,
    });
    const seller = await createCompany({
      name: "VAT Seller",
      legalName: "VAT Seller LLC",
      location: "Sharjah",
      email: "vat-seller@example.com",
    });
    const item = await createItem({
      sku: "NO-VAT-ITEM",
      name: "No VAT Workflow Item",
      unit: "pcs",
      expectedPrice: 100,
      maxPrice: 120,
    });
    await setStock(seller.id, item.id, 10);
    const target = await createMonthlyTarget({
      buyerCompanyId: buyer.id,
      sellerCompanyId: seller.id,
      month: "2026-05",
      lines: [{ itemId: item.id, quantity: 3, maxPrice: 120 }],
    });

    const result = await runTargetWorkflow(target.id);
    expect(result.order?.vatAmount.toString()).toBe("0");
    expect(result.order?.total.toString()).toBe("300");

    const order = await prisma.purchaseOrder.findUnique({
      where: { id: result.order!.id },
      include: { lines: true },
    });
    expect(order?.lines[0].vatRate.toString()).toBe("0");

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const vendorInvoice = await request(app)
      .post(`/api/workflow/targets/${target.id}/vendor-invoice`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(201);

    expect(vendorInvoice.body.invoice.vatAmount).toBe("0");
    expect(vendorInvoice.body.invoice.total).toBe("300");
    expect(vendorInvoice.body.invoice.lines[0].vatRate).toBe("0");
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
