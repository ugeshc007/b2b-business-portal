import fs from "node:fs";
import path from "node:path";

type BrandCompany = {
  name?: string | null;
  legalName: string;
  email: string;
};

type DocumentBrand = {
  label: string;
  primary: string;
  accent: string;
  pale: string;
  text: string;
  pattern: "diagonal" | "dots";
  logoFile: string;
};

export function getDocumentBrand(company: BrandCompany): DocumentBrand {
  const haystack = `${company.name ?? ""} ${company.legalName} ${company.email}`.toLowerCase();
  if (haystack.includes("buy2day") || haystack.includes("b2d")) {
    return {
      label: "BUY2DAY",
      primary: "#123A63",
      accent: "#F28C28",
      pale: "#EAF3FA",
      text: "#162331",
      pattern: "dots",
      logoFile: "buy2day-logo.png",
    };
  }

  return {
    label: "DEALZ",
    primary: "#244B3B",
    accent: "#C8A24A",
    pale: "#EEF6F1",
    text: "#17211B",
    pattern: "diagonal",
    logoFile: "dealz-logo.png",
  };
}

export function getBrandLogoPath(brand: DocumentBrand) {
  return path.resolve(process.cwd(), "public", "brand", brand.logoFile);
}

export function drawBrandLogo(
  doc: PDFKit.PDFDocument,
  brand: DocumentBrand,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { background?: boolean; padding?: number } = {},
) {
  const padding = options.padding ?? 8;
  doc.save();
  if (options.background !== false) {
    doc.roundedRect(x, y, width, height, 6).fill("#FFFFFF");
  }
  const logoPath = getBrandLogoPath(brand);
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, x + padding, y + padding, {
      fit: [width - padding * 2, height - padding * 2],
      align: "center",
      valign: "center",
    });
  } else {
    doc.fillColor(options.background === false ? "#111111" : brand.primary).font("Helvetica-Bold").fontSize(13).text(brand.label, x + padding, y + height / 2 - 7, { width: width - padding * 2, align: "center" });
  }
  doc.restore();
}

export function drawBrandHeader(doc: PDFKit.PDFDocument, brand: DocumentBrand, title: string, numberLabel: string, numberValue: string, dateLabel: string, dateValue: string, extraLabel?: string, extraValue?: string) {
  doc.save();
  doc.rect(0, 0, 595.28, 116).fill(brand.primary);
  doc.rect(0, 104, 595.28, 12).fill(brand.accent);

  if (brand.pattern === "diagonal") {
    doc.lineWidth(1).strokeColor("#FFFFFF").opacity(0.14);
    for (let x = -80; x < 620; x += 28) {
      doc.moveTo(x, 114).lineTo(x + 120, 0).stroke();
    }
  } else {
    doc.fillColor("#FFFFFF").opacity(0.16);
    for (let x = 24; x < 580; x += 32) {
      for (let y = 18; y < 96; y += 24) {
        doc.circle(x, y, 2.2).fill();
      }
    }
  }
  doc.restore();

  drawBrandLogo(doc, brand, 42, 24, 128, 58, { background: true, padding: 7 });
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(22).text(title, 250, 28, { width: 300, align: "right" });
  doc.font("Helvetica").fontSize(10).text(`${numberLabel}: ${numberValue}`, 330, 62, { width: 220, align: "right" });
  doc.text(`${dateLabel}: ${dateValue}`, 330, 78, { width: 220, align: "right" });
  if (extraLabel && extraValue) doc.text(`${extraLabel}: ${extraValue}`, 330, 94, { width: 220, align: "right" });
  doc.fillColor(brand.text);
}

export function drawSectionLabel(doc: PDFKit.PDFDocument, brand: DocumentBrand, label: string, x: number, y: number) {
  doc.roundedRect(x, y, 92, 22, 4).fill(brand.pale);
  doc.fillColor(brand.primary).font("Helvetica-Bold").fontSize(10).text(label, x + 10, y + 7, { width: 72 });
  doc.fillColor(brand.text);
}

export function drawTableHeader(doc: PDFKit.PDFDocument, brand: DocumentBrand, y: number) {
  doc.roundedRect(42, y - 7, 508, 28, 4).fill(brand.primary);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(10);
  doc.text("Item", 52, y);
  doc.text("Qty", 305, y, { width: 40, align: "right" });
  doc.text("Unit Price", 350, y, { width: 75, align: "right" });
  doc.text("VAT", 430, y, { width: 40, align: "right" });
  doc.text("Line Total", 475, y, { width: 65, align: "right" });
  doc.fillColor(brand.text);
}

export function drawTotalsBox(doc: PDFKit.PDFDocument, brand: DocumentBrand, y: number, rows: Array<[string, string]>) {
  const height = 20 + rows.length * 22;
  doc.roundedRect(365, y - 12, 185, height, 6).fill(brand.pale).strokeColor(brand.accent).stroke();
  doc.fillColor(brand.text).font("Helvetica-Bold").fontSize(10);
  rows.forEach(([label, value], index) => {
    const rowY = y + index * 22;
    const isLast = index === rows.length - 1;
    doc.fontSize(isLast ? 12 : 10).text(label, 380, rowY, { width: 75 });
    doc.text(value, 455, rowY, { width: 80, align: "right" });
  });
}
