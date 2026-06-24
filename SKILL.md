---
name: codimd-helper
description: Search, read, answer questions from, create, sync, or manage notes in the CodiMD instance at http://140.115.52.84:3000 using the remote codimd-helper over SSH. Use when the user mentions CodiMD, codimd-helper, CodiMD notes, recent articles, article names, note titles, or asks to search/list/read/create CodiMD notes.
---
# CodiMD Helper Skill

Use this skill when the user wants to search, retrieve, summarize, answer questions from, create, or organize notes in the CodiMD instance at `http://140.115.52.84:3000`.

## Purpose

This skill gives agents a safe CLI-first interface to CodiMD through `codimd-helper`.

Use the CodiMD application layer for writes. Do not create, update, or delete notes by writing directly to PostgreSQL.

The helper currently supports:

- Reading/searching notes through configured database access.
- Answering questions through the RAG answer cache.
- Logging in to CodiMD and saving a session cookie.
- Creating notes through CodiMD's verified HTTP flow: `POST /new`.

The helper should keep secrets on the machine where it runs. Do not expose database URLs, cookies, passwords, SSH keys, or session tokens in responses.

## Execution Mode

Always call the server-side helper through SSH. Do not use a local `codimd-helper` wrapper, `Get-Command codimd-helper`, or `node dist\index.js` from the agent machine for task execution. The local wrapper reads the agent machine environment and can fail with `CODIMD_DB_URL is not configured`; that error usually means the wrong execution path was used.

Default remote host:

```text
hscc@140.115.52.84
```

Default command form:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper <command> <args> --json
```

Before first use from a new machine, verify:

```bash
ssh hscc@140.115.52.84 'echo ok'
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper --help
```

Always request JSON output for agent workflows.

## Common Read Tasks

List recent note/article titles by updated time:

```bash
ssh hscc@140.115.52.84 -- '/usr/local/bin/codimd-helper search '\''*'\'' --limit 10 --json'
```

PowerShell-safe form from the Codex desktop shell:

```powershell
ssh hscc@140.115.52.84 -- '/usr/local/bin/codimd-helper search ''*'' --limit 10 --json'
```

Use `search '*'` for recent-note listing because `answer` is optimized for question answering and may say no relevant note was found for list-style requests. Keep the remote command as one quoted argument so the remote shell does not expand `*` into filenames.

## Core Commands

Authentication:

- `codimd-helper login`

Read-only:

- `codimd-helper answer`
- `codimd-helper search`
- `codimd-helper read`

Write operations:

- `codimd-helper create`

Maintenance:

- `codimd-helper sync`

Known limitation:

- `codimd-helper update` may still be scaffolded or unavailable. Treat update as pending unless verified in the current environment.

## Login

Login stores a `connect.sid` session cookie at `CODIMD_COOKIE_PATH`, defaulting to `./data/cache/codimd.cookies`.

Remote example:

```powershell
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper login --email "<email>" --password "<password>" --json
```

If `CODIMD_USERNAME` and `CODIMD_PASSWORD` are set, the command can omit credentials:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper login --json
```

Never print, store, or ask the user to paste real passwords into notes or public logs. If a command output includes cookies or credentials, redact them before responding.

## Create Notes

Create is implemented through the verified CodiMD 2.5.4 web flow:

```http
POST /new
Content-Type: text/markdown
Cookie: connect.sid=...
```

The request body is the full Markdown note. CodiMD responds with `302 Found` and a `Location` header containing the new note path.

The CLI performs the curl-like HTTP request inside `src/codimd/client.ts`, then returns the note URL.

Create from a Markdown file:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper create --title "<title>" --file "<markdown-file>" --json
```

Create from a built-in template:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper create --title "<title>" --template meeting-note --tag meeting --json
```

Expected successful output shape:

