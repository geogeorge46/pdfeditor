import * as pdfjsLib from "pdfjs-dist";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { buildDocumentHtmlWithEdits, type PageEditsInput } from "@/lib/pdfToText";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function getTextAlign(node: HTMLElement): "left" | "center" | "right" | "justify" | undefined {
  const style = node.getAttribute("style") ?? "";
  const m = style.match(/text-align\s*:\s*(left|center|right|justify)/i);
  if (!m) return undefined;
  const v = m[1].toLowerCase();
  return v === "left" || v === "center" || v === "right" || v === "justify" ? v : undefined;
}

function mapDocxAlignment(align: "left" | "center" | "right" | "justify" | undefined): any {
  if (!align) return undefined;
  // docx uses an enum, but passing the string values works with its internal mapping.
  return (
    ({
      left: "LEFT",
      center: "CENTER",
      right: "RIGHT",
      justify: "JUSTIFIED",
    } as any)[align] ?? undefined
  );
}

function stripHtmlToPlainText(html: string): string {
  return (html || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/* ── PDF export via browser print dialog ────────────────────────────────── */
/**
 * Opens a print-preview dialog using the browser's native engine.
 * This is more reliable than html2canvas and supports all modern CSS colors.
 * The user can choose "Save as PDF" in the print dialog.
 */
export async function exportToPdf(editorHtml: string, _filename = "document") {
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;left:-9999px;top:0;width:210mm;height:297mm;border:none;visibility:hidden;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Document</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background: #fff; }
    
    /* Ensure the exported container fits the page */
    .export-container {
      position: relative;
      width: 210mm;
      height: 297mm;
      overflow: hidden;
      page-break-after: always;
    }

    canvas { display: block; max-width: 100%; }
    
    /* Preserve our absolute text layer styles */
    span {
      white-space: pre;
      line-height: 1;
      display: inline-block;
    }
  </style>
</head>
<body>
  <div class="export-container">
    ${editorHtml}
  </div>
</body>
</html>`);
  doc.close();

  // Give time for images/canvases to render
  await new Promise<void>((resolve) => setTimeout(resolve, 800));

  iframe.contentWindow!.focus();
  iframe.contentWindow!.print();

  setTimeout(() => document.body.removeChild(iframe), 2000);
}

/* ── DOCX export ─────────────────────────────────────────────────────────── */
export async function exportToDocx(editorHtml: string, filename = "document.docx") {
  const parser = new DOMParser();
  const domDoc = parser.parseFromString(editorHtml, "text/html");
  const children = Array.from(domDoc.body.childNodes);

  const paragraphs: Paragraph[] = [];

  const headingMap: Record<string, any> = {
    h1: HeadingLevel.HEADING_1,
    h2: HeadingLevel.HEADING_2,
    h3: HeadingLevel.HEADING_3,
  };

  for (const node of children) {
    if (!(node instanceof HTMLElement)) continue;
    const text = node.textContent?.trim() ?? "";
    if (!text) continue;

    const tag = node.tagName.toLowerCase();
    const align = mapDocxAlignment(getTextAlign(node));

    if (headingMap[tag]) {
      paragraphs.push(
        new Paragraph({
          heading: headingMap[tag],
          children: [new TextRun({ text, bold: true })],
          ...(align ? { alignment: align } : {}),
        })
      );
      continue;
    }

    // Build inline runs preserving bold/italic/underline
    const runs: TextRun[] = [];
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent ?? "";
        if (t) runs.push(new TextRun({ text: t }));
      } else if (child instanceof HTMLElement) {
        const ct = child.tagName.toLowerCase();
        runs.push(
          new TextRun({
            text: child.textContent ?? "",
            bold: ct === "strong" || ct === "b",
            italics: ct === "em" || ct === "i",
            underline: ct === "u" ? {} : undefined,
          })
        );
      }
    }

    if (runs.length === 0) runs.push(new TextRun({ text }));
    paragraphs.push(new Paragraph({ children: runs, ...(align ? { alignment: align } : {}) }));
  }

  const docx = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(docx);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── DOCX export for edited pages ───────────────────────────────────────── */
export async function exportEditedPagesToDocx(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageEdits: PageEditsInput,
  pageIndices: number[],
  filename = "edited_doc.docx"
) {
  const safeFilename = filename.toLowerCase().endsWith(".docx") ? filename : `${filename}.docx`;
  const html = await buildDocumentHtmlWithEdits(pdfDoc, pageEdits, pageIndices);
  await exportToDocx(html, safeFilename);
}

function waitForImageLoad(img: HTMLImageElement): Promise<void> {
  if (img.complete) return Promise.resolve();
  return new Promise((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
}

/* ── PDF export for edited pages (multi-page) ───────────────────────────── */
export async function exportEditedPagesToPdf(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageEdits: PageEditsInput,
  pageIndices: number[],
  filename = "edited_pdf.pdf",
  opts: { renderScale?: number; html2canvasScale?: number } = {}
) {
  if (!pageIndices.length) return;
  const renderScale = opts.renderScale ?? 1;
  const html2canvasScale = opts.html2canvasScale ?? 2;
  const safeFilename = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;

  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf" as any),
    import("html2canvas" as any),
  ]);

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1px;height:1px;border:none;visibility:hidden;background:#fff;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"/>
    <style>
      html,body{margin:0;padding:0;background:#fff}
      .export-page{position:relative;background:#fff;overflow:hidden}
      img{display:block}
    </style>
    </head><body></body></html>`);
  doc.close();

  // Give DOM a moment in the iframe context.
  await new Promise<void>((r) => setTimeout(() => r(), 50));

  try {
    for (let i = 0; i < pageIndices.length; i++) {
      const pageIndex = pageIndices[i];
      const page = await pdfDoc.getPage(pageIndex + 1); // 1-based for pdfjs
      const viewport = page.getViewport({ scale: renderScale });

      const cvs = document.createElement("canvas");
      cvs.width = Math.max(1, Math.floor(viewport.width));
      cvs.height = Math.max(1, Math.floor(viewport.height));
      const ctx = cvs.getContext("2d");
      if (!ctx) continue;

      await page.render({ canvasContext: ctx, viewport, canvas: cvs as any }).promise;

      const bgDataUrl = cvs.toDataURL("image/jpeg", 0.95);
      const textContent = await page.getTextContent();
      const editsForPage = pageEdits[pageIndex] || {};

      let spansHtml = "";
      for (const [idx, item] of textContent.items.entries()) {
        if (!("str" in item) || !item.str || !item.str.trim()) continue;
        const edit = editsForPage[idx];
        if (!edit) continue; // respect empty-string edits (deletions) below

        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(tx[2], tx[3]);
        if (fontHeight < 2) continue;

        const topPx = tx[5] - fontHeight * 0.8;
        const leftPx = tx[4];

        // Keep user's inline formatting (b/i/u) by embedding edit.text as HTML.
        const spanStyle = [
          "position:absolute",
          `left:${leftPx}px`,
          `top:${topPx}px`,
          `font-size:${fontHeight}px`,
          "line-height:1",
          "white-space:pre",
          "transform-origin:0% 0%",
          "color:rgba(0,0,0,1)",
          "background:#ffffff",
          "outline:none",
          "border:none",
          "padding:0 2px",
          "border-radius:2px",
          "pointer-events:none",
          "display:inline-block",
        ].join(";");

        const inner = edit.text ?? "";
        spansHtml += `<span style="${spanStyle}">${inner}</span>`;
      }

      const containerHtml = `<div class="export-page" style="width:${viewport.width}px;height:${viewport.height}px">
        <img src="${bgDataUrl}" style="width:${viewport.width}px;height:${viewport.height}px" />
        ${spansHtml}
      </div>`;

      doc.body.innerHTML = containerHtml;
      const imgEl = doc.querySelector("img") as HTMLImageElement | null;
      if (imgEl) await waitForImageLoad(imgEl);

      const exportPageEl = doc.querySelector(".export-page") as HTMLElement | null;
      if (!exportPageEl) continue;

      const pageCanvas = await html2canvas(exportPageEl, {
        backgroundColor: "#ffffff",
        scale: html2canvasScale,
        useCORS: true,
        logging: false,
      });

      const imgData = pageCanvas.toDataURL("image/jpeg", 0.95);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, 0, pageW, pageH);
    }
  } finally {
    document.body.removeChild(iframe);
  }

  const blob = pdf.output("blob") as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFilename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Flatten "Edit over PDF" edits into a real PDF file ─────────────────── */
/**
 * IMPORTANT:
 * - "Edit over PDF" edits are normally an overlay (for fast on-screen editing).
 * - This function creates a *new* PDF with the edits drawn onto the pages.
 * - The original uploaded PDF bytes are never mutated.
 *
 * Limits:
 * - We use a standard PDF font (Helvetica) for reliability.
 * - We strip HTML formatting to plain text for the flattened PDF.
 */
export async function flattenPdfWithTextEdits(
  sourceFile: File,
  pdfJsDoc: pdfjsLib.PDFDocumentProxy,
  pageEdits: PageEditsInput,
  pageIndices: number[],
  filename = "edited_flattened.pdf"
): Promise<File> {
  const safeFilename = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
  const pdfBytes = await sourceFile.arrayBuffer();
  const pdf = await PDFDocument.load(pdfBytes);
  const helv = await pdf.embedFont(StandardFonts.Helvetica);

  for (const pageIndex of pageIndices) {
    const editsForPage = pageEdits[pageIndex];
    if (!editsForPage || Object.keys(editsForPage).length === 0) continue;

    const page = pdf.getPage(pageIndex);
    if (!page) continue;

    const { width: pageW, height: pageH } = page.getSize();

    // Use pdfjs to locate the original text items by index, then draw replacements.
    const jsPage = await pdfJsDoc.getPage(pageIndex + 1);
    const viewport = jsPage.getViewport({ scale: 1 });
    const textContent = await jsPage.getTextContent();

    for (const [idx, item] of textContent.items.entries()) {
      const edit = editsForPage[idx];
      if (!edit) continue; // only items with edits
      if (!("str" in item) || !item.str || !item.str.trim()) continue;

      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.hypot(tx[2], tx[3]);
      if (fontHeight < 2) continue;

      const topPx = tx[5] - fontHeight * 0.8;
      const leftPx = tx[4];

      // Convert viewport (top-left) to PDF (bottom-left).
      // viewport units at scale=1 align closely with PDF points for most PDFs.
      const fontSize = Math.max(6, Math.min(72, fontHeight));
      const x = leftPx;
      const y = pageH - topPx - fontSize;

      const text = stripHtmlToPlainText(edit.text ?? "");

      // Cover the original text with a white rectangle (also handles deletions).
      const padX = 2;
      const padY = Math.max(1, fontSize * 0.15);
      const rectH = fontSize + padY * 2;
      const rectW =
        text.length > 0 ? helv.widthOfTextAtSize(text, fontSize) + padX * 2 : (item.width || fontSize) + padX * 2;

      page.drawRectangle({
        x: x - padX,
        y: y - padY,
        width: Math.min(rectW, pageW - (x - padX)),
        height: Math.min(rectH, pageH - (y - padY)),
        color: rgb(1, 1, 1),
        borderColor: rgb(1, 1, 1),
      });

      if (text.length > 0) {
        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font: helv,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  const outBytes = await pdf.save();
  // Copy into a fresh Uint8Array backed by a standard ArrayBuffer so BlobPart typing is satisfied.
  const outCopy = new Uint8Array(outBytes.byteLength);
  outCopy.set(outBytes);
  const outBlob = new Blob([outCopy], { type: "application/pdf" });
  return new File([outBlob], safeFilename, { type: "application/pdf" });
}
