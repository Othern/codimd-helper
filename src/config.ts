import "dotenv/config";

export interface AppConfig {
  codimdBaseUrl: string;
  codimdDbUrl?: string;
  codimdUsername?: string;
  codimdPassword?: string;
  codimdSessionCookie?: string;
  codimdCookiePath: string;
  indexPath: string;
  cachePath: string;
  ragEmbeddingDimensions: number;
  ragAnswerSimilarityThreshold: number;
  ragAnswerCacheHitScoreThreshold: number;
  ragChunkMaxChars: number;
  ragChunkOverlapChars: number;
}

export function loadConfig(): AppConfig {
  const cachePath = process.env.CACHE_PATH ?? "./data/cache";

  return {
    codimdBaseUrl: process.env.CODIMD_BASE_URL ?? "http://140.115.52.84:3000",
    codimdDbUrl: process.env.CODIMD_DB_URL,
    codimdUsername: process.env.CODIMD_USERNAME,
    codimdPassword: process.env.CODIMD_PASSWORD,
    codimdSessionCookie: process.env.CODIMD_SESSION_COOKIE,
    codimdCookiePath: process.env.CODIMD_COOKIE_PATH ?? `${cachePath}/codimd.cookies`,
    indexPath: process.env.INDEX_PATH ?? "./data/index",
    cachePath,
    ragEmbeddingDimensions: parsePositiveInteger(process.env.RAG_EMBEDDING_DIMENSIONS, 1536),
    ragAnswerSimilarityThreshold: parseSimilarityThreshold(process.env.RAG_ANSWER_SIMILARITY_THRESHOLD, 0.9),
    ragAnswerCacheHitScoreThreshold: parseSimilarityThreshold(process.env.RAG_ANSWER_CACHE_HIT_SCORE_THRESHOLD, 0.85),
    ragChunkMaxChars: parsePositiveInteger(process.env.RAG_CHUNK_MAX_CHARS, 1800),
    ragChunkOverlapChars: parsePositiveInteger(process.env.RAG_CHUNK_OVERLAP_CHARS, 200)
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
