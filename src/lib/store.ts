import { create } from 'zustand';
import * as pdfjsLib from 'pdfjs-dist';
import { Canvas } from 'fabric';

interface PdfState {
  file: File | null;
  document: pdfjsLib.PDFDocumentProxy | null;
  numPages: number;
  currentPageIndex: number;
  zoom: number;
  fabricCanvas: Canvas | null;
  pageAnnotations: Record<number, any>; // Store Fabric JSON per page
  
  // Actions
  setFile: (file: File | null) => void;
  setDocument: (doc: pdfjsLib.PDFDocumentProxy | null) => void;
  setCurrentPageIndex: (index: number) => void;
  setZoom: (zoom: number) => void;
  setFabricCanvas: (canvas: Canvas | null) => void;
}

export const usePdfStore = create<PdfState>((set) => ({
  file: null,
  document: null,
  numPages: 0,
  currentPageIndex: 0,
  zoom: 1.5,
  fabricCanvas: null,
  pageAnnotations: {},

  setFile: (file) => set({ file, document: null, currentPageIndex: 0, numPages: 0, pageAnnotations: {} }),
  setDocument: (doc) => set({ document: doc, numPages: doc?.numPages || 0, currentPageIndex: 0 }),
  
  setCurrentPageIndex: (index) => set((state) => {
    if (state.fabricCanvas) {
      // Serialize current page before moving away
      const annotations = state.fabricCanvas.toJSON();
      return { 
        pageAnnotations: { ...state.pageAnnotations, [state.currentPageIndex]: annotations },
        currentPageIndex: index 
      };
    }
    return { currentPageIndex: index };
  }),
  
  setZoom: (zoom) => set({ zoom }),
  setFabricCanvas: (canvas) => set({ fabricCanvas: canvas }),
}));
