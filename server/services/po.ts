import PDFDocument from "pdfkit";
import { storage } from "../storage";
import type { Response } from "express";

// Helper: format currency
function money(n: number | string | null | undefined) {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Compute out-of-stock deficit using stock movement's previousStock captured at order time
async function computeDeficits(orderId: string, items: Array<{ productId: string; quantity: number; unitPrice: string | number }>) {
  const deficits: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    deficitQty: number;
  }> = [];

  // Fetch movements for this order once to avoid per-item queries
  const movements = await storage.getStockMovements();
  const orderMovements = movements.filter(m => m.movement.orderId === orderId);

  for (const it of items) {
    const mv = orderMovements.find(m => m.movement.productId === it.productId);
    // previousStock before deduction
    const prev = mv?.movement?.previousStock ?? 0;
    const deficit = Math.max(0, it.quantity - Math.max(0, prev));
    if (deficit > 0) {
      deficits.push({ productId: it.productId, quantity: it.quantity, unitPrice: Number(it.unitPrice), deficitQty: deficit });
    }
  }
  return deficits;
}

export async function streamPurchaseOrderPdf(res: Response, orderId: string, opts?: { download?: boolean }) {
  const order = await storage.getOrder(orderId);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  // Try to fetch GRN header (user provided) to fill PO metadata fields
  const { grn } = await storage.getOrderGrn(orderId);

  // Apply PO Draft overrides if present
  const poDraft = await storage.getPoDraft(orderId);

  const itemsBase = (order.items || []).map((x: any) => ({
    id: x.orderItem.id,
    productId: x.orderItem.productId,
    name: x.product?.name ?? "",
    sku: x.product?.sku ?? "",
    mfgPartCode: x.product?.mfgPartCode ?? "",
    units: x.product?.units ?? "PCS",
    quantity: Number(x.orderItem.quantity),
    unitPrice: Number(x.orderItem.unitPrice),
    totalPrice: Number(x.orderItem.totalPrice),
  }));

  const items = (() => {
    if (poDraft?.items && Array.isArray(poDraft.items) && poDraft.items.length > 0) {
      // Use draft items directly if provided
      return poDraft.items.map((i: any) => ({
        ...i,
        quantity: Number(i.quantity ?? i.deficitQty ?? 0),
        unitPrice: Number(i.unitPrice ?? 0),
        amount: Number(i.amount ?? (Number(i.unitPrice ?? 0) * Number(i.deficitQty ?? 0)))
      }));
    }
    return itemsBase;
  })();

  const deficits = poDraft?.items && Array.isArray(poDraft.items) && poDraft.items.length > 0
    ? poDraft.items.map((i: any) => ({ productId: i.productId, quantity: Number(i.quantity ?? i.deficitQty ?? 0), unitPrice: Number(i.unitPrice ?? 0), deficitQty: Number(i.deficitQty ?? i.quantity ?? 0) }))
    : await computeDeficits(
    orderId,
    items.map((i: { productId: string; quantity: number; unitPrice: number }) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    }))
  );
  if (deficits.length === 0) {
    // Nothing to purchase; respond with a simple PDF stating no PO required
    const doc = new PDFDocument({ margin: 36, size: "A4" });
    const filename = `PO-${order.orderNumber}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${opts?.download ? "attachment" : "inline"}; filename=\"${filename}\"`);
    doc.pipe(res);
    doc.fontSize(18).text("Purchase Order not required", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Order #${order.orderNumber} has no out-of-stock items.`);
    doc.end();
    return;
  }

  // Build PO lines by enriching with product fields
  const byId: Record<string, typeof items[number]> = Object.fromEntries(
    items.map((i: typeof items[number]) => [i.productId, i] as const)
  );
  const poLines = deficits.map(d => ({
    ...byId[d.productId],
    // Allow override of unitPrice/amount via draft items
    unitPrice: byId[d.productId]?.unitPrice ?? d.unitPrice,
    deficitQty: d.deficitQty,
    amount: (d.deficitQty) * (byId[d.productId]?.unitPrice ?? d.unitPrice),
  }));

  const poSubtotal = poLines.reduce((sum, l) => sum + l.amount, 0);

  // Landscape A4, tighter margins to avoid bleed while keeping within page
  const doc = new PDFDocument({ margin: 28, size: "A4", layout: "landscape" });
  const filename = `PO-${order.orderNumber}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${opts?.download ? "attachment" : "inline"}; filename=\"${filename}\"`);
  doc.pipe(res);

  // Dimensions helpers
  const leftX = doc.page.margins.left;
  const rightX = doc.page.width - doc.page.margins.right;
  const pageWidth = rightX - leftX;

  // Header bar (light blue) with company title and logo
  doc.save();
  doc.rect(leftX, 30, pageWidth, 70).fill("#d9ecff");
  doc.restore();
  doc.fillColor("#000");
  doc.fontSize(16).text("QUATRE AGRO ENTERPRISES PVT LTD", leftX, 45, { align: "center", width: pageWidth });
  // Embed provided logo if available
  try {
    const logoPath = "C:/Users/Arzaan Ali Khan/OneDrive/Desktop/StockSmartHub/Crystal group Logo.png";
    doc.image(logoPath, rightX - 120, 35, { fit: [100, 60], align: "right" });
    doc.rect(rightX - 120, 35, 100, 60).strokeColor("#000").lineWidth(0.5).stroke();
  } catch {
    // If image not found, draw a subtle placeholder box
    doc.rect(rightX - 120, 35, 100, 60).strokeColor("#000").lineWidth(0.5).stroke();
    doc.fontSize(8).fillColor("#666").text("Logo", rightX - 90, 60, { width: 40, align: "center" });
  }
  doc.fillColor("#000");

  // Two-column meta box area below header (left: vendor details; right: dates and job/location)
  const metaTop = 110;
  const leftColW = pageWidth * 0.62;
  const rightColW = pageWidth - leftColW - 12;
  const rightColX = leftX + leftColW + 12;

  const label = (t: string, x: number, y: number) => {
    doc.fontSize(9).fillColor("#000").text(t, x, y);
  };
  const valueBox = (v: string | undefined, x: number, y: number, w: number) => {
    doc.rect(x, y - 2, w, 16).strokeColor("#999").lineWidth(0.5).stroke();
    if (v) doc.fontSize(9).fillColor("#000").text(v, x + 4, y);
  };

  // Merge header overrides
  const header = poDraft?.header || {};

  // Left column labels/values
  let yL = metaTop;
  label("Vendor Name", leftX, yL); valueBox(header.vendorName ?? grn?.vendorName ?? "", leftX + 95, yL, leftColW - 100);
  yL += 20; label("Vendor Bill No", leftX, yL); valueBox(header.vendorBillNo ?? grn?.vendorBillNo ?? "", leftX + 95, yL, leftColW - 100);
  yL += 20; label("Indent No", leftX, yL); valueBox(header.indentNo ?? grn?.indentNo ?? "", leftX + 95, yL, leftColW - 100);
  yL += 20; label("PO No", leftX, yL); valueBox(header.poNo ?? grn?.poNo ?? order.orderNumber, leftX + 95, yL, leftColW - 100);
  yL += 20; label("Challan no", leftX, yL); valueBox(header.challanNo ?? grn?.challanNo ?? "", leftX + 95, yL, leftColW - 100);

  // Right column (dates and job/location) within a light box
  doc.save();
  doc.rect(rightColX, metaTop - 8, rightColW, 98).strokeColor("#000").lineWidth(0.8).stroke();
  doc.restore();
  let yR = metaTop;
  const dateStr = (d?: Date) => (d ? new Date(d).toLocaleDateString() : "");
  label("GRN DATE", rightColX + 6, yR); valueBox(dateStr(header.grnDate as any) || dateStr(grn?.grnDate as any), rightColX + 110, yR, rightColW - 118); yR += 20;
  label("Vendor Bill Date", rightColX + 6, yR); valueBox(dateStr(header.vendorBillDate as any) || dateStr(grn?.vendorBillDate as any), rightColX + 110, yR, rightColW - 118); yR += 20;
  label("PO Date", rightColX + 6, yR); valueBox(dateStr(header.poDate as any) || dateStr(grn?.poDate as any) || new Date().toLocaleDateString(), rightColX + 110, yR, rightColW - 118); yR += 20;
  label("Job Order No.", rightColX + 6, yR); valueBox(header.jobOrderNo ?? grn?.jobOrderNo ?? (order.jobOrder || ""), rightColX + 110, yR, rightColW - 118); yR += 20;
  label("Location", rightColX + 6, yR); valueBox(header.location ?? grn?.location ?? (order.location || ""), rightColX + 110, yR, rightColW - 118);

  // Table header (all columns must fit). Define exact widths and cumulative x positions
  const tableTop = metaTop + 108;
  const widths = {
    sr: 28,
    mfg: 88,
    req: 208,
    make: 88,
    part: 78,
    cond: 68,
    unit: 44,
    rate: 58,
    totalNetQty: 58,
    amount: 58,
  } as const;
  const x = {
    sr: leftX,
    mfg: leftX + widths.sr,
    req: leftX + widths.sr + widths.mfg,
    make: leftX + widths.sr + widths.mfg + widths.req,
    part: leftX + widths.sr + widths.mfg + widths.req + widths.make,
    cond: leftX + widths.sr + widths.mfg + widths.req + widths.make + widths.part,
    unit: leftX + widths.sr + widths.mfg + widths.req + widths.make + widths.part + widths.cond,
    rate: leftX + widths.sr + widths.mfg + widths.req + widths.make + widths.part + widths.cond + widths.unit,
    totalNetQty: leftX + widths.sr + widths.mfg + widths.req + widths.make + widths.part + widths.cond + widths.unit + widths.rate,
    amount: leftX + widths.sr + widths.mfg + widths.req + widths.make + widths.part + widths.cond + widths.unit + widths.rate + widths.totalNetQty,
  } as const;

  // Draw table header background (yellow)
  doc.save();
  doc.rect(leftX, tableTop - 12, pageWidth, 22).fill("#ffeb3b");
  doc.restore();
  doc.rect(leftX, tableTop - 12, pageWidth, 22).strokeColor("#000").lineWidth(0.8).stroke();
  doc.fontSize(8.5).fillColor("#000");
  doc.text("Sr No", x.sr + 2, tableTop - 8, { width: widths.sr - 4 });
  doc.text("MFG Part Code", x.mfg + 2, tableTop - 8, { width: widths.mfg - 4 });
  doc.text("REQUIRED SPARE PART(S)\nCONSUMABLE(S)", x.req + 2, tableTop - 11, { width: widths.req - 4 });
  doc.text("Make & Model", x.make + 2, tableTop - 8, { width: widths.make - 4 });
  doc.text("Part No", x.part + 2, tableTop - 8, { width: widths.part - 4 });
  doc.text("New Old\nRefurbished", x.cond + 2, tableTop - 11, { width: widths.cond - 4 });
  doc.text("Qty Unit", x.unit + 2, tableTop - 8, { width: widths.unit - 4 });
  doc.text("Rate", x.rate + 2, tableTop - 8, { width: widths.rate - 4, align: "right" });
  doc.text("Total Net\nQuantity", x.totalNetQty + 2, tableTop - 11, { width: widths.totalNetQty - 4, align: "right" });
  doc.text("Amount", x.amount + 2, tableTop - 8, { width: widths.amount - 4, align: "right" });

  // Rows
  let y = tableTop + 14;
  const drawRow = (rowIdx: number, data?: typeof poLines[number]) => {
    // outer row box
    doc.rect(leftX, y - 4, pageWidth, 18).strokeColor("#cfcfcf").lineWidth(0.5).stroke();
    doc.fontSize(8.5).fillColor("#000");
    if (data) {
      doc.text(String(rowIdx + 1), x.sr + 2, y, { width: widths.sr - 4 });
      // MFG Part Code: show only manufacturer part code; leave blank if missing
      doc.text(data.mfgPartCode || "", x.mfg + 2, y, { width: widths.mfg - 4 });
      doc.text(data.name || "", x.req + 2, y, { width: widths.req - 4 });
      doc.text("", x.make + 2, y, { width: widths.make - 4 });
      doc.text(data.sku || "", x.part + 2, y, { width: widths.part - 4 });
      doc.text("", x.cond + 2, y, { width: widths.cond - 4 });
      doc.text((data.units || "PCS"), x.unit + 2, y, { width: widths.unit - 4 });
      doc.text(money(data.unitPrice), x.rate + 2, y, { width: widths.rate - 4, align: "right" });
      doc.text(String(data.deficitQty), x.totalNetQty + 2, y, { width: widths.totalNetQty - 4, align: "right" });
      doc.text(money(data.amount), x.amount + 2, y, { width: widths.amount - 4, align: "right" });
    } else {
      // empty row with sr no
      doc.text(String(rowIdx + 1), x.sr + 2, y, { width: widths.sr - 4 });
    }
    y += 18;
  };

  // Fill with data rows then pad to 10 rows
  poLines.forEach((l, idx) => drawRow(idx, l));
  for (let i = poLines.length; i < 10; i++) drawRow(i);

  // Totals
  doc.rect(leftX, y - 4, pageWidth - 100, 18).strokeColor("#000").lineWidth(0.8).stroke();
  doc.rect(rightX - 100, y - 4, 100, 18).strokeColor("#000").lineWidth(0.8).stroke();
  doc.fontSize(10).text("TOTAL", leftX + pageWidth - 170, y + 0, { width: 70, align: "right" });
  doc.text(money(poSubtotal), rightX - 96, y + 0, { width: 92, align: "right" });
  y += 26;

  // Footer note
  const footerTop = y + 6;
  doc.rect(leftX, footerTop, pageWidth, 90).strokeColor("#000").lineWidth(0.8).stroke();
  // Left footer fields
  doc.fontSize(9).fillColor("#000");
  doc.text("Received By", leftX + 8, footerTop + 8); doc.text(header.receivedBy || grn?.receivedBy || "", leftX + 100, footerTop + 8, { width: 200 });
  doc.text("Name of person", leftX + 8, footerTop + 28); doc.text(header.personName || grn?.personName || "", leftX + 100, footerTop + 28, { width: 200 });
  doc.text("Remarks", leftX + 8, footerTop + 48); doc.text(header.remarks || grn?.remarks || "", leftX + 100, footerTop + 48, { width: 300 });
  // Signature area on right
  doc.text("Signature", rightX - 180, footerTop + 65, { width: 80, align: "right" });
  doc.text(grn?.personName || order.customerName || "", rightX - 90, footerTop + 65, { width: 85, align: "right" });

  // Company footer line
  const addr = "501, Synergy Business Park, Sahakar Wadi, Off Aarey Road, IIT Bhatti Hanuman Tekdi, Goregaon East Mumbai 400 063\nEMAIL: ctc@crystalgroup.in | WEB: www.crystalgroup.in";
  doc.fontSize(8).fillColor("#000").text("QUATRE AGRO ENTERPRISES PVT LTD", leftX, footerTop + 100, { align: "center", width: pageWidth });
  doc.fontSize(8).fillColor("#000").text(addr, leftX, footerTop + 114, { align: "center", width: pageWidth });

  doc.end();
}
