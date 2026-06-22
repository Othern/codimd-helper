# CodiMD Remote Knowledge Skill

Use this skill when the user wants to search, read, summarize, create, update, or organize notes in the CodiMD instance at `http://140.115.52.84:3000`.

## Purpose

This skill lets an agent query the CodiMD knowledge base from any machine by executing the `codimd-helper` CLI on the CodiMD server over SSH.

The agent machine should not connect to the PostgreSQL database directly. The database URL and credentials stay on the CodiMD server.

## Remote Execution Model

Default remote host:

```text
hscc@140.115.52.84
```

Default CodiMD URL:

```text
http://140.115.52.84:3000
```

Preferred remote command pattern:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper <command> <args> --json
```

Authentication should use SSH keys or an SSH agent. Do not store SSH passwords in this skill file, prompts, shell history, wrapper scripts, or repository files.

Before using this skill from a new agent machine, verify:

```bash
ssh hscc@140.115.52.84 'echo ok'
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper search "healthcheck" --limit 1 --json
```

If a local wrapper named `codimd-helper` exists on the agent machine, prefer using it:

```bash
codimd-helper search "3GPP" --json
```

The wrapper should forward arguments to the server:

```bash
#!/usr/bin/env bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper "$@"
```

On Windows, the wrapper may be a `codimd-helper.cmd` file:

```bat
@echo off
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper %*
```

## Expected CLI Commands

The server-side CLI should expose these commands:

- `codimd-helper search`
- `codimd-helper read`
- `codimd-helper create`
- `codimd-helper update`
- `codimd-helper sync`
- `codimd-helper rag init`
- `codimd-helper rag search-cache`
- `codimd-helper rag search-chunks`
- `codimd-helper rag upsert-chunk`
- `codimd-helper rag upsert-answer`

For agent workflows, always prefer `--json`.

## When To Use

Use this skill for requests such as:

- "Search my CodiMD notes for ..."
- "Find notes related to ..."
- "Read this CodiMD note."
- "Summarize this CodiMD note."
- "Turn this conversation into a CodiMD note."
- "Update the meeting note with these action items."
- "Sync or rebuild the CodiMD knowledge index."
- "Use cached knowledge or RAG to answer from CodiMD."
- "Find the answer if it already exists, otherwise search related notes."

## Workflow

### RAG Answer Cache

Use the RAG cache when the agent can provide embeddings for the question and retrieved content. The intended flow is:

```text
question
  -> generate question embedding
  -> search cached answers
  -> if a trusted cached answer exists, answer with sources
  -> otherwise search note chunks
  -> read source notes only when chunk summaries are insufficient
  -> synthesize answer
  -> upsert the answer cache with source note/chunk IDs
```

Search cached answers first:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper rag search-cache "<question>" --embedding "<json-vector>" --json
```

Use a cached answer only when all of these are true:

1. The response has `cacheHit: true`.
2. The best answer has high `similarity`, normally at or above `RAG_ANSWER_SIMILARITY_THRESHOLD`.
3. The answer includes `sourceNoteIds` or `sourceChunkIds`.
4. The source notes are not known to be stale.

If the cached answer is missing, weak, stale, or source-less, search chunks:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper rag search-chunks --embedding "<json-vector>" --limit 8 --json
```

When generating a final answer from chunks:

1. Prefer chunk `summary` for quick synthesis.
2. Use `content` when the summary is too vague.
3. Use `codimd-helper read` for the original note when exact wording, broader context, or update timestamps matter.
4. Cite the source CodiMD notes in the response.
5. Clearly state when the answer is inferred from retrieved notes.

After synthesizing a useful answer, store it:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper rag upsert-answer \
  --id "<stable-answer-id>" \
  --question "<question>" \
  --answer "<answer>" \
  --embedding "<json-vector>" \
  --source-note-id "<note-id>" \
  --source-chunk-id "<chunk-id>" \
  --note-updated-at-snapshot "{\"<note-id>\":\"<updatedAt>\"}" \
  --confidence "<0-to-1>" \
  --json
```

Do not treat the RAG answer cache as authoritative if source notes have changed. Prefer source-based invalidation using note `updatedAt` over time-only expiration.

### RAG Index Maintenance

