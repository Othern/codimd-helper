import type { AppConfig } from "../config.js";
import { CodimdDatabase } from "../codimd/database.js";
import { searchNotes } from "../indexer/search.js";
import { chunkMarkdown } from "./chunker.js";
import { RagDatabase } from "./database.js";
import { generateLocalEmbedding } from "./embedding.js";

export interface RagIndexNoteResult {
  noteId: string;
  title: string;
  url: string;
  updatedAt?: string;
  chunks: number;
}

export interface RagIndexSearchResult {
  query: string;
  notes: RagIndexNoteResult[];
}

export async function indexNote(config: AppConfig, noteIdOrUrl: string): Promise<RagIndexNoteResult> {
  const codimd = new CodimdDatabase(config);
  const rag = new RagDatabase(config);

  try {
    await rag.initialize();
    const note = await codimd.readNote(noteIdOrUrl);
    const chunks = chunkMarkdown(note.markdown, {
      maxChars: config.ragChunkMaxChars,
      overlapChars: config.ragChunkOverlapChars
    });

    await rag.deleteChunksForNote(note.id);

    for (const chunk of chunks) {
      const generated = generateLocalEmbedding(`${note.title}\n\n${chunk.summary}\n\n${chunk.content}`, config.ragEmbeddingDimensions);
      await rag.upsertChunk({
        id: `${note.id}:${chunk.chunkIndex}`,
        noteId: note.id,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        summary: chunk.summary,
        embedding: generated.embedding,
        noteUpdatedAt: note.updatedAt,
        metadata: {
          title: note.title,
          url: note.url,
          embeddingProvider: generated.provider
        }
      });
    }

    return {
      noteId: note.id,
      title: note.title,
      url: note.url,
      updatedAt: note.updatedAt,
      chunks: chunks.length
    };
  } finally {
    await codimd.close();
    await rag.close();
  }
}

export async function indexSearchResults(config: AppConfig, query: string, limit: number): Promise<RagIndexSearchResult> {
  const notes = await searchNotes(config, { query, limit });
  const indexed: RagIndexNoteResult[] = [];

  for (const note of notes) {
    indexed.push(await indexNote(config, note.url));
  }

  return {
    query,
    notes: indexed
  };
}
