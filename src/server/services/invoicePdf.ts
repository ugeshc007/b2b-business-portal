import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { prisma } from "../db";
import { drawBrandHeader, drawSectionLabel, drawTableHeader, drawTotalsBox, getDocumentBrand } from "./documentBrand";

function money(value: { toString(): string } | string | number) {
  return `AED ${Number(value.toString()).toFixed(2)}`;
}

function amount(value: { toString(): string } | string | number) {
  return Number(value.toString()).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isBuy2dayCompany(company: { name?: string | null; legalName: string; email: string }) {
  const haystack = `${company.name ?? ""} ${company.legalName} ${company.email}`.toLowerCase();
  return haystack.includes("buy2day") || haystack.includes("b2d");
}

function integerWords(value: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  if (value === 0) return "Zero";
  if (value < 20) return ones[value];
  if (value < 100) return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ""}`;
  if (value < 1000) return `${ones[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${integerWords(value % 100)}` : ""}`;
  if (value < 1000000) return `${integerWords(Math.floor(value / 1000))} Thousand${value % 1000 ? ` ${integerWords(value % 1000)}` : ""}`;
  return `${integerWords(Math.floor(value / 1000000))} Million${value % 1000000 ? ` ${integerWords(value % 1000000)}` : ""}`;
}

function amountInWords(value: { toString(): string }) {
  const total = Number(value.toString());
  const dirhams = Math.floor(total);
  const fils = Math.round((total - dirhams) * 100);
  return `AED ${integerWords(dirhams)}${fils ? ` And ${integerWords(fils)} Fils` : ""} Only`;
}

type InvoicePdfCompany = {
  name?: string | null;
  legalName: string;
  location: string;
  email: string;
  trn?: string | null;
  bankName?: string | null;
  bankBeneficiaryName?: string | null;
  bankAccountNumber?: string | null;
  bankIban?: string | null;
  bankCid?: string | null;
  bankBranch?: string | null;
};

type InvoicePdfData = {
  invoiceNumber: string;
  createdAt: Date;
  subtotal: { toString(): string };
  vatAmount: { toString(): string };
  total: { toString(): string };
  sellerCompany: InvoicePdfCompany;
  buyerCompany: InvoicePdfCompany;
  purchaseOrder: {
    poNumber: string;
    createdAt: Date;
  };
  lines: Array<{
    quantity: number;
    unitPrice: { toString(): string };
    vatRate: { toString(): string };
    lineTotal: { toString(): string };
    item: {
      sku: string;
      name: string;
      unit: string;
    };
  }>;
};

function drawCompanyBlock(doc: PDFKit.PDFDocument, brand: ReturnType<typeof getDocumentBrand>, label: string, company: { legalName: string; location: string; email: string; trn?: string | null }, x: number, y: number) {
  const width = 220;
  drawSectionLabel(doc, brand, label, x, y);
  const lines = [
    company.legalName,
    company.location,
    `Email: ${company.email}`,
    `TRN: ${company.trn ?? "Not set"}`,
  ];
  let cursorY = y + 32;
  doc.font("Helvetica").fontSize(9.5).fillColor(brand.text);
  for (const line of lines) {
    const lineHeight = doc.heightOfString(line, { width, lineGap: 1 });
    doc.text(line, x, cursorY, { width, lineGap: 1 });
    cursorY += lineHeight + 2;
  }
  return cursorY;
}

function drawBox(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, title?: string) {
  doc.rect(x, y, width, height).strokeColor("#111111").lineWidth(0.8).stroke();
  if (title) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111111").text(title, x + 5, y + 5, { width: width - 10 });
  }
}

function drawTemplateCompany(doc: PDFKit.PDFDocument, title: string, company: { legalName: string; location: string; email: string; trn?: string | null }, x: number, y: number, width: number, height: number) {
  drawBox(doc, x, y, width, height, title);
  const rows = [
    ["Name", company.legalName],
    ["Address", company.location],
    ["Email", company.email],
    ["TRN", company.trn || "Not set"],
  ];
  let rowY = y + 24;
  doc.font("Helvetica").fontSize(8.5).fillColor("#111111");
  for (const [label, value] of rows) {
    doc.font("Helvetica-Bold").text(`${label}:`, x + 6, rowY, { width: 56 });
    doc.font("Helvetica").text(value, x + 66, rowY, { width: width - 74, lineGap: 1 });
    rowY += Math.max(14, doc.heightOfString(value, { width: width - 74, lineGap: 1 }) + 2);
  }
}

function drawBuy2dayInvoicePdf(doc: PDFKit.PDFDocument, invoice: InvoicePdfData) {
  doc.rect(0, 0, 595.28, 841.89).fill("#FFFFFF");
  doc.fillColor("#111111");

  doc.font("Helvetica-Bold").fontSize(16).text(invoice.sellerCompany.legalName, 42, 44, { width: 230 });
  doc.font("Helvetica").fontSize(8.5).text(invoice.sellerCompany.location, 330, 42, { width: 220, align: "right", lineGap: 1 });
  doc.text(`Email: ${invoice.sellerCompany.email}`, 330, doc.y + 2, { width: 220, align: "right" });
  doc.text(`TRN No: ${invoice.sellerCompany.trn ?? "Not set"}`, 330, doc.y + 2, { width: 220, align: "right" });

  doc.font("Helvetica").fontSize(12).text("TAX", 42, 122, { width: 508, align: "center" });
  doc.font("Helvetica-Bold").fontSize(15).text("INVOICE", 42, 144, { width: 508, align: "center" });

  drawBox(doc, 390, 124, 160, 58);
  doc.font("Helvetica-Bold").fontSize(8.5).text("Date", 400, 136);
  doc.text("Invoice Number", 400, 152);
  doc.font("Helvetica").text(`: ${invoice.createdAt.toLocaleDateString()}`, 470, 136, { width: 72 });
  doc.text(`: ${invoice.invoiceNumber}`, 470, 152, { width: 72 });

  drawTemplateCompany(doc, "Sold To:", invoice.buyerCompany, 42, 214, 248, 118);
  drawTemplateCompany(doc, "Ship To:", invoice.buyerCompany, 305, 214, 245, 118);

  const infoY = 340;
  const infoColumns = [
    ["Customer PO No.", invoice.purchaseOrder.poNumber],
    ["Customer PO Date", invoice.purchaseOrder.createdAt.toLocaleDateString()],
    ["Inv Curr.", "AED"],
    ["Payment Terms", "2 DAYS"],
  ];
  let infoX = 42;
  for (const [label, value] of infoColumns) {
    const width = label === "Payment Terms" ? 127 : 127;
    drawBox(doc, infoX, infoY, width, 42);
    doc.font("Helvetica-Bold").fontSize(8.2).text(label, infoX + 4, infoY + 9, { width: width - 8, align: "center" });
    doc.font("Helvetica").fontSize(8.2).text(value, infoX + 4, infoY + 25, { width: width - 8, align: "center" });
    infoX += width;
  }

  const tableY = 388;
  const columns = [
    ["No.", 24],
    ["Item Number", 70],
    ["Description", 120],
    ["Qty", 42],
    ["UOM", 35],
    ["Rate", 45],
    ["Gross Amount", 58],
    ["Disc Amt.", 42],
    ["Net Total", 52],
    ["VAT %", 34],
    ["VAT Amt.", 48],
    ["Net Total Amt Inc. VAT", 70],
  ] as const;
  const scale = 508 / columns.reduce((sum, [, width]) => sum + width, 0);
  let x = 42;
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#111111");
  for (const [label, width] of columns) {
    const cellWidth = width * scale;
    doc.rect(x, tableY, cellWidth, 32).stroke();
    doc.text(label, x + 2, tableY + 8, { width: cellWidth - 4, align: "center" });
    x += cellWidth;
  }

  let y = tableY + 32;
  doc.font("Helvetica").fontSize(7.2);
  invoice.lines.forEach((line, index) => {
    const gross = Number(line.unitPrice.toString()) * line.quantity;
    const vatAmount = Number(line.lineTotal.toString()) * Number(line.vatRate.toString());
    const values = [
      String(index + 1),
      line.item.sku,
      line.item.name,
      String(line.quantity),
      line.item.unit,
      amount(line.unitPrice),
      amount(gross),
      "0.00",
      amount(line.lineTotal),
      `${Number(line.vatRate) * 100}`,
      amount(vatAmount),
      amount(Number(line.lineTotal.toString()) + vatAmount),
    ];
    x = 42;
    let rowHeight = Math.max(26, doc.heightOfString(line.item.name, { width: 120 * scale - 4 }) + 12);
    values.forEach((value, columnIndex) => {
      const cellWidth = columns[columnIndex][1] * scale;
      doc.rect(x, y, cellWidth, rowHeight).stroke();
      doc.text(value, x + 2, y + 8, { width: cellWidth - 4, align: columnIndex >= 3 ? "right" : "left" });
      x += cellWidth;
    });
    y += rowHeight;
  });

  drawBox(doc, 42, y + 8, 508, 38);
  doc.font("Helvetica-Bold").fontSize(8).text(`Amount In Words: ${amountInWords(invoice.total)}`, 48, y + 20, { width: 490 });

  const bankY = y + 58;
  drawBox(doc, 42, bankY, 265, 116, "Our Bank Details:");
  const bankRows = [
    ["Bank Name", invoice.sellerCompany.bankName],
    ["Branch", invoice.sellerCompany.bankBranch],
    ["A/C No", invoice.sellerCompany.bankAccountNumber],
    ["A/C Currency", "AED"],
    ["A/C Name", invoice.sellerCompany.bankBeneficiaryName],
    ["IBAN No", invoice.sellerCompany.bankIban],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  let bankLineY = bankY + 28;
  doc.font("Helvetica").fontSize(7.8);
  for (const [label, value] of bankRows) {
    doc.font("Helvetica-Bold").text(label, 48, bankLineY, { width: 72 });
    doc.font("Helvetica").text(value, 134, bankLineY, { width: 166 });
    bankLineY += 14;
  }

  drawBox(doc, 370, bankY - 6, 180, 116, "AMOUNT in AED");
  const totals = [
    ["Gross Amount", amount(invoice.subtotal)],
    ["Less: Discount", "0.00"],
    ["Net Amount", amount(invoice.subtotal)],
    [Number(invoice.vatAmount.toString()) > 0 ? "VAT 5% Amount" : "VAT Amount", amount(invoice.vatAmount)],
    ["Total Value", amount(invoice.total)],
  ];
  let totalY = bankY + 24;
  for (const [label, value] of totals) {
    doc.font("Helvetica-Bold").fontSize(8).text(label, 378, totalY, { width: 80 });
    doc.text(value, 460, totalY, { width: 80, align: "right" });
    totalY += 16;
  }

  doc.font("Helvetica").fontSize(6.5).text("Agreed payment terms to be strictly followed. Products listed on this invoice are intended for approved business use and resale.", 42, bankY + 130, { width: 508 });
  drawBox(doc, 42, 720, 245, 48, "Agreed By: Sign and Stamp");
  drawBox(doc, 305, 720, 245, 48, `For ${invoice.sellerCompany.legalName}`);
}

function drawBankDetails(doc: PDFKit.PDFDocument, brand: ReturnType<typeof getDocumentBrand>, company: {
  bankName?: string | null;
  bankBeneficiaryName?: string | null;
  bankAccountNumber?: string | null;
  bankIban?: string | null;
  bankCid?: string | null;
  bankBranch?: string | null;
}, x: number, y: number) {
  const rows = [
    ["Bank Name", company.bankName],
    ["Beneficiary", company.bankBeneficiaryName],
    ["Account No", company.bankAccountNumber],
    ["IBAN", company.bankIban],
    ["CID", company.bankCid],
    ["Branch", company.bankBranch],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  if (!rows.length) return y;

  drawSectionLabel(doc, brand, "Bank", x, y);
  let cursorY = y + 32;
  doc.font("Helvetica").fontSize(8.8).fillColor(brand.text);
  for (const [label, value] of rows) {
    const text = `${label}: ${value}`;
    const lineHeight = doc.heightOfString(text, { width: 260, lineGap: 1 });
    doc.text(text, x, cursorY, { width: 260, lineGap: 1 });
    cursorY += lineHeight + 2;
  }
  return cursorY;
}

export async function generateInvoicePdf(invoiceId: string) {
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
  const storageDir = path.resolve(process.cwd(), "storage", "invoices");
  fs.mkdirSync(storageDir, { recursive: true });

  const safeNumber = invoice.invoiceNumber.replace(/[^a-zA-Z0-9-_]/g, "_");
  const pdfPath = path.join(storageDir, `${safeNumber}.pdf`);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42 });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);
    const brand = getDocumentBrand(invoice.sellerCompany);

    if (isBuy2dayCompany(invoice.sellerCompany)) {
      drawBuy2dayInvoicePdf(doc, invoice);
      doc.end();
      stream.on("finish", resolve);
      stream.on("error", reject);
      return;
    }

    drawBrandHeader(doc, brand, "TAX INVOICE", "Invoice No", invoice.invoiceNumber, "Date", invoice.createdAt.toLocaleDateString(), "PO Ref", invoice.purchaseOrder.poNumber);

    const top = 150;
    const sellerBottom = drawCompanyBlock(doc, brand, "Seller", invoice.sellerCompany, 42, top);
    const buyerBottom = drawCompanyBlock(doc, brand, "Buyer", invoice.buyerCompany, 330, top);

    const tableTop = Math.max(sellerBottom, buyerBottom, 238) + 18;
    drawTableHeader(doc, brand, tableTop);

    let y = tableTop + 34;
    doc.font("Helvetica").fontSize(9).fillColor(brand.text);
    for (const [index, line] of invoice.lines.entries()) {
      if (y > 700) {
        doc.addPage();
        drawBrandHeader(doc, brand, "TAX INVOICE", "Invoice No", invoice.invoiceNumber, "Date", invoice.createdAt.toLocaleDateString(), "PO Ref", invoice.purchaseOrder.poNumber);
        y = 145;
        drawTableHeader(doc, brand, y);
        y += 34;
      }
      if (index % 2 === 0) {
        doc.roundedRect(42, y - 6, 508, 22, 3).fill(brand.pale);
      }
      doc.fillColor(brand.text).font("Helvetica").fontSize(8.5);
      doc.text(`${line.item.sku} - ${line.item.name}`, 52, y, { width: 250, lineBreak: false });
      doc.fontSize(9);
      doc.text(String(line.quantity), 305, y, { width: 40, align: "right" });
      doc.text(money(line.unitPrice), 350, y, { width: 75, align: "right" });
      doc.text(`${Number(line.vatRate) * 100}%`, 430, y, { width: 40, align: "right" });
      doc.text(money(line.lineTotal), 475, y, { width: 65, align: "right" });
      y += 24;
    }

    y += 14;
    drawTotalsBox(doc, brand, y, [
      ["Subtotal", money(invoice.subtotal)],
      [Number(invoice.vatAmount.toString()) > 0 ? "VAT 5%" : "VAT", money(invoice.vatAmount)],
      ["Total", money(invoice.total)],
    ]);

    drawBankDetails(doc, brand, invoice.sellerCompany, 42, y);

    doc.fillColor(brand.text).font("Helvetica").fontSize(9).text("Generated by B2B Business Portal. This PDF copy is stored for audit and email attachment use.", 42, 760, { width: 508 });

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return prisma.invoice.update({
    where: { id: invoiceId },
    data: { pdfPath },
    include: {
      buyerCompany: true,
      sellerCompany: true,
      purchaseOrder: true,
      lines: { include: { item: true } },
    },
  });
}

export async function getInvoicePdfFile(invoiceId: string) {
  let invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      buyerCompany: true,
      sellerCompany: true,
      purchaseOrder: true,
      lines: { include: { item: true } },
    },
  });
  if (!invoice) throw new Error("Invoice not found");
  if (!invoice.pdfPath || !fs.existsSync(invoice.pdfPath)) {
    invoice = await generateInvoicePdf(invoiceId);
  }
  return {
    invoice,
    path: invoice.pdfPath!,
    filename: `${invoice.invoiceNumber}.pdf`,
  };
}