Initialize RAG tables only during setup or migration:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper rag init --json
```

Use `rag upsert-chunk` when an indexing process has split notes into chunks and generated embeddings:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper rag upsert-chunk \
  --id "<note-id>:<chunk-index>" \
  --note-id "<note-id>" \
  --chunk-index "<chunk-index>" \
  --content "<chunk-text>" \
  --summary "<chunk-summary>" \
  --embedding "<json-vector>" \
  --note-updated-at "<updatedAt>" \
  --metadata "{}" \
  --json
```

Embeddings must be JSON arrays whose length matches `RAG_EMBEDDING_DIMENSIONS` on the server.

### Search Notes

Run:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper search "<query>" --json
```

Use `--limit` when the user asks for broader or narrower results:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper search "<query>" --limit 20 --json
```

Then:

1. Parse the JSON response.
2. Confirm `ok` is `true`.
3. Return the most relevant notes with title, URL, updated date, and a short reason for relevance.
4. If results are ambiguous, ask which note the user wants to inspect before updating anything.

### Read Notes

Run:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper read "<note-url-or-id>" --json
```

Then:

1. Parse the JSON response.
2. Preserve original Markdown semantics when summarizing.
3. Mention title, tags, updated date, and source URL when available.
4. Clearly separate facts found in the note from the agent's own recommendations.

### Create Notes

Create is available only if the server-side CLI has implemented safe CodiMD creation through the application layer.

Do not create notes by writing directly to PostgreSQL.

If creation is available, prepare a Markdown file locally or on the server, then run:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper create --title "<title>" --file "<markdown-file>" --json
```

Use a template when the user intent clearly matches one:

- Meeting notes: `meeting-note`
- Research notes: `research-note`
- Daily notes: `daily-note`

### Update Notes

Update is available only if the server-side CLI has implemented safe CodiMD updates through the application layer.

Do not update notes by writing directly to PostgreSQL.

Before updating:

1. Read the existing note.
2. Identify the exact section to update.
3. Prefer append or targeted section replacement over full-note replacement.
4. Ask for confirmation when the update is substantial or ambiguous.

If update is available, run:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper update "<note-url-or-id>" --append --file "<markdown-file>" --json
```

### Sync Index

If the user asks for fresh results, run:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper sync --json
```

For a full rebuild:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper sync --full --json
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
4. Do not ask for or store the SSH password.

If the CLI returns `ok: false`:

1. Report the `message` field.
2. Do not invent search results.
3. Suggest the most likely operational fix only when clear.

Common fixes:

- `command not found`: install or symlink `/usr/local/bin/codimd-helper` on the CodiMD server.
- `CODIMD_DB_URL is not configured`: check the server-side `.env`.
- `could not open extension control file ... vector.control`: install pgvector in the PostgreSQL host/container that `CODIMD_DB_URL` points to, then rerun `codimd-helper rag init --json`.
- `password/publickey denied`: fix SSH credentials from the agent machine.
- Repeated password prompts: configure SSH key authentication or load the key into `ssh-agent`.
- PostgreSQL connection errors: verify Docker compose database port or server-side DB URL.

## Safety Rules

- Do not expose database credentials, cookies, session tokens, or private server configuration.
- Do not store SSH passwords in `SKILL.md` or any agent-readable instruction file.
- Do not ask the user to paste secrets into prompts unless absolutely necessary.
- Treat CodiMD URLs and note content as private.
- Do not delete notes unless the user explicitly asks and confirms.
- Do not overwrite a full note when append or section update is enough.
- For uncertain note matches, ask for confirmation before updating.
- Prefer read-only operations unless the user explicitly requests creation or update.

## Good Search Behavior

When searching, expand the query with likely bilingual terms when useful. For example, include both Chinese and English forms when the user query suggests it:

- meeting
- paper
- experiment
- decision
- todo
- project
- research

Prefer returning a small, high-quality result set over a long list.

## Output Conventions

When responding to the user:

- Use Traditional Chinese by default.
- Include CodiMD links as Markdown links.
- Keep summaries short unless the user asks for detail.
- Separate facts found in notes from your own recommendations.
- When showing commands, prefer the local wrapper form if available; otherwise show the full SSH command.
