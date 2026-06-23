import { describe, expect, it } from "vitest";

import type { AppConfig } from "../src/config.js";
import { chooseCachedAnswer } from "../src/rag/answer.js";
import type { CachedRagAnswerMatch } from "../src/rag/types.js";

const config: AppConfig = {
  codimdBaseUrl: "http://140.115.52.84:3000",
  indexPath: "./data/index",
  cachePath: "./data/cache",
  ragEmbeddingDimensions: 1536,
  ragAnswerSimilarityThreshold: 0.9,
  ragAnswerCacheHitScoreThreshold: 0.85,
  ragChunkMaxChars: 1800,
  ragChunkOverlapChars: 200
};

describe("chooseCachedAnswer", () => {
  it("hits the answer cache when the exact question has enough confidence and sources", () => {
    const decision = chooseCachedAnswer(config, "SIB19 是什麼", [
      cachedAnswer({
        normalizedQuestion: "sib19 是什麼",
        similarity: 0.2,
        confidence: 0.95,
        sourceNoteIds: ["note-1"]
      })
    ]);

    expect(decision.hit).toBe(true);
    expect(decision.score).toBe(0.95);
  });

  it("misses the answer cache when the weighted score is below threshold", () => {
    const decision = chooseCachedAnswer(config, "SIB19 是什麼", [
      cachedAnswer({
        normalizedQuestion: "sib19 是甚麼",
        similarity: 0.8,
        confidence: 0.8,
        sourceNoteIds: ["note-1"]
      })
    ]);

    expect(decision.hit).toBe(false);
    expect(decision.score).toBeCloseTo(0.64);
  });
});

function cachedAnswer(overrides: Partial<CachedRagAnswerMatch>): CachedRagAnswerMatch {
  return {
    id: "answer-1",
    question: "SIB19 是什麼",
    normalizedQuestion: "sib19 是什麼",
    answer: "SIB19 answer",
    sourceNoteIds: [],
    sourceChunkIds: [],
    noteUpdatedAtSnapshot: {},
    confidence: 1,
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z",
    distance: 0,
    similarity: 1,
    ...overrides
  };
}