```json
{
  "ok": true,
  "baseUrl": "http://140.115.52.84:3000",
  "note": {
    "id": "note-id",
    "url": "http://140.115.52.84:3000/note-id",
    "downloadUrl": "http://140.115.52.84:3000/note-id/download",
    "updated": true
  }
}
```

If `updated` is `false`, the note was still created through `/new`, but the follow-up `PUT /api/notes/:id` did not complete. Use `downloadUrl` to verify content.

## Verified Raw HTTP Flow

For diagnosis only, the equivalent curl flow is:

```bash
ssh hscc@140.115.52.84 -- curl -i -c cookies.txt -b cookies.txt \
  -X POST http://140.115.52.84:3000/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "email=<email>" \
  --data-urlencode "password=<password>"
```

Confirm session:

```bash
ssh hscc@140.115.52.84 -- curl -i -b cookies.txt http://140.115.52.84:3000/me
```

Create note:

```bash
ssh hscc@140.115.52.84 -- curl -i -b cookies.txt \
  -X POST http://140.115.52.84:3000/new \
  -H "Content-Type: text/markdown" \
  --data-binary @note.md
```

Verify content:

```bash
ssh hscc@140.115.52.84 -- curl -i -b cookies.txt http://140.115.52.84:3000/<note-id>/download
```

Use the CLI rather than raw curl for normal agent work.

## Answer Cache Behavior

Use `answer` for normal questions:

```bash
ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper answer "<question>" --json
```

The command returns one of two modes:

- `mode: "answer_cache"`: a cached answer scored at or above `RAG_ANSWER_CACHE_HIT_SCORE_THRESHOLD`; use the returned answer directly.
- `mode: "db_fallback"`: the cache score was too low, so the helper searched CodiMD notes, synthesized an answer, and wrote that answer back to cache.

When responding to the user, mention source links from returned notes when available. If the answer came from `db_fallback`, treat it as a source-summary answer rather than a fully verified final interpretation unless the relevant notes were also read.

Treat RAG as an internal search/answer cache. Do not call low-level RAG internals directly.

## Read Source Notes

Read full notes when:

- The user asks about a specific note.
- Exact wording matters.
- The answer may affect a future note update.
- Search or answer results are ambiguous.
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

The CLI writes title and tags into frontmatter because CodiMD's `/new` route accepts Markdown body, not separate JSON fields.

## Error Handling

If SSH fails:

1. Report that the remote CodiMD helper could not be reached.
2. Mention the failed command without exposing secrets.
3. Ask the user to verify SSH access to `hscc@140.115.52.84`.
4. Do not ask for or store SSH passwords.

If login fails:

1. Check that `CODIMD_BASE_URL` matches the host used by CodiMD.
2. Check that the account exists and the password is correct.
3. Run `ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper login --json` again.
4. Verify with `ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper create ... --json` or the `/me` diagnostic only when needed.

If create returns an authentication error:

1. Run `ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper login --json`.
2. Confirm `CODIMD_COOKIE_PATH` is writable.
3. Retry create with `--json`.

If a created note URL shows Internal Server Error in a browser but `/download` works:

- The note was created successfully.
- The browser may not be logged in, especially when notes use `limited` permission.
- Ask the user to log in through the browser and reopen the note.

Common fixes:

- `command not found`: install or symlink `/usr/local/bin/codimd-helper` on the CodiMD server.
- `CODIMD_DB_URL is not configured`: check the environment where read/search commands run.
- `CodiMD session is missing or expired`: run `ssh hscc@140.115.52.84 -- /usr/local/bin/codimd-helper login --json`.
- PostgreSQL connection errors: verify Docker compose database port and DB URL in the runtime environment.
- SSH permission errors: fix SSH key or account access.

## Safety Rules

- Do not expose database credentials, cookies, session tokens, SSH keys, or private server configuration.
- Do not store SSH passwords in this file, prompts, shell history, or repository files.
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
- Say whether the answer came from answer cache, database fallback, direct note read, keyword search, or create result when that matters.
- Use the full SSH command in examples.

