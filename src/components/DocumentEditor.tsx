"use client";

import { useEffect, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
// TextStyle is registered automatically by FontFamily and Color extensions
import FontFamily from "@tiptap/extension-font-family";
import Color from "@tiptap/extension-color";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { Extension } from "@tiptap/core";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Highlighter, Download, FileDown,
  Loader2, Palette, Eye, PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePdfStore } from "@/lib/store";
import { extractPageText, blocksToHtml } from "@/lib/pdfToText";
import { exportToPdf, exportToDocx } from "@/lib/exportUtils";

/* ── Custom FontSize extension ───────────────────────────────────────────── */
const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => el.style.fontSize || null,
          renderHTML: (attrs) =>
            attrs.fontSize ? { style: `font-size:${attrs.fontSize}` } : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }: any) =>
        chain().setMark("textStyle", { fontSize: size }).run(),
    } as any;
  },
});

/* ── Constants ───────────────────────────────────────────────────────────── */
const FONT_FAMILIES = [
  { label: "Default (sans)",      value: "sans-serif" },
  { label: "Serif",               value: "Georgia, serif" },
  { label: "Monospace",           value: "monospace" },
  { label: "Arial",               value: "Arial, sans-serif" },
  { label: "Times New Roman",     value: "'Times New Roman', serif" },
  { label: "Courier New",         value: "'Courier New', monospace" },
];

const FONT_SIZES = [
  "10px","11px","12px","13px","14px","16px","18px","20px","22px",
  "24px","28px","32px","36px","48px","64px",
];

