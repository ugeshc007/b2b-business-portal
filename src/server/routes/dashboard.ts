import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth } from "../middleware";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/summary", async (_req, res, next) => {
  try {
    const [companies, items, targets, requirements, quotations, orders, invoices, emails, stock, emailIntegrations, turnoverTargets, agentAuditLogs, ecommerceOrders] = await Promise.all([
      prisma.company.findMany({ include: { managedByCompany: true } }),
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
    ]);

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
      agentAuditLogs,
      ecommerceOrders,
    });
  } catch (error) {
    next(error);
  }
});
