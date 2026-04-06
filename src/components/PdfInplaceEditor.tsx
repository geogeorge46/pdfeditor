"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { usePdfStore } from "@/lib/store";
import { 
  Download, FileText, Bold, Italic, Underline as UnderlineIcon, Palette, Eye, PenLine,
  Strikethrough, Highlighter, AlignLeft, AlignCenter, AlignRight, AlignJustify, Undo, Redo,
  List, ListOrdered, Link2, Eraser, Image as ImageIcon
} from "lucide-react";
import { exportToPdf, exportToDocx } from "@/lib/exportUtils";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

const FONT_FAMILIES = [
  { label: "Arial", value: "Arial" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
];

const FONT_SIZES = [
  { label: "1 (Small)", value: "1" },
  { label: "2", value: "2" },
  { label: "3 (Normal)", value: "3" },
  { label: "4", value: "4" },
  { label: "5", value: "5" },
  { label: "6", value: "6" },
  { label: "7 (Huge)", value: "7" },
];

export function PdfInplaceEditor() {
  const {
    file,
    document: pdfDoc,
    currentPageIndex,
    zoom,
    numPages,
    setCurrentPageIndex,
    setZoom,
    pageEdits,
    updatePageEdit
  } = usePdfStore();

  const wrapRef = useRef<HTMLDivElement>(null);
  const visCanvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);

  const [isRendering, setIsRendering] = useState(false);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyFormat = (command: string, val?: string) => {
    document.execCommand(command, false, val);
  };

  const insertLink = () => {
    const url = prompt("Enter URL:", "https://");
    if (url) {
      applyFormat("createLink", url);
    }
  };

  const handleInsertImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        // The selection must be focused inside one of the spans
        applyFormat("insertImage", dataUrl);
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    if (!pdfDoc || !visCanvasRef.current || !textLayerRef.current) return;

    let cancelled = false;
    setIsRendering(true);

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    (async () => {
      try {
        const page = await pdfDoc.getPage(currentPageIndex + 1);
        if (cancelled) return;

        const dpr = window.devicePixelRatio || 1;
        const logVP = page.getViewport({ scale: zoom });
        const hiDvp = page.getViewport({ scale: zoom * dpr });

        const offscreen = document.createElement("canvas");
        offscreen.width = hiDvp.width;
        offscreen.height = hiDvp.height;

        const renderTask = page.render({
          canvas: offscreen,
          canvasContext: offscreen.getContext("2d")!,
          viewport: hiDvp,
        });
        renderTaskRef.current = renderTask;

        try {
          await renderTask.promise;
        } catch (err: any) {
          if (err?.name === "RenderingCancelledException") return;
          throw err;
        }
        renderTaskRef.current = null;
        if (cancelled) return;

        const vis = visCanvasRef.current!;
        vis.width = hiDvp.width;
        vis.height = hiDvp.height;
        vis.style.width = `${logVP.width}px`;
        vis.style.height = `${logVP.height}px`;
        vis.getContext("2d")!.drawImage(offscreen, 0, 0);

        if (wrapRef.current) {
          wrapRef.current.style.width = `${logVP.width}px`;
          wrapRef.current.style.height = `${logVP.height}px`;
        }

        const textContent = await page.getTextContent();
        if (cancelled) return;

        const tlDiv = textLayerRef.current!;
        tlDiv.innerHTML = "";
        tlDiv.style.width = `${logVP.width}px`;
        tlDiv.style.height = `${logVP.height}px`;

        const currentPageEdits = pageEdits[currentPageIndex] || {};

        textContent.items.forEach((item, idx) => {
          if (!("str" in item) || !item.str) return;

          const tx = pdfjsLib.Util.transform(logVP.transform, item.transform);
          const fontHeight = Math.hypot(tx[2], tx[3]);
          if (fontHeight < 2) return;

          const topPx = tx[5] - fontHeight * 0.8;
          const leftPx = tx[4];

          const editData = currentPageEdits[idx];
          const spanText = editData ? editData.text : item.str;

          const span = document.createElement("span");
          span.contentEditable = view === "edit" ? "true" : "false";
          span.spellcheck = false;
          span.innerHTML = spanText; // Support HTML for bold/italic/color

          Object.assign(span.style, {
            position: "absolute",
            left: `${leftPx}px`,
            top: `${topPx}px`,
            fontSize: `${fontHeight}px`,
            lineHeight: "1",
            whiteSpace: "pre",
            transformOrigin: "0% 0%",
            cursor: view === "edit" ? "text" : "default",
            color: view === "edit" ? "rgba(0,0,0,0.88)" : "transparent", // Only show if edited in preview to avoid double text
            background: view === "edit" ? "rgba(255,255,255,0.85)" : "transparent",
            outline: "none",
            border: "none",
            padding: "0 2px",
            borderRadius: "2px",
            pointerEvents: "auto",
            zIndex: "2",
            userSelect: "text",
            minWidth: "4px",
            display: "inline-block",
          });

          // Hack to ensure inner images don't exceed span boundary wildly 
          // (if they inserted an image via execCommand)
          const applyImageConstraints = () => {
             const imgs = span.querySelectorAll('img');
             imgs.forEach(img => {
                img.style.maxHeight = '200px';
                img.style.maxWidth = '200px';
                img.style.objectFit = 'contain';
                img.style.display = 'inline-block';
             });
          };
          applyImageConstraints();

          if (view === "preview" && editData) {
            span.style.color = "rgba(0,0,0,0.88)";
            span.style.background = "#fff";
          }

          span.addEventListener("focus", () => {
            if (view === "preview") return;
            span.style.background = "#fff";
            span.style.boxShadow = "0 0 0 2px #6366f1";
            span.style.zIndex = "10";
          });
          span.addEventListener("blur", () => {
            if (view === "preview") return;
            span.style.background = "rgba(255,255,255,0.85)";
            span.style.boxShadow = "";
            span.style.zIndex = "2";
          });
          span.addEventListener("input", () => {
            applyImageConstraints();
            updatePageEdit(currentPageIndex, idx, { 
              text: span.innerHTML || "",
              x: leftPx,
              y: topPx,
              fontHeight
            });
          });

          tlDiv.appendChild(span);
        });

        setIsRendering(false);
      } catch (err) {
        if (!cancelled) {
          console.error("Render failed:", err);
          setIsRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, currentPageIndex, zoom, view]);

  const handleExportPdf = () => {
    if (!wrapRef.current) return;
    exportToPdf(wrapRef.current.innerHTML, "edited_pdf");
  };

  const handleExportDocx = () => {
    if (!wrapRef.current) return;
    exportToDocx(wrapRef.current.innerHTML, "edited_doc.docx");
  };

  if (!file) return null;

  return (
    <>
      <input 
        type="file" 
        accept="image/*" 
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleInsertImage} 
      />
      {/* ─ Controls bar ──────────────────────────────────────────────────── */}
      <div className="bg-slate-800 border-b border-slate-700 flex flex-wrap items-center gap-1.5 px-4 py-2 text-xs text-slate-300 shrink-0 select-none min-h-[40px]">
        
        {/* Edit / Preview toggle */}
        <div className="flex items-center bg-slate-700 rounded-lg p-0.5 mr-2 shrink-0">
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

        {view === "edit" ? (
          <div className="flex items-center gap-1 flex-wrap">
            <div className="w-px h-5 bg-slate-600 mx-1" />
            
            <button className="p-1.5 rounded hover:bg-slate-700 hover:text-white" title="Undo" onMouseDown={(e) => { e.preventDefault(); applyFormat("undo"); }}><Undo className="w-4 h-4" /></button>
            <button className="p-1.5 rounded hover:bg-slate-700 hover:text-white" title="Redo" onMouseDown={(e) => { e.preventDefault(); applyFormat("redo"); }}><Redo className="w-4 h-4" /></button>
            <button className="p-1.5 rounded hover:bg-slate-700 hover:text-white" title="Clear Formatting" onMouseDown={(e) => { e.preventDefault(); applyFormat("removeFormat"); }}><Eraser className="w-4 h-4" /></button>

            <div className="w-px h-5 bg-slate-600 mx-1" />
            
            <select className="h-7 rounded bg-slate-700 text-[11px] text-white px-1 cursor-pointer border-0 w-20 focus:outline-none" onChange={(e) => applyFormat("fontName", e.target.value)}>
              <option value="">Font Family</option>
              {FONT_FAMILIES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>

            <select className="h-7 rounded bg-slate-700 text-[11px] text-white px-1 cursor-pointer border-0 w-16 focus:outline-none" onChange={(e) => applyFormat("fontSize", e.target.value)}>
              <option value="">Size</option>
              {FONT_SIZES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>

            <div className="w-px h-5 bg-slate-600 mx-1" />
            
            <button className="p-1.5 rounded hover:bg-slate-700 hover:text-white" title="Bold" onMouseDown={(e) => { e.preventDefault(); applyFormat("bold"); }}><Bold className="w-4 h-4" /></button>
            <button className="p-1.5 rounded hover:bg-slate-700 hover:text-white" title="Italic" onMouseDown={(e) => { e.preventDefault(); applyFormat("italic"); }}><Italic className="w-4 h-4" /></button>
            <button className="p-1.5 rounded hover:bg-slate-700 hover:text-white" title="Underline" onMouseDown={(e) => { e.preventDefault(); applyFormat("underline"); }}><UnderlineIcon className="w-4 h-4" /></button>
            <button className="p-1.5 rounded hover:bg-slate-700 hover:text-white" title="Strikethrough" onMouseDown={(e) => { e.preventDefault(); applyFormat("strikeThrough"); }}><Strikethrough className="w-4 h-4" /></button>
            
            <div className="w-px h-5 bg-slate-600 mx-1" />

            <button className="p-1.5 rounded hover:bg-slate-700 hover:text-white" title="Align Left" onMouseDown={(e) => { e.preventDefault(); applyFormat("justifyLeft"); }}><AlignLeft className="w-4 h-4" /></button>
            <button className="p-1.5 rounded hover:bg-slate-700 hover:text-white" title="Align Center" onMouseDown={(e) => { e.preventDefault(); applyFormat("justifyCenter"); }}><AlignCenter className="w-4 h-4" /></button>
            <button className="p-1.5 rounded hover:bg-slate-700 hover:text-white" title="Align Right" onMouseDown={(e) => { e.preventDefault(); applyFormat("justifyRight"); }}><AlignRight className="w-4 h-4" /></button>
            <button className="p-1.5 rounded hover:bg-slate-700 hover:text-white" title="Justify" onMouseDown={(e) => { e.preventDefault(); applyFormat("justifyFull"); }}><AlignJustify className="w-4 h-4" /></button>

            <div className="w-px h-5 bg-slate-600 mx-1" />

            <button className="p-1.5 rounded hover:bg-slate-700 hover:text-white" title="Bullet List" onMouseDown={(e) => { e.preventDefault(); applyFormat("insertUnorderedList"); }}><List className="w-4 h-4" /></button>
            <button className="p-1.5 rounded hover:bg-slate-700 hover:text-white" title="Numbered List" onMouseDown={(e) => { e.preventDefault(); applyFormat("insertOrderedList"); }}><ListOrdered className="w-4 h-4" /></button>
            
            <div className="w-px h-5 bg-slate-600 mx-1" />

            <button className="p-1.5 rounded hover:bg-slate-700 hover:text-white" title="Insert Link" onMouseDown={(e) => { e.preventDefault(); insertLink(); }}><Link2 className="w-4 h-4" /></button>
            <button className="p-1.5 rounded hover:bg-slate-700 hover:text-white" title="Insert Inline Image" onMouseDown={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}><ImageIcon className="w-4 h-4 text-emerald-400" /></button>

            <div className="w-px h-5 bg-slate-600 mx-1" />

            <label className="flex items-center gap-1 cursor-pointer hover:bg-slate-700 p-1 rounded" title="Text Color">
              <Palette className="w-4 h-4 text-indigo-400" />
              <input type="color" defaultValue="#000000" className="w-4 h-4 rounded cursor-pointer p-0 border-0 bg-transparent"
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => applyFormat("foreColor", e.target.value)} />
            </label>

            <label className="flex items-center gap-1 cursor-pointer hover:bg-slate-700 p-1 rounded" title="Highlight Color">
              <Highlighter className="w-4 h-4 text-amber-400" />
              <input type="color" defaultValue="#ffff00" className="w-4 h-4 rounded cursor-pointer p-0 border-0 bg-transparent"
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  applyFormat("hiliteColor", e.target.value);
                }} />
            </label>
          </div>
        ) : (
          <span className="font-medium text-slate-500">Previewing document modifications</span>
        )}
        
        <div className="flex-1" />

        <div className="flex items-center gap-2 mr-4">
          <button 
            onClick={handleExportPdf}
            className="flex items-center gap-2 px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors font-bold"
          >
            <Download className="w-3 h-3" /> PDF
          </button>
          <button 
            onClick={handleExportDocx}
            className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-bold"
          >
            <FileText className="w-3 h-3" /> Word
          </button>
        </div>

        <div className="w-px h-4 bg-slate-600" />
        
        {/* Zoom controls */}
        <button
          className="px-2 py-1 rounded hover:bg-slate-700 transition-colors"
          onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
        >− Zoom</button>
        <span className="tabular-nums w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button
          className="px-2 py-1 rounded hover:bg-slate-700 transition-colors"
          onClick={() => setZoom(Math.min(4, zoom + 0.25))}
        >+ Zoom</button>

        <div className="w-px h-4 bg-slate-600" />

        {/* Page navigation */}
        <button
          className="px-2 py-1 rounded hover:bg-slate-700 transition-colors disabled:opacity-40"
          disabled={currentPageIndex <= 0}
          onClick={() => setCurrentPageIndex(currentPageIndex - 1)}
        >← Prev</button>
        <span className="tabular-nums">
          Page {currentPageIndex + 1} / {numPages}
        </span>
        <button
          className="px-2 py-1 rounded hover:bg-slate-700 transition-colors disabled:opacity-40"
          disabled={currentPageIndex >= numPages - 1}
          onClick={() => setCurrentPageIndex(currentPageIndex + 1)}
        >Next →</button>
      </div>

      {/* ─ Page area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-slate-400 flex justify-center items-start p-8">

        {isRendering && (
          <div className="fixed inset-0 flex items-center justify-center z-30 pointer-events-none">
            <div className="bg-slate-800/90 text-slate-200 text-sm rounded-lg px-5 py-3 shadow-lg">
              Rendering page…
            </div>
          </div>
        )}

        <div
          ref={wrapRef}
          className="relative shadow-2xl bg-white"
          style={{ minWidth: 100, minHeight: 100 }}
        >
          <canvas ref={visCanvasRef} className="block" />
          <div
            ref={textLayerRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              overflow: "hidden",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
    </>
  );
}
