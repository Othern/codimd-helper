import type { IndexedNote } from "./store.js";
import type { AppConfig } from "../config.js";
import { CodimdDatabase } from "../codimd/database.js";

export interface SearchOptions {
  query: string;
  tags?: string[];
  limit?: number;
}

export async function searchNotes(config: AppConfig, options: SearchOptions): Promise<IndexedNote[]> {
  if (!config.codimdDbUrl) {
    throw new Error("CODIMD_DB_URL is not configured. Set it in .env or use a database tunnel.");
  }

  const database = new CodimdDatabase(config);

  try {
    return await database.searchNotes(options.query, options.limit ?? 10);
  } finally {
    await database.close();
  }
}
