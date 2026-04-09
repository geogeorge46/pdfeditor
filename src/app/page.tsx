"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  FileUp, Settings, FileText, Download, X, Square, Circle, Minus, ArrowRight, StickyNote,
  Type, Pen, MousePointer, Highlighter, Eraser, ZoomIn, ZoomOut,
  FileEdit, Eye,
} from "lucide-react";
import { usePdfStore } from "@/lib/store";
import dynamic from "next/dynamic";
import { Rect, IText, PencilBrush, Ellipse, Line as FabricLine, Triangle as FabricTriangle, Group, Image as FabricImage } from "fabric";
import {
  mergePdfFiles,
  splitPdfByRanges,
  duplicatePageAt,
  deletePageAt,
  insertBlankPageAt,
  rotatePageAt,
  cropPageMarginsAt,
} from "@/lib/pageOps";

const PdfViewer = dynamic(() => import("@/components/PdfViewer").then(mod => mod.PdfViewer), {
  ssr: false,
});
const PdfInplaceEditor = dynamic(() => import("@/components/PdfInplaceEditor").then(mod => mod.PdfInplaceEditor), {
  ssr: false,
});
const DocumentEditor = dynamic(() => import("@/components/DocumentEditor").then(mod => mod.DocumentEditor), {
  ssr: false,
});

type ToolId = 'select' | 'draw' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'note' | 'highlight' | 'erase';
type AppMode = 'annotate' | 'inplace' | 'document';

interface Tool {
  id: ToolId;
  icon: React.ReactNode;
  label: string;
}

const TOOLS: Tool[] = [
  { id: 'select',    icon: <MousePointer className="w-5 h-5" />, label: 'Select & Move' },
  { id: 'draw',      icon: <Pen className="w-5 h-5" />,          label: 'Freehand Draw' },
  { id: 'highlight', icon: <Highlighter className="w-5 h-5" />,  label: 'Highlight' },
  { id: 'rect',      icon: <Square className="w-5 h-5" />,       label: 'Rectangle' },
  { id: 'ellipse',   icon: <Circle className="w-5 h-5" />,       label: 'Ellipse' },
  { id: 'line',      icon: <Minus className="w-5 h-5" />,        label: 'Line' },
  { id: 'arrow',     icon: <ArrowRight className="w-5 h-5" />,   label: 'Arrow' },
  { id: 'text',      icon: <Type className="w-5 h-5" />,         label: 'Add Text Box' },
  { id: 'note',      icon: <StickyNote className="w-5 h-5" />,   label: 'Sticky Note' },
  { id: 'erase',     icon: <Eraser className="w-5 h-5" />,       label: 'Erase Object' },
];

