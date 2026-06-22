import type { AppConfig } from "../config.js";

export class CodimdClient {
  constructor(private readonly config: AppConfig) {}

  get baseUrl(): string {
    return this.config.codimdBaseUrl;
  }
}

