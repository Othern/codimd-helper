import { createHash } from "node:crypto";

import type { AppConfig } from "../config.js";
import type { IndexedNote } from "../indexer/store.js";
import { searchNotes } from "../indexer/search.js";
import type { CachedRagAnswerMatch } from "./types.js";
import { RagDatabase } from "./database.js";
import { generateLocalEmbedding } from "./embedding.js";
import { normalizeQuestion } from "./vector.js";

export interface CachedAnswerDecision {
  hit: boolean;
  score: number;
  threshold: number;
  answer?: CachedRagAnswerMatch;
}

export interface RagAnswerResult {
  ok: true;
  mode: "answer_cache" | "db_fallback";
  question: string;
  answer: string;
  cache: CachedAnswerDecision;
  notes: IndexedNote[];
  cachedAnswerId?: string;
}

export async function answerWithRagCache(config: AppConfig, question: string, limit: number): Promise<RagAnswerResult> {
  const generated = generateLocalEmbedding(question, config.ragEmbeddingDimensions);
  const rag = new RagDatabase(config);

  try {
    await rag.initialize();
    const candidates = await rag.findCachedAnswerCandidates(question, generated.embedding, 5, 0);
    const cache = chooseCachedAnswer(config, question, candidates);

    if (cache.hit && cache.answer) {
      return {
        ok: true,
        mode: "answer_cache",
        question,
        answer: cache.answer.answer,
        cache,
        notes: []
      };
    }

    const notes = await searchNotes(config, {
      query: buildDbSearchQuery(question),
      limit
    });
    const answer = synthesizeAnswerFromNotes(question, notes);
    const now = new Date().toISOString();
    const cachedAnswerId = stableAnswerId(question);

    await rag.upsertAnswer({
      id: cachedAnswerId,
      question,
      normalizedQuestion: normalizeQuestion(question),
      questionEmbedding: generated.embedding,
      answer,
      sourceNoteIds: notes.map((note) => note.id),
      sourceChunkIds: [],
      noteUpdatedAtSnapshot: Object.fromEntries(notes.flatMap((note) => (note.updatedAt ? [[note.id, note.updatedAt]] : []))),
      confidence: notes.length > 0 ? 0.75 : 0.3,
      createdAt: now,
      updatedAt: now
    });

    return {
      ok: true,
      mode: "db_fallback",
      question,
      answer,
      cache,
      notes,
      cachedAnswerId
    };
  } finally {
    await rag.close();
  }
}

export function chooseCachedAnswer(
  config: AppConfig,
  question: string,
  candidates: CachedRagAnswerMatch[]
): CachedAnswerDecision {
  const normalized = normalizeQuestion(question);
  const ranked = candidates
    .map((answer) => {
      const exactQuestion = answer.normalizedQuestion === normalized;
      const sourceScore = answer.sourceNoteIds.length > 0 || answer.sourceChunkIds.length > 0 ? 1 : 0.75;
      const similarity = exactQuestion ? Math.max(answer.similarity, 1) : answer.similarity;
      const score = clamp01(similarity * answer.confidence * sourceScore);

      return { answer, score };
    })
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  const threshold = config.ragAnswerCacheHitScoreThreshold;

  if (!best) {
    return {
      hit: false,
      score: 0,
      threshold
    };
  }

  return {
    hit: best.score >= threshold,
    score: best.score,
    threshold,
    answer: best.answer
  };
}

function synthesizeAnswerFromNotes(question: string, notes: IndexedNote[]): string {
  if (notes.length === 0) {
    return `目前沒有在 CodiMD 中找到可以回答「${question}」的相關筆記。`;
  }

  const lines = [
    `根據 CodiMD 搜尋結果，和「${question}」最相關的筆記如下：`,
    "",
    ...notes.slice(0, 5).map((note, index) => {
      const updatedAt = note.updatedAt ? `，更新：${note.updatedAt}` : "";
      const summary = note.summary ? `。重點：${note.summary}` : "";
      return `${index + 1}. ${note.title}${updatedAt}${summary}`;
    })
  ];

  return lines.join("\n");
}

function buildDbSearchQuery(question: string): string {
  const tokens = question.match(/[A-Za-z0-9][A-Za-z0-9._-]*/g) ?? [];
  return tokens.sort((left, right) => right.length - left.length)[0] ?? question;
}

function stableAnswerId(question: string): string {
  const digest = createHash("sha256").update(normalizeQuestion(question)).digest("hex").slice(0, 16);
  return `answer-${digest}`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}
