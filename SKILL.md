# CodiMD Cached Knowledge Skill

Use this skill when the user wants to search, retrieve, summarize, answer questions from, create, update, or organize notes in the CodiMD instance at `http://140.115.52.84:3000`.

## Purpose

This skill gives agents a safe remote interface to the CodiMD knowledge base through the server-side `codimd-helper` CLI.

The default question workflow is:

```text
question
  -> codimd-helper answer
  -> score answer cache
  -> return cached answer if score is high enough
  -> otherwise query CodiMD PostgreSQL
  -> synthesize an answer from matching notes
  -> write the synthesized answer back to cache
```

Treat RAG as an internal search/answer cache, not as a separate CLI workflow. Agents should not call low-level RAG commands directly.

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

- `codimd-helper answer`
- `codimd-helper search`
- `codimd-helper read`

Maintenance:

- `codimd-helper sync`

Write operations:

- `codimd-helper create`
- `codimd-helper update`

Create and update may be scaffolded or unavailable. Never write directly to PostgreSQL to create or update notes.

## Answer Cache Behavior

Use `answer` for normal questions:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper answer "<question>" --json
```

The command returns one of two modes:

- `mode: "answer_cache"`: a cached answer scored at or above `RAG_ANSWER_CACHE_HIT_SCORE_THRESHOLD`; use the returned answer directly.
- `mode: "db_fallback"`: the cache score was too low, so the helper searched CodiMD notes, synthesized an answer, and wrote that answer back to cache.

When responding to the user, mention source links from the returned notes when available. If the answer came from `db_fallback`, treat it as a source-summary answer rather than a fully verified final interpretation unless the relevant notes were also read.

## Read Source Notes

Read full notes when:

- The user asks about a specific note.
- Exact wording matters.
- The answer may affect a note update.
- Search/answer results are ambiguous.
- The synthesized answer is too shallow.

Run:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper read "<note-url-or-id>" --json
```

Preserve Markdown semantics when summarizing. Separate facts found in notes from the agent's recommendations.

## Keyword Search

Use keyword search when the user explicitly asks for a list of matching notes, or when `answer` does not provide enough context:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper search "<query>" --limit 20 --json
```

After search, either read likely source notes or ask the user which note to inspect when results are ambiguous.

## Sync

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
- `could not open extension control file ... vector.control`: install pgvector in the PostgreSQL host/container.
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

When searching, expand queries with likely bilingual or technical variants when useful. Examples:

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
- Say whether the answer came from answer cache, database fallback, direct note read, or keyword search when that matters.
- Prefer the local `codimd-helper` wrapper in examples if available; otherwise show the full SSH command.
