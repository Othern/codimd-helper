import pg from "pg";

import type { AppConfig } from "../config.js";
import type { IndexedNote } from "../indexer/store.js";

const { Pool } = pg;

interface NoteTableInfo {
  tableName: string;
  columns: Set<string>;
}

export class CodimdDatabase {
  private readonly pool: pg.Pool;

  constructor(config: AppConfig) {
    if (!config.codimdDbUrl) {
      throw new Error("CODIMD_DB_URL is required for database-backed search.");
    }

    validateDatabaseUrl(config.codimdDbUrl);

    this.pool = new Pool({
      connectionString: config.codimdDbUrl
    });
  }

  async searchNotes(query: string, limit: number): Promise<IndexedNote[]> {
    const table = await this.getNotesTable();
    const searchableColumns = ["title", "content", "shortid", "alias"].filter((column) => table.columns.has(column));

    if (searchableColumns.length === 0) {
      throw new Error("Could not find searchable columns on the CodiMD Notes table.");
    }

    const where = searchableColumns.map((column) => `${quoteIdent(column)} ILIKE $1`).join(" OR ");
    const selected = this.selectColumns(table.columns);
    const orderBy = table.columns.has("updatedAt") ? `${quoteIdent("updatedAt")} DESC` : quoteIdent("id");

    const result = await this.pool.query(
      `SELECT ${selected} FROM ${quoteIdent(table.tableName)} WHERE ${where} ORDER BY ${orderBy} LIMIT $2`,
      [`%${query}%`, limit]
    );

    return result.rows.map((row) => this.rowToIndexedNote(row));
  }

  async readNote(noteIdOrUrl: string): Promise<IndexedNote & { markdown: string }> {
    const table = await this.getNotesTable();
    const key = normalizeNoteKey(noteIdOrUrl);
    const matchColumns = ["id", "shortid", "alias"].filter((column) => table.columns.has(column));

    if (matchColumns.length === 0) {
      throw new Error("Could not find note identifier columns on the CodiMD Notes table.");
    }

    const where = matchColumns.map((column, index) => `${quoteIdent(column)} = $${index + 1}`).join(" OR ");
    const selected = this.selectColumns(table.columns);
    const result = await this.pool.query(
      `SELECT ${selected} FROM ${quoteIdent(table.tableName)} WHERE ${where} LIMIT 1`,
      matchColumns.map(() => key)
    );

    if (result.rowCount === 0) {
      throw new Error(`Note not found: ${noteIdOrUrl}`);
    }

    const note = this.rowToIndexedNote(result.rows[0]);
    return {
      ...note,
      markdown: String(result.rows[0].content ?? "")
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async getNotesTable(): Promise<NoteTableInfo> {
    const tableResult = await this.pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND lower(table_name) = 'notes' LIMIT 1`
    );

    if (tableResult.rowCount === 0) {
      throw new Error("Could not find the CodiMD Notes table in the public schema.");
    }

    const tableName = String(tableResult.rows[0].table_name);
    const columnResult = await this.pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );

    return {
      tableName,
      columns: new Set(columnResult.rows.map((row) => String(row.column_name)))
    };
  }

  private selectColumns(columns: Set<string>): string {
    return ["id", "shortid", "alias", "title", "content", "updatedAt", "createdAt"]
      .filter((column) => columns.has(column))
      .map(quoteIdent)
      .join(", ");
  }

  private rowToIndexedNote(row: Record<string, unknown>): IndexedNote {
    const slug = String(row.alias ?? row.shortid ?? row.id);
    const title = String(row.title ?? firstHeading(String(row.content ?? "")) ?? "Untitled");
    const content = String(row.content ?? "");

    return {
      id: String(row.id ?? slug),
      title,
      url: joinUrl(process.env.CODIMD_BASE_URL ?? "http://140.115.52.84:3000", slug),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : stringifyOptional(row.updatedAt),
      summary: summarizeMarkdown(content)
    };
  }
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function normalizeNoteKey(noteIdOrUrl: string): string {
  try {
    const url = new URL(noteIdOrUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts.at(-1) ?? noteIdOrUrl);
  } catch {
    return noteIdOrUrl;
  }
}

function joinUrl(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(slug)}`;
}

function firstHeading(markdown: string): string | undefined {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^#\s+(.+)$/)?.[1]?.trim())
    .find((heading): heading is string => Boolean(heading));
}

function summarizeMarkdown(markdown: string): string {
  return markdown
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/[#>*_`[\]()]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 40)
    .join(" ");
}

function stringifyOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return String(value);
}

function validateDatabaseUrl(databaseUrl: string): void {
  let url: URL;

  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("CODIMD_DB_URL is not a valid PostgreSQL URL.");
  }

  const placeholders = new Set(["HOST", "USER", "PASSWORD", "DATABASE"]);
  const values = [
    url.hostname,
    decodeURIComponent(url.username),
    decodeURIComponent(url.password),
    url.pathname.replace(/^\//, "")
  ];

  const found = values.find((value) => placeholders.has(value));

  if (found) {
    throw new Error(`CODIMD_DB_URL still contains placeholder value "${found}". Replace .env.example values in your real .env file.`);
  }
}
