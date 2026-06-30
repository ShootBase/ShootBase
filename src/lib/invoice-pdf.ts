// Isomorphic PDF generator for invoices. Works in browser and Worker (edge).
// Modern, premium SaaS-style layout with dynamic Pro branding.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import type { Invoice } from '@/lib/invoices.functions';

// Shootbase logo is intentionally NOT rendered on invoice PDFs.
// Invoices are branded only with the Pro's own business branding.

export type InvoiceBranding = {
  businessName: string | null;
  logoUrl: string | null;
  brandColor: string | null; // hex like #C5A059
};

function gbp(p: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format((p || 0) / 100);
}

function hexToRgb(hex: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = m[1];
  return {
    r: parseInt(v.slice(0, 2), 16) / 255,
    g: parseInt(v.slice(2, 4), 16) / 255,
    b: parseInt(v.slice(4, 6), 16) / 255,
  };
}

async function fetchImageBytes(url: string | null): Promise<{ bytes: Uint8Array; kind: 'png' | 'jpg' } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    // Detect by magic bytes too
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    if (ct.includes('png') || isPng) return { bytes: buf, kind: 'png' };
    if (ct.includes('jpeg') || ct.includes('jpg') || isJpg) return { bytes: buf, kind: 'jpg' };
    // unknown — try png first
    return { bytes: buf, kind: 'png' };
  } catch {
    return null;
  }
}

async function embedImageSafe(pdf: PDFDocument, fetched: { bytes: Uint8Array; kind: 'png' | 'jpg' } | null): Promise<PDFImage | null> {
  if (!fetched) return null;
  try {
    if (fetched.kind === 'png') return await pdf.embedPng(fetched.bytes);
    return await pdf.embedJpg(fetched.bytes);
  } catch {
    try {
      // try the other format
      if (fetched.kind === 'png') return await pdf.embedJpg(fetched.bytes);
      return await pdf.embedPng(fetched.bytes);
    } catch {
      return null;
    }
  }
}

