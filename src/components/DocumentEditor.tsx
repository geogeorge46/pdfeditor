"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import Color from "@tiptap/extension-color";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { CodeBlock } from "@tiptap/extension-code-block";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Extension } from "@tiptap/core";
import * as pdfjsLib from "pdfjs-dist";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Highlighter, Download, FileDown, FileUp,
  Loader2, Palette, Eye, PenLine, Image as ImageIcon,
  Link2, Subscript as SubIcon, Superscript as SupIcon,
  Table as TableIcon, Code2, Quote, Minus, Indent,
  Outdent, RotateCcw, RotateCw, Search, Eraser,
  Triangle, Square, Circle, Minus as MinusIcon,
  ChevronDown, Type, Hash, AlignVerticalJustifyCenter,
  LayoutList, Info, X, CheckSquare, Save, CheckCircle2,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePdfStore } from "@/lib/store";
import { exportHtmlToSearchablePdf, exportToPdf, exportToDocx } from "@/lib/exportUtils";
import { buildDocumentHtmlWithEdits } from "@/lib/pdfToText";

/* -- Custom FontSize extension -------------------------------------------- */
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

/* -- Line Spacing extension ----------------------------------------------- */
const LineHeight = Extension.create({
  name: "lineHeight",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading"],
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: (el) => el.style.lineHeight || null,
          renderHTML: (attrs) =>
            attrs.lineHeight ? { style: `line-height:${attrs.lineHeight}` } : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setLineHeight: (lh: string) => ({ commands }: any) => {
        return commands.updateAttributes("paragraph", { lineHeight: lh });
      },
    } as any;
  },
});

