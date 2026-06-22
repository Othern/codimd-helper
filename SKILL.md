# CodiMD RAG Knowledge Skill

Use this skill when the user wants to search, retrieve, summarize, answer questions from, create, update, or organize notes in the CodiMD instance at `http://140.115.52.84:3000`.

## Purpose

This skill gives agents a safe remote interface to the CodiMD knowledge base through the server-side `codimd-helper` CLI.

The preferred knowledge workflow is:

```text
question
  -> answer cache
  -> RAG chunk retrieval
  -> source note read
  -> traditional keyword search fallback
```

Use cached synthesized answers when they are trustworthy. Use RAG chunks when a cached answer is missing or weak. Read full CodiMD notes only when the chunk context is insufficient or exact source wording matters.

The agent machine must not connect to PostgreSQL directly. Database URLs, pgvector tables, CodiMD credentials, and other secrets stay on the CodiMD server.

## Remote Execution

Default remote host:

```text
hscc@140.115.52.84
```

Default command pattern:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper <command> <args> --json
```

If a local wrapper named `codimd-helper` exists, prefer it:

```bash
codimd-helper <command> <args> --json
```

Before first use from a new machine, verify:

```bash
ssh hscc@140.115.52.84 'echo ok'
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper search "healthcheck" --limit 1 --json
```

Always request JSON output for agent workflows.

## Core Commands

Read-only:

- `codimd-helper rag search-cache`
- `codimd-helper rag retrieve`
- `codimd-helper rag search-chunks`
- `codimd-helper search`
- `codimd-helper read`

Index and cache maintenance:

- `codimd-helper rag init`
- `codimd-helper rag index`
- `codimd-helper rag index-note`
- `codimd-helper rag upsert-chunk`
- `codimd-helper rag upsert-answer`
- `codimd-helper sync`

Write operations:

- `codimd-helper create`
- `codimd-helper update`

Create and update may be scaffolded or unavailable. Never write directly to PostgreSQL to create or update notes.

## Cache Architecture

The project uses three knowledge layers:

```text
rag_answers
  Cached synthesized answers with source note/chunk IDs.

rag_chunks
  Chunked note content, summaries, metadata, updatedAt snapshots, and pgvector embeddings.

CodiMD notes table
  Original source of truth for note markdown and updatedAt values.
```

An answer cache entry is usable only when:

1. The query matches the cached question strongly enough.
2. The cached answer includes source note IDs or source chunk IDs.
3. The answer confidence is appropriate for the task.
4. Source notes are not known to be stale.
5. The answer actually addresses the user's current question.

Prefer source-based invalidation using CodiMD note `updatedAt`. Do not rely only on TTL-style expiration.

## Default Question Workflow

For user questions that ask for knowledge from CodiMD, follow this order.

### 1. Search Answer Cache

If an external embedding is available:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper rag search-cache "<question>" --embedding "<json-vector>" --json
```

If no external embedding is available, omit `--embedding`; the helper will use its built-in deterministic local hash embedding:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper rag search-cache "<question>" --json
```

Use the cached answer directly only when the best result is clearly relevant, sourced, and fresh enough. Include source links or source note references when responding.

If the cached answer is weak, missing, stale, source-less, or only partially answers the question, continue to RAG retrieval.

### 2. Retrieve RAG Chunks

Use the built-in retrieval path:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper rag retrieve "<query>" --limit 8 --json
```

If an external embedding is available and a caller needs direct vector search:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper rag search-chunks --embedding "<json-vector>" --limit 8 --json
```

When using chunks:

1. Prefer `summary` for quick synthesis.
2. Use `content` for the actual evidence.
3. Inspect `metadata.title`, `metadata.url`, and `noteUpdatedAt` when available.
4. Cite source CodiMD URLs in the final answer when URLs are present.
5. State when a conclusion is inferred from retrieved notes rather than explicitly written.

### 3. Read Source Notes

Read full notes when:

- Chunk content is not enough.
- Exact wording matters.
- The answer may affect a note update.
- The retrieved chunks conflict.
- The user asks to summarize or inspect a specific note.

Run:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper read "<note-url-or-id>" --json
```

Preserve Markdown semantics when summarizing. Separate facts found in notes from the agent's recommendations.

### 4. Fallback To Keyword Search

If RAG retrieval is empty or the topic has not been indexed, use keyword search:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper search "<query>" --limit 20 --json
```

After search, either read likely source notes or ask the user which note to inspect when results are ambiguous.

## Writing Back To Answer Cache

After synthesizing a useful answer from reliable sources, cache it if the agent has enough source information.

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper rag upsert-answer \
  --id "<stable-answer-id>" \
  --question "<question>" \
  --answer "<answer>" \
  --source-note-id "<note-id>" \
  --source-chunk-id "<chunk-id>" \
  --note-updated-at-snapshot "{\"<note-id>\":\"<updatedAt>\"}" \
  --confidence "<0-to-1>" \
  --json
```

