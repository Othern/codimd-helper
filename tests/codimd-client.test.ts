import { describe, expect, it } from "vitest";
import { CodimdClient } from "../src/codimd/client.js";

describe("CodimdClient", () => {
  it("exposes the configured base URL", () => {
    const client = new CodimdClient({
      codimdBaseUrl: "http://140.115.52.84:3000",
      indexPath: "./data/index",
      cachePath: "./data/cache",
      ragEmbeddingDimensions: 1536,
      ragAnswerSimilarityThreshold: 0.9
    });

    expect(client.baseUrl).toBe("http://140.115.52.84:3000");
  });
});
