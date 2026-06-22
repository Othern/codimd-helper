import "dotenv/config";

export interface AppConfig {
  codimdBaseUrl: string;
  codimdDbUrl?: string;
  indexPath: string;
  cachePath: string;
  ragEmbeddingDimensions: number;
  ragAnswerSimilarityThreshold: number;
}

export function loadConfig(): AppConfig {
  return {
    codimdBaseUrl: process.env.CODIMD_BASE_URL ?? "http://140.115.52.84:3000",
    codimdDbUrl: process.env.CODIMD_DB_URL,
    indexPath: process.env.INDEX_PATH ?? "./data/index",
    cachePath: process.env.CACHE_PATH ?? "./data/cache",
    ragEmbeddingDimensions: parsePositiveInteger(process.env.RAG_EMBEDDING_DIMENSIONS, 1536),
    ragAnswerSimilarityThreshold: parseSimilarityThreshold(process.env.RAG_ANSWER_SIMILARITY_THRESHOLD, 0.9)
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseSimilarityThreshold(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}