/* -- Constants ------------------------------------------------------------ */
const FONT_FAMILIES = [
  { label: "Default",          value: "sans-serif" },
  { label: "Mono",             value: "monospace" },
  { label: "Arial",            value: "Arial, sans-serif" },
  { label: "Helvetica",        value: "Helvetica, Arial, sans-serif" },
  { label: "Times New Roman",  value: "'Times New Roman', serif" },
  { label: "Courier New",      value: "'Courier New', monospace" },
  { label: "Roboto",           value: "Roboto, sans-serif" },
  { label: "Trebuchet MS",     value: "'Trebuchet MS', sans-serif" },
  { label: "Verdana",          value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma",           value: "Tahoma, Geneva, sans-serif" },
  { label: "Georgia",          value: "Georgia, serif" },
  { label: "Garamond",         value: "Garamond, serif" },
  { label: "Palatino",         value: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
  { label: "Comic Sans MS",    value: "'Comic Sans MS', cursive" },
  { label: "Impact",           value: "Impact, fantasy" },
  { label: "Brush Script MT",  value: "'Brush Script MT', cursive" },
];

const FONT_SIZES = [
  "8px","9px","10px","11px","12px","13px","14px","16px","18px","20px","22px",
  "24px","28px","32px","36px","42px","48px","64px","72px",
];

const LINE_SPACINGS = [
  { label: "Single (1.0)",     value: "1" },
  { label: "1.15",             value: "1.15" },
  { label: "1.5",              value: "1.5" },
  { label: "Double (2.0)",     value: "2" },
  { label: "2.5",              value: "2.5" },
  { label: "Triple (3.0)",     value: "3" },
];

const HEADING_LEVELS = [
  { label: "Normal",  value: "p" },
  { label: "H1",      value: "h1" },
  { label: "H2",      value: "h2" },
  { label: "H3",      value: "h3" },
  { label: "H4",      value: "h4" },
];

/* -- SVG Shape definitions ------------------------------------------------ */
const SHAPES = {
  rectangle: `<div contenteditable="false" style="display:inline-block;width:120px;height:80px;border:2px solid #6366f1;background:rgba(99,102,241,0.1);border-radius:4px;margin:4px;vertical-align:middle;"></div>`,
  circle: `<div contenteditable="false" style="display:inline-block;width:100px;height:100px;border:2px solid #10b981;background:rgba(16,185,129,0.1);border-radius:50%;margin:4px;vertical-align:middle;"></div>`,
  triangle: `<div contenteditable="false" style="display:inline-block;margin:4px;vertical-align:middle;"><svg width="100" height="86" viewBox="0 0 100 86"><polygon points="50,0 100,86 0,86" fill="rgba(251,191,36,0.2)" stroke="#f59e0b" stroke-width="2"/></svg></div>`,
  line: `<div contenteditable="false" style="display:inline-block;width:150px;height:20px;margin:4px;vertical-align:middle;"><svg width="150" height="20" viewBox="0 0 150 20"><line x1="0" y1="10" x2="150" y2="10" stroke="#ef4444" stroke-width="2"/></svg></div>`,
  arrow: `<div contenteditable="false" style="display:inline-block;width:150px;height:30px;margin:4px;vertical-align:middle;"><svg width="150" height="30" viewBox="0 0 150 30"><defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#8b5cf6"/></marker></defs><line x1="0" y1="15" x2="135" y2="15" stroke="#8b5cf6" stroke-width="2" marker-end="url(#arrowhead)"/></svg></div>`,
  star: `<div contenteditable="false" style="display:inline-block;width:80px;height:80px;margin:4px;vertical-align:middle;"><svg viewBox="0 0 100 100" width="80" height="80"><polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35" fill="rgba(236,72,153,0.2)" stroke="#ec4899" stroke-width="2"/></svg></div>`,
  diamond: `<div contenteditable="false" style="display:inline-block;width:80px;height:80px;margin:4px;vertical-align:middle;"><svg viewBox="0 0 100 100" width="80" height="80"><polygon points="50,5 95,50 50,95 5,50" fill="rgba(6,182,212,0.15)" stroke="#06b6d4" stroke-width="2"/></svg></div>`,
  callout: `<div contenteditable="false" style="display:inline-block;padding:8px 14px;background:rgba(99,102,241,0.08);border:2px solid #6366f1;border-radius:10px;position:relative;margin:4px;font-size:13px;color:#1e293b;min-width:100px;text-align:center;">Callout text</div>`,
};

/* -- Small toolbar button ------------------------------------------------- */
function TB({
  onClick, active = false, title, children, disabled = false,
}: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      title={title} onClick={onClick} disabled={disabled}
      className={[
        "w-7 h-7 flex items-center justify-center rounded text-xs transition-all select-none shrink-0",
        active ? "bg-indigo-600 text-white shadow-inner shadow-indigo-900/30"
                : "text-slate-300 hover:bg-slate-700 hover:text-white",
        disabled ? "opacity-40 cursor-not-allowed" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/* -- Separator ------------------------------------------------------------ */
function Sep() {
  return <div className="w-px h-5 bg-slate-600 mx-0.5 shrink-0" />;
}

/* -- Toolbar section label ------------------------------------------------ */
function ToolbarGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5">
      {children}
    </div>
  );
}

/* -- Table picker --------------------------------------------------------- */
function TablePicker({ onInsert }: { onInsert: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState({ r: 0, c: 0 });
  const MAX = 8;

  return (
    <div className="absolute top-full left-0 mt-1 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-3">
      <p className="text-xs text-slate-400 mb-2 text-center">
        {hover.r > 0 ? `${hover.r} × ${hover.c} table` : "Insert table"}
      </p>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${MAX},1fr)` }}>
        {Array.from({ length: MAX * MAX }, (_, i) => {
          const r = Math.floor(i / MAX) + 1;
          const c = (i % MAX) + 1;
          const active = r <= hover.r && c <= hover.c;
          return (
            <div
              key={i}
              className={`w-5 h-5 rounded-sm border transition-colors cursor-pointer ${
                active ? "bg-indigo-500 border-indigo-400" : "bg-slate-700 border-slate-600 hover:bg-slate-600"
              }`}
              onMouseEnter={() => setHover({ r, c })}
              onClick={() => onInsert(hover.r, hover.c)}
            />
          );
        })}
      </div>
    </div>
  );
}

/* -- Shape picker --------------------------------------------------------- */
function ShapePicker({ onInsert }: { onInsert: (html: string) => void }) {
  const items = [
    { label: "Rectangle", key: "rectangle", icon: "▭" },
    { label: "Circle",    key: "circle",    icon: "○" },
    { label: "Triangle",  key: "triangle",  icon: "△" },
    { label: "Line",      key: "line",      icon: "—" },
    { label: "Arrow",     key: "arrow",     icon: "→" },
    { label: "Star",      key: "star",      icon: "★" },
    { label: "Diamond",   key: "diamond",   icon: "◇" },
    { label: "Callout",   key: "callout",   icon: "💬" },
  ];

  return (
    <div className="absolute top-full left-0 mt-1 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-3 w-48">
      <p className="text-xs text-slate-400 mb-2">Insert Shape</p>
      <div className="grid grid-cols-4 gap-1">
        {items.map((item) => (
          <button
            key={item.key}
            title={item.label}
            onClick={() => onInsert(SHAPES[item.key as keyof typeof SHAPES])}
            className="flex flex-col items-center gap-0.5 p-1.5 rounded hover:bg-slate-700 text-slate-300 text-lg transition-colors"
          >
            <span>{item.icon}</span>
            <span className="text-[9px] text-slate-400">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* -- Find & Replace modal ------------------------------------------------ */
function FindReplaceModal({
  editor,
  onClose,
}: {
  editor: any;
  onClose: () => void;
}) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [status, setStatus] = useState("");

  const doFind = () => {
    if (!find || !editor) return;
    const content = editor.getHTML();
    const flags = matchCase ? "g" : "gi";
    const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
    const count = (content.match(regex) || []).length;
    setStatus(count > 0 ? `Found ${count} occurrence(s)` : "Not found");
  };

  const doReplace = () => {
    if (!find || !editor) return;
    const content = editor.getHTML();
    const flags = matchCase ? "g" : "gi";
    const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
    const replaced = content.replace(regex, replace);
    editor.commands.setContent(replaced);
    const count = (content.match(regex) || []).length;
    setStatus(`Replaced ${count} occurrence(s)`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-5 w-[380px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Search className="w-4 h-4 text-indigo-400" /> Find &amp; Replace
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Find</label>
            <input
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Search text…"
              onKeyDown={(e) => e.key === "Enter" && doFind()}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Replace with</label>
            <input
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              placeholder="Replacement text…"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
            <input
              type="checkbox"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
              className="rounded"
            />
            Match Case
          </label>
          {status && (
            <p className="text-xs text-indigo-300 flex items-center gap-1">
              <Info className="w-3 h-3" /> {status}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={doFind}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-xs py-1.5 rounded-lg transition-colors"
            >
              Find
            </button>
            <button
              onClick={doReplace}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs py-1.5 rounded-lg transition-colors"
            >
              Replace All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -- Image Insert Modal ---------------------------------------------------- */
function ImageInsertModal({ onInsert, onClose }: { onInsert: (src: string, alt?: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"upload" | "url">("upload");
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      onInsert(src, alt || f.name);
    };
    reader.readAsDataURL(f);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-5 w-[400px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-emerald-400" /> Insert Image
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex mb-4 bg-slate-700 rounded-lg p-0.5">
          {(["upload", "url"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1 text-xs rounded-md font-medium transition-colors ${
                tab === t ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {t === "upload" ? "Upload File" : "From URL"}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {tab === "upload" ? (
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-600 hover:border-indigo-500 rounded-lg p-8 text-center cursor-pointer transition-colors"
            >
              <ImageIcon className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Click to upload image</p>
              <p className="text-xs text-slate-500 mt-1">PNG, JPG, GIF, WebP, SVG</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Image URL</label>
                <input
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/image.png"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Alt text (optional)</label>
                <input
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={alt}
                  onChange={(e) => setAlt(e.target.value)}
                  placeholder="Image description"
                />
              </div>
              <button
                onClick={() => url && onInsert(url, alt)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs py-2 rounded-lg transition-colors"
              >
                Insert Image
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -- Word / char count ---------------------------------------------------- */
function useWordCount(editor: any) {
  const [counts, setCounts] = useState({ words: 0, chars: 0 });
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const text = editor.getText();
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      setCounts({ words, chars: text.length });
    };
    editor.on("update", update);
    update();
    return () => editor.off("update", update);
  }, [editor]);
  return counts;
}

/* -- Main component ------------------------------------------------------- */
export function DocumentEditor({
  onSaveToAnnotate,
  autoImportFromPdf = false,
}: {
  onSaveToAnnotate?: (file: File) => void;
  autoImportFromPdf?: boolean;
} = {}) {
  // Word Editor is FULLY ISOLATED from the PDF store.
  // It does NOT read/write pageEdits or pdfDoc.
  // The original PDF in Annotate / Edit-over-PDF is NEVER touched.
  // Changes only reach those modes when the user explicitly clicks "Save to Annotate".
  const [view, setView]               = useState<"edit" | "preview">("edit");
  const [pageView, setPageView]         = useState<"continuous" | "pages">("continuous");
  const [isExporting,  setExporting]  = useState<"pdf" | "docx" | "annotate" | null>(null);
  const [filename, setFilename]       = useState("Untitled Document");
  const [lastSaved, setLastSaved]     = useState<Date | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const AUTOSAVE_PREFIX = "word-editor-draft";

  // Dropdown state
  const [showTable,    setShowTable]    = useState(false);
  const [showShapes,   setShowShapes]   = useState(false);
  const [showFindRepl, setShowFindRepl] = useState(false);
  const [showImgModal, setShowImgModal] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Refs for closing dropdowns on outside click
  const tableRef  = useRef<HTMLDivElement>(null);
  const shapesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) setShowTable(false);
      if (shapesRef.current && !shapesRef.current.contains(e.target as Node)) setShowShapes(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Access PDF/file from the store for optional import / sync.
  // IMPORTANT: don't select an object literal here, because it creates a new
  // reference every render and can trigger React useSyncExternalStore warnings
  // ("getSnapshot should be cached").
  const pdfDoc = usePdfStore((s) => s.document);
  const pdfFile = usePdfStore((s) => s.file);
  const pageEdits = usePdfStore((s) => s.pageEdits);
  const [isImporting, setIsImporting] = useState(false);

  const fileFingerprint = pdfFile
    ? `${pdfFile.name}::${pdfFile.size}::${pdfFile.lastModified}`
    : "no-file";
  const autosaveKey = `${AUTOSAVE_PREFIX}:${fileFingerprint}`;
  const autosaveTimeKey = `${AUTOSAVE_PREFIX}:${fileFingerprint}:time`;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TextStyle,
      FontFamily,
      FontSize,
      LineHeight,
      Color,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: true, allowBase64: true }),
      Link.configure({ openOnClick: false }),
      Subscript,
      Superscript,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CodeBlock,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: "<p></p>",
    editorProps: {
      attributes: { class: "outline-none" },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      localStorage.setItem(autosaveKey, html);
      localStorage.setItem(autosaveTimeKey, Date.now().toString());
      setLastSaved(new Date());
    }
  });

  // Load autosaved draft when editor or source file changes.
  // This prevents stale drafts from previous PDFs showing up.
  useEffect(() => {
    if (!editor) return;
    const savedHtml = localStorage.getItem(autosaveKey);
    if (savedHtml) {
      // Skip corrupted autosave (only <hr> / empty <p> tags with no real text)
      const textOnly = savedHtml.replace(/<[^>]*>/g, "").trim();
      if (textOnly.length > 0) {
        editor.commands.setContent(savedHtml);
        const savedTime = localStorage.getItem(autosaveTimeKey);
        if (savedTime) setLastSaved(new Date(parseInt(savedTime, 10)));
      } else {
        // Clear the corrupted autosave
        localStorage.removeItem(autosaveKey);
        localStorage.removeItem(autosaveTimeKey);
        editor.commands.setContent("<p></p>");
        setLastSaved(null);
      }
    } else {
      // No draft for this file: start clean for the newly loaded PDF.
      editor.commands.setContent("<p></p>");
      setLastSaved(null);
    }
  }, [editor, autosaveKey, autosaveTimeKey]);

  /**
   * If the Word editor is still blank but we already have edited text (from
   * "Edit over PDF"), automatically sync so the user isn't seeing an empty page.
   */
  useEffect(() => {
    if (!editor || !pdfDoc) return;
    if (!pageEdits || Object.keys(pageEdits).length === 0) return;

    const textNow = editor.getText().trim();
    if (textNow.length > 0) return; // Don't override autosave/import

    let cancelled = false;
    setIsImporting(true);

    (async () => {
      try {
        const totalPages = pdfDoc.numPages;
        const pageIndices = Array.from({ length: totalPages }, (_, i) => i);
        const html = await buildDocumentHtmlWithEdits(pdfDoc, pageEdits, pageIndices);
        if (cancelled) return;
        if (html.trim()) editor.commands.setContent(html);
      } catch (err) {
        console.error("Auto-sync Word editor failed:", err);
      } finally {
        if (!cancelled) setIsImporting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editor, pdfDoc, pageEdits]);

  /**
   * User-triggered PDF import: extracts text from the currently loaded PDF
   * and populates the Word Editor with aligned content.
   * Only runs when the user explicitly clicks "Import from PDF".
   */
  const importFromPdfIntoEditor = useCallback(async (askConfirm: boolean) => {
    if (!editor || !pdfDoc) return;

    if (askConfirm) {
      const confirmed = window.confirm(
        "This will replace your current editor content with text extracted from the loaded PDF. Continue?"
      );
      if (!confirmed) return;
    }

    setIsImporting(true);

    try {
      const totalPages = pdfDoc.numPages;
      let combinedHtml = "";
      let hasAnyText = false;

      for (let p = 1; p <= totalPages; p++) {
        const page = await pdfDoc.getPage(p);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });

        interface RawItem {
          str: string;
          x: number;
          y: number;
          height: number;
          width: number;
        }

        const rawItems: RawItem[] = [];

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

        if (rawItems.length === 0) continue;

        hasAnyText = true;

        const heights = rawItems.map((i) => i.height).filter((h) => h > 0);
        const avgHeight = heights.reduce((a, b) => a + b, 0) / heights.length;
        const maxHeight = Math.max(...heights);
        const pageWidth = viewport.width;

        rawItems.sort((a, b) => a.y - b.y || a.x - b.x);

        // Group items into lines by Y proximity
        const LINE_MERGE_TOLERANCE = avgHeight * 0.55;
        interface LineData {
          items: RawItem[];
          y: number;
          height: number;
          minX: number;
          maxX: number;
        }
        const lines: LineData[] = [];

        for (const item of rawItems) {
          const last = lines[lines.length - 1];
          if (!last || Math.abs(item.y - last.y) > LINE_MERGE_TOLERANCE) {
            lines.push({
              items: [item],
              y: item.y,
              height: item.height,
              minX: item.x,
              maxX: item.x + item.width,
            });
          } else {
            last.items.push(item);
            last.height = Math.max(last.height, item.height);
            last.minX = Math.min(last.minX, item.x);
            last.maxX = Math.max(last.maxX, item.x + item.width);
          }
        }

        // Determine text alignment for each line
        const detectAlignment = (line: LineData): string => {
          const leftMargin = line.minX;
          const rightMargin = pageWidth - line.maxX;
          const textWidth = line.maxX - line.minX;

          if (textWidth > pageWidth * 0.85) return "justify";

          const marginDiff = Math.abs(leftMargin - rightMargin);
          if (marginDiff < pageWidth * 0.1 && leftMargin > pageWidth * 0.1) return "center";
          if (rightMargin < pageWidth * 0.08 && leftMargin > pageWidth * 0.25) return "right";

          return "left";
        };

        // Build blocks with alignment
        const PARAGRAPH_GAP_MULTIPLIER = 1.6;

        interface Block {
          type: "heading" | "paragraph";
          level?: 1 | 2 | 3;
          text: string;
          alignment: string;
        }

        const blocks: Block[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const text = line.items
            .sort((a, b) => a.x - b.x)
            .map((it) => it.str)
            .join(" ")
            .trim();

          if (!text) continue;

          const lineH = line.height;
          const isH1 = lineH >= maxHeight * 0.85 && lineH > avgHeight * 1.5;
          const isH2 = !isH1 && lineH > avgHeight * 1.35;
          const isH3 = !isH1 && !isH2 && lineH > avgHeight * 1.15;
          const alignment = detectAlignment(line);

          if (isH1) { blocks.push({ type: "heading", level: 1, text, alignment }); continue; }
          if (isH2) { blocks.push({ type: "heading", level: 2, text, alignment }); continue; }
          if (isH3) { blocks.push({ type: "heading", level: 3, text, alignment }); continue; }

          const isNewParagraph = (() => {
            if (i === 0) return true;
            const prev = lines[i - 1];
            const gap = Math.abs(line.y - prev.y);
            const expectedSpacing = (line.height + prev.height) / 2;
            return gap > expectedSpacing * PARAGRAPH_GAP_MULTIPLIER;
          })();

          if (isNewParagraph) {
            blocks.push({ type: "paragraph", text, alignment });
          } else {
            const last = blocks[blocks.length - 1];
            if (last?.type === "paragraph") {
              last.text += " " + text;
            } else {
              blocks.push({ type: "paragraph", text, alignment });
            }
          }
        }

        const escapeHtml = (s: string) =>
          s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

        const pageHtml = blocks
          .map((b) => {
            const safe = escapeHtml(b.text);
            const alignStyle = b.alignment !== "left" ? ` style="text-align:${b.alignment}"` : "";
            if (b.type === "heading") return `<h${b.level}${alignStyle}>${safe}</h${b.level}>`;
            return `<p${alignStyle}>${safe}</p>`;
          })
          .join("\n");

        combinedHtml += pageHtml;

        if (p < totalPages) {
          combinedHtml += `\n<hr>\n`;
        }
      }

      if (!hasAnyText) {
        alert("No extractable text found in this PDF. The PDF may be image-based (scanned). Only PDFs with native text can be imported.");
        return;
      }

      if (combinedHtml.trim()) {
        editor.commands.setContent(combinedHtml);
        setLastSaved(new Date());
        localStorage.setItem(autosaveKey, combinedHtml);
        localStorage.setItem(autosaveTimeKey, Date.now().toString());
      }
    } catch (err) {
      console.error("PDF text extraction for Word Editor failed:", err);
      alert("Failed to extract text from PDF. Please try again.");
    } finally {
      setIsImporting(false);
    }
  }, [editor, pdfDoc, autosaveKey, autosaveTimeKey]);

  const handleImportFromPdf = useCallback(async () => {
    await importFromPdfIntoEditor(true);
  }, [importFromPdfIntoEditor]);

  // Optional: when using DocumentEditor as "Edit over PDF", auto-import once
  // so users can immediately edit in reflow mode (Word-like) without overlays.
  useEffect(() => {
    if (!autoImportFromPdf || !editor || !pdfDoc) return;
    const hasText = editor.getText().trim().length > 0;
    if (hasText) return;
    void importFromPdfIntoEditor(false);
  }, [autoImportFromPdf, editor, pdfDoc, importFromPdfIntoEditor]);

  const [isImageSelected, setIsImageSelected] = useState(false);

  // useEffect(() => {
  //   const ed = editor;
  //   if (!ed) return;
  //   const updateImageSelected = () => setIsImageSelected(ed.isActive("image"));
  //   ed.on("selectionUpdate", updateImageSelected);
  //   updateImageSelected();
  //   return () => ed.off("selectionUpdate", updateImageSelected);
  // }, [editor]);

  const { words, chars } = useWordCount(editor);

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

  /**
   * Render the TipTap content into a real PDF blob via html2pdf.js,
   * then hand it to the parent as a File so Annotate / Edit-over-PDF
   * modes can open it immediately.
   */
  const handleSaveToAnnotate = useCallback(async () => {
    if (!editor || !onSaveToAnnotate) return;
    setExporting("annotate");
    try {
      const html = editor.getHTML();
      const blob = await exportHtmlToSearchablePdf(html);
      const pdfFile = new File([blob], `${filename}.pdf`, { type: "application/pdf" });
      onSaveToAnnotate(pdfFile);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Save to Annotate failed:", err);
      alert("Could not generate PDF. Please try again.");
    } finally {
      setExporting(null);
    }
  }, [editor, filename, onSaveToAnnotate]);
  const busy = !!isExporting;
  const disabled = view === "preview";

  /* helpers */
  const insertTable = (rows: number, cols: number) => {
    setShowTable(false);
    editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
  };

  const insertShape = (html: string) => {
    setShowShapes(false);
    editor?.chain().focus().insertContent(html).run();
  };

  const insertLink = () => {
    const prev = editor?.getAttributes("link").href ?? "";
    const url = window.prompt("Enter URL:", prev || "https://");
    if (url === null) return;
    if (url === "") {
      editor?.chain().focus().unsetLink().run();
    } else {
      editor?.chain().focus().setLink({ href: url }).run();
    }
  };

  const resizeSelectedImage = () => {
    if (!editor) return;
    const imageAttrs = editor.getAttributes("image");
    if (!imageAttrs.src) return;

    const currentWidth = imageAttrs.width ? String(imageAttrs.width) : "";
    const currentHeight = imageAttrs.height ? String(imageAttrs.height) : "";
    const width = window.prompt("New image width (px)", currentWidth);
    if (width === null) return;
    const height = window.prompt("New image height (px)", currentHeight);
    if (height === null) return;

    const attrs: Record<string, string> = {};
    if (width.trim()) attrs.width = width.trim();
    if (height.trim()) attrs.height = height.trim();
    if (Object.keys(attrs).length > 0) {
      editor.chain().focus().updateAttributes("image", attrs).run();
    }
  };

  const insertHR = () => editor?.chain().focus().setHorizontalRule().run();

  const setHeading = (val: string) => {
    if (val === "p") {
      editor?.chain().focus().setParagraph().run();
    } else {
      const level = parseInt(val.replace("h", "")) as 1 | 2 | 3 | 4;
      editor?.chain().focus().toggleHeading({ level }).run();
    }
  };

  const currentHeading = () => {
    for (const l of [1, 2, 3, 4]) {
      if (editor?.isActive("heading", { level: l })) return `h${l}`;
    }
    return "p";
  };

  /* -- Render ------------------------------------------------------------- */
  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-hidden">

      {/* -- Document Header ------------------------------------------------ */}
      <div className="bg-slate-800 border-b border-slate-700 px-3 py-1.5 flex justify-between items-center shrink-0">
        <input 
          value={filename} 
          onChange={(e) => setFilename(e.target.value)}
          className="bg-transparent text-slate-200 font-medium text-sm focus:outline-none hover:bg-slate-700 focus:bg-slate-700 rounded px-2 py-0.5 transition-colors w-[200px] sm:w-[350px]"
          placeholder="Untitled Document"
        />
        <div className="text-[11px] text-slate-400">
          {lastSaved ? `Autosaved: ${lastSaved.toLocaleTimeString()}` : "Not saved"}
        </div>
      </div>

      {/* -- Toolbar ---------------------------------------------------------- */}
      <div className="border-b border-slate-700 bg-slate-800 px-2 py-1.5 flex flex-wrap items-center gap-1 shrink-0 select-none">

        {/* Edit / Preview toggle */}
        <div className="flex items-center bg-slate-700 rounded-lg p-0.5 mr-1 shrink-0">
          <button
            onClick={() => setView("edit")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              view === "edit" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <PenLine className="w-3 h-3" /> Edit
          </button>
          <button
            onClick={() => setView("preview")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              view === "preview" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Eye className="w-3 h-3" /> Preview
          </button>
        </div>

        {/* Page View toggle */}
        <div className="flex items-center bg-slate-700 rounded-lg p-0.5 mr-1 shrink-0">
          <button
            onClick={() => setPageView("continuous")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              pageView === "continuous" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-3 h-3" /> Continuous
          </button>
          <button
            onClick={() => setPageView("pages")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              pageView === "pages" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-3 h-3" /> Pages
          </button>
        </div>

        <Sep />

        {/* Heading style */}
        <select
          disabled={disabled}
          value={currentHeading()}
          onChange={(e) => setHeading(e.target.value)}
          className="h-7 rounded bg-slate-700 text-slate-200 text-xs px-1.5 border border-slate-600 focus:outline-none disabled:opacity-40 w-24"
        >
          {HEADING_LEVELS.map((h) => (
            <option key={h.value} value={h.value}>{h.label}</option>
          ))}
        </select>

        {/* Font family */}
        <select
          disabled={disabled}
          className="h-7 rounded bg-slate-700 text-slate-200 text-xs px-1.5 border border-slate-600 focus:outline-none disabled:opacity-40 w-28"
          onChange={(e) => editor?.chain().focus().setFontFamily(e.target.value).run()}
          defaultValue="sans-serif"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        {/* Font size */}
        <select
          disabled={disabled}
          className="h-7 w-16 rounded bg-slate-700 text-slate-200 text-xs px-1 border border-slate-600 focus:outline-none disabled:opacity-40"
          onChange={(e) => (editor as any)?.chain().focus().setFontSize(e.target.value).run()}
          defaultValue="14px"
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>{s.replace("px", "")}</option>
          ))}
        </select>

        {/* Line spacing */}
        <select
          disabled={disabled}
          className="h-7 w-16 rounded bg-slate-700 text-slate-200 text-xs px-1 border border-slate-600 focus:outline-none disabled:opacity-40"
          title="Line Spacing"
          onChange={(e) => (editor as any)?.chain().focus().setLineHeight(e.target.value).run()}
          defaultValue=""
        >
          <option value="" disabled>Spacing</option>
          {LINE_SPACINGS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>

        <Sep />

        {/* Undo / Redo */}
        <TB title="Undo (Ctrl+Z)" onClick={() => editor?.chain().focus().undo().run()} disabled={disabled}>
          <RotateCcw className="w-3.5 h-3.5" />
        </TB>
        <TB title="Redo (Ctrl+Y)" onClick={() => editor?.chain().focus().redo().run()} disabled={disabled}>
          <RotateCw className="w-3.5 h-3.5" />
        </TB>
        <TB title="Clear Formatting" onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()} disabled={disabled}>
          <Eraser className="w-3.5 h-3.5" />
        </TB>

        <Sep />

        {/* Text formatting */}
        <TB title="Bold (Ctrl+B)"            onClick={() => editor?.chain().focus().toggleBold().run()}       active={editor?.isActive("bold")}      disabled={disabled}><Bold className="w-3.5 h-3.5" /></TB>
        <TB title="Italic (Ctrl+I)"          onClick={() => editor?.chain().focus().toggleItalic().run()}     active={editor?.isActive("italic")}    disabled={disabled}><Italic className="w-3.5 h-3.5" /></TB>
        <TB title="Underline (Ctrl+U)"       onClick={() => editor?.chain().focus().toggleUnderline().run()}  active={editor?.isActive("underline")} disabled={disabled}><UnderlineIcon className="w-3.5 h-3.5" /></TB>
        <TB title="Strikethrough"            onClick={() => editor?.chain().focus().toggleStrike().run()}      active={editor?.isActive("strike")}    disabled={disabled}><Strikethrough className="w-3.5 h-3.5" /></TB>
        <TB title="Subscript"                onClick={() => editor?.chain().focus().toggleSubscript().run()}   active={editor?.isActive("subscript")} disabled={disabled}><SubIcon className="w-3.5 h-3.5" /></TB>
        <TB title="Superscript"              onClick={() => editor?.chain().focus().toggleSuperscript().run()} active={editor?.isActive("superscript")} disabled={disabled}><SupIcon className="w-3.5 h-3.5" /></TB>

        <Sep />

        {/* Colors */}
        <label className="flex items-center gap-0.5 cursor-pointer group" title="Text Color">
          <Palette className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-colors" />
          <input type="color" defaultValue="#000000"
            className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
            onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()} />
        </label>

        <label className="flex items-center gap-0.5 cursor-pointer group" title="Highlight Color">
          <Highlighter className="w-3.5 h-3.5 text-amber-400 group-hover:text-amber-300 transition-colors" />
          <input type="color" defaultValue="#facc15"
            className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
            onChange={(e) => editor?.chain().focus().toggleHighlight({ color: e.target.value }).run()} />
        </label>

        <Sep />

        {/* Alignment */}
        <TB title="Align Left"    onClick={() => editor?.chain().focus().setTextAlign("left").run()}    active={editor?.isActive({ textAlign: "left" })}    disabled={disabled}><AlignLeft className="w-3.5 h-3.5" /></TB>
        <TB title="Align Center"  onClick={() => editor?.chain().focus().setTextAlign("center").run()}  active={editor?.isActive({ textAlign: "center" })} disabled={disabled}><AlignCenter className="w-3.5 h-3.5" /></TB>
        <TB title="Align Right"   onClick={() => editor?.chain().focus().setTextAlign("right").run()}   active={editor?.isActive({ textAlign: "right" })}  disabled={disabled}><AlignRight className="w-3.5 h-3.5" /></TB>
        <TB title="Justify"       onClick={() => editor?.chain().focus().setTextAlign("justify").run()} active={editor?.isActive({ textAlign: "justify" })} disabled={disabled}><AlignJustify className="w-3.5 h-3.5" /></TB>

        <Sep />

        {/* Indent / Outdent */}
        <TB title="Increase Indent" onClick={() => editor?.chain().focus().sinkListItem("listItem").run()} disabled={disabled}><Indent className="w-3.5 h-3.5" /></TB>
        <TB title="Decrease Indent" onClick={() => editor?.chain().focus().liftListItem("listItem").run()} disabled={disabled}><Outdent className="w-3.5 h-3.5" /></TB>

        <Sep />

        {/* Lists */}
        <TB title="Bullet List"   onClick={() => editor?.chain().focus().toggleBulletList().run()}  active={editor?.isActive("bulletList")}  disabled={disabled}><List className="w-3.5 h-3.5" /></TB>
        <TB title="Numbered List" onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive("orderedList")} disabled={disabled}><ListOrdered className="w-3.5 h-3.5" /></TB>
        <TB title="Task List"     onClick={() => editor?.chain().focus().toggleTaskList().run()}    active={editor?.isActive("taskList")}    disabled={disabled}><CheckSquare className="w-3.5 h-3.5" /></TB>
        <TB title="Blockquote" onClick={() => editor?.chain().focus().toggleBlockquote().run()} active={editor?.isActive("blockquote")} disabled={disabled}><Quote className="w-3.5 h-3.5" /></TB>
        <TB title="Code Block" onClick={() => editor?.chain().focus().toggleCodeBlock().run()} active={editor?.isActive("codeBlock")} disabled={disabled}><Code2 className="w-3.5 h-3.5" /></TB>

        <Sep />

        {/* Insert: Link */}
        <TB title="Insert / Edit Link" onClick={insertLink} active={editor?.isActive("link")} disabled={disabled}><Link2 className="w-3.5 h-3.5" /></TB>

        {/* Insert: Image */}
        <TB title="Insert Image" onClick={() => setShowImgModal(true)} disabled={disabled}>
          <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
        </TB>

        {isImageSelected && (
          <TB title="Resize selected image" onClick={resizeSelectedImage} disabled={disabled}>
            <Square className="w-3.5 h-3.5 text-slate-200" />
          </TB>
        )}

        {/* Insert: Table */}
        <div ref={tableRef} className="relative">
          <TB title="Insert Table" onClick={() => { setShowTable((p) => !p); setShowShapes(false); }} disabled={disabled}>
            <TableIcon className="w-3.5 h-3.5 text-blue-400" />
          </TB>
          {showTable && <TablePicker onInsert={insertTable} />}
        </div>

        {/* Insert: Shapes */}
        <div ref={shapesRef} className="relative">
          <TB title="Insert Shape" onClick={() => { setShowShapes((p) => !p); setShowTable(false); }} disabled={disabled}>
            <Square className="w-3.5 h-3.5 text-purple-400" />
          </TB>
          {showShapes && <ShapePicker onInsert={insertShape} />}
        </div>

        {/* Horizontal Rule */}
        <TB title="Insert Horizontal Rule / Page Break" onClick={insertHR} disabled={disabled}>
          <Minus className="w-3.5 h-3.5" />
        </TB>

        {/* Find & Replace */}
        <TB title="Find & Replace" onClick={() => setShowFindRepl(true)}>
          <Search className="w-3.5 h-3.5 text-yellow-400" />
        </TB>

        <div className="flex-1" />

        {/* Import from loaded PDF — only shown when a PDF is loaded */}
        {pdfDoc && (
          <Button size="sm" disabled={busy || isImporting}
            title="Import text content from the currently loaded PDF into this editor"
            className="h-7 bg-amber-600 hover:bg-amber-500 text-white text-xs px-3 gap-1"
            onClick={handleImportFromPdf}>
            {isImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileUp className="w-3 h-3" />}
            {isImporting ? "Importing…" : "Import from PDF"}
          </Button>
        )}

        {/* Filename + export */}
        <input
          className="h-7 rounded bg-slate-700 border border-slate-600 text-slate-200 text-xs px-3 w-32 focus:outline-none"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          placeholder="filename"
        />

        {/* Save to Annotate — only shown when a callback was provided */}
        {onSaveToAnnotate && (
          <Button size="sm" disabled={busy}
            title="Render this document to PDF and open it in Annotate / Edit over PDF modes"
            className={`h-7 text-white text-xs px-3 gap-1 transition-all ${
              saveSuccess
                ? "bg-emerald-500 hover:bg-emerald-400"
                : "bg-violet-600 hover:bg-violet-500"
            }`}
            onClick={handleSaveToAnnotate}>
            {isExporting === "annotate"
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : saveSuccess
              ? <CheckCircle2 className="w-3 h-3" />
              : <Save className="w-3 h-3" />}
            {saveSuccess ? "Saved!" : "Save to Annotate"}
          </Button>
        )}

        <Button size="sm" disabled={busy}
          className="h-7 bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 gap-1"
          onClick={handlePdf}>
          {isExporting === "pdf" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          PDF
        </Button>

        <Button size="sm" disabled={busy}
          className="h-7 bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-3 gap-1"
          onClick={handleDocx}>
          {isExporting === "docx" ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />}
          DOCX
        </Button>
      </div>

      {/* -- Body ------------------------------------------------------------- */}
      {view === "edit" ? (
        /* -- Continuous edit canvas --------------------------------------- */
        <div className="doc-scroll-area flex-1 overflow-y-auto py-8">
          <div
            ref={canvasRef}
            className={`doc-page-canvas max-w-[850px] mx-auto text-slate-900 text-[14.5px] leading-relaxed transition-all ${
              pageView === "pages" ? "page-view" : ""
            }`}
            style={{ minHeight: '800px' }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      ) : (
        /* -- Preview mode -------------------------------------------------- */
        <div className="doc-scroll-area flex-1 overflow-y-auto py-8">
          <div
            ref={canvasRef}
            className={`doc-page-canvas max-w-[850px] mx-auto text-slate-900 text-[14.5px] leading-relaxed transition-all ${
              pageView === "pages" ? "page-view" : ""
            }`}
            style={{ minHeight: '800px' }}
          >
            <div
              className="ProseMirror"
              dangerouslySetInnerHTML={{ __html: editor?.getHTML() ?? "" }}
            />
          </div>
        </div>
      )}

      {/* -- Status bar ----------------------------------------------------- */}
      <div className="border-t border-slate-700 bg-slate-800 px-4 py-1 flex items-center gap-4 text-xs text-slate-500 shrink-0">
        <span className="flex items-center gap-1">
          <Type className="w-3 h-3" /> {words} words
        </span>
        <span>{chars} characters</span>
        {editor?.isActive("link") && (
          <span className="text-indigo-400">
            Link: {editor.getAttributes("link").href}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-slate-600">{view === "edit" ? "Editing" : "Preview"} mode</span>
      </div>

      {/* -- Modals --------------------------------------------------------- */}
      {showFindRepl && (
        <FindReplaceModal editor={editor} onClose={() => setShowFindRepl(false)} />
      )}
      {showImgModal && (
        <ImageInsertModal
          onInsert={(src, alt) => {
            editor?.chain().focus().setImage({ src, alt }).run();
            setShowImgModal(false);
          }}
          onClose={() => setShowImgModal(false)}
        />
      )}
    </div>
  );
}
