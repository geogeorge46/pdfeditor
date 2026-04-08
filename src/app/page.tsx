"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  FileUp, Settings, FileText, Download, X, Square,
  Type, Pen, MousePointer, Highlighter, Eraser, ZoomIn, ZoomOut,
  FileEdit, Eye,
} from "lucide-react";
import { usePdfStore } from "@/lib/store";
import dynamic from "next/dynamic";
import { Rect, IText, PencilBrush } from "fabric";

const PdfViewer = dynamic(() => import("@/components/PdfViewer").then(mod => mod.PdfViewer), {
  ssr: false,
});
const PdfInplaceEditor = dynamic(() => import("@/components/PdfInplaceEditor").then(mod => mod.PdfInplaceEditor), {
  ssr: false,
});
const DocumentEditor = dynamic(() => import("@/components/DocumentEditor").then(mod => mod.DocumentEditor), {
  ssr: false,
});

type ToolId = 'select' | 'draw' | 'rect' | 'text' | 'highlight' | 'erase';
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
  { id: 'text',      icon: <Type className="w-5 h-5" />,         label: 'Add Text Box' },
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
        hBrush.color  = 'rgba(250, 204, 21, 0.4)';
        hBrush.width  = 18;
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
  }, [activeTool, fabricCanvas]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) { setFile(e.target.files[0]); setAppMode('inplace'); }
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.type === 'application/pdf') { setFile(f); setAppMode('inplace'); }
    else alert('Please upload a PDF file.');
  };
  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation(); setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setAppMode('annotate');
  };

  const canvasReady = !!fabricCanvas;
  const isDocMode = appMode === 'document';

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-50">
      <input type="file" accept="application/pdf" className="hidden"
        ref={fileInputRef} onChange={handleFileChange} />

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
          <Button variant="ghost" size="icon"><Settings className="w-5 h-5 text-slate-400" /></Button>
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
            <DocumentEditor onSaveToAnnotate={handleSaveToAnnotate} />
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
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-6">Open a PDF to start editing</p>
            )}
          </aside>
        )}
      </main>

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
