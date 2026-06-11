import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { AuthRequest, requireAuth } from "../middleware";
import { getStockMovementReport } from "../services/stockLedger";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

function normalizeIdentity(value?: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function identityMatches(left?: string | null, right?: string | null) {
  const normalizedLeft = normalizeIdentity(left);
  const normalizedRight = normalizeIdentity(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  if (normalizedLeft.length < 8 || normalizedRight.length < 8) return false;
  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

function parseBusinessPlanSetting(
  setting: { key: string; value: string; updatedAt: Date },
  companies: Array<{ id: string; name: string; legalName: string }>,
) {
  const [, companyId = setting.key] = setting.key.split(":");
  try {
    const plan = JSON.parse(setting.value);
    const explicitCompanyId = plan.companyId ?? plan.mainCompanyId ?? companyId;
    const resolvedCompany = companies.find((company) => company.id === companyId)
      ?? companies.find((company) => company.id === explicitCompanyId)
      ?? companies.find((company) => {
        const planNames = [plan.excelMainCompanyName, plan.companyName].filter(Boolean);
        return [company.name, company.legalName].some((value) => planNames.some((planName) => identityMatches(value, planName)));
      });
    const resolvedCompanyId = resolvedCompany?.id ?? explicitCompanyId;
    return {
      ...plan,
      planId: setting.key,
      companyId: resolvedCompanyId,
      companyName: resolvedCompany?.name ?? plan.companyName ?? plan.excelMainCompanyName ?? resolvedCompanyId,
      mainCompanyId: resolvedCompanyId,
      updatedAt: setting.updatedAt,
      parseError: null,
    };
  } catch (error) {
    return {
      planId: setting.key,
      companyId,
      companyName: companies.find((company) => company.id === companyId)?.name ?? companyId,
      updatedAt: setting.updatedAt,
      parseError: error instanceof Error ? error.message : "Could not parse saved business plan",
    };
  }
}

dashboardRouter.get("/summary", async (req: AuthRequest, res, next) => {
  try {
    let [companies, portalUsers, items, targets, requirements, quotations, orders, invoices, emails, stock, emailIntegrations, turnoverTargets, agentAuditLogs, ecommerceOrders, stockMovementReport, businessPlanSettings] = await Promise.all([
      prisma.company.findMany({ include: { managedByCompany: true } }),
      prisma.user.findMany({
        where: { role: "COMPANY_USER" },
        select: { id: true, email: true, name: true, role: true, companyId: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.item.findMany(),
      prisma.monthlyTarget.findMany({
        include: {
          lines: { include: { item: true } },
          buyerCompany: true,
          sellerCompany: true,
          requirements: { include: { quotations: { include: { purchaseOrder: { include: { invoice: true } } } } } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.requirement.findMany({ include: { buyerCompany: true, sellerCompany: true }, orderBy: { createdAt: "desc" } }),
      prisma.quotation.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.purchaseOrder.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.invoice.findMany({ include: { buyerCompany: true, sellerCompany: true }, orderBy: { createdAt: "desc" } }),
      prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.stock.findMany({ include: { company: true, item: true }, orderBy: { updatedAt: "desc" } }),
      prisma.emailIntegration.findMany({ include: { company: true }, orderBy: { createdAt: "asc" } }),
      prisma.turnoverTarget.findMany({ include: { company: true }, orderBy: { createdAt: "desc" } }),
      prisma.agentAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.ecommerceOrder.findMany({
        include: { buyerCompany: true, sellerCompany: true, item: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      getStockMovementReport(),
      prisma.appSetting.findMany({
        where: { key: { startsWith: "businessPlan:" } },
        orderBy: { updatedAt: "desc" },
      }),
    ]);
    const scopedCompanyId = req.userRole === "COMPANY_USER" ? req.userCompanyId : null;
    if (scopedCompanyId) {
      const visibleCompanyIds = new Set(companies
        .filter((company) => company.id === scopedCompanyId || company.managedByCompanyId === scopedCompanyId)
        .map((company) => company.id));
      const visibleCompanyEmails = new Set(companies
        .filter((company) => visibleCompanyIds.has(company.id))
        .map((company) => company.email));
      companies = companies.filter((company) => visibleCompanyIds.has(company.id));
      portalUsers = portalUsers.filter((user) => user.companyId === scopedCompanyId);
      targets = targets.filter((target) => visibleCompanyIds.has(target.buyerCompanyId) || visibleCompanyIds.has(target.sellerCompanyId));
      const visibleTargetIds = new Set(targets.map((target) => target.id));
      requirements = requirements.filter((requirement) => visibleCompanyIds.has(requirement.buyerCompanyId) || visibleCompanyIds.has(requirement.sellerCompanyId));
      quotations = quotations.filter((quotation) => visibleCompanyIds.has(quotation.buyerCompanyId) || visibleCompanyIds.has(quotation.sellerCompanyId));
      orders = orders.filter((order) => visibleCompanyIds.has(order.buyerCompanyId) || visibleCompanyIds.has(order.sellerCompanyId));
      invoices = invoices.filter((invoice) => visibleCompanyIds.has(invoice.buyerCompanyId) || visibleCompanyIds.has(invoice.sellerCompanyId));
      emails = emails.filter((email) => visibleCompanyEmails.has(email.fromEmail) || visibleCompanyEmails.has(email.toEmail));
      stock = stock.filter((row) => visibleCompanyIds.has(row.companyId));
      emailIntegrations = emailIntegrations.filter((integration) => visibleCompanyIds.has(integration.companyId));
      turnoverTargets = turnoverTargets.filter((target) => visibleCompanyIds.has(target.companyId));
      agentAuditLogs = agentAuditLogs.filter((log) => log.targetId && visibleTargetIds.has(log.targetId));
      ecommerceOrders = ecommerceOrders.filter((order) => visibleCompanyIds.has(order.buyerCompanyId) || visibleCompanyIds.has(order.sellerCompanyId));
      stockMovementReport = stockMovementReport.filter((row) => visibleCompanyIds.has(row.companyId));
      businessPlanSettings = businessPlanSettings.filter((setting) => {
        const [, companyId = setting.key] = setting.key.split(":");
        return visibleCompanyIds.has(companyId);
      });
    }
    const businessPlans = businessPlanSettings.map((setting) => parseBusinessPlanSetting(setting, companies));

    const invoiceTotal = invoices.reduce((sum, invoice) => sum.plus(invoice.total), new Prisma.Decimal(0));
    const vatTotal = invoices.reduce((sum, invoice) => sum.plus(invoice.vatAmount), new Prisma.Decimal(0));
    const stockByCompany = companies.map((company) => {
      const rows = stock.filter((row) => row.companyId === company.id);
      return {
        companyId: company.id,
        companyName: company.name,
        itemCount: rows.length,
        totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
      };
    });
    const workflowByStatus = requirements.reduce<Record<string, number>>((acc, requirement) => {
      acc[requirement.status] = (acc[requirement.status] ?? 0) + 1;
      return acc;
    }, {});
    const emailByStatus = emails.reduce<Record<string, number>>((acc, email) => {
      acc[email.status] = (acc[email.status] ?? 0) + 1;
      return acc;
    }, {});
    const recentActivity = [
      ...requirements.slice(0, 5).map((requirement) => ({
        id: requirement.id,
        type: "Requirement",
        title: requirement.subject,
        status: requirement.status,
        date: requirement.createdAt,
      })),
      ...invoices.slice(0, 5).map((invoice) => ({
        id: invoice.id,
        type: "Invoice",
        title: invoice.invoiceNumber,
        status: invoice.status,
        date: invoice.createdAt,
      })),
      ...emails.slice(0, 5).map((email) => ({
        id: email.id,
        type: "Email",
        title: email.subject,
        status: email.status,
        date: email.createdAt,
      })),
    ]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 8);

    res.json({
      counts: {
        companies: companies.length,
        items: items.length,
        targets: targets.length,
        requirements: requirements.length,
        quotations: quotations.length,
        orders: orders.length,
        invoices: invoices.length,
        ecommerceOrders: ecommerceOrders.length,
      },
      overview: {
        invoiceTotal,
        vatTotal,
        stockByCompany,
        workflowByStatus,
        emailByStatus,
        gmailConnected: emailIntegrations.filter((integration) => integration.status === "CONNECTED").length,
        gmailConfigured: emailIntegrations.length,
        recentActivity,
        lastUpdatedAt: new Date(),
      },
      companies,
      portalUsers,
      items,
      targets: targets.map((target) => {
        const invoice = target.requirements
          .flatMap((requirement) => requirement.quotations)
          .map((quotation) => quotation.purchaseOrder?.invoice)
          .find(Boolean);
        const poTotal = target.lines.reduce((sum, line) => {
          const unitPrice = line.maxPrice ?? line.item.expectedPrice;
          const vatRate = line.item.vatRate ?? new Prisma.Decimal(0.05);
          return sum.plus(new Prisma.Decimal(unitPrice).mul(line.quantity).mul(new Prisma.Decimal(1).plus(vatRate)));
        }, new Prisma.Decimal(0));
        return {
          ...target,
          requirements: undefined,
          documentValue: invoice?.total ?? poTotal,
          invoiceNumber: invoice?.invoiceNumber ?? null,
        };
      }),
      requirements,
      quotations,
      orders,
      invoices,
      emails,
      stock,
      emailIntegrations,
      turnoverTargets,
      businessPlans,
      stockMovementReport,
      agentAuditLogs,
      ecommerceOrders,
    });
  } catch (error) {
    next(error);
  }
});
