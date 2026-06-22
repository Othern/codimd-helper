export interface RagChunk {
  id: string;
  noteId: string;
  chunkIndex: number;
  content: string;
  summary?: string;
  embedding: number[];
  noteUpdatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface RagChunkMatch extends Omit<RagChunk, "embedding"> {
  distance: number;
  similarity: number;
}

export interface CachedRagAnswer {
  id: string;
  question: string;
  normalizedQuestion: string;
  questionEmbedding: number[];
  answer: string;
  sourceNoteIds: string[];
  sourceChunkIds: string[];
  noteUpdatedAtSnapshot: Record<string, string>;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface CachedRagAnswerMatch extends Omit<CachedRagAnswer, "questionEmbedding"> {
  distance: number;
  similarity: number;
}
