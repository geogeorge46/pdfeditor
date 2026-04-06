import { create } from 'zustand';
import * as pdfjsLib from 'pdfjs-dist';
import { Canvas } from 'fabric';

interface PageEdit {
  text: string;
  x: number;
  y: number;
  fontHeight: number;
  styles: {
    fontWeight?: string;
    fontStyle?: string;
    textDecoration?: string;
    fontSize?: string;
    color?: string;
  };
}

interface PdfState {
  file: File | null;
  document: pdfjsLib.PDFDocumentProxy | null;
  numPages: number;
  currentPageIndex: number;
  zoom: number;
  fabricCanvas: Canvas | null;
  pageAnnotations: Record<number, any>; // Store Fabric JSON per page
  pageEdits: Record<number, Record<number, PageEdit>>; // Store edits per page/index
  isPreviewMode: boolean;

  // Actions
  setFile: (file: File | null) => void;
  setDocument: (doc: pdfjsLib.PDFDocumentProxy | null) => void;
  setCurrentPageIndex: (index: number) => void;
  setZoom: (zoom: number) => void;
  setFabricCanvas: (canvas: Canvas | null) => void;
  updatePageEdit: (page: number, index: number, edit: Partial<PageEdit>) => void;
  setIsPreviewMode: (val: boolean) => void;
}

export const usePdfStore = create<PdfState>((set) => ({
  file: null,
  document: null,
  numPages: 0,
  currentPageIndex: 0,
  zoom: 1.5,
  fabricCanvas: null,
  pageAnnotations: {},
  pageEdits: {},
  isPreviewMode: false,

  setFile: (file) => set({ 
    file, document: null, currentPageIndex: 0, numPages: 0, 
    pageAnnotations: {}, pageEdits: {}, isPreviewMode: false 
  }),
  setDocument: (doc) => set({ 
    document: doc, numPages: doc?.numPages || 0, currentPageIndex: 0 
  }),
  
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
  setIsPreviewMode: (val) => set({ isPreviewMode: val }),

  updatePageEdit: (page, index, edit) => set((state) => {
    const pageEdits = { ...state.pageEdits };
    if (!pageEdits[page]) pageEdits[page] = {};
    const existing = pageEdits[page][index] || { text: "", styles: {} };

    pageEdits[page][index] = {
      ...existing,
      ...edit,
      styles: { ...existing.styles, ...(edit.styles || {}) }
    };

    return { pageEdits };
  }),
}));