If an external embedding is required by the deployed helper version, include:

```bash
--embedding "<json-vector>"
```

Use conservative confidence:

- `0.9-1.0`: directly supported by retrieved notes.
- `0.7-0.89`: mostly supported but requires synthesis.
- below `0.7`: usually do not cache unless the user explicitly asks for a rough draft.

Do not cache answers that contain secrets, uncertain claims, outdated source material, or unsourced recommendations.

## RAG Index Maintenance

Initialize pgvector tables and indexes after setup or migration:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper rag init --json
```

Index one note:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper rag index-note "<note-url-or-id>" --json
```

Index notes found by keyword search:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper rag index --query "<query>" --limit 10 --json
```

Use this when the user asks for fresh RAG results, a topic has poor retrieval, or new CodiMD notes were added.

The built-in indexer currently uses deterministic local hash embeddings. It is enough to exercise the cache and retrieval pipeline, especially for keywords, acronyms, and spec numbers. Prefer a model-based embedding provider when semantic recall matters.

Embedding vectors must match `RAG_EMBEDDING_DIMENSIONS` on the server.

## Traditional Search And Sync

Use keyword search when RAG is unavailable, unindexed, or the user explicitly asks for a list of matching notes:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper search "<query>" --limit 20 --json
```

Use sync when the local non-RAG index needs refreshing:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper sync --json
```

For full rebuild:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper sync --full --json
```

## Create And Update Notes

Create and update are allowed only through safe CodiMD application-layer CLI support.

Do not create, update, or delete CodiMD notes by writing directly to PostgreSQL.

Before updating:

1. Read the existing note.
2. Identify the exact section to update.
3. Prefer append or targeted section replacement over full-note replacement.
4. Ask for confirmation when the update is substantial, ambiguous, or destructive.

Create example:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper create --title "<title>" --file "<markdown-file>" --json
```

Update example:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper update "<note-url-or-id>" --append --file "<markdown-file>" --json
```

## Note Style

Use this structure unless the user requests another format:

```markdown
---
title: Note Title
tags:
  - project/example
source: codimd
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Note Title

## Summary

## Key Points

## Details

## Action Items

## References
```

## Error Handling

If SSH fails:

1. Report that the remote CodiMD helper could not be reached.
2. Mention the failed command.
3. Ask the user to verify SSH access to `hscc@140.115.52.84`.
4. Do not ask for or store SSH passwords.

If the CLI returns `ok: false`:

1. Report the `message` field.
2. Do not invent search results or cached answers.
3. Suggest the most likely operational fix only when clear.

Common fixes:

- `command not found`: install or symlink `/usr/local/bin/codimd-helper` on the CodiMD server.
- `CODIMD_DB_URL is not configured`: check the server-side `.env`.
- `could not open extension control file ... vector.control`: install pgvector in the PostgreSQL host/container, then rerun `codimd-helper rag init --json`.
- `relation "rag_chunks" does not exist`: run `codimd-helper rag init --json`.
- Empty RAG retrieval: run `codimd-helper rag index --query "<topic>" --limit 10 --json`.
- Embedding dimension errors: ensure vectors match `RAG_EMBEDDING_DIMENSIONS`.
- PostgreSQL connection errors: verify Docker compose database port and server-side DB URL.
- SSH permission errors: fix SSH key or account access.

## Safety Rules

- Do not expose database credentials, cookies, session tokens, SSH keys, or private server configuration.
- Do not store SSH passwords in this file, prompts, shell history, wrapper scripts, or repository files.
- Treat CodiMD URLs and note content as private.
- Do not delete notes unless the user explicitly asks and confirms.
- Do not overwrite a full note when append or section update is enough.
- For uncertain note matches, ask for confirmation before updating.
- Prefer read-only operations unless the user explicitly requests creation or update.
- Do not present cached answers as fresh if the source notes may have changed.

## Search Quality

When searching or indexing, expand queries with likely bilingual or technical variants when useful. Examples:

- `3GPP`, `TS 38`, `NR`, `LTE`
- `meeting`, plus the user's Chinese wording when present
- `paper`, plus the user's Chinese wording when present
- `experiment`, plus the user's Chinese wording when present
- `decision`, plus the user's Chinese wording when present
- `todo`, plus the user's Chinese wording when present
- `research`, plus the user's Chinese wording when present

Prefer a small, high-quality set of sourced results over a long unsorted list.

## Output Conventions

When responding to the user:

- Use Traditional Chinese by default.
- Include CodiMD links as Markdown links when available.
- Keep summaries short unless the user asks for detail.
- Distinguish note facts from agent recommendations.
- Say whether the answer came from cache, RAG retrieval, direct note read, or keyword search when that matters.
- Prefer the local `codimd-helper` wrapper in examples if available; otherwise show the full SSH command.
