"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { usePdfStore } from "@/lib/store";

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
  } = usePdfStore();

  const wrapRef       = useRef<HTMLDivElement>(null);
  const visCanvasRef  = useRef<HTMLCanvasElement>(null);
  const textLayerRef  = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);

  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    if (!pdfDoc || !visCanvasRef.current || !textLayerRef.current) return;

    let cancelled = false;
    setIsRendering(true);

    // Cancel any previous in-flight PDF render (it has its own offscreen canvas,
    // so there is no "same canvas" collision — we cancel just to save CPU)
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

        // ── 1. Render to a freshly-created offscreen canvas ────────────────
        //    Each render call owns its own canvas element, so concurrent renders
        //    can never collide on the same canvas object.
        const offscreen = document.createElement("canvas");
        offscreen.width  = hiDvp.width;
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

        // ── 2. Blit finished pixels → the visible canvas ───────────────────
        const vis = visCanvasRef.current!;
        vis.width        = hiDvp.width;
        vis.height       = hiDvp.height;
        vis.style.width  = `${logVP.width}px`;
        vis.style.height = `${logVP.height}px`;
        vis.getContext("2d")!.drawImage(offscreen, 0, 0);

        // ── 3. Resize the wrapper to match logical CSS dimensions ──────────
        if (wrapRef.current) {
          wrapRef.current.style.width  = `${logVP.width}px`;
          wrapRef.current.style.height = `${logVP.height}px`;
        }

        // ── 4. Build editable text overlay ────────────────────────────────
        //    We call page.getTextContent() and use pdfjsLib.Util.transform()
        //    to convert each text-item transform into CSS pixel coordinates.
        //    We then create our own contenteditable <span> elements positioned
        //    exactly over the canvas text — bypassing the TextLayer class
        //    whose span structure changed in pdfjs-dist v5 and broke pointer
        //    events.
        const textContent = await page.getTextContent();
        if (cancelled) return;

        const tlDiv = textLayerRef.current!;
        tlDiv.innerHTML    = "";
        tlDiv.style.width  = `${logVP.width}px`;
        tlDiv.style.height = `${logVP.height}px`;

        for (const item of textContent.items) {
          // Skip marks and empty strings
          if (!("str" in item) || !item.str) continue;

          // Convert the PDF text-item transform matrix →
          // viewport (CSS-pixel) coordinates.
          // tx = [a, b, c, d, e, f]  (2-D affine matrix)
          const tx = pdfjsLib.Util.transform(logVP.transform, item.transform);

          // Font height ≈ the y-scale component of the combined matrix
          const fontHeight = Math.hypot(tx[2], tx[3]);
          if (fontHeight < 2) continue; // skip invisible micro-text

          // tx[5] is the baseline y-position in CSS pixels (from top).
          // CSS `top` needs the UPPER edge of the element.
          // Typical ascent ≈ 80 % of the font height.
          const topPx  = tx[5] - fontHeight * 0.8;
          const leftPx = tx[4];

          const span = document.createElement("span");
          span.contentEditable = "true";
          span.spellcheck      = false;
          span.textContent     = item.str;

          Object.assign(span.style, {
            position:        "absolute",
            left:            `${leftPx}px`,
            top:             `${topPx}px`,
            fontSize:        `${fontHeight}px`,
            lineHeight:      "1",
            whiteSpace:      "pre",
            transformOrigin: "0% 0%",
            cursor:          "text",
            color:           "rgba(0,0,0,0.88)",
            background:      "rgba(255,255,255,0.85)",
            outline:         "none",
            border:          "none",
            padding:         "0 2px",
            borderRadius:    "2px",
            pointerEvents:   "auto",
            zIndex:          "2",
            userSelect:      "text",
            minWidth:        "4px",
            display:         "inline-block",
          });

          span.addEventListener("focus", () => {
            span.style.background = "#fff";
            span.style.boxShadow  = "0 0 0 2px #6366f1";
            span.style.zIndex     = "10";
          });
          span.addEventListener("blur", () => {
            span.style.background = "rgba(255,255,255,0.85)";
            span.style.boxShadow  = "";
            span.style.zIndex     = "2";
          });

          tlDiv.appendChild(span);
        }

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
  }, [pdfDoc, currentPageIndex, zoom]);

  if (!file) return null;

  return (
    <>
      {/* ─ Controls bar ──────────────────────────────────────────────────── */}
      <div className="h-10 bg-slate-800 border-b border-slate-700 flex items-center gap-3 px-4 text-xs text-slate-300 shrink-0 select-none">
        <span className="font-medium text-indigo-300">✏ Click any text to edit it in place</span>
        <div className="flex-1" />

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

        {/*
          The page card:
            - position:relative so the absolute text-layer aligns to it
            - canvas renders the full PDF visually
            - textLayerRef div sits on top with pointer-events editable spans
        */}
        <div
          ref={wrapRef}
          className="relative shadow-2xl bg-white"
          style={{ minWidth: 100, minHeight: 100 }}
        >
          {/* PDF visual rendering (canvas) */}
          <canvas ref={visCanvasRef} className="block" />

          {/* Editable text overlay — spans positioned over canvas text */}
          <div
            ref={textLayerRef}
            style={{
              position:      "absolute",
              top:           0,
              left:          0,
              overflow:      "hidden",
              pointerEvents: "none",   // container: transparent to mouse
            }}
          />
        </div>
      </div>
    </>
  );
}
