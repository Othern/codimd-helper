import { Command } from "commander";
import { loadConfig } from "../config.js";
import { CodimdDatabase } from "../codimd/database.js";
import { searchNotes } from "../indexer/search.js";
import { RagDatabase } from "../rag/database.js";
import { normalizeQuestion, parseEmbedding } from "../rag/vector.js";

export function runCli(argv = process.argv): void {
  const config = loadConfig();
  const program = new Command();

  program
    .name("codimd-helper")
    .description("CLI helper for searching and managing CodiMD notes")
    .version("0.1.0");

  program
    .command("search")
    .argument("<query>", "Search query")
    .option("--tag <tag...>", "Filter by tag")
    .option("--limit <number>", "Maximum number of results", "10")
    .option("--json", "Print machine-readable JSON")
    .action(async (query: string, options: { tag?: string[]; limit: string; json?: boolean }) => {
      try {
        const notes = await searchNotes(config, {
          query,
          tags: options.tag,
          limit: Number.parseInt(options.limit, 10)
        });

        print({ ok: true, baseUrl: config.codimdBaseUrl, notes }, Boolean(options.json));
      } catch (error) {
        fail(error, Boolean(options.json));
      }
    });

  program
    .command("read")
    .argument("<noteIdOrUrl>", "CodiMD note ID or URL")
    .option("--json", "Print machine-readable JSON")
    .action(async (noteIdOrUrl: string, options: { json?: boolean }) => {
      const database = new CodimdDatabase(config);

      try {
        const note = await database.readNote(noteIdOrUrl);
        print({ ok: true, note }, Boolean(options.json));
      } catch (error) {
        fail(error, Boolean(options.json));
      } finally {
        await database.close();
      }
    });

  program
    .command("create")
    .requiredOption("--title <title>", "Note title")
    .option("--file <path>", "Markdown file to upload")
    .option("--template <name>", "Template name")
    .option("--tag <tag...>", "Tags")
    .option("--json", "Print machine-readable JSON")
    .action((options: { title: string; file?: string; template?: string; tag?: string[]; json?: boolean }) => {
      print(
        {
          ok: false,
          error: "create_not_implemented",
          message: "CodiMD create support is pending authentication/client implementation.",
          title: options.title,
          file: options.file,
          template: options.template,
          tags: options.tag ?? []
        },
        Boolean(options.json)
      );
      process.exitCode = 2;
    });

  program
    .command("update")
    .argument("<noteIdOrUrl>", "CodiMD note ID or URL")
    .option("--append", "Append content")
    .option("--prepend", "Prepend content")
    .option("--replace", "Replace content")
    .option("--file <path>", "Markdown file with update content")
    .option("--yes", "Skip confirmation")
    .option("--json", "Print machine-readable JSON")
    .action((noteIdOrUrl: string, options: { json?: boolean }) => {
      print(
        {
          ok: false,
          error: "update_not_implemented",
          message: "CodiMD update support is pending authentication/client implementation.",
          noteIdOrUrl
        },
        Boolean(options.json)
      );
      process.exitCode = 2;
    });

  program
    .command("sync")
    .option("--full", "Rebuild the full local index")
    .option("--json", "Print machine-readable JSON")
    .action((options: { full?: boolean; json?: boolean }) => {
      print(
        {
          ok: true,
          baseUrl: config.codimdBaseUrl,
          full: Boolean(options.full),
          indexedNotes: 0,
          updatedNotes: 0,
          message: "Index sync scaffold is ready; CodiMD fetch implementation is pending."
        },
        Boolean(options.json)
      );
    });

  const rag = program.command("rag").description("Manage RAG vector index and answer cache");

  rag
    .command("init")
    .option("--json", "Print machine-readable JSON")
    .action(async (options: { json?: boolean }) => {
      const database = new RagDatabase(config);

      try {
        await database.initialize();
        print(
          {
            ok: true,
            embeddingDimensions: config.ragEmbeddingDimensions,
            answerSimilarityThreshold: config.ragAnswerSimilarityThreshold,
            message: "RAG tables and pgvector indexes are ready."
          },
          Boolean(options.json)
        );
      } catch (error) {
        fail(error, Boolean(options.json));
      } finally {
        await database.close();
      }
    });

  rag
    .command("search-cache")
    .argument("<question>", "Question to match against cached answers")
    .requiredOption("--embedding <json>", "Question embedding as a JSON number array")
    .option("--limit <number>", "Maximum number of cached answers", "3")
    .option("--json", "Print machine-readable JSON")
    .action(async (question: string, options: { embedding: string; limit: string; json?: boolean }) => {
      const database = new RagDatabase(config);

      try {
        const answers = await database.findCachedAnswer(question, parseEmbedding(options.embedding), Number.parseInt(options.limit, 10));
        print({ ok: true, cacheHit: answers.length > 0, answers }, Boolean(options.json));
      } catch (error) {
        fail(error, Boolean(options.json));
      } finally {
        await database.close();
      }
    });

  rag
    .command("search-chunks")
    .requiredOption("--embedding <json>", "Query embedding as a JSON number array")
    .option("--note-id <noteId...>", "Restrict retrieval to specific note IDs")
    .option("--limit <number>", "Maximum number of chunks", "8")
    .option("--json", "Print machine-readable JSON")
    .action(async (options: { embedding: string; noteId?: string[]; limit: string; json?: boolean }) => {
      const database = new RagDatabase(config);

      try {
        const chunks = await database.searchChunks(parseEmbedding(options.embedding), Number.parseInt(options.limit, 10), options.noteId);
        print({ ok: true, chunks }, Boolean(options.json));
      } catch (error) {
        fail(error, Boolean(options.json));
      } finally {
        await database.close();
      }
    });

  rag
    .command("upsert-chunk")
    .requiredOption("--id <id>", "Stable chunk ID")
    .requiredOption("--note-id <noteId>", "Source note ID")
    .requiredOption("--chunk-index <number>", "Chunk index within the note")
    .requiredOption("--content <text>", "Chunk text")
    .requiredOption("--embedding <json>", "Chunk embedding as a JSON number array")
    .option("--summary <text>", "Chunk summary")
    .option("--note-updated-at <iso>", "Source note updatedAt timestamp")
    .option("--metadata <json>", "Chunk metadata as a JSON object", "{}")
    .option("--json", "Print machine-readable JSON")
    .action(
      async (options: {
        id: string;
        noteId: string;
        chunkIndex: string;
        content: string;
        embedding: string;
        summary?: string;
        noteUpdatedAt?: string;
        metadata: string;
        json?: boolean;
      }) => {
        const database = new RagDatabase(config);

        try {
          await database.upsertChunk({
            id: options.id,
            noteId: options.noteId,
            chunkIndex: Number.parseInt(options.chunkIndex, 10),
            content: options.content,
            summary: options.summary,
            embedding: parseEmbedding(options.embedding),
            noteUpdatedAt: options.noteUpdatedAt,
            metadata: parseJsonObject(options.metadata)
          });
          print({ ok: true, id: options.id }, Boolean(options.json));
        } catch (error) {
          fail(error, Boolean(options.json));
        } finally {
          await database.close();
        }
      }
    );

  rag
    .command("upsert-answer")
    .requiredOption("--id <id>", "Stable cached answer ID")
    .requiredOption("--question <text>", "Original user question")
    .requiredOption("--answer <text>", "Cached answer text")
    .requiredOption("--embedding <json>", "Question embedding as a JSON number array")
    .option("--source-note-id <noteId...>", "Source note IDs")
    .option("--source-chunk-id <chunkId...>", "Source chunk IDs")
    .option("--note-updated-at-snapshot <json>", "Source note updatedAt snapshot as a JSON object", "{}")
    .option("--confidence <number>", "Answer confidence from 0 to 1", "1")
    .option("--json", "Print machine-readable JSON")
    .action(
      async (options: {
        id: string;
        question: string;
        answer: string;
        embedding: string;
        sourceNoteId?: string[];
        sourceChunkId?: string[];
        noteUpdatedAtSnapshot: string;
        confidence: string;
        json?: boolean;
      }) => {
        const database = new RagDatabase(config);

        try {
          const now = new Date().toISOString();
          await database.upsertAnswer({
            id: options.id,
            question: options.question,
            normalizedQuestion: normalizeQuestion(options.question),
            questionEmbedding: parseEmbedding(options.embedding),
            answer: options.answer,
            sourceNoteIds: options.sourceNoteId ?? [],
            sourceChunkIds: options.sourceChunkId ?? [],
            noteUpdatedAtSnapshot: parseStringJsonObject(options.noteUpdatedAtSnapshot),
            confidence: Number.parseFloat(options.confidence),
            createdAt: now,
            updatedAt: now
          });
          print({ ok: true, id: options.id }, Boolean(options.json));
        } catch (error) {
          fail(error, Boolean(options.json));
        } finally {
          await database.close();
        }
      }
    );

  program.parse(argv);
}

function print(payload: unknown, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(JSON.stringify(payload, null, 2));
}

function fail(error: unknown, asJson: boolean): void {
  const message = error instanceof Error ? error.message : String(error);
  print({ ok: false, error: "command_failed", message }, asJson);
  process.exitCode = 1;
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function parseStringJsonObject(value: string): Record<string, string> {
  const parsed = parseJsonObject(value);

  if (!Object.values(parsed).every((item) => typeof item === "string")) {
    throw new Error("Expected a JSON object whose values are strings.");
  }

  return parsed as Record<string, string>;
}
