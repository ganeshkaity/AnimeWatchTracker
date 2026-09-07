/**
 * pdfUtils.js — PDF.js initialization and coordinate helpers
 */

let pdfjsLib = null;

export async function initPdfJs() {
  if (typeof window === 'undefined') return null;
  if (pdfjsLib) return pdfjsLib;

  try {
    // Dynamic import for client-only Next.js execution
    const pdfjsModule = await import('pdfjs-dist');
    const pdfjs = pdfjsModule.default || pdfjsModule;
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
    }
    pdfjsLib = pdfjs;
    return pdfjsLib;
  } catch (err) {
    console.error('[PDFReader/pdfUtils] Failed to load PDF.js:', err);
    throw err;
  }
}

/**
 * Load PDF Document via progressive streaming endpoint
 */
export async function loadPDFDocument(sourceUrl) {
  const lib = await initPdfJs();
  if (!lib) throw new Error('PDF.js not initialized');

  const loadingTask = lib.getDocument({
    url: sourceUrl,
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/',
    rangeChunkSize: 65536,
    disableAutoFetch: false,
    disableStream: false,
  });

  return loadingTask.promise;
}

/**
 * Normalize point from screen coordinates to relative 0..1 coordinates
 */
export function screenToPageCoords(clientX, clientY, pageElement) {
  if (!pageElement) return { x: 0, y: 0 };
  const rect = pageElement.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  return { x, y };
}

/**
 * Convert relative 0..1 coordinates to pixels on a target element
 */
export function pageToScreenCoords(normX, normY, width, height) {
  return {
    x: normX * width,
    y: normY * height,
  };
}

/**
 * Calculate zoom level for Fit Width and Fit Page
 */
export function calculateFitZoom(containerWidth, containerHeight, pageWidth, pageHeight, mode = 'fit-width') {
  if (!containerWidth || !containerHeight || !pageWidth || !pageHeight) return 1.0;

  // Leave a comfortable margin
  const availW = Math.max(100, containerWidth - 32);
  const availH = Math.max(100, containerHeight - 32);

  if (mode === 'fit-width') {
    return Math.max(0.2, Math.min(3.0, availW / pageWidth));
  } else if (mode === 'fit-page') {
    const scaleW = availW / pageWidth;
    const scaleH = availH / pageHeight;
    return Math.max(0.2, Math.min(3.0, Math.min(scaleW, scaleH)));
  }

  return 1.0;
}
