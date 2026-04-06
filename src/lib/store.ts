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
  currentPageIndex: number;
  numPages: number;
  zoom: number;
  fabricCanvas: Canvas | null;
  pageAnnotations: Record<number, any>; 
  pageEdits: Record<number, Record<number, PageEdit>>; 

  // Actions
  setFile: (file: File | null) => void;
  setDocument: (doc: pdfjsLib.PDFDocumentProxy | null) => void;
  setCurrentPageIndex: (index: number) => void;
  setZoom: (zoom: number) => void;
  setFabricCanvas: (canvas: Canvas | null) => void;
  updatePageEdit: (page: number, index: number, edit: Partial<PageEdit>) => void;
}

export const usePdfStore = create<PdfState>((set) => ({
  file: null,
  document: null,
  currentPageIndex: 0,
  numPages: 0,
  zoom: 1.5,
  fabricCanvas: null,
  pageAnnotations: {},
  pageEdits: {},

  setFile: (file) => set({ file, document: null, currentPageIndex: 0, numPages: 0, pageAnnotations: {}, pageEdits: {} }),
  setDocument: (doc) => set({ document: doc, numPages: doc?.numPages || 0, currentPageIndex: 0 }),

  setCurrentPageIndex: (index) => set((state) => ({ currentPageIndex: index })),
  setZoom: (zoom) => set({ zoom }),
  setFabricCanvas: (canvas) => set({ fabricCanvas: canvas }),

  updatePageEdit: (page, index, edit) => set((state) => {
    const pageEdits = { ...state.pageEdits };
    if (!pageEdits[page]) pageEdits[page] = {};
    const existing = pageEdits[page][index] || { text: "", x:0, y:0, fontHeight:0, styles: {} };

    pageEdits[page][index] = {
      ...existing,
      ...edit,
      styles: { ...existing.styles, ...(edit.styles || {}) }
    } as PageEdit;

    return { pageEdits };
  }),
}));
