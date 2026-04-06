import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

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
    @page { size: A4; margin: 2.5cm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Times New Roman", serif;
      font-size: 12pt;
      line-height: 1.7;
      color: #111;
      margin: 0;
      padding: 0;
    }
    h1 { font-size: 22pt; font-weight: 700; margin: 18pt 0 8pt; }
    h2 { font-size: 17pt; font-weight: 700; margin: 14pt 0 6pt; }
    h3 { font-size: 13pt; font-weight: 700; margin: 11pt 0 4pt; }
    p  { margin: 0 0 8pt; orphans: 3; widows: 3; }
    ul { list-style: disc;    margin: 0 0 8pt 20pt; padding: 0; }
    ol { list-style: decimal; margin: 0 0 8pt 20pt; padding: 0; }
    li { margin-bottom: 3pt; }
    hr { border: none; border-top: 1px dashed #999; margin: 14pt 0; }
    mark { background: #fde68a; padding: 0 2px; }
    strong { font-weight: 700; }
    em { font-style: italic; }
    u  { text-decoration: underline; }
    s  { text-decoration: line-through; }
  </style>
</head>
<body>${editorHtml}</body>
</html>`);
  doc.close();

  // Give the iframe time to render fonts
  await new Promise<void>((resolve) => setTimeout(resolve, 600));

  iframe.contentWindow!.focus();
  iframe.contentWindow!.print();

  // Clean up after the dialog is dismissed
  setTimeout(() => document.body.removeChild(iframe), 2000);
}

/* ── DOCX export ─────────────────────────────────────────────────────────── */
export async function exportToDocx(editorHtml: string, filename = "document.docx") {
  const parser = new DOMParser();
  const domDoc = parser.parseFromString(editorHtml, "text/html");
  const children = Array.from(domDoc.body.childNodes);

  const paragraphs: Paragraph[] = [];

  const headingMap: Record<string, HeadingLevel> = {
    h1: HeadingLevel.HEADING_1,
    h2: HeadingLevel.HEADING_2,
    h3: HeadingLevel.HEADING_3,
  };

  for (const node of children) {
    if (!(node instanceof HTMLElement)) continue;
    const text = node.textContent?.trim() ?? "";
    if (!text) continue;

    const tag = node.tagName.toLowerCase();

    if (headingMap[tag]) {
      paragraphs.push(
        new Paragraph({
          heading: headingMap[tag],
          children: [new TextRun({ text, bold: true })],
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
    paragraphs.push(new Paragraph({ children: runs }));
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
