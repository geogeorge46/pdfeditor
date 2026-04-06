"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { usePdfStore } from "@/lib/store";
import { 
  Bold, Italic, Underline, Type, 
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Maximize2, Eye, Download, FileText
} from "lucide-react";
import { exportToPdf, exportToDocx } from "@/lib/exportUtils";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

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
    updatePageEdit,
    isPreviewMode,
    setIsPreviewMode
  } = usePdfStore();

  const wrapRef       = useRef<HTMLDivElement>(null);
  const visCanvasRef  = useRef<HTMLCanvasElement>(null);
  const textLayerRef  = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);

  const [isRendering, setIsRendering]   = useState(false);
  const [activeSpanIdx, setActiveSpanIdx] = useState<number | null>(null);

  // ── Render PDF & Build Interactive Spans ──────────────────────────────────
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

        const dpr   = window.devicePixelRatio || 1;
        const logVP = page.getViewport({ scale: zoom });
        const hiDvp = page.getViewport({ scale: zoom * dpr });

        // 1. Offscreen render
        const offscreen = document.createElement("canvas");
        offscreen.width  = hiDvp.width;
        offscreen.height = hiDvp.height;

        const renderTask = page.render({
          canvas: offscreen,
          canvasContext: offscreen.getContext("2d")!,
          viewport: hiDvp,
        });
        renderTaskRef.current = renderTask;

        try { await renderTask.promise; } catch (err: any) {
          if (err?.name === "RenderingCancelledException") return;
          throw err;
        }
        renderTaskRef.current = null;
        if (cancelled) return;

        // 2. Visible blit
        const vis = visCanvasRef.current!;
        vis.width        = hiDvp.width;
        vis.height       = hiDvp.height;
        vis.style.width  = `${logVP.width}px`;
        vis.style.height = `${logVP.height}px`;
        vis.getContext("2d")!.drawImage(offscreen, 0, 0);

        if (wrapRef.current) {
          wrapRef.current.style.width  = `${logVP.width}px`;
          wrapRef.current.style.height = `${logVP.height}px`;
        }

        // 3. Text Overlay
        const textContent = await page.getTextContent();
        if (cancelled) return;

        const tlDiv = textLayerRef.current!;
        tlDiv.innerHTML    = "";
        tlDiv.style.width  = `${logVP.width}px`;
        tlDiv.style.height = `${logVP.height}px`;

        const currentPageEdits = pageEdits[currentPageIndex] || {};

        textContent.items.forEach((item, idx) => {
          if (!("str" in item) || !item.str) return;

          const tx = pdfjsLib.Util.transform(logVP.transform, item.transform);
          const fontHeight = Math.hypot(tx[2], tx[3]);
          if (fontHeight < 2) return;

          const topPx  = tx[5] - fontHeight * 0.8;
          const leftPx = tx[4];

          const editData = currentPageEdits[idx];
          const spanText = editData ? editData.text : item.str;
          const spanStyle = editData ? editData.styles : {};

          const span = document.createElement("span");
          span.contentEditable = isPreviewMode ? "false" : "true";
          span.spellcheck      = false;
          span.textContent     = spanText;

          const baseStyles = {
            position:        "absolute",
            left:            `${leftPx}px`,
            top:             `${topPx}px`,
            fontSize:        `${fontHeight}px`,
            lineHeight:      "1",
            whiteSpace:      "pre",
            transformOrigin: "0% 0%",
            cursor:          isPreviewMode ? "default" : "text",
            color:           spanStyle.color || "rgba(0,0,0,0.88)",
            background:      isPreviewMode ? "transparent" : "rgba(255,255,255,0.7)",
            outline:         "none",
            border:          isPreviewMode ? "none" : "1px solid transparent",
            borderRadius:    "1px",
            pointerEvents:   "auto",
            zIndex:          "2",
            userSelect:      "text",
            fontWeight:      spanStyle.fontWeight || "normal",
            fontStyle:       spanStyle.fontStyle || "normal",
            textDecoration:  spanStyle.textDecoration || "none",
          };

          Object.assign(span.style, baseStyles);

          // Interaction events
          span.addEventListener("focus", () => {
            if (isPreviewMode) return;
            setActiveSpanIdx(idx);
            span.style.background = "#fff";
            span.style.border     = "1px solid #6366f1";
            span.style.zIndex     = "10";
          });

          span.addEventListener("blur", () => {
            span.style.background = isPreviewMode ? "transparent" : "rgba(255,255,255,0.7)";
            span.style.border     = isPreviewMode ? "none" : "1px solid transparent";
            span.style.zIndex     = "2";
          });

          span.addEventListener("input", () => {
            updatePageEdit(currentPageIndex, idx, { text: span.textContent || "" });
          });

          tlDiv.appendChild(span);
        });

        setIsRendering(false);
      } catch (err) {
        if (!cancelled) { console.error("Render failed:", err); setIsRendering(false); }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) renderTaskRef.current.cancel();
    };
  }, [pdfDoc, currentPageIndex, zoom, isPreviewMode]); // Re-render when preview mode changes to lock/unlock spans

  // ── Toolbar Logic ──────────────────────────────────────────────────────────
  const toggleStyle = (key: string, value: string, defaultValue = "normal") => {
    if (activeSpanIdx === null) return;
    const currentEdit = pageEdits[currentPageIndex]?.[activeSpanIdx] || { text: "", styles: {} };
    const currentVal  = (currentEdit.styles as any)[key];
    const newVal      = currentVal === value ? defaultValue : value;
    
    const span = textLayerRef.current?.children[activeSpanIdx] as HTMLSpanElement;

    updatePageEdit(currentPageIndex, activeSpanIdx, { 
      styles: { [key]: newVal },
      x: span ? parseFloat(span.style.left) : (currentEdit as any).x,
      y: span ? parseFloat(span.style.top) : (currentEdit as any).y,
      fontHeight: span ? parseFloat(span.style.fontSize) : (currentEdit as any).fontHeight,
      text: span ? (span.textContent || "") : currentEdit.text
    });
    
    if (span) {
      (span.style as any)[key] = newVal;
    }
  };

  const handleExportPdf = () => {
    if (!wrapRef.current) return;
    // We pass the container HTML which has absolute positioned spans
    exportToPdf(wrapRef.current.outerHTML, "edited_pdf");
  };

  const handleExportDocx = () => {
    if (!wrapRef.current) return;
    exportToDocx(wrapRef.current.outerHTML, "edited_doc.docx");
  };

  if (!file) return null;

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden bg-slate-100">
      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="h-12 bg-white border-b border-slate-200 flex items-center px-4 gap-2 shadow-sm shrink-0 z-20">
        <div className="flex items-center gap-1 mr-4">
          <ButtonTool 
            icon={<Bold className="w-4 h-4" />} 
            active={pageEdits[currentPageIndex]?.[activeSpanIdx!]?.styles.fontWeight === 'bold'}
            onClick={() => toggleStyle('fontWeight', 'bold')}
            disabled={activeSpanIdx === null || isPreviewMode} 
          />
          <ButtonTool 
            icon={<Italic className="w-4 h-4" />} 
            active={pageEdits[currentPageIndex]?.[activeSpanIdx!]?.styles.fontStyle === 'italic'}
            onClick={() => toggleStyle('fontStyle', 'italic')}
            disabled={activeSpanIdx === null || isPreviewMode} 
          />
          <ButtonTool 
            icon={<Underline className="w-4 h-4" />} 
            active={pageEdits[currentPageIndex]?.[activeSpanIdx!]?.styles.textDecoration === 'underline'}
            onClick={() => toggleStyle('textDecoration', 'underline')}
            disabled={activeSpanIdx === null || isPreviewMode} 
          />
          <div className="w-px h-6 bg-slate-200 mx-1" />
          <input 
            type="color" 
            className="w-6 h-6 p-0 border-none bg-transparent cursor-pointer disabled:opacity-30" 
            value={pageEdits[currentPageIndex]?.[activeSpanIdx!]?.styles.color || "#000000"}
            onChange={(e) => toggleStyle('color', e.target.value)}
            disabled={activeSpanIdx === null || isPreviewMode}
          />
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 mr-4">
          <button 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              isPreviewMode ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            onClick={() => setIsPreviewMode(!isPreviewMode)}
          >
            {isPreviewMode ? <Maximize2 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {isPreviewMode ? "Exit Preview" : "Preview"}
          </button>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          <button className="px-2 py-1 hover:bg-white rounded transition-colors" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}><ZoomOut className="w-4 h-4"/></button>
          <span className="text-xs font-bold w-12 text-center text-slate-600">{Math.round(zoom * 100)}%</span>
          <button className="px-2 py-1 hover:bg-white rounded transition-colors" onClick={() => setZoom(Math.min(4, zoom + 0.25))}><ZoomIn className="w-4 h-4"/></button>
        </div>

        <div className="flex items-center gap-2 ml-4">
          <button 
            onClick={handleExportPdf}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5" /> PDF
          </button>
          <button 
            onClick={handleExportDocx}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-bold hover:bg-blue-700 transition-all shadow-sm"
          >
            <FileText className="w-3.5 h-3.5" /> Word
          </button>
        </div>
      </div>

      {/* ── Secondary Nav ──────────────────────────────────────────────── */}
      <div className="h-8 bg-slate-50 border-b border-slate-200 flex items-center justify-between px-4 text-[10px] uppercase tracking-wider text-slate-500 font-bold shrink-0">
        <div className="flex items-center gap-4">
          <span>{file.name}</span>
          <span>{numPages} Pages</span>
        </div>
        <div className="flex items-center gap-3">
          <button disabled={currentPageIndex <= 0} onClick={() => setCurrentPageIndex(currentPageIndex - 1)} className="hover:text-indigo-600 disabled:opacity-30"><ChevronLeft className="w-3 h-3"/></button>
          <span>Page {currentPageIndex + 1} of {numPages}</span>
          <button disabled={currentPageIndex >= numPages - 1} onClick={() => setCurrentPageIndex(currentPageIndex + 1)} className="hover:text-indigo-600 disabled:opacity-30"><ChevronRight className="w-3 h-3"/></button>
        </div>
      </div>

      {/* ── Editor Canvas ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-slate-200 flex justify-center items-start p-10 pt-4 custom-scrollbar">
        {isRendering && (
          <div className="fixed bottom-10 right-10 z-50 animate-bounce">
            <div className="bg-indigo-600 text-white text-[10px] font-bold px-4 py-2 rounded-full shadow-2xl">
              Updating View...
            </div>
          </div>
        )}

        <div
          ref={wrapRef}
          className={`relative bg-white transition-shadow duration-300 ${isPreviewMode ? 'shadow-2xl' : 'shadow-lg ring-1 ring-slate-300'}`}
          style={{ minWidth: 100, minHeight: 100 }}
        >
          {/* Base Layer: PDF Visuals */}
          <canvas ref={visCanvasRef} className="block" />

          {/* Top Layer: Interactive Editable Spans */}
          <div
            ref={textLayerRef}
            className="absolute inset-0 overflow-hidden pointer-events-none print:pointer-events-none"
          />
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #e2e8f0; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #64748b; }
      `}</style>
    </div>
  );
}

function ButtonTool({ icon, onClick, active = false, disabled = false }: any) {
  return (
    <button 
      disabled={disabled}
      onClick={onClick}
      className={`p-1.5 rounded transition-all ${
        active 
          ? 'bg-indigo-100 text-indigo-700 shadow-inner' 
          : 'hover:bg-slate-100 text-slate-500 hover:text-slate-900 disabled:opacity-20'
      }`}
    >
      {icon}
    </button>
  );
}
