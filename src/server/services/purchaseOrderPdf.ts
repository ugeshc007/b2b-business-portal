import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { prisma } from "../db";
import { drawBrandHeader, drawBrandLogo, drawSectionLabel, drawTableHeader, drawTotalsBox, getDocumentBrand } from "./documentBrand";

function money(value: { toFixed(decimalPlaces: number): string } | string | number) {
  return `AED ${Number(value.toString()).toFixed(2)}`;
}

function amount(value: { toString(): string } | string | number) {
  return Number(value.toString()).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isBuy2dayCompany(company: { name?: string | null; legalName: string; email: string }) {
  const haystack = `${company.name ?? ""} ${company.legalName} ${company.email}`.toLowerCase();
  return haystack.includes("buy2day") || haystack.includes("b2d");
}

export async function getPurchaseOrderPdf(orderId: string) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: orderId },
    include: {
      buyerCompany: true,
      sellerCompany: true,
      lines: { include: { item: true } },
    },
  });
  if (!order) throw new Error("Purchase order not found");

  return writePurchaseOrderPdf(order);
}

export async function getPurchaseOrderPdfForTarget(targetId: string) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { quotation: { requirement: { targetId } } },
    include: {
      buyerCompany: true,
      sellerCompany: true,
      lines: { include: { item: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!order) throw new Error("Purchase order not found for target");

  return writePurchaseOrderPdf(order);
}

async function writePurchaseOrderPdf(order: {
  id: string;
  poNumber: string;
  createdAt: Date;
  subtotal: { toFixed(decimalPlaces: number): string; toString(): string };
  vatAmount: { toFixed(decimalPlaces: number): string; toString(): string };
  total: { toFixed(decimalPlaces: number): string; toString(): string };
  buyerCompany: { name?: string | null; legalName: string; location: string; email: string; trn: string | null; logoPath?: string | null };
  sellerCompany: { name?: string | null; legalName: string; location: string; email: string; trn: string | null; logoPath?: string | null };
  lines: Array<{
    quantity: number;
    unitPrice: { toFixed(decimalPlaces: number): string; toString(): string };
    vatRate: { toString(): string };
    lineTotal: { toFixed(decimalPlaces: number): string; toString(): string };
    item: { sku: string; name: string; unit?: string };
  }>;
}) {
  const storageDir = path.resolve(process.cwd(), "storage", "purchase-orders");
  fs.mkdirSync(storageDir, { recursive: true });
  const safeNumber = order.poNumber.replace(/[^a-zA-Z0-9-_]/g, "_");
  const pdfPath = path.join(storageDir, `${safeNumber}.pdf`);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: isBuy2dayCompany(order.buyerCompany) ? "A4" : "A4", layout: isBuy2dayCompany(order.buyerCompany) ? "landscape" : "portrait", margin: 42 });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);
    const brand = getDocumentBrand({
      name: order.buyerCompany.name ?? undefined,
      legalName: order.buyerCompany.legalName,
      email: order.buyerCompany.email,
    });

    if (isBuy2dayCompany(order.buyerCompany)) {
      drawBuy2dayLpoPdf(doc, order);
      doc.end();
      stream.on("finish", resolve);
      stream.on("error", reject);
      return;
    }

    drawBrandHeader(doc, brand, "PURCHASE ORDER", "PO No", order.poNumber, "Date", order.createdAt.toLocaleDateString());

    const top = 150;
    drawSectionLabel(doc, brand, "Buyer", 42, top);
    doc.font("Helvetica").fontSize(10).fillColor(brand.text).text(order.buyerCompany.legalName, 42, top + 32, { width: 220 });
    doc.text(order.buyerCompany.location, { width: 220 });
    doc.text(`Email: ${order.buyerCompany.email}`, { width: 220 });
    doc.text(`TRN: ${order.buyerCompany.trn ?? "Not set"}`, { width: 220 });

    drawSectionLabel(doc, brand, "Vendor", 330, top);
    doc.font("Helvetica").fontSize(10).fillColor(brand.text).text(order.sellerCompany.legalName, 330, top + 32, { width: 220 });
    doc.text(order.sellerCompany.location, 330);
    doc.text(`Email: ${order.sellerCompany.email}`, 330);
    doc.text(`TRN: ${order.sellerCompany.trn ?? "Not set"}`, 330);

    const tableTop = Math.max(doc.y, 220);
    drawTableHeader(doc, brand, tableTop);

    let y = tableTop + 34;
    doc.font("Helvetica").fontSize(9).fillColor(brand.text);
    for (const [index, line] of order.lines.entries()) {
      if (y > 700) {
        doc.addPage();
        drawBrandHeader(doc, brand, "PURCHASE ORDER", "PO No", order.poNumber, "Date", order.createdAt.toLocaleDateString());
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
      ["Subtotal", money(order.subtotal)],
      [Number(order.vatAmount.toString()) > 0 ? "VAT 5%" : "VAT", money(order.vatAmount)],
      ["Total", money(order.total)],
    ]);

    doc.fillColor(brand.text).font("Helvetica").fontSize(9).text("Generated by B2B Business Portal.", 42, 760, { width: 508 });

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return {
    order,
    path: pdfPath,
    filename: `${order.poNumber}.pdf`,
  };
}

