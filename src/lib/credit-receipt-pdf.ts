// Isomorphic PDF generator for Shootbase credit purchase receipts.
// Runs in browser and Worker (edge).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const SHOOTBASE_LOGO_URL =
  'https://www.shootbase.co.uk/__l5e/assets-v1/090b7b91-1c83-4ad4-ada6-592190cf11fa/shootbase-logo-email.png';

const COMPANY_LINES = ['Shootbase Ltd', 'Pollard Street East', 'M40 7FS Manchester'];

export type CreditReceiptData = {
  receiptNumber: string;
  customerName: string;
  customerEmail: string;
  purchaseDate: string; // ISO or pretty
  packageName: string;
  credits: number;
  amountPence: number;
  stripePaymentId: string;
};

function gbp(p: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    (p || 0) / 100,
  );
}

async function fetchLogo(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(SHOOTBASE_LOGO_URL);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function generateCreditReceiptPdf(data: CreditReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.08, 0.09, 0.12);
  const mid = rgb(0.35, 0.37, 0.42);
  const muted = rgb(0.55, 0.57, 0.62);
  const hairline = rgb(0.88, 0.89, 0.91);
  const panel = rgb(0.97, 0.97, 0.98);
  const accent = rgb(0.773, 0.627, 0.349); // Shootbase gold

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 48;
  const page = pdf.addPage([pageWidth, pageHeight]);

  // Top accent band
  page.drawRectangle({
    x: 0,
    y: pageHeight - 6,
    width: pageWidth,
    height: 6,
    color: accent,
  });

  let y = pageHeight - margin - 10;

  // Logo
  const logoBytes = await fetchLogo();
  let logoBottom = y;
  if (logoBytes) {
    let img = null;
    try {
      img = await pdf.embedPng(logoBytes);
    } catch {
      try {
        img = await pdf.embedJpg(logoBytes);
      } catch {
        img = null;
      }
    }
    if (img) {
      const maxW = 140;
      const maxH = 50;
      const ratio = img.height / img.width;
      let w = maxW;
      let h = w * ratio;
      if (h > maxH) {
        h = maxH;
        w = h / ratio;
      }
      page.drawImage(img, { x: margin, y: y - h + 8, width: w, height: h });
      logoBottom = y - h - 6;
    }
  }

  // Company block (below logo)
  let cy = logoBottom;
  for (const line of COMPANY_LINES) {
    page.drawText(line, { x: margin, y: cy, size: 10, font, color: mid });
    cy -= 13;
  }

  // RECEIPT title (right)
  const title = 'RECEIPT';
  const titleSize = 22;
  const titleW = bold.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: pageWidth - margin - titleW,
    y,
    size: titleSize,
    font: bold,
    color: ink,
  });

  // PAID pill
  const pillText = 'PAID';
  const pillSize = 8;
  const pillW = bold.widthOfTextAtSize(pillText, pillSize) + 16;
  const pillH = 16;
  const pillX = pageWidth - margin - pillW;
  const pillY = y - 24;
  const okGreen = rgb(0.13, 0.55, 0.34);
  page.drawRectangle({
    x: pillX,
    y: pillY,
    width: pillW,
    height: pillH,
    color: rgb(1, 1, 1),
    borderColor: okGreen,
    borderWidth: 1,
  });
  page.drawText(pillText, {
    x: pillX + 8,
    y: pillY + 4,
    size: pillSize,
    font: bold,
    color: okGreen,
  });

  y = Math.min(cy, pillY) - 28;

  // Meta card
  const cardH = 78;
  page.drawRectangle({
    x: margin,
    y: y - cardH,
    width: pageWidth - margin * 2,
    height: cardH,
    color: panel,
  });
  page.drawRectangle({
    x: margin,
    y: y - cardH,
    width: 3,
    height: cardH,
    color: accent,
  });
  const cellPadX = 18;
  const cellY1 = y - 22;
  const cellY2 = y - 50;
  const cellX = (col: number) =>
    margin + cellPadX + col * ((pageWidth - margin * 2 - cellPadX * 2) / 4);
  const drawMeta = (label: string, value: string, col: number, color = ink, size = 11) => {
    page.drawText(label.toUpperCase(), {
      x: cellX(col),
      y: cellY1,
      size: 7,
      font: bold,
      color: muted,
    });
    page.drawText(value, { x: cellX(col), y: cellY2, size, font: bold, color });
  };
  drawMeta('Receipt no.', data.receiptNumber, 0);
  drawMeta('Date', data.purchaseDate, 1);
  drawMeta('Reference', data.stripePaymentId.slice(0, 22), 2, mid, 9);
  drawMeta('Amount paid', gbp(data.amountPence), 3, accent, 13);

  y -= cardH + 28;

  // Billed to
  page.drawText('BILLED TO', { x: margin, y, size: 8, font: bold, color: muted });
  y -= 14;
  page.drawText(data.customerName || '—', { x: margin, y, size: 11, font: bold, color: ink });
  y -= 14;
  page.drawText(data.customerEmail || '—', { x: margin, y, size: 10, font, color: mid });
  y -= 24;

  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.5,
    color: hairline,
  });
  y -= 18;

  // Line item table
  const colDesc = margin;
  const colQty = pageWidth - margin - 220;
  const colRate = pageWidth - margin - 140;
  const colTotal = pageWidth - margin - 60;
  page.drawText('DESCRIPTION', { x: colDesc, y, size: 7, font: bold, color: muted });
  page.drawText('CREDITS', { x: colQty, y, size: 7, font: bold, color: muted });
  page.drawText('PRICE', { x: colRate, y, size: 7, font: bold, color: muted });
  page.drawText('AMOUNT', { x: colTotal, y, size: 7, font: bold, color: muted });
  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.5,
    color: hairline,
  });
  y -= 16;

  page.drawText(data.packageName || 'Credit purchase', {
    x: colDesc,
    y,
    size: 10,
    font,
    color: ink,
  });
  page.drawText(String(data.credits), { x: colQty, y, size: 10, font, color: mid });
  page.drawText(gbp(data.amountPence), { x: colRate, y, size: 10, font, color: mid });
  page.drawText(gbp(data.amountPence), { x: colTotal, y, size: 10, font: bold, color: ink });
  y -= 12;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.3,
    color: hairline,
  });
  y -= 28;

  // Totals (right)
  const totalsX = pageWidth - margin - 230;
  const totalsValueX = pageWidth - margin - 8;
  const right = (s: string, size: number, f = font, color = ink) => {
    const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: totalsValueX - w, y, size, font: f, color });
  };
  page.drawText('Subtotal', { x: totalsX, y, size: 10, font, color: mid });
  right(gbp(data.amountPence), 10);
  y -= 18;
  page.drawLine({
    start: { x: totalsX, y: y + 4 },
    end: { x: pageWidth - margin, y: y + 4 },
    thickness: 0.5,
    color: hairline,
  });
  y -= 4;
  page.drawText('Total paid', { x: totalsX, y, size: 12, font: bold, color: ink });
  right(gbp(data.amountPence), 14, bold, accent);
  y -= 28;

  // Stripe reference (full)
  page.drawText('TRANSACTION REFERENCE', { x: margin, y, size: 7, font: bold, color: muted });
  y -= 12;
  page.drawText(data.stripePaymentId, { x: margin, y, size: 9, font, color: mid });

  // Footer
  const footerText = 'Thank you for using Shootbase. This receipt confirms a successful payment.';
  const fSize = 8;
  const fW = font.widthOfTextAtSize(footerText, fSize);
  page.drawText(footerText, {
    x: (pageWidth - fW) / 2,
    y: 28,
    size: fSize,
    font,
    color: muted,
  });

  return await pdf.save();
}

export function creditReceiptFilename(receiptNumber: string): string {
  const safe = (receiptNumber || 'receipt').replace(/[^a-z0-9-]/gi, '_');
  return `${safe}.pdf`;
}
