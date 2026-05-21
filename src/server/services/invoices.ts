import { prisma } from "../db";
import { generateInvoicePdf } from "./invoicePdf";
import { getCompanySmtpSettings } from "./emailIntegrations";
import nodemailer from "nodemailer";

export async function listInvoices() {
  return prisma.invoice.findMany({
    include: {
      buyerCompany: true,
      sellerCompany: true,
      purchaseOrder: true,
      lines: { include: { item: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getInvoice(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      buyerCompany: true,
      sellerCompany: true,
      purchaseOrder: true,
      lines: { include: { item: true } },
    },
  });
  if (!invoice) throw new Error("Invoice not found");
  return invoice;
}

export async function sendInvoiceEmail(invoiceId: string) {
  const invoice = await generateInvoicePdf(invoiceId);
  const lineText = invoice.lines
    .map((line) => `${line.item.sku} ${line.item.name} x ${line.quantity} @ AED ${line.unitPrice.toFixed(2)}`)
    .join("\n");

  const body = [
    `Tax Invoice ${invoice.invoiceNumber}`,
    `Seller: ${invoice.sellerCompany.legalName}`,
    invoice.sellerCompany.trn ? `Seller TRN: ${invoice.sellerCompany.trn}` : "",
    `Buyer: ${invoice.buyerCompany.legalName}`,
    invoice.buyerCompany.trn ? `Buyer TRN: ${invoice.buyerCompany.trn}` : "",
    "",
    lineText,
    "",
    `Subtotal: AED ${invoice.subtotal.toFixed(2)}`,
    `${invoice.vatAmount.gt(0) ? "VAT 5%" : "VAT"}: AED ${invoice.vatAmount.toFixed(2)}`,
    `Total: AED ${invoice.total.toFixed(2)}`,
    `PDF Attachment: ${invoice.pdfPath}`,
  ].filter(Boolean).join("\n");

  const sellerIntegration = await prisma.emailIntegration.findUnique({
    where: { companyId: invoice.sellerCompanyId },
  });
  const smtp = await getCompanySmtpSettings(invoice.sellerCompanyId);
  let status = "SENT";
  let messageId: string | undefined;

  if (sellerIntegration?.mode === "LIVE" && smtp) {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.username,
        pass: smtp.password,
      },
    });

    const result = await transporter.sendMail({
      from: smtp.username,
      to: invoice.buyerCompany.email,
      subject: `Tax Invoice ${invoice.invoiceNumber}`,
      text: body,
      attachments: invoice.pdfPath ? [{ filename: `${invoice.invoiceNumber}.pdf`, path: invoice.pdfPath }] : [],
    });
    status = "SENT_VIA_SMTP";
    messageId = result.messageId;
  }

  return prisma.emailLog.create({
    data: {
      direction: "OUTBOUND",
      fromEmail: smtp?.username ?? invoice.sellerCompany.email,
      toEmail: invoice.buyerCompany.email,
      subject: `Tax Invoice ${invoice.invoiceNumber}`,
      body,
      status,
      messageId,
      attachmentPath: invoice.pdfPath,
    },
  });
}
