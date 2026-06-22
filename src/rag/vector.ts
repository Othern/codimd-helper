export function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ").toLowerCase();
}

export function parseEmbedding(value: string): number[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Embedding must be a JSON array of numbers.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((item) => Number.isFinite(item))) {
    throw new Error("Embedding must be a non-empty JSON array of finite numbers.");
  }

  return parsed.map(Number);
}

export function assertEmbeddingDimensions(embedding: number[], dimensions: number): void {
  if (embedding.length !== dimensions) {
    throw new Error(`Embedding has ${embedding.length} dimensions, but RAG_EMBEDDING_DIMENSIONS is ${dimensions}.`);
  }
}

export function toPgVector(embedding: number[]): string {
  if (embedding.length === 0 || !embedding.every((item) => Number.isFinite(item))) {
    throw new Error("Embedding must be a non-empty array of finite numbers.");
  }

  return `[${embedding.join(",")}]`;
}

export function cosineDistanceToSimilarity(distance: number): number {
  return 1 - distance;
}
