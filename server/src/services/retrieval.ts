// Lexical retrieval (BM25) over document chunks. Anthropic does not offer an embeddings API, and
// for one person's lecture notes BM25 is fast, free and good enough. The `retrieve` function is the
// only seam: swap in vector search (e.g. Atlas Vector Search + an embeddings provider) later.
import { Types } from "mongoose";
import { Chunk } from "../models/Document.js";

const STOPWORDS = new Set(
  (
    "a an and are as at be but by for from has have he her his i if in into is it its me my no not of on or our she so that the their them then there these they this to was we were what when which who will with you your " +
    "der die das den dem des ein eine einer eines einem einen und oder aber ist sind war waren zu im in am an auf aus bei mit nach von vor für über unter durch als auch nicht noch nur sich sie er es wir ihr ich du man wie was wer wenn dass da so"
  ).split(" "),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .map(stem);
}

// Very light suffix stripping so "transforms"/"transform" and "Signale"/"Signal" match.
function stem(t: string) {
  if (t.length > 5) return t.replace(/(ungen|ung|ies|es|en|er|s|e)$/u, "");
  return t;
}

export function chunkPages(pages: string[], size = 1000, overlap = 150) {
  const chunks: { page: number; text: string }[] = [];
  pages.forEach((pageText, i) => {
    const text = pageText.trim();
    if (!text) return;
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + size, text.length);
      if (end < text.length) {
        const cut = Math.max(text.lastIndexOf(". ", end), text.lastIndexOf("\n", end));
        if (cut > start + size * 0.5) end = cut + 1;
      }
      chunks.push({ page: i + 1, text: text.slice(start, end).trim() });
      if (end >= text.length) break;
      start = Math.max(end - overlap, start + 1);
    }
  });
  return chunks;
}

export interface Passage {
  chunkId: string;
  documentId: string;
  page: number;
  text: string;
  score: number;
}

export async function retrievePassages(
  userId: Types.ObjectId,
  query: string,
  opts: { documentIds?: string[]; limit?: number } = {},
): Promise<Passage[]> {
  const qTerms = [...new Set(tokenize(query))];
  if (!qTerms.length) return [];
  const filter: Record<string, unknown> = { userId };
  if (opts.documentIds?.length) filter.documentId = { $in: opts.documentIds.map((id) => new Types.ObjectId(id)) };
  const chunks = await Chunk.find(filter).select("documentId page terms").lean();
  if (!chunks.length) return [];

  const N = chunks.length;
  const avgLen = chunks.reduce((s, c) => s + c.terms.length, 0) / N || 1;
  const df = new Map<string, number>();
  for (const c of chunks) {
    const seen = new Set(c.terms);
    for (const t of qTerms) if (seen.has(t)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const k1 = 1.4;
  const b = 0.75;
  const scored: { id: Types.ObjectId; score: number }[] = [];
  for (const c of chunks) {
    let score = 0;
    const tf = new Map<string, number>();
    for (const t of c.terms) if (df.has(t)) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [t, f] of tf) {
      const n = df.get(t)!;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * c.terms.length) / avgLen)));
    }
    if (score > 0) scored.push({ id: c._id, score });
  }
  scored.sort((a, b2) => b2.score - a.score);
  const top = scored.slice(0, opts.limit ?? 6);
  const full = await Chunk.find({ _id: { $in: top.map((t) => t.id) } }).lean();
  const byId = new Map(full.map((c) => [String(c._id), c]));
  return top
    .map((t) => {
      const c = byId.get(String(t.id));
      return c ? { chunkId: String(c._id), documentId: String(c.documentId), page: c.page, text: c.text, score: Number(t.score.toFixed(3)) } : null;
    })
    .filter((p): p is Passage => p !== null);
}
