import { PDFDocument, degrees } from "pdf-lib";

async function fileToPdf(file: File): Promise<PDFDocument> {
  const bytes = await file.arrayBuffer();
  return PDFDocument.load(bytes);
}

async function pdfToFile(pdf: PDFDocument, filename: string): Promise<File> {
  const bytes = await pdf.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: "application/pdf" });
  return new File([blob], filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`, {
    type: "application/pdf",
  });
}

export async function mergePdfFiles(files: File[], outputName = "merged.pdf"): Promise<File> {
  const merged = await PDFDocument.create();
  for (const file of files) {
    const src = await fileToPdf(file);
    const indices = src.getPages().map((_, i) => i);
    const copied = await merged.copyPages(src, indices);
    copied.forEach((p) => merged.addPage(p));
  }
  return pdfToFile(merged, outputName);
}

function parseRanges(input: string, maxPages: number): number[] {
  const out = new Set<number>();
  const parts = input.split(",").map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    if (p.includes("-")) {
      const [a, b] = p.split("-").map((n) => parseInt(n.trim(), 10));
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const from = Math.max(1, Math.min(a, b));
      const to = Math.min(maxPages, Math.max(a, b));
      for (let i = from; i <= to; i++) out.add(i - 1);
    } else {
      const n = parseInt(p, 10);
      if (Number.isFinite(n) && n >= 1 && n <= maxPages) out.add(n - 1);
    }
  }
  return [...out].sort((a, b) => a - b);
}

export async function splitPdfByRanges(file: File, ranges: string, outputName = "split.pdf"): Promise<File> {
  const src = await fileToPdf(file);
  const pageIndices = parseRanges(ranges, src.getPageCount());
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pageIndices);
  copied.forEach((p) => out.addPage(p));
  return pdfToFile(out, outputName);
}

export async function duplicatePageAt(file: File, pageIndex: number, outputName = "duplicated.pdf"): Promise<File> {
  const pdf = await fileToPdf(file);
  if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) return file;
  const [copy] = await pdf.copyPages(pdf, [pageIndex]);
  pdf.insertPage(pageIndex + 1, copy);
  return pdfToFile(pdf, outputName);
}

export async function deletePageAt(file: File, pageIndex: number, outputName = "deleted.pdf"): Promise<File> {
  const pdf = await fileToPdf(file);
  if (pdf.getPageCount() <= 1) return file;
  if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) return file;
  pdf.removePage(pageIndex);
  return pdfToFile(pdf, outputName);
}

export async function insertBlankPageAt(file: File, pageIndex: number, outputName = "inserted.pdf"): Promise<File> {
  const pdf = await fileToPdf(file);
  const ref = pdf.getPage(Math.min(Math.max(pageIndex, 0), pdf.getPageCount() - 1));
  const { width, height } = ref.getSize();
  pdf.insertPage(pageIndex, [width, height]);
  return pdfToFile(pdf, outputName);
}

export async function rotatePageAt(file: File, pageIndex: number, delta = 90, outputName = "rotated.pdf"): Promise<File> {
  const pdf = await fileToPdf(file);
  if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) return file;
  const page = pdf.getPage(pageIndex);
  const current = page.getRotation().angle;
  page.setRotation(degrees((current + delta + 360) % 360));
  return pdfToFile(pdf, outputName);
}

export async function cropPageMarginsAt(
  file: File,
  pageIndex: number,
  marginPt: number,
  outputName = "cropped.pdf"
): Promise<File> {
  const pdf = await fileToPdf(file);
  if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) return file;
  const page = pdf.getPage(pageIndex);
  const { width, height } = page.getSize();
  const m = Math.max(0, Math.min(Math.min(width, height) / 3, marginPt));
  page.setCropBox(m, m, width - 2 * m, height - 2 * m);
  return pdfToFile(pdf, outputName);
}

