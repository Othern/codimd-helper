import "dotenv/config";

export interface AppConfig {
  codimdBaseUrl: string;
  codimdDbUrl?: string;
  indexPath: string;
  cachePath: string;
}

export function loadConfig(): AppConfig {
  return {
    codimdBaseUrl: process.env.CODIMD_BASE_URL ?? "http://140.115.52.84:3000",
    codimdDbUrl: process.env.CODIMD_DB_URL,
    indexPath: process.env.INDEX_PATH ?? "./data/index",
    cachePath: process.env.CACHE_PATH ?? "./data/cache"
  };
}