function drawCell(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, text = "", options: { bold?: boolean; align?: "left" | "center" | "right"; size?: number; color?: string } = {}) {
  doc.rect(x, y, width, height).strokeColor("#111111").lineWidth(0.7).stroke();
  if (!text) return;
  doc
    .font(options.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(options.size ?? 7.6)
    .fillColor(options.color ?? "#111111")
    .text(text, x + 3, y + 4, { width: width - 6, align: options.align ?? "left", lineGap: 1 });
}

function drawBuy2dayLpoPdf(doc: PDFKit.PDFDocument, order: {
  poNumber: string;
  createdAt: Date;
  subtotal: { toString(): string };
  vatAmount: { toString(): string };
  total: { toString(): string };
  buyerCompany: { legalName: string; location: string; email: string; trn: string | null; logoPath?: string | null };
  sellerCompany: { legalName: string; location: string; email: string; trn: string | null; logoPath?: string | null };
  lines: Array<{
    quantity: number;
    unitPrice: { toString(): string };
    vatRate: { toString(): string };
    lineTotal: { toString(): string };
    item: { sku: string; name: string; unit?: string };
  }>;
}) {
  const pageWidth = 841.89;
  const margin = 32;
  const width = pageWidth - margin * 2;
  doc.rect(0, 0, 841.89, 595.28).fill("#FFFFFF");
  doc.rect(margin, 28, width, 535).strokeColor("#111111").lineWidth(0.8).stroke();
  const brand = getDocumentBrand(order.buyerCompany);

  drawBrandLogo(doc, brand, margin + 42, 46, 235, 70, { background: false, padding: 0 });
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#111111").text(order.buyerCompany.legalName, 500, 44, { width: 285, align: "right" });
  doc.font("Helvetica").fontSize(10).text(order.buyerCompany.location, 500, 68, { width: 285, align: "right" });
  doc.text(`Email: ${order.buyerCompany.email}`, 500, 84, { width: 285, align: "right" });
  doc.text(`TRN: ${order.buyerCompany.trn ?? "Not set"}`, 500, 100, { width: 285, align: "right" });
  doc.moveTo(margin + 35, 124).lineTo(margin + width - 35, 124).stroke();
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#6D95FF").text("Purchase Order request form", margin, 138, { width, align: "center" });

  const infoY = 162;
  const leftW = 315;
  const labelW = 190;
  const valW = 190;
  const dateW = 80;
  let rowY = infoY;
  drawCell(doc, margin, rowY, 52, 18);
  drawCell(doc, margin + 52, rowY, leftW - 52, 18, order.sellerCompany.legalName, { size: 9 });
  drawCell(doc, margin + leftW, rowY, labelW, 18, "Purchase Order No. / Date", { bold: true, size: 9 });
  drawCell(doc, margin + leftW + labelW, rowY, valW, 18, order.poNumber, { size: 9 });
  drawCell(doc, margin + leftW + labelW + valW, rowY, dateW, 18, order.createdAt.toLocaleDateString(), { size: 9 });

  rowY += 18;
  drawCell(doc, margin, rowY, 52, 36);
  drawCell(doc, margin + 52, rowY, leftW - 52, 36, order.sellerCompany.location, { size: 7.8 });
  drawCell(doc, margin + leftW, rowY, labelW, 36, "Ordered by", { bold: true, size: 9 });
  drawCell(doc, margin + leftW + labelW, rowY, valW + dateW, 36, order.buyerCompany.legalName, { size: 9 });

  rowY += 36;
  drawCell(doc, margin, rowY, leftW, 18);
  drawCell(doc, margin + leftW, rowY, labelW, 18, "Terms of Payment", { bold: true, size: 9 });
  drawCell(doc, margin + leftW + labelW, rowY, valW + dateW, 18, "ADVANCE", { size: 9 });

  rowY += 18;
  drawCell(doc, margin, rowY, leftW, 18);
  drawCell(doc, margin + leftW, rowY, labelW, 18, "Terms of Delivery", { bold: true, size: 9 });
  drawCell(doc, margin + leftW + labelW, rowY, valW + dateW, 18, "IMMEDIATE AGAINST PAYMENT CONFIRMATION", { size: 8 });

  rowY += 18;
  drawCell(doc, margin, rowY, leftW, 18);
  drawCell(doc, margin + leftW, rowY, labelW, 18, "Delivery To", { bold: true, size: 9 });
  drawCell(doc, margin + leftW + labelW, rowY, valW + dateW, 18, order.buyerCompany.location.split(",")[0] || order.buyerCompany.location, { size: 9 });

  rowY += 18;
  drawCell(doc, margin, rowY, width, 18);

  const tableY = rowY + 18;
  const baseColumns = [
    ["Sr. No.", 52],
    ["Item Code", 78],
    ["Item Description", 205],
    ["Quantity", 110],
    ["Unit Price", 80],
    ["Amount", 92],
    ["VAT Rate", 48],
    ["VAT Amt", 48],
    ["Total", 80],
  ] as const;
  const columnScale = width / baseColumns.reduce((sum, [, colWidth]) => sum + colWidth, 0);
  const columns = baseColumns.map(([label, colWidth]) => [label, colWidth * columnScale] as const);

  let x = margin;
  for (const [label, colWidth] of columns) {
    drawCell(doc, x, tableY, colWidth, 18, label, { bold: true, align: "center", size: 8.5 });
    x += colWidth;
  }

  const rowHeight = 15;
  const maxRows = 12;
  const rows = [...order.lines];
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const line = rows[rowIndex];
    const y = tableY + 18 + rowIndex * rowHeight;
    const vatAmount = line ? Number(line.lineTotal.toString()) * Number(line.vatRate.toString()) : 0;
    const total = line ? Number(line.lineTotal.toString()) + vatAmount : 0;
    const values = line
      ? [
          String(rowIndex + 1),
          line.item.sku,
          line.item.name,
          Number(line.quantity).toLocaleString("en-US"),
          amount(line.unitPrice),
          amount(line.lineTotal),
          Number(line.vatRate.toString()) ? `${Number(line.vatRate.toString()) * 100}%` : "-",
          vatAmount ? amount(vatAmount) : "-",
          amount(total),
        ]
      : ["", "", "", "", "", "-", "-", "-", "-"];
    x = margin;
    values.forEach((value, columnIndex) => {
      const colWidth = columns[columnIndex][1];
      drawCell(doc, x, y, colWidth, rowHeight, value, {
        size: 7.6,
        align: columnIndex >= 3 ? "right" : columnIndex === 2 ? "center" : "left",
      });
      x += colWidth;
    });
  }

  const summaryY = tableY + 18 + maxRows * rowHeight;
  drawCell(doc, margin, summaryY, width - 80, 18, "", { size: 8 });
  drawCell(doc, margin + width - 80, summaryY, 80, 18, amount(order.total), { align: "right", size: 8 });
  drawCell(doc, margin, summaryY + 18, width - 80, 18, "", { size: 8 });
  drawCell(doc, margin + width - 80, summaryY + 18, 80, 18, "-", { align: "right", size: 8 });
  drawCell(doc, margin, summaryY + 36, width - 80, 20, "Grant Total", { size: 9 });
  drawCell(doc, margin + width - 80, summaryY + 36, 80, 20, amount(order.total), { align: "right", size: 8.5 });

  drawCell(doc, margin, 548, 335, 15, "Name- Finance", { bold: true, size: 8.5 });
  drawCell(doc, margin + 335, 548, width - 335, 15);
}
