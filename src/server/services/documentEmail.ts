import { getDocumentBrand } from "./documentBrand";

type EmailCompany = {
  name?: string;
  legalName: string;
  location: string;
  email: string;
  trn?: string | null;
};

type EmailLine = {
  sku: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: string;
  vatRate: string;
  lineTotal: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function companyBlock(title: string, company: EmailCompany) {
  return `
    <td style="width:50%;vertical-align:top;padding:14px;border:1px solid #d9e1dc;border-radius:8px;background:#ffffff;">
      <div style="font-size:12px;font-weight:700;color:#66756a;text-transform:uppercase;margin-bottom:8px;">${title}</div>
      <div style="font-size:15px;font-weight:700;color:#17211b;margin-bottom:6px;">${escapeHtml(company.legalName)}</div>
      <div style="font-size:13px;color:#3f4a43;line-height:1.45;">${escapeHtml(company.location)}</div>
      <div style="font-size:13px;color:#3f4a43;line-height:1.45;">Email: ${escapeHtml(company.email)}</div>
      <div style="font-size:13px;color:#3f4a43;line-height:1.45;">TRN: ${escapeHtml(company.trn || "Not set")}</div>
    </td>
  `;
}

export function purchaseOrderHtml(input: {
  buyer: EmailCompany;
  vendor: EmailCompany;
  poNumber: string;
  date: string;
  lines: EmailLine[];
  subtotal: string;
  vatAmount: string;
  total: string;
}) {
  const brand = getDocumentBrand(input.buyer);
  const rows = input.lines.map((line, index) => `
    <tr style="background:${index % 2 === 0 ? "#ffffff" : brand.pale};">
      <td style="padding:11px 12px;border-bottom:1px solid #e5ebe7;">
        <strong>${escapeHtml(line.sku)}</strong><br />
        <span style="color:#5d6a61;">${escapeHtml(line.name)}</span>
      </td>
      <td style="padding:11px 12px;border-bottom:1px solid #e5ebe7;text-align:right;">${line.quantity}</td>
      <td style="padding:11px 12px;border-bottom:1px solid #e5ebe7;">${escapeHtml(line.unit)}</td>
      <td style="padding:11px 12px;border-bottom:1px solid #e5ebe7;text-align:right;">${escapeHtml(line.unitPrice)}</td>
      <td style="padding:11px 12px;border-bottom:1px solid #e5ebe7;text-align:right;">${escapeHtml(line.vatRate)}</td>
      <td style="padding:11px 12px;border-bottom:1px solid #e5ebe7;text-align:right;font-weight:700;">${escapeHtml(line.lineTotal)}</td>
    </tr>
  `).join("");

  return `
    <div style="margin:0;padding:0;background:#eef2ef;font-family:Arial,Helvetica,sans-serif;color:#17211b;">
      <div style="max-width:860px;margin:0 auto;background:#ffffff;border:1px solid #d9e1dc;">
        <div style="background:${brand.primary};color:#ffffff;padding:24px 28px;border-bottom:8px solid ${brand.accent};">
          <div style="font-size:13px;letter-spacing:1.5px;font-weight:700;">${brand.label}</div>
          <div style="font-size:26px;font-weight:800;margin-top:8px;">Purchase Order</div>
          <div style="font-size:14px;margin-top:8px;">PO ${escapeHtml(input.poNumber)} &nbsp; | &nbsp; ${escapeHtml(input.date)}</div>
        </div>

        <div style="padding:22px 28px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:10px 0;margin:0 -10px 20px;">
            <tr>
              ${companyBlock("Buyer", input.buyer)}
              ${companyBlock("Vendor", input.vendor)}
            </tr>
          </table>

          <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #d9e1dc;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:${brand.primary};color:#ffffff;">
                <th align="left" style="padding:12px;">Item</th>
                <th align="right" style="padding:12px;">Qty</th>
                <th align="left" style="padding:12px;">Unit</th>
                <th align="right" style="padding:12px;">Unit Price</th>
                <th align="right" style="padding:12px;">VAT</th>
                <th align="right" style="padding:12px;">Line Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;">
            <tr>
              <td style="width:55%;vertical-align:top;color:#3f4a43;font-size:14px;line-height:1.55;">
                Please issue the invoice for this same purchase order and reply from the vendor portal.
              </td>
              <td style="width:45%;vertical-align:top;">
                <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:${brand.pale};border:1px solid ${brand.accent};border-radius:8px;">
                  <tr><td style="padding:10px 14px;">Subtotal</td><td align="right" style="padding:10px 14px;font-weight:700;">${escapeHtml(input.subtotal)}</td></tr>
                  <tr><td style="padding:10px 14px;">VAT 5%</td><td align="right" style="padding:10px 14px;font-weight:700;">${escapeHtml(input.vatAmount)}</td></tr>
                  <tr style="background:${brand.primary};color:#ffffff;"><td style="padding:12px 14px;font-weight:800;">Total</td><td align="right" style="padding:12px 14px;font-weight:800;">${escapeHtml(input.total)}</td></tr>
                </table>
              </td>
            </tr>
          </table>
        </div>

        <div style="background:#f4f7f5;border-top:1px solid #d9e1dc;padding:14px 28px;font-size:12px;color:#66756a;">
          Generated by B2B Business Portal. PDF copy is attached for vendor records.
        </div>
      </div>
    </div>
  `;
}
