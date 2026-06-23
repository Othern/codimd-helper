import type { AppConfig } from "../config.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface CodimdMe {
  status: string;
  id: string;
  name?: string;
  photo?: string;
}

export interface CodimdCreatedNote {
  id: string;
  url: string;
  downloadUrl: string;
  updated: boolean;
}

export class CodimdClient {
  constructor(private readonly config: AppConfig) {}

  get baseUrl(): string {
    return this.config.codimdBaseUrl.replace(/\/$/, "");
  }

  async login(email = this.config.codimdUsername, password = this.config.codimdPassword): Promise<CodimdMe> {
    if (!email || !password) {
      throw new Error("CODIMD_USERNAME and CODIMD_PASSWORD are required for login.");
    }

    const body = new URLSearchParams({ email, password });
    const response = await fetch(`${this.baseUrl}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...this.cookieHeaders()
      },
      body,
      redirect: "manual"
    });

    await this.storeResponseCookies(response);

    if (![200, 302].includes(response.status)) {
      throw new Error(`CodiMD login failed with HTTP ${response.status}.`);
    }

    const me = await this.getMe();
    if (!me) {
      throw new Error("CodiMD login did not produce an authenticated session.");
    }
    return me;
  }

  async getMe(): Promise<CodimdMe | null> {
    const response = await fetch(`${this.baseUrl}/me`, {
      headers: await this.authHeaders()
    });

    await this.storeResponseCookies(response);

    if (response.status === 401) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`CodiMD /me failed with HTTP ${response.status}.`);
    }

    return (await response.json()) as CodimdMe;
  }

  async ensureAuthenticated(): Promise<CodimdMe> {
    const me = await this.getMe();
    if (me) {
      return me;
    }

    if (this.config.codimdUsername && this.config.codimdPassword) {
      return this.login();
    }

    throw new Error("CodiMD session is missing or expired. Run codimd-helper login or set CODIMD_USERNAME/CODIMD_PASSWORD.");
  }

  async createNote(markdown: string): Promise<CodimdCreatedNote> {
    await this.ensureAuthenticated();

    const response = await fetch(`${this.baseUrl}/new`, {
      method: "POST",
      headers: {
        "Content-Type": "text/markdown",
        ...(await this.authHeaders())
      },
      body: markdown,
      redirect: "manual"
    });

    await this.storeResponseCookies(response);

    if (response.status !== 302) {
      throw new Error(`CodiMD create failed with HTTP ${response.status}.`);
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error("CodiMD create response did not include a Location header.");
    }

    const url = new URL(location, this.baseUrl).toString();
    const id = trimLeadingSlash(new URL(url).pathname);
    let updated = false;

    try {
      await this.updateNoteContent(id, markdown);
      updated = true;
    } catch {
      updated = false;
    }

    return {
      id,
      url,
      downloadUrl: new URL(`${id}/download`, `${this.baseUrl}/`).toString(),
      updated
    };
  }

  async downloadNote(noteIdOrUrl: string): Promise<string> {
    const noteUrl = this.noteUrl(noteIdOrUrl);
    const response = await fetch(new URL("download", ensureTrailingSlash(noteUrl)).toString(), {
      headers: await this.authHeaders()
    });

    await this.storeResponseCookies(response);

    if (!response.ok) {
      throw new Error(`CodiMD note download failed with HTTP ${response.status}.`);
    }

    return response.text();
  }

  private async updateNoteContent(noteIdOrUrl: string, markdown: string): Promise<void> {
    const noteId = this.noteId(noteIdOrUrl);
    const response = await fetch(`${this.baseUrl}/api/notes/${encodeURIComponent(noteId)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(await this.authHeaders())
      },
      body: JSON.stringify({ content: markdown })
    });

    await this.storeResponseCookies(response);

    if (!response.ok) {
      throw new Error(`CodiMD note update failed with HTTP ${response.status}.`);
    }
  }

  private noteUrl(noteIdOrUrl: string): string {
    return new URL(this.noteId(noteIdOrUrl), `${this.baseUrl}/`).toString();
  }

  private noteId(noteIdOrUrl: string): string {
    try {
      return trimLeadingSlash(new URL(noteIdOrUrl).pathname);
    } catch {
      return trimLeadingSlash(noteIdOrUrl);
    }
  }

  private async authHeaders(): Promise<Record<string, string>> {
    return this.cookieHeaders(await this.readCookieHeader());
  }

  private cookieHeaders(cookie = this.config.codimdSessionCookie): Record<string, string> {
    if (!cookie) {
      return {};
    }
    return { Cookie: cookie.includes("=") ? cookie : `connect.sid=${cookie}` };
  }

  private async readCookieHeader(): Promise<string | undefined> {
    if (this.config.codimdSessionCookie) {
      return this.config.codimdSessionCookie;
    }

    try {
      const cookieFile = await readFile(this.config.codimdCookiePath, "utf8");
      return cookieFile.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  private async storeResponseCookies(response: Response): Promise<void> {
    if (this.config.codimdSessionCookie) {
      return;
    }

    const setCookies = getSetCookieHeaders(response.headers);
    const sessionCookie = setCookies.find((cookie) => cookie.startsWith("connect.sid="));
    if (!sessionCookie) {
      return;
    }

    const cookiePair = sessionCookie.split(";", 1)[0];
    await mkdir(dirname(this.config.codimdCookiePath), { recursive: true });
    await writeFile(this.config.codimdCookiePath, cookiePair, "utf8");
  }
}

function getSetCookieHeaders(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetter.getSetCookie === "function") {
    return withGetter.getSetCookie();
  }

  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

function trimLeadingSlash(value: string): string {
  return value.replace(/^\/+/, "");
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
