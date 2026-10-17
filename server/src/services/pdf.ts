import { createRequire } from "node:module";
import path from "node:path";
import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
const standardFontDataUrl = path.join(pdfjsRoot, "standard_fonts") + path.sep;

export interface ExtractedPdf {
  pages: string[]; // index 0 = page 1
  emptyPages: number[]; // 1-based page numbers with no extractable text
}

export function isPdf(buf: Buffer) {
  return buf.subarray(0, 5).toString("latin1") === "%PDF-";
}

/** Extracts the text layer page by page. Scanned pages have no text layer; OCR is not performed. */
export async function extractPdfText(buf: Buffer, maxPages = 600): Promise<ExtractedPdf> {
  const task = getDocument({
    data: new Uint8Array(buf),
    enableXfa: false,
    standardFontDataUrl,
    verbosity: VerbosityLevel.ERRORS,
  });
  const pdf = await task.promise;
  try {
    if (pdf.numPages > maxPages) throw new Error(`PDF has ${pdf.numPages} pages; the limit is ${maxPages}.`);
    const pages: string[] = [];
    const emptyPages: number[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str;
        text += item.hasEOL ? "\n" : " ";
      }
      text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      if (text.replace(/\s/g, "").length < 20) emptyPages.push(i);
      pages.push(text);
      page.cleanup();
    }
    return { pages, emptyPages };
  } finally {
    await task.destroy();
  }
}
