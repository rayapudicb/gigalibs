// svg-to-pdfkit 0.1.8 ships no types (WI-OI-106): draws an SVG string into a PDFKit document.
declare module 'svg-to-pdfkit' {
  export default function SVGtoPDF(
    doc: PDFKit.PDFDocument,
    svg: string,
    x?: number,
    y?: number,
    options?: { width?: number; height?: number; preserveAspectRatio?: string; assumePt?: boolean },
  ): void;
}
