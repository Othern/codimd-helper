import pg from "pg";

import type { AppConfig } from "../config.js";
import type { CachedRagAnswer, CachedRagAnswerMatch, RagChunk, RagChunkMatch } from "./types.js";
import { assertEmbeddingDimensions, cosineDistanceToSimilarity, normalizeQuestion, toPgVector } from "./vector.js";

const { Pool } = pg;

export class RagDatabase {
  private readonly pool: pg.Pool;

  constructor(private readonly config: AppConfig) {
    if (!config.codimdDbUrl) {
      throw new Error("CODIMD_DB_URL is required for RAG database access.");
    }

    this.pool = new Pool({
      connectionString: config.codimdDbUrl
    });
  }

  async initialize(): Promise<void> {
    const dimensions = validateDimensions(this.config.ragEmbeddingDimensions);

    try {
      await this.pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    } catch (error) {
      if (isPgVectorMissingError(error)) {
        throw new Error(
          "pgvector is not installed in this PostgreSQL instance. Install the pgvector package/extension in the database container or host, then rerun `codimd-helper rag init --json`."
        );
      }

      throw error;
    }
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rag_chunks (
        id text PRIMARY KEY,
        note_id text NOT NULL,
        chunk_index integer NOT NULL,
        content text NOT NULL,
        summary text,
        embedding vector(${dimensions}) NOT NULL,
        note_updated_at timestamptz,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (note_id, chunk_index)
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rag_answers (
        id text PRIMARY KEY,
        question text NOT NULL,
        normalized_question text NOT NULL,
        question_embedding vector(${dimensions}) NOT NULL,
        answer text NOT NULL,
        source_note_ids text[] NOT NULL DEFAULT '{}',
        source_chunk_ids text[] NOT NULL DEFAULT '{}',
        note_updated_at_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        confidence double precision NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query("CREATE INDEX IF NOT EXISTS rag_chunks_note_id_idx ON rag_chunks (note_id)");
    await this.pool.query("CREATE INDEX IF NOT EXISTS rag_answers_normalized_question_idx ON rag_answers (normalized_question)");
    await this.pool.query("CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw_idx ON rag_chunks USING hnsw (embedding vector_cosine_ops)");
    await this.pool.query("CREATE INDEX IF NOT EXISTS rag_answers_question_embedding_hnsw_idx ON rag_answers USING hnsw (question_embedding vector_cosine_ops)");
  }

  async upsertChunk(chunk: RagChunk): Promise<void> {
    assertEmbeddingDimensions(chunk.embedding, this.config.ragEmbeddingDimensions);

    await this.pool.query(
      `
        INSERT INTO rag_chunks (id, note_id, chunk_index, content, summary, embedding, note_updated_at, metadata, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8::jsonb, now())
        ON CONFLICT (note_id, chunk_index)
        DO UPDATE SET
          id = EXCLUDED.id,
          content = EXCLUDED.content,
          summary = EXCLUDED.summary,
          embedding = EXCLUDED.embedding,
          note_updated_at = EXCLUDED.note_updated_at,
          metadata = EXCLUDED.metadata,
          updated_at = now()
      `,
      [
        chunk.id,
        chunk.noteId,
        chunk.chunkIndex,
        chunk.content,
        chunk.summary ?? null,
        toPgVector(chunk.embedding),
        chunk.noteUpdatedAt ?? null,
        JSON.stringify(chunk.metadata ?? {})
      ]
    );
  }

  async upsertAnswer(answer: CachedRagAnswer): Promise<void> {
    assertEmbeddingDimensions(answer.questionEmbedding, this.config.ragEmbeddingDimensions);

    await this.pool.query(
      `
        INSERT INTO rag_answers (
          id,
          question,
          normalized_question,
          question_embedding,
          answer,
          source_note_ids,
          source_chunk_ids,
          note_updated_at_snapshot,
          confidence,
          updated_at
        )
        VALUES ($1, $2, $3, $4::vector, $5, $6, $7, $8::jsonb, $9, now())
        ON CONFLICT (id)
        DO UPDATE SET
          question = EXCLUDED.question,
          normalized_question = EXCLUDED.normalized_question,
          question_embedding = EXCLUDED.question_embedding,
          answer = EXCLUDED.answer,
          source_note_ids = EXCLUDED.source_note_ids,
          source_chunk_ids = EXCLUDED.source_chunk_ids,
          note_updated_at_snapshot = EXCLUDED.note_updated_at_snapshot,
          confidence = EXCLUDED.confidence,
          updated_at = now()
      `,
      [
        answer.id,
        answer.question,
        answer.normalizedQuestion,
        toPgVector(answer.questionEmbedding),
        answer.answer,
        answer.sourceNoteIds,
        answer.sourceChunkIds,
        JSON.stringify(answer.noteUpdatedAtSnapshot),
        answer.confidence
      ]
    );
  }

  async findCachedAnswer(question: string, questionEmbedding: number[], limit = 3): Promise<CachedRagAnswerMatch[]> {
    assertEmbeddingDimensions(questionEmbedding, this.config.ragEmbeddingDimensions);

    const threshold = this.config.ragAnswerSimilarityThreshold;
    const result = await this.pool.query(
      `
        SELECT
          id,
          question,
          normalized_question,
          answer,
          source_note_ids,
          source_chunk_ids,
          note_updated_at_snapshot,
          confidence,
          created_at,
          updated_at,
          question_embedding <=> $1::vector AS distance
        FROM rag_answers
        WHERE normalized_question = $2 OR 1 - (question_embedding <=> $1::vector) >= $3
        ORDER BY
          CASE WHEN normalized_question = $2 THEN 0 ELSE 1 END,
          question_embedding <=> $1::vector
        LIMIT $4
      `,
      [toPgVector(questionEmbedding), normalizeQuestion(question), threshold, limit]
    );

    return result.rows.map(rowToCachedAnswerMatch);
  }

  async searchChunks(queryEmbedding: number[], limit = 8, noteIds?: string[]): Promise<RagChunkMatch[]> {
    assertEmbeddingDimensions(queryEmbedding, this.config.ragEmbeddingDimensions);

    const params: unknown[] = [toPgVector(queryEmbedding), limit];
    const noteFilter = noteIds && noteIds.length > 0 ? "WHERE note_id = ANY($3)" : "";

    if (noteIds && noteIds.length > 0) {
      params.push(noteIds);
    }

    const result = await this.pool.query(
      `
        SELECT
          id,
          note_id,
          chunk_index,
          content,
          summary,
          note_updated_at,
          metadata,
          embedding <=> $1::vector AS distance
        FROM rag_chunks
        ${noteFilter}
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `,
      params
    );

    return result.rows.map(rowToChunkMatch);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function validateDimensions(dimensions: number): number {
  if (!Number.isInteger(dimensions) || dimensions <= 0 || dimensions > 2000) {
    throw new Error("RAG_EMBEDDING_DIMENSIONS must be an integer between 1 and 2000 for pgvector vector columns.");
  }

  return dimensions;
}

function rowToChunkMatch(row: Record<string, unknown>): RagChunkMatch {
  const distance = Number(row.distance);

  return {
    id: String(row.id),
    noteId: String(row.note_id),
    chunkIndex: Number(row.chunk_index),
    content: String(row.content),
    summary: stringifyOptional(row.summary),
    noteUpdatedAt: stringifyDate(row.note_updated_at),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    distance,
    similarity: cosineDistanceToSimilarity(distance)
  };
}

function rowToCachedAnswerMatch(row: Record<string, unknown>): CachedRagAnswerMatch {
  const distance = Number(row.distance);

  return {
    id: String(row.id),
    question: String(row.question),
    normalizedQuestion: String(row.normalized_question),
    answer: String(row.answer),
    sourceNoteIds: Array.isArray(row.source_note_ids) ? row.source_note_ids.map(String) : [],
    sourceChunkIds: Array.isArray(row.source_chunk_ids) ? row.source_chunk_ids.map(String) : [],
    noteUpdatedAtSnapshot: isStringRecord(row.note_updated_at_snapshot) ? row.note_updated_at_snapshot : {},
    confidence: Number(row.confidence),
    createdAt: stringifyDate(row.created_at) ?? "",
    updatedAt: stringifyDate(row.updated_at) ?? "",
    distance,
    similarity: cosineDistanceToSimilarity(distance)
  };
}

function stringifyOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return String(value);
}

function stringifyDate(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return stringifyOptional(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function isPgVectorMissingError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  return error.code === "58P01" || String(error.message ?? "").includes("extension/vector.control");
}
