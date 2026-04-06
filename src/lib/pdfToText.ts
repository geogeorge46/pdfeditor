import * as pdfjsLib from "pdfjs-dist";

export interface ExtractedBlock {
  type: "heading" | "paragraph";
  level?: 1 | 2 | 3;
  text: string;
}

interface LineData {
  items: { str: string; x: number; y: number; height: number }[];
  y: number;
  height: number;
}

/**
 * Extracts structured text content from a single PDF page.
 * Detects paragraphs by measuring vertical gaps between lines.
 */
export async function extractPageText(
  page: pdfjsLib.PDFPageProxy
): Promise<ExtractedBlock[]> {
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });

  // Normalize all text items
  const rawItems: { str: string; x: number; y: number; height: number; width: number }[] = [];

  for (const item of textContent.items) {
    if ("str" in item && item.str.trim()) {
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      rawItems.push({
        str: item.str,
        x: tx[4],
        y: tx[5],
        height: Math.abs(item.transform[3]),
        width: item.width,
      });
    }
  }

  if (rawItems.length === 0) return [];

  const heights = rawItems.map((i) => i.height).filter((h) => h > 0);
  const avgHeight = heights.reduce((a, b) => a + b, 0) / heights.length;
  const maxHeight = Math.max(...heights);

  // Sort top-to-bottom, then left-to-right
  rawItems.sort((a, b) => a.y - b.y || a.x - b.x);

  // ── Step 1: group items into lines by Y proximity ────────────────────────
  const LINE_MERGE_TOLERANCE = avgHeight * 0.55;
  const lines: LineData[] = [];

  for (const item of rawItems) {
    const last = lines[lines.length - 1];
    if (!last || Math.abs(item.y - last.y) > LINE_MERGE_TOLERANCE) {
      lines.push({ items: [item], y: item.y, height: item.height });
    } else {
      last.items.push(item);
      last.height = Math.max(last.height, item.height);
    }
  }

  // ── Step 2: build blocks, splitting on large vertical gaps ───────────────
  const PARAGRAPH_GAP_MULTIPLIER = 1.6; // gap > 1.6× avg line-height → new paragraph
  const blocks: ExtractedBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.items
      .sort((a, b) => a.x - b.x)
      .map((it) => it.str)
      .join(" ")
      .trim();

    if (!text) continue;

    // Classify by font size relative to the page average
    const lineH = line.height;
    const isH1 = lineH >= maxHeight * 0.85 && lineH > avgHeight * 1.5;
    const isH2 = !isH1 && lineH > avgHeight * 1.35;
    const isH3 = !isH1 && !isH2 && lineH > avgHeight * 1.15;

    if (isH1) {
      blocks.push({ type: "heading", level: 1, text });
      continue;
    }
    if (isH2) {
      blocks.push({ type: "heading", level: 2, text });
      continue;
    }
    if (isH3) {
      blocks.push({ type: "heading", level: 3, text });
      continue;
    }

    // Regular text — check if this should be a new paragraph
    const isNewParagraph = (() => {
      if (i === 0) return true;
      const prev = lines[i - 1];
      const gap = Math.abs(line.y - prev.y);
      // Use average of both line heights as the expected single-line spacing
      const expectedSpacing = (line.height + prev.height) / 2;
      return gap > expectedSpacing * PARAGRAPH_GAP_MULTIPLIER;
    })();

    if (isNewParagraph) {
      blocks.push({ type: "paragraph", text });
    } else {
      // Continue the last paragraph (add a space, not a <br>)
      const last = blocks[blocks.length - 1];
      if (last?.type === "paragraph") {
        last.text += " " + text;
      } else {
        blocks.push({ type: "paragraph", text });
      }
    }
  }

  return blocks;
}

/**
 * Converts extracted blocks to TipTap-compatible HTML.
 */
export function blocksToHtml(blocks: ExtractedBlock[]): string {
  return blocks
    .map((b) => {
      const safe = escapeHtml(b.text);
      if (b.type === "heading") return `<h${b.level}>${safe}</h${b.level}>`;
      return `<p>${safe}</p>`;
    })
    .join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
