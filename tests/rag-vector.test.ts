import { describe, expect, it } from "vitest";

import { chunkMarkdown } from "../src/rag/chunker.js";
import { generateLocalEmbedding } from "../src/rag/embedding.js";
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

  it("generates stable local embeddings", () => {
    expect(generateLocalEmbedding("3GPP TS 38.304", 8).embedding).toEqual(generateLocalEmbedding("3GPP TS 38.304", 8).embedding);
  });

  it("chunks markdown into bounded sections", () => {
    const chunks = chunkMarkdown(`# Title\n\n${"One two three. ".repeat(80)}\n\n${"Four five six. ".repeat(80)}`, {
      maxChars: 220,
      overlapChars: 20
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.summary).toContain("Title");
  });
});
