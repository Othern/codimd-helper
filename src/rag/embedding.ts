const EMBEDDING_PROVIDER = "local-hash-v1";

export interface GeneratedEmbedding {
  embedding: number[];
  provider: string;
}

export function generateLocalEmbedding(text: string, dimensions: number): GeneratedEmbedding {
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error("Embedding dimensions must be a positive integer.");
  }

  const vector = Array.from({ length: dimensions }, () => 0);
  const terms = tokenizeForEmbedding(text);

  for (const term of terms) {
    const hash = fnv1a(term);
    const index = hash % dimensions;
    const sign = hash & 1 ? 1 : -1;
    vector[index] += sign;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  const embedding = magnitude === 0 ? vector : vector.map((value) => value / magnitude);

  return {
    embedding,
    provider: EMBEDDING_PROVIDER
  };
}

export function tokenizeForEmbedding(text: string): string[] {
  const normalized = text.toLowerCase();
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  const expanded: string[] = [];

  for (const token of tokens) {
    expanded.push(token);

    if (token.length > 2) {
      for (let index = 0; index < token.length - 1; index += 1) {
        expanded.push(token.slice(index, index + 2));
      }
    }
  }

  return expanded;
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}