export async function generateInvoicePdf(args: {
  invoice: Invoice;
  fromName: string;
  branding?: InvoiceBranding | null;
}): Promise<Uint8Array> {
  const { invoice, fromName, branding } = args;
  void branding;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Colours
  const ink = rgb(0.08, 0.09, 0.12);
  const mid = rgb(0.35, 0.37, 0.42);
  const muted = rgb(0.55, 0.57, 0.62);
  const hairline = rgb(0.88, 0.89, 0.91);
  const panel = rgb(0.97, 0.97, 0.98);
  const defaultAccent = rgb(0.773, 0.627, 0.349); // Shootbase gold
  const brandRgb = hexToRgb(branding?.brandColor ?? null);
  const accent = brandRgb ? rgb(brandRgb.r, brandRgb.g, brandRgb.b) : defaultAccent;

  // Logo: only the Pro's own brand logo. No Shootbase fallback.
  const proLogoFetched = await fetchImageBytes(branding?.logoUrl ?? null);
  const proLogo = await embedImageSafe(pdf, proLogoFetched);
  const headerLogo = proLogo;

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 48;
  const footerReserve = 60;

  let page: PDFPage = pdf.addPage([pageWidth, pageHeight]);

  const drawFooter = (p: PDFPage) => {
    const text = 'Generated with Shootbase';
    const size = 8;
    const w = font.widthOfTextAtSize(text, size);
    p.drawText(text, {
      x: (pageWidth - w) / 2,
      y: 28,
      size,
      font,
      color: muted,
    });
  };

  // ----- Header band with brand colour accent -----
  const bandH = 6;
  page.drawRectangle({
    x: 0,
    y: pageHeight - bandH,
    width: pageWidth,
    height: bandH,
    color: accent,
  });

  let y = pageHeight - margin - 10;

  // Logo (left) + business name
  const logoMaxW = 130;
  const logoMaxH = 48;
  let textStartY = y;
  if (headerLogo) {
    const ratio = headerLogo.height / headerLogo.width;
    let lw = logoMaxW;
    let lh = lw * ratio;
    if (lh > logoMaxH) {
      lh = logoMaxH;
      lw = lh / ratio;
    }
    page.drawImage(headerLogo, { x: margin, y: y - lh + 8, width: lw, height: lh });
    textStartY = y - lh - 6;
  }

  // Business name below logo
  const businessName = branding?.businessName || fromName;
  page.drawText(businessName, {
    x: margin,
    y: textStartY,
    size: 12,
    font: bold,
    color: ink,
  });

  // Right side: INVOICE title + status pill
  const invoiceTitle = 'INVOICE';
  const titleSize = 22;
  const titleW = bold.widthOfTextAtSize(invoiceTitle, titleSize);
  page.drawText(invoiceTitle, {
    x: pageWidth - margin - titleW,
    y: y,
    size: titleSize,
    font: bold,
    color: ink,
  });

  // Status pill
  const statusText = invoice.status.toUpperCase();
  const statusSize = 8;
  const statusW = bold.widthOfTextAtSize(statusText, statusSize) + 16;
  const statusH = 16;
  const pillX = pageWidth - margin - statusW;
  const pillY = y - 24;
  const statusColor =
    invoice.status === 'paid'
      ? rgb(0.13, 0.55, 0.34)
      : invoice.status === 'sent'
        ? rgb(0.18, 0.42, 0.85)
        : muted;
  page.drawRectangle({
    x: pillX,
    y: pillY,
    width: statusW,
    height: statusH,
    color: rgb(1, 1, 1),
    borderColor: statusColor,
    borderWidth: 1,
  });
  page.drawText(statusText, {
    x: pillX + 8,
    y: pillY + 4,
    size: statusSize,
    font: bold,
    color: statusColor,
  });

  y = Math.min(textStartY, pillY) - 30;

  // ----- Meta card (Invoice #, dates, total) -----
  const cardH = 78;
  page.drawRectangle({
    x: margin,
    y: y - cardH,
    width: pageWidth - margin * 2,
    height: cardH,
    color: panel,
  });
  // Accent stripe on left
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
  const drawMeta = (label: string, value: string, col: number) => {
    const x = margin + cellPadX + col * ((pageWidth - margin * 2 - cellPadX * 2) / 4);
    page.drawText(label.toUpperCase(), { x, y: cellY1, size: 7, font: bold, color: muted });
    page.drawText(value, { x, y: cellY2, size: 11, font: bold, color: ink });
  };
  drawMeta('Invoice no.', invoice.invoice_number, 0);
  drawMeta('Issue date', invoice.invoice_date, 1);
  drawMeta('Due date', invoice.due_date || '—', 2);
  // Total cell highlighted in brand
  const col = 3;
  const x = margin + cellPadX + col * ((pageWidth - margin * 2 - cellPadX * 2) / 4);
  page.drawText('AMOUNT DUE', { x, y: cellY1, size: 7, font: bold, color: muted });
  page.drawText(gbp(invoice.total_pence), { x, y: cellY2, size: 13, font: bold, color: accent });

  y -= cardH + 28;

  // ----- Bill From / Bill To columns -----
  const colW = (pageWidth - margin * 2 - 24) / 2;
  const drawAddrBlock = (label: string, lines: string[], x0: number) => {
    page.drawText(label.toUpperCase(), { x: x0, y, size: 8, font: bold, color: muted });
    let ly = y - 14;
    for (const l of lines) {
      if (!l) continue;
      page.drawText(l, { x: x0, y: ly, size: 10, font, color: ink });
      ly -= 13;
    }
    return ly;
  };
  const fromLines = [businessName];
  const toLines = [invoice.client_name, invoice.client_email || '', invoice.project_description || ''];
  const fromEnd = drawAddrBlock('From', fromLines, margin);
  const toEnd = drawAddrBlock('Bill to', toLines, margin + colW + 24);
  y = Math.min(fromEnd, toEnd) - 18;

  // Divider
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: hairline });
  y -= 18;

  // ----- Line items table -----
  const colX = {
    desc: margin,
    qty: pageWidth - margin - 240,
    rate: pageWidth - margin - 150,
    total: pageWidth - margin - 60,
  };
  page.drawText('DESCRIPTION', { x: colX.desc, y, size: 7, font: bold, color: muted });
  page.drawText('QTY', { x: colX.qty, y, size: 7, font: bold, color: muted });
  page.drawText('RATE', { x: colX.rate, y, size: 7, font: bold, color: muted });
  page.drawText('AMOUNT', { x: colX.total, y, size: 7, font: bold, color: muted });
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: hairline });
  y -= 14;

  const ensureSpace = (needed: number) => {
    if (y - needed < footerReserve) {
      drawFooter(page);
      page = pdf.addPage([pageWidth, pageHeight]);
      // top accent
      page.drawRectangle({ x: 0, y: pageHeight - 4, width: pageWidth, height: 4, color: accent });
      y = pageHeight - margin;
    }
  };

  for (const item of invoice.line_items ?? []) {
    ensureSpace(22);
    const lineTotal = Math.round((item.quantity || 0) * (item.rate_pence || 0));
    page.drawText(item.description || '—', { x: colX.desc, y, size: 10, font, color: ink });
    page.drawText(String(item.quantity ?? 0), { x: colX.qty, y, size: 10, font, color: mid });
    page.drawText(gbp(item.rate_pence || 0), { x: colX.rate, y, size: 10, font, color: mid });
    page.drawText(gbp(lineTotal), { x: colX.total, y, size: 10, font: bold, color: ink });
    y -= 10;
    page.drawLine({ start: { x: margin, y: y - 2 }, end: { x: pageWidth - margin, y: y - 2 }, thickness: 0.3, color: hairline });
    y -= 12;
  }

  // ----- Totals block (right aligned card) -----
  ensureSpace(90);
  y -= 10;
  const totalsX = pageWidth - margin - 230;
  const totalsValueX = pageWidth - margin - 8;
  const totalsValueRight = (s: string, size: number, f: PDFFont, color: ReturnType<typeof rgb>) => {
    const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: totalsValueX - w, y, size, font: f, color });
  };

  page.drawText('Subtotal', { x: totalsX, y, size: 10, font, color: mid });
  totalsValueRight(gbp(invoice.subtotal_pence), 10, font, ink);
  y -= 16;

  if (invoice.tax_enabled) {
    page.drawText(`Tax (${invoice.tax_rate}%)`, { x: totalsX, y, size: 10, font, color: mid });
    totalsValueRight(gbp(invoice.tax_pence), 10, font, ink);
    y -= 16;
  }

  // Divider + total
  page.drawLine({
    start: { x: totalsX, y: y + 4 },
    end: { x: pageWidth - margin, y: y + 4 },
    thickness: 0.5,
    color: hairline,
  });
  y -= 4;
  page.drawText('Total', { x: totalsX, y, size: 12, font: bold, color: ink });
  totalsValueRight(gbp(invoice.total_pence), 14, bold, accent);
  y -= 28;

  if (invoice.notes) {
    ensureSpace(60);
    page.drawText('NOTES', { x: margin, y, size: 8, font: bold, color: muted });
    y -= 14;
    const words = invoice.notes.split(/\s+/);
    let line = '';
    const maxWidth = pageWidth - margin * 2;
    for (const w of words) {
      const trial = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(trial, 10) > maxWidth) {
        ensureSpace(14);
        page.drawText(line, { x: margin, y, size: 10, font, color: mid });
        y -= 13;
        line = w;
      } else {
        line = trial;
      }
    }
    if (line) {
      ensureSpace(14);
      page.drawText(line, { x: margin, y, size: 10, font, color: mid });
      y -= 13;
    }
  }

  // ----- Payment methods (bank details + payment links) -----
  const drawWrappedText = (text: string, size: number, color: ReturnType<typeof rgb>) => {
    const lines = text.split(/\r?\n/);
    const maxWidth = pageWidth - margin * 2;
    for (const raw of lines) {
      const words = raw.split(/\s+/);
      let line = '';
      for (const w of words) {
        const trial = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(trial, size) > maxWidth) {
          ensureSpace(size + 4);
          page.drawText(line, { x: margin, y, size, font, color });
          y -= size + 3;
          line = w;
        } else {
          line = trial;
        }
      }
      ensureSpace(size + 4);
      page.drawText(line, { x: margin, y, size, font, color });
      y -= size + 3;
    }
  };

  const showBank = invoice.show_bank_details && (invoice.bank_details ?? '').trim().length > 0;
  const links = (invoice.payment_links ?? []).filter((l) => (l?.url ?? '').trim().length > 0);
  const showLinks = invoice.show_payment_links && links.length > 0;

  if (showBank || showLinks) {
    ensureSpace(40);
    y -= 8;
    page.drawText('PAYMENT', { x: margin, y, size: 8, font: bold, color: muted });
    y -= 14;
  }

  if (showBank) {
    ensureSpace(20);
    page.drawText('Bank transfer', { x: margin, y, size: 10, font: bold, color: ink });
    y -= 14;
    drawWrappedText(invoice.bank_details!.trim(), 10, mid);
    y -= 6;
  }

  if (showLinks) {
    ensureSpace(28);
    page.drawText('Pay online', { x: margin, y, size: 10, font: bold, color: ink });
    y -= 14;
    for (const link of links) {
      ensureSpace(28);
      const label = (link.label?.trim() || 'Pay now');
      const btnPadX = 12;
      const btnPadY = 6;
      const labelW = bold.widthOfTextAtSize(label, 10);
      const btnW = labelW + btnPadX * 2;
      const btnH = 22;
      page.drawRectangle({
        x: margin,
        y: y - btnH + 4,
        width: btnW,
        height: btnH,
        color: accent,
      });
      page.drawText(label, {
        x: margin + btnPadX,
        y: y - btnH + btnPadY + 5,
        size: 10,
        font: bold,
        color: rgb(1, 1, 1),
      });
      // Make the button area a clickable link
      page.drawText(' ', { x: margin, y: y - btnH + 4, size: 1, font, color: rgb(1, 1, 1) });
      // URL text under the button
      page.drawText(link.url, {
        x: margin + btnW + 10,
        y: y - btnH + btnPadY + 5,
        size: 9,
        font,
        color: mid,
      });
      y -= btnH + 8;
    }
  }

  drawFooter(page);

  return await pdf.save();
}

export function invoicePdfFilename(invoice: Invoice): string {
  const num = (invoice.invoice_number || 'invoice').replace(/[^a-z0-9-]/gi, '_');
  return `ShootBase-Invoice-${num}.pdf`;
}

