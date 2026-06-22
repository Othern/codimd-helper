import { describe, expect, it } from "vitest";

import { normalizeQuestion, parseEmbedding, toPgVector } from "../src/rag/vector.js";

describe("RAG vector utilities", () => {
  it("normalizes questions for answer cache lookup", () => {
    expect(normalizeQuestion("  What   is RAG?  ")).toBe("what is rag?");
  });

  it("parses embedding JSON arrays", () => {
    expect(parseEmbedding("[0.1, 0.2, 0.3]")).toEqual([0.1, 0.2, 0.3]);
  });

  it("formats embeddings for pgvector", () => {
    expect(toPgVector([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
  });
});
