"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { usePdfStore } from "@/lib/store";
import { Canvas, Image } from "fabric";

// Initialize the PDF.js worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

export function PdfViewer() {
  const { file, document, currentPageIndex, zoom, setDocument, setFabricCanvas, pageEdits } = usePdfStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isRendered, setIsRendered] = useState(false);

  // 1. Load the PDF Document from the File object
  useEffect(() => {
    if (!file) return;

    let isDocumentActive = true;

    const loadDocument = async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;

        if (isDocumentActive) {
          setDocument(pdfDoc);
        }
      } catch (error) {
        console.error("Failed to load PDF:", error);
      }
    };

    loadDocument();

    return () => {
      isDocumentActive = false;
    };
  }, [file, setDocument]);

  // 2. Render the Active Page to HTML Canvas and Text Layer
  useEffect(() => {
    let renderTask: pdfjsLib.RenderTask | null = null;
    let isActive = true;

    const renderPage = async () => {
      if (!document || !pdfCanvasRef.current || !textLayerRef.current) return;
      setIsRendered(false);

      try {
        const page = await document.getPage(currentPageIndex + 1);

        // High DPI (Retina) display support
        const pixelRatio = window.devicePixelRatio || 1;
        const logicalViewport = page.getViewport({ scale: zoom });
        const renderViewport = page.getViewport({ scale: zoom * pixelRatio });

        const canvas = pdfCanvasRef.current;
        const context = canvas.getContext("2d");

        if (!context || !isActive) return;

        // Set physical resolution
        canvas.height = renderViewport.height;
        canvas.width = renderViewport.width;

        // Set logical CSS resolution
        canvas.style.width = `${logicalViewport.width}px`;
        canvas.style.height = `${logicalViewport.height}px`;

        // Store logical dimensions state for Fabric.js to use later
        canvas.dataset.logicalWidth = logicalViewport.width.toString();
        canvas.dataset.logicalHeight = logicalViewport.height.toString();

        const renderContext = {
          canvasContext: context,
          viewport: renderViewport,
          canvas: canvas as any
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;

        if (!isActive) return;

        // Render text overlay for edits
        const textContent = await page.getTextContent();
        if (!isActive) return;

        const tlDiv = textLayerRef.current;
        tlDiv.innerHTML = "";
        tlDiv.style.width = `${logicalViewport.width}px`;
        tlDiv.style.height = `${logicalViewport.height}px`;

        const currentPageEdits = usePdfStore.getState().pageEdits[currentPageIndex] || {};

        textContent.items.forEach((item, idx) => {
          if (!("str" in item) || !item.str) return;
          const editData = currentPageEdits[idx];
          
          // Only show span if user made an edit
          if (!editData) return;

          const tx = pdfjsLib.Util.transform(logicalViewport.transform, item.transform);
          const fontHeight = Math.hypot(tx[2], tx[3]);
          if (fontHeight < 2) return;

          const topPx = tx[5] - fontHeight * 0.8;
          const leftPx = tx[4];

          const span = window.document.createElement("span");
          span.innerHTML = editData.text; // Contains formatting
          Object.assign(span.style, {
            position: "absolute",
            left: `${leftPx}px`,
            top: `${topPx}px`,
            fontSize: `${fontHeight}px`,
            lineHeight: "1",
            whiteSpace: "pre",
            transformOrigin: "0% 0%",
            color: "rgba(0,0,0,0.88)",
            background: "#fff", // Hide original text
            pointerEvents: "none",
            zIndex: "5",
            display: "inline-block",
            fontFamily: "sans-serif"
          });
          
          tlDiv.appendChild(span);
        });

        setIsRendered(true);
      } catch (error) {
        if (error instanceof pdfjsLib.RenderingCancelledException) {
          // Normal during fast re-renders
        } else {
          console.error("Error rendering page:", error);
        }
      }
    };

    renderPage();

    return () => {
      isActive = false;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [document, currentPageIndex, zoom, pageEdits]); // Re-render if string changes

  // 3. Initialize Fabric.js Overlay once PDF is rendered
  useEffect(() => {
    if (!isRendered || !pdfCanvasRef.current || !fabricCanvasRef.current || !containerRef.current) return;

    let isMounted = true;

    // Destroy existing canvas if any
    const existingFabricCanvas = usePdfStore.getState().fabricCanvas;
    if (existingFabricCanvas) {
      existingFabricCanvas.dispose();
    }

    const pdfCanvas = pdfCanvasRef.current;
    const logicalWidth = parseFloat(pdfCanvas.dataset.logicalWidth || String(pdfCanvas.width));
    const logicalHeight = parseFloat(pdfCanvas.dataset.logicalHeight || String(pdfCanvas.height));

    // Explicitly size the container to match
    containerRef.current.style.width = `${logicalWidth}px`;
    containerRef.current.style.height = `${logicalHeight}px`;

    // Initialize Fabric Canvas
    const fCanvas = new Canvas(fabricCanvasRef.current, {
      width: logicalWidth,
      height: logicalHeight,
      selection: true,
      isDrawingMode: false,
    });

    const storedData = usePdfStore.getState().pageAnnotations[currentPageIndex];
    if (storedData) {
      fCanvas.loadFromJSON(storedData).then(() => {
        if (!isMounted) return;
        fCanvas.renderAll();
        setFabricCanvas(fCanvas);
      }).catch(err => {
        if (!isMounted) return;
        console.error("Failed to restore canvas state:", err);
        setFabricCanvas(fCanvas);
      });
    } else {
      setFabricCanvas(fCanvas);
    }

    return () => {
      isMounted = false;
      // NOTE: the store captures the JSON on unmount/page change before this dispose
      fCanvas.dispose();
      setFabricCanvas(null);
    };
  }, [isRendered, currentPageIndex, setFabricCanvas]);

  if (!file) return null;

  return (
    <div className="relative overflow-auto w-full h-full flex justify-center items-start bg-slate-900 p-8">
      <div
        ref={containerRef}
        className="relative shadow-2xl bg-white"
        style={{
          // Container matches the dynamic dimension of the canvases
        }}
      >
        {/* Visible PDF.js Canvas (Base Layer) */}
        <canvas
          ref={pdfCanvasRef}
          className="absolute top-0 left-0 z-0 pointer-events-none"
        />

        {/* Text edits layer */}
        <div
            ref={textLayerRef}
            className="absolute top-0 left-0 z-5 pointer-events-none overflow-hidden"
        />

        {/* Transparent Fabric.js Canvas (Interaction Layer) */}
        <div className="absolute top-0 left-0 z-10 w-full h-full">
          <canvas ref={fabricCanvasRef} />
        </div>
      </div>
    </div>
  );
}