export default function Home() {
  const {
    file, setFile,
    currentPageIndex, numPages, setCurrentPageIndex,
    zoom, setZoom,
  } = usePdfStore();

  const fabricCanvas = usePdfStore((s) => s.fabricCanvas);

  const [isDragging, setIsDragging]   = useState(false);
  const [activeTool, setActiveTool]   = useState<ToolId>('select');
  // Keep original landing experience; switch mode after file load.
  const [appMode, setAppMode]         = useState<AppMode>('annotate');
  const [highlightOpacity, setHighlightOpacity] = useState(0.4);
  const [highlightWidth, setHighlightWidth] = useState(18);
  const [customStamp, setCustomStamp] = useState("REVIEWED");
  const [showPageOps, setShowPageOps] = useState(false);
  const [splitRanges, setSplitRanges] = useState("");
  const [cropMarginPt, setCropMarginPt] = useState(18);
  const [isPageOpBusy, setIsPageOpBusy] = useState(false);
  const [selectedImage, setSelectedImage] = useState<any | null>(null);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropW, setCropW] = useState(0);
  const [cropH, setCropH] = useState(0);
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const replaceImageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Callback passed to DocumentEditor: receives the generated PDF File
  // and loads it into the store so Annotate / Edit-over-PDF can open it.
  const handleSaveToAnnotate = useCallback((savedFile: File) => {
    setFile(savedFile);
    setAppMode('annotate');
  }, [setFile]);

  // Apply the tool to active Fabric canvas
  useEffect(() => {
    if (!fabricCanvas) return;

    fabricCanvas.isDrawingMode = false;
    fabricCanvas.selection = true;

    switch (activeTool) {
      case 'select':
        break;

      case 'draw': {
        fabricCanvas.isDrawingMode = true;
        const brush = new PencilBrush(fabricCanvas);
        brush.color = '#e53e3e';
        brush.width = 3;
        fabricCanvas.freeDrawingBrush = brush;
        break;
      }

      case 'highlight': {
        fabricCanvas.isDrawingMode = true;
        const hBrush = new PencilBrush(fabricCanvas);
        hBrush.color  = `rgba(250, 204, 21, ${Math.max(0.05, Math.min(1, highlightOpacity))})`;
        hBrush.width  = Math.max(2, Math.min(60, highlightWidth));
        fabricCanvas.freeDrawingBrush = hBrush;
        break;
      }

      case 'rect': {
        const rect = new Rect({
          left: 80, top: 80,
          fill: 'transparent',
          stroke: '#4f46e5',
          strokeWidth: 2,
          width: 160, height: 100,
          strokeUniform: true,
        });
        fabricCanvas.add(rect);
        fabricCanvas.setActiveObject(rect);
        fabricCanvas.requestRenderAll();
        setActiveTool('select');
        break;
      }

      case 'ellipse': {
        const ellipse = new Ellipse({
          left: 80, top: 80,
          rx: 90, ry: 50,
          fill: 'transparent',
          stroke: '#0ea5e9',
          strokeWidth: 2,
        });
        fabricCanvas.add(ellipse);
        fabricCanvas.setActiveObject(ellipse);
        fabricCanvas.requestRenderAll();
        setActiveTool('select');
        break;
      }

      case 'line': {
        const line = new FabricLine([80, 80, 260, 80], {
          stroke: '#f59e0b',
          strokeWidth: 3,
          selectable: true,
        });
        fabricCanvas.add(line);
        fabricCanvas.setActiveObject(line);
        fabricCanvas.requestRenderAll();
        setActiveTool('select');
        break;
      }

      case 'arrow': {
        const line = new FabricLine([0, 0, 160, 0], {
          stroke: '#8b5cf6',
          strokeWidth: 3,
          originX: 'left',
          originY: 'center',
        });
        const head = new FabricTriangle({
          left: 160,
          top: 0,
          width: 14,
          height: 14,
          fill: '#8b5cf6',
          angle: 90,
          originX: 'center',
          originY: 'center',
        });
        const arrow = new Group([line, head], { left: 80, top: 80 });
        fabricCanvas.add(arrow);
        fabricCanvas.setActiveObject(arrow);
        fabricCanvas.requestRenderAll();
        setActiveTool('select');
        break;
      }

      case 'text': {
        const text = new IText('Type here…', {
          left: 80, top: 80,
          fontFamily: 'sans-serif',
          fontSize: 20,
          fill: '#1e293b',
        });
        fabricCanvas.add(text);
        fabricCanvas.setActiveObject(text);
        text.enterEditing();
        fabricCanvas.requestRenderAll();
        setActiveTool('select');
        break;
      }

      case 'note': {
        const note = new IText('Note...', {
          left: 80, top: 80,
          fontFamily: 'sans-serif',
          fontSize: 16,
          fill: '#111827',
          backgroundColor: '#fef08a',
        });
        fabricCanvas.add(note);
        fabricCanvas.setActiveObject(note);
        note.enterEditing();
        fabricCanvas.requestRenderAll();
        setActiveTool('select');
        break;
      }

      case 'erase': {
        const deleteActive = () => {
          const active = fabricCanvas.getActiveObjects();
          if (active.length) {
            fabricCanvas.remove(...active);
            fabricCanvas.discardActiveObject();
            fabricCanvas.requestRenderAll();
          }
        };
        fabricCanvas.on('mouse:down', deleteActive);
        (fabricCanvas as any).__eraseListener = deleteActive;
        break;
      }
    }

    return () => {
      const listener = (fabricCanvas as any).__eraseListener;
      if (listener && activeTool !== 'erase') {
        fabricCanvas.off('mouse:down', listener);
        delete (fabricCanvas as any).__eraseListener;
      }
    };
  }, [activeTool, fabricCanvas, highlightOpacity, highlightWidth]);

  const addStamp = (label: string, color: string) => {
    if (!fabricCanvas) return;
    const stamp = new IText(label, {
      left: 100,
      top: 100,
      fontFamily: 'Arial',
      fontSize: 22,
      fontWeight: 'bold',
      fill: color,
      stroke: color,
      strokeWidth: 0.3,
      backgroundColor: 'rgba(255,255,255,0.75)',
      charSpacing: 30,
      angle: -12,
    });
    fabricCanvas.add(stamp);
    fabricCanvas.setActiveObject(stamp);
    fabricCanvas.requestRenderAll();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) { setFile(e.target.files[0]); setAppMode('inplace'); }
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (f.type === 'application/pdf') {
      setFile(f);
      setAppMode('inplace');
      return;
    }
    if (f.type.startsWith('image/') && appMode === 'annotate' && fabricCanvas) {
      void placeImageOnCanvas(f);
      return;
    }
    alert('Please upload a PDF file, or drop an image while in Annotate mode.');
  };
  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation(); setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setAppMode('annotate');
  };

  const canvasReady = !!fabricCanvas;
  const isDocMode = appMode === 'document';

  const applyPageOp = async (op: () => Promise<File>) => {
    if (!file) return;
    setIsPageOpBusy(true);
    try {
      const nextFile = await op();
      setFile(nextFile);
      setAppMode('inplace');
    } finally {
      setIsPageOpBusy(false);
    }
  };

  const placeImageOnCanvas = async (imgFile: File, replaceTarget?: any) => {
    if (!fabricCanvas) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string) || "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(imgFile);
    });

    const imgObj = await FabricImage.fromURL(dataUrl);
    imgObj.set({
      left: replaceTarget?.left ?? 120,
      top: replaceTarget?.top ?? 120,
      angle: replaceTarget?.angle ?? 0,
      scaleX: replaceTarget?.scaleX ?? 0.35,
      scaleY: replaceTarget?.scaleY ?? 0.35,
    });

    if (replaceTarget) {
      fabricCanvas.remove(replaceTarget);
    }

    fabricCanvas.add(imgObj);
    fabricCanvas.setActiveObject(imgObj);
    fabricCanvas.requestRenderAll();
  };

  const handleMergePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    if (!file || picked.length === 0) return;
    const files = [file, ...picked];
    await applyPageOp(() => mergePdfFiles(files, "merged.pdf"));
    if (mergeInputRef.current) mergeInputRef.current.value = "";
  };

  const handleInsertImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    await placeImageOnCanvas(f);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleReplaceImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image/") || !selectedImage) return;
    await placeImageOnCanvas(f, selectedImage);
    if (replaceImageInputRef.current) replaceImageInputRef.current.value = "";
  };

  useEffect(() => {
    if (!fabricCanvas) return;
    const onSelect = () => {
      const obj: any = fabricCanvas.getActiveObject();
      if (obj && (obj.type === "image" || obj.constructor?.name?.toLowerCase().includes("image"))) {
        setSelectedImage(obj);
        setCropX(Number(obj.cropX || 0));
        setCropY(Number(obj.cropY || 0));
        setCropW(Number(obj.width || 0));
        setCropH(Number(obj.height || 0));
      } else {
        setSelectedImage(null);
      }
    };
    fabricCanvas.on("selection:created", onSelect);
    fabricCanvas.on("selection:updated", onSelect);
    fabricCanvas.on("selection:cleared", onSelect);
    return () => {
      fabricCanvas.off("selection:created", onSelect);
      fabricCanvas.off("selection:updated", onSelect);
      fabricCanvas.off("selection:cleared", onSelect);
    };
  }, [fabricCanvas]);

  const applyImageCrop = () => {
    if (!selectedImage || !fabricCanvas) return;
    const el: any = selectedImage.getElement?.();
    const srcW = Number(el?.naturalWidth || el?.width || 0);
    const srcH = Number(el?.naturalHeight || el?.height || 0);
    if (!srcW || !srcH) return;

    const nx = Math.max(0, Math.min(cropX, srcW - 1));
    const ny = Math.max(0, Math.min(cropY, srcH - 1));
    const nw = Math.max(1, Math.min(cropW, srcW - nx));
    const nh = Math.max(1, Math.min(cropH, srcH - ny));

    selectedImage.set({
      cropX: nx,
      cropY: ny,
      width: nw,
      height: nh,
    });
    selectedImage.setCoords();
    fabricCanvas.requestRenderAll();
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-50">
      <input type="file" accept="application/pdf" className="hidden"
        ref={fileInputRef} onChange={handleFileChange} />
      <input type="file" accept="image/*" className="hidden" ref={imageInputRef} onChange={handleInsertImagePick} />
      <input type="file" accept="image/*" className="hidden" ref={replaceImageInputRef} onChange={handleReplaceImagePick} />

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="h-14 border-b border-slate-800 bg-slate-900 flex items-center justify-between px-4 z-20 shadow-md shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-6 h-6 text-indigo-500" />
          <h1 className="font-semibold text-lg tracking-tight">Offline PDF Editor</h1>
        </div>

        {/* Mode toggle */}
        {file && (
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
            <button
               onClick={() => setAppMode('annotate')}
               className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                 appMode === 'annotate' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
               }`}
             >
               <Pen className="w-4 h-4" /> Annotate (Draw)
             </button>
             <button
               onClick={() => setAppMode('inplace')}
               className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                 appMode === 'inplace' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
               }`}
             >
               <Eye className="w-4 h-4" /> Edit PDF (Keep Layout)
             </button>
            <button
               onClick={() => setAppMode('document')}
               className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                 appMode === 'document' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
               }`}
             >
               <FileEdit className="w-4 h-4" /> Word Editor (Full Rewrite)
             </button>
          </div>
        )}
        {file && (
          <div className="hidden lg:block text-[11px] text-slate-400 ml-3">
            {appMode === 'inplace'
              ? 'Edit PDF keeps original alignment for unchanged text.'
              : appMode === 'document'
              ? 'Word Editor is for full reflow/rewrite and rich document editing.'
              : 'Annotate adds drawings and markup without changing base text layout.'}
          </div>
        )}

        {/* Page nav (annotate and inplace modes) */}
        {file && appMode !== 'document' && (
          <div className="flex items-center gap-3 text-sm font-medium text-slate-300">
            <Button variant="ghost" size="sm"
              disabled={currentPageIndex <= 0}
              onClick={() => setCurrentPageIndex(currentPageIndex - 1)}>Prev</Button>
            <span className="tabular-nums">Page {currentPageIndex + 1} / {numPages}</span>
            <Button variant="ghost" size="sm"
              disabled={currentPageIndex >= numPages - 1}
              onClick={() => setCurrentPageIndex(currentPageIndex + 1)}>Next</Button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Zoom (annotate and inplace modes) */}
          {file && appMode !== 'document' && (
            <div className="flex items-center gap-1 mr-2">
              <Button variant="ghost" size="icon" title="Zoom out" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}>
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-xs text-slate-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
              <Button variant="ghost" size="icon" title="Zoom in" onClick={() => setZoom(Math.min(4, zoom + 0.25))}>
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>
          )}
          {file && (
            <Button variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-950" onClick={clearFile}>
              <X className="w-4 h-4 mr-1" /> Close
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => setShowPageOps((v) => !v)} title="Page operations">
            <Settings className="w-5 h-5 text-slate-400" />
          </Button>
        </div>
      </header>

      {/* ── Main workspace ─────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden flex min-h-0">

        {/* Left toolbar — only in annotate mode */}
        {!isDocMode && (
          <aside className="w-16 border-r border-slate-800 bg-slate-900 flex flex-col items-center py-4 gap-1 z-10 shrink-0">
            <Button variant="ghost" size="icon" className="hover:bg-slate-800 rounded-xl mb-2"
              title="Open File" onClick={() => fileInputRef.current?.click()}>
              <FileUp className="w-5 h-5" />
            </Button>
            {appMode === "annotate" && (
              <Button variant="ghost" size="icon" className="hover:bg-slate-800 rounded-xl mb-2"
                title="Insert Image" onClick={() => imageInputRef.current?.click()}>
                <FileText className="w-5 h-5" />
              </Button>
            )}
            <div className="h-px bg-slate-800 w-8 mb-2" />

            {TOOLS.map((tool) => (
              <Button key={tool.id} variant="ghost" size="icon" title={tool.label}
                disabled={!canvasReady}
                onClick={() => setActiveTool(tool.id)}
                className={[
                  'rounded-xl transition-all',
                  activeTool === tool.id && canvasReady
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-slate-100',
                  !canvasReady ? 'opacity-40 cursor-not-allowed' : '',
                ].join(' ')}
              >
                {tool.icon}
              </Button>
            ))}
          </aside>
        )}

        {/* ── Canvas / Editor area ────────────────────────────────────── */}
        {appMode === 'document' ? (
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <DocumentEditor onSaveToAnnotate={handleSaveToAnnotate} autoImportFromPdf />
          </div>
        ) : appMode === 'inplace' ? (
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <PdfInplaceEditor />
          </div>
        ) : (
          // Annotate mode
          <div
            className="flex-1 bg-slate-950 relative overflow-auto flex items-start justify-center"
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
          >
            {isDragging && (
              <div className="absolute inset-4 border-2 border-dashed border-indigo-500 bg-indigo-900/10 z-50 rounded-lg pointer-events-none" />
            )}

            {file ? (
              <PdfViewer />
            ) : (
              <div
                className="flex items-center justify-center text-slate-400 flex-col gap-4 cursor-pointer hover:bg-slate-900/30 transition-colors w-full h-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-24 h-24 rounded-2xl bg-slate-800/60 flex items-center justify-center mb-2 border border-slate-700">
                  <FileUp className="w-10 h-10 text-indigo-400" />
                </div>
                <p className="font-semibold text-xl text-slate-300">Drop a PDF or click to browse</p>
                <p className="text-sm text-slate-500">100% offline — your files never leave this device</p>
              </div>
            )}
          </div>
        )}

        {/* Right properties panel — annotate mode only */}
        {appMode === 'annotate' && (
          <aside className="w-52 border-l border-slate-800 bg-slate-900 p-4 z-10 flex flex-col gap-4 shrink-0">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Properties</h2>
            {file ? (
              <div className="text-sm text-slate-300 space-y-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">File</p>
                  <p className="truncate font-medium" title={file.name}>{file.name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Pages</p>
                  <p>{numPages}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Size</p>
                  <p>{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Active Tool</p>
                  <p className="capitalize text-indigo-400 font-medium">
                    {TOOLS.find(t => t.id === activeTool)?.label ?? activeTool}
                  </p>
                </div>

                {activeTool === 'highlight' && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">Highlight Opacity</p>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={highlightOpacity}
                      onChange={(e) => setHighlightOpacity(Number(e.target.value))}
                      className="w-full"
                    />
                    <p className="text-xs text-slate-500">Highlight Width</p>
                    <input
                      type="range"
                      min={4}
                      max={40}
                      step={1}
                      value={highlightWidth}
                      onChange={(e) => setHighlightWidth(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                )}

                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <p className="text-xs text-slate-500">Image</p>
                  <div className="grid grid-cols-2 gap-1">
                    <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => imageInputRef.current?.click()}>
                      Insert
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[10px]"
                      disabled={!selectedImage}
                      onClick={() => replaceImageInputRef.current?.click()}
                    >
                      Replace
                    </Button>
                  </div>
                  {selectedImage && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-slate-500">Crop (source pixels)</p>
                      <div className="grid grid-cols-2 gap-1">
                        <input type="number" value={cropX} onChange={(e) => setCropX(Number(e.target.value))} className="h-7 rounded bg-slate-800 border border-slate-700 px-2 text-xs" placeholder="cropX" />
                        <input type="number" value={cropY} onChange={(e) => setCropY(Number(e.target.value))} className="h-7 rounded bg-slate-800 border border-slate-700 px-2 text-xs" placeholder="cropY" />
                        <input type="number" value={cropW} onChange={(e) => setCropW(Number(e.target.value))} className="h-7 rounded bg-slate-800 border border-slate-700 px-2 text-xs" placeholder="width" />
                        <input type="number" value={cropH} onChange={(e) => setCropH(Number(e.target.value))} className="h-7 rounded bg-slate-800 border border-slate-700 px-2 text-xs" placeholder="height" />
                      </div>
                      <Button size="sm" className="h-7 text-[10px] w-full" onClick={applyImageCrop}>Apply Crop</Button>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <p className="text-xs text-slate-500">Stamps</p>
                  <div className="grid grid-cols-2 gap-1">
                    <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => addStamp("APPROVED", "#16a34a")}>Approved</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => addStamp("DRAFT", "#f59e0b")}>Draft</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => addStamp("CONFIDENTIAL", "#dc2626")}>Confidential</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => addStamp("REJECTED", "#7c3aed")}>Rejected</Button>
                  </div>
                  <div className="flex gap-1">
                    <input
                      value={customStamp}
                      onChange={(e) => setCustomStamp(e.target.value)}
                      className="flex-1 h-7 rounded bg-slate-800 border border-slate-700 px-2 text-xs text-slate-200 outline-none"
                      placeholder="Custom stamp"
                    />
                    <Button size="sm" className="h-7 text-[10px]" onClick={() => addStamp(customStamp || "STAMP", "#0ea5e9")}>
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-6">Open a PDF to start editing</p>
            )}
          </aside>
        )}
      </main>

      {file && showPageOps && (
        <div className="fixed right-4 top-16 z-50 w-[360px] rounded-xl border border-slate-700 bg-slate-900/95 shadow-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-100">Page Operations</p>
            <button className="text-xs text-slate-400 hover:text-white" onClick={() => setShowPageOps(false)}>Close</button>
          </div>

          <input ref={mergeInputRef} type="file" accept="application/pdf" multiple className="hidden" onChange={handleMergePick} />

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" disabled={isPageOpBusy} onClick={() => mergeInputRef.current?.click()}>Merge PDFs</Button>
              <Button size="sm" disabled={isPageOpBusy} onClick={() => applyPageOp(() => duplicatePageAt(file, currentPageIndex, "duplicate-page.pdf"))}>
                Duplicate Page
              </Button>
              <Button size="sm" disabled={isPageOpBusy} onClick={() => applyPageOp(() => insertBlankPageAt(file, currentPageIndex + 1, "insert-blank.pdf"))}>
                Insert Blank
              </Button>
              <Button size="sm" disabled={isPageOpBusy} onClick={() => applyPageOp(() => deletePageAt(file, currentPageIndex, "delete-page.pdf"))}>
                Delete Page
              </Button>
              <Button size="sm" disabled={isPageOpBusy} onClick={() => applyPageOp(() => rotatePageAt(file, currentPageIndex, 90, "rotate-page.pdf"))}>
                Rotate +90°
              </Button>
              <Button size="sm" disabled={isPageOpBusy} onClick={() => applyPageOp(() => rotatePageAt(file, currentPageIndex, -90, "rotate-page.pdf"))}>
                Rotate -90°
              </Button>
            </div>

            <div className="border-t border-slate-800 pt-2">
              <p className="text-xs text-slate-400 mb-1">Split ranges (example: 1-3,5,8-10)</p>
              <div className="flex gap-2">
                <input
                  value={splitRanges}
                  onChange={(e) => setSplitRanges(e.target.value)}
                  className="flex-1 h-8 rounded bg-slate-800 border border-slate-700 px-2 text-xs text-slate-200 outline-none"
                  placeholder="1-3,5"
                />
                <Button
                  size="sm"
                  disabled={isPageOpBusy || !splitRanges.trim()}
                  onClick={() => applyPageOp(() => splitPdfByRanges(file, splitRanges, "split.pdf"))}
                >
                  Split
                </Button>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-2">
              <p className="text-xs text-slate-400 mb-1">Crop current page margins (pt)</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={cropMarginPt}
                  onChange={(e) => setCropMarginPt(Number(e.target.value))}
                  className="w-24 h-8 rounded bg-slate-800 border border-slate-700 px-2 text-xs text-slate-200 outline-none"
                />
                <Button
                  size="sm"
                  disabled={isPageOpBusy}
                  onClick={() => applyPageOp(() => cropPageMarginsAt(file, currentPageIndex, cropMarginPt, "crop-page.pdf"))}
                >
                  Apply Crop
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Status bar ─────────────────────────────────────────────────── */}
      <footer className="h-7 border-t border-slate-800 bg-slate-900 flex items-center justify-between px-4 text-xs text-slate-500 z-10 shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${file ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500'}`} />
          {file
            ? appMode === 'document'
              ? 'Document Edit mode — Advanced TipTap word processor'
              : appMode === 'inplace'
              ? 'Edit over PDF mode — Text overlay replacement'
              : `Annotate mode — ${TOOLS.find(t => t.id === activeTool)?.label}`
            : 'Ready · Offline mode'}
        </div>
        <span>100% client-side · no uploads</span>
      </footer>
    </div>
  );
}
