# Recommended Project Structure

This scaffold assumes the project will be implemented as a CLI-first TypeScript tool. Agents can interact with CodiMD by running shell commands such as `codimd-helper search`, `codimd-helper read`, and `codimd-helper create`.

MCP is not required for this project. It is useful when you need standardized tool schemas across many agent runtimes, but it adds an extra server layer. For your current goal, a CLI is simpler, easier to debug, and enough for agent interaction.

```text
codimd-helper/
|-- README.md
|-- PROJECT_STRUCTURE.md
|-- SKILL.md
|-- package.json
|-- tsconfig.json
|-- .env.example
|-- src/
|   |-- index.ts
|   |-- config.ts
|   |-- cli/
|   |   |-- commands.ts
|   |   `-- output.ts
|   |-- codimd/
|   |   |-- client.ts
|   |   |-- auth.ts
|   |   |-- notes.ts
|   |   `-- markdown.ts
|   |-- indexer/
|   |   |-- store.ts
|   |   |-- sync.ts
|   |   `-- search.ts
|   `-- templates/
|       |-- meeting-note.md
|       |-- research-note.md
|       `-- daily-note.md
|-- data/
|   |-- cache/
|   |   `-- .gitkeep
|   `-- index/
|       `-- .gitkeep
|-- docs/
|   |-- authentication.md
|   |-- cli-contracts.md
|   `-- note-taxonomy.md
`-- tests/
    |-- codimd-client.test.ts
    `-- search.test.ts
```

## Architecture

The project is split into four layers:

1. `src/cli/`
   Exposes agent-callable commands, for example `search`, `read`, `create`, `update`, and `sync`.

2. `src/codimd/`
   Contains the CodiMD integration. Start with HTTP/session-based access if the server supports it. If your deployment exposes direct database access, keep that implementation behind the same client interface.

3. `src/indexer/`
   Maintains a local cache and searchable index of note metadata and Markdown content. This makes knowledge lookup much faster than scanning the server every time.

4. `src/templates/`
   Stores reusable Markdown templates for common note types.

## Recommended CLI Commands

### `codimd-helper search`

Search notes by query text, tags, title, or date.

Examples:

```powershell
codimd-helper search "transformer paper" --limit 10
codimd-helper search "meeting" --tag meeting/project
```

Recommended JSON mode for agents:

```powershell
codimd-helper search "transformer paper" --json
```

Output:

```json
{
  "ok": true,
  "notes": [
    {
      "id": "string",
      "title": "string",
      "url": "string",
      "updatedAt": "ISO-8601",
      "summary": "string"
    }
  ]
}
```

### `codimd-helper read`

Read one note as Markdown.

Examples:

```powershell
codimd-helper read "http://140.115.52.84:3000/example-note"
codimd-helper read "example-note" --json
```

Output:

```json
{
  "ok": true,
  "id": "string",
  "title": "string",
  "markdown": "string",
  "url": "string",
  "updatedAt": "ISO-8601"
}
```

### `codimd-helper create`

Create a new CodiMD note from Markdown or a template.

Examples:

```powershell
codimd-helper create --title "Research Note" --template research-note --tag research/paper
codimd-helper create --title "Raw Note" --file .\note.md
```

Output:

```json
{
  "ok": true,
  "id": "string",
  "url": "string"
}
```

### `codimd-helper update`

Update a note. This should require explicit confirmation in the agent workflow unless the caller passes `--yes`.

Examples:

```powershell
codimd-helper update "example-note" --append --file .\action-items.md
codimd-helper update "example-note" --replace --file .\new-note.md --yes
```

Output:

```json
{
  "ok": true,
  "id": "string",
  "url": "string",
  "updatedAt": "ISO-8601"
}
```

### `codimd-helper sync`

Refresh the local searchable index from CodiMD.

Examples:

```powershell
codimd-helper sync
codimd-helper sync --full
```

Output:

```json
{
  "ok": true,
  "indexedNotes": 42,
  "updatedNotes": 3
}
```

## Knowledge Organization

Recommended note frontmatter:

```yaml
---
title: Example Note
tags:
  - project
  - research
source: codimd
created: 2026-06-22
updated: 2026-06-22
---
```

Recommended tags:

- `project/*` for project notes.
- `meeting/*` for meeting notes.
- `research/*` for literature and reference notes.
- `decision/*` for decisions.
- `todo/*` for action lists.

## Implementation Notes

- Keep CodiMD server credentials in `.env`, never in source files.
- Prefer official APIs if enabled on the server.
- If the server has no usable API, use authenticated HTTP requests and parse exported Markdown.
- Keep all search/index state in `data/`, so the agent can rebuild it without mutating the CodiMD server.
- Make note updates conservative: read current note, compute diff, then write.
- Always provide `--json` for agent workflows so results are easy to parse.