/* ── Small toolbar button ────────────────────────────────────────────────── */
function TB({
  onClick, active = false, title, children,
}: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button
      title={title} onClick={onClick}
      className={[
        "w-8 h-8 flex items-center justify-center rounded-md text-sm transition-colors select-none",
        active ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-700 hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export function DocumentEditor() {
  const { document: pdfDoc, numPages } = usePdfStore();
  const [view, setView]           = useState<"edit" | "preview">("edit");
  const [isExtracting, setExtracting] = useState(false);
  const [isExporting,  setExporting]  = useState<"pdf" | "docx" | null>(null);
  const [filename, setFilename]   = useState("document");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      FontFamily,
      FontSize,
      Color,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
    ],
    content: "<p></p>",
    editorProps: {
      attributes: { class: "outline-none" },
    },
  });

  /* ── Extract text from every page on mount ── */
  useEffect(() => {
    if (!pdfDoc || !editor) return;

    const extract = async () => {
      setExtracting(true);
      let html = "";

      for (let i = 1; i <= numPages; i++) {
        try {
          const page = await pdfDoc.getPage(i);
          const blocks = await extractPageText(page);
          if (blocks.length) {
            html += blocksToHtml(blocks);
          }
          // Visual page break between pages (except after last)
          if (i < numPages) html += `<hr/>`;
        } catch (e) {
          console.error(`Page ${i} extraction failed:`, e);
        }
      }

      editor.commands.setContent(html || "<p>No readable text found in this PDF.</p>");
      setExtracting(false);
    };

    extract();
  }, [pdfDoc, numPages, editor]);

  const handlePdf = useCallback(async () => {
    if (!editor) return;
    setExporting("pdf");
    try { await exportToPdf(editor.getHTML(), filename); }
    finally { setExporting(null); }
  }, [editor, filename]);

  const handleDocx = useCallback(async () => {
    if (!editor) return;
    setExporting("docx");
    try { await exportToDocx(editor.getHTML(), `${filename}.docx`); }
    finally { setExporting(null); }
  }, [editor, filename]);

  const busy = isExtracting || !!isExporting;

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-hidden">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-700 bg-slate-800 px-3 py-2 flex flex-wrap items-center gap-1 shrink-0">

        {/* Edit / Preview toggle */}
        <div className="flex items-center bg-slate-700 rounded-lg p-0.5 mr-2">
          <button
            onClick={() => setView("edit")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              view === "edit" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <PenLine className="w-3.5 h-3.5" /> Edit
          </button>
          <button
            onClick={() => setView("preview")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              view === "preview" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Eye className="w-3.5 h-3.5" /> Preview
          </button>
        </div>

        <div className="w-px h-5 bg-slate-600" />

        {/* Font family */}
        <select
          className="h-8 rounded-md bg-slate-700 text-slate-200 text-xs px-2 border border-slate-600 focus:outline-none disabled:opacity-40"
          disabled={view === "preview"}
          onChange={(e) => editor?.chain().focus().setFontFamily(e.target.value).run()}
          defaultValue="sans-serif"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        {/* Font size */}
        <select
          className="h-8 w-20 rounded-md bg-slate-700 text-slate-200 text-xs px-2 border border-slate-600 focus:outline-none disabled:opacity-40"
          disabled={view === "preview"}
          onChange={(e) => (editor as any)?.chain().focus().setFontSize(e.target.value).run()}
          defaultValue="14px"
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>{s.replace("px", "")}</option>
          ))}
        </select>

        <div className="w-px h-5 bg-slate-600" />

        {/* Formatting buttons */}
        <TB title="Bold"          onClick={() => editor?.chain().focus().toggleBold().run()}          active={editor?.isActive("bold")}>          <Bold className="w-4 h-4" /></TB>
        <TB title="Italic"        onClick={() => editor?.chain().focus().toggleItalic().run()}        active={editor?.isActive("italic")}>        <Italic className="w-4 h-4" /></TB>
        <TB title="Underline"     onClick={() => editor?.chain().focus().toggleUnderline().run()}     active={editor?.isActive("underline")}>     <UnderlineIcon className="w-4 h-4" /></TB>
        <TB title="Strikethrough" onClick={() => editor?.chain().focus().toggleStrike().run()}        active={editor?.isActive("strike")}>        <Strikethrough className="w-4 h-4" /></TB>

        <div className="w-px h-5 bg-slate-600" />

        {/* Text color */}
        <label className="flex items-center gap-1 cursor-pointer" title="Text color">
          <Palette className="w-4 h-4 text-slate-400" />
          <input type="color" defaultValue="#000000" className="w-6 h-6 rounded cursor-pointer opacity-80 hover:opacity-100"
            onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()} />
        </label>

        {/* Highlight color */}
        <label className="flex items-center gap-1 cursor-pointer" title="Highlight">
          <Highlighter className="w-4 h-4 text-slate-400" />
          <input type="color" defaultValue="#facc15" className="w-6 h-6 rounded cursor-pointer opacity-80 hover:opacity-100"
            onChange={(e) => editor?.chain().focus().toggleHighlight({ color: e.target.value }).run()} />
        </label>

        <div className="w-px h-5 bg-slate-600" />

        {/* Alignment */}
        <TB title="Left"    onClick={() => editor?.chain().focus().setTextAlign("left").run()}    active={editor?.isActive({ textAlign: "left" })}>    <AlignLeft className="w-4 h-4" /></TB>
        <TB title="Center"  onClick={() => editor?.chain().focus().setTextAlign("center").run()}  active={editor?.isActive({ textAlign: "center" })}> <AlignCenter className="w-4 h-4" /></TB>
        <TB title="Right"   onClick={() => editor?.chain().focus().setTextAlign("right").run()}   active={editor?.isActive({ textAlign: "right" })}>   <AlignRight className="w-4 h-4" /></TB>
        <TB title="Justify" onClick={() => editor?.chain().focus().setTextAlign("justify").run()} active={editor?.isActive({ textAlign: "justify" })}><AlignJustify className="w-4 h-4" /></TB>

        <div className="w-px h-5 bg-slate-600" />

        {/* Lists */}
        <TB title="Bullet list"   onClick={() => editor?.chain().focus().toggleBulletList().run()}  active={editor?.isActive("bulletList")}>  <List className="w-4 h-4" /></TB>
        <TB title="Numbered list" onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive("orderedList")}> <ListOrdered className="w-4 h-4" /></TB>

        <div className="flex-1" />

        {/* Filename + export */}
        <input
          className="h-8 rounded-md bg-slate-700 border border-slate-600 text-slate-200 text-xs px-3 w-36 focus:outline-none"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          placeholder="filename"
        />

        <Button size="sm" disabled={busy}
          className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 gap-1.5"
          onClick={handlePdf}>
          {isExporting === "pdf" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          Print / PDF
        </Button>

        <Button size="sm" disabled={busy}
          className="h-8 bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-3 gap-1.5"
          onClick={handleDocx}>
          {isExporting === "docx" ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />}
          DOCX
        </Button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      {isExtracting ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          <p className="text-sm">Extracting text from PDF…</p>
          <p className="text-xs text-slate-500">This may take a moment for large documents.</p>
        </div>
      ) : view === "edit" ? (

        /* ── Edit mode ── */
        <div className="flex-1 overflow-y-auto bg-slate-100 px-6 py-8">
          <div className="max-w-[794px] mx-auto min-h-[1123px] bg-white shadow-md rounded px-16 py-14 text-slate-900 text-[13.5px] leading-relaxed">
            <EditorContent editor={editor} />
          </div>
        </div>

      ) : (

        /* ── Preview mode — styled like a printed page ── */
        <div className="flex-1 overflow-y-auto bg-slate-300 px-6 py-8">
          <div className="max-w-[794px] mx-auto min-h-[1123px] bg-white shadow-xl rounded px-16 py-14 text-slate-900 text-[13.5px] leading-relaxed">
            {/* Render the HTML directly — read-only view */}
            <div
              className="ProseMirror"
              dangerouslySetInnerHTML={{ __html: editor?.getHTML() ?? "" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
