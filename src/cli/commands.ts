import { Command } from "commander";
import { loadConfig } from "../config.js";
import { CodimdDatabase } from "../codimd/database.js";
import { searchNotes } from "../indexer/search.js";

export function runCli(argv = process.argv): void {
  const config = loadConfig();
  const program = new Command();

  program
    .name("codimd-helper")
    .description("CLI helper for searching and managing CodiMD notes")
    .version("0.1.0");

  program
    .command("search")
    .argument("<query>", "Search query")
    .option("--tag <tag...>", "Filter by tag")
    .option("--limit <number>", "Maximum number of results", "10")
    .option("--json", "Print machine-readable JSON")
    .action(async (query: string, options: { tag?: string[]; limit: string; json?: boolean }) => {
      try {
        const notes = await searchNotes(config, {
          query,
          tags: options.tag,
          limit: Number.parseInt(options.limit, 10)
        });

        print({ ok: true, baseUrl: config.codimdBaseUrl, notes }, Boolean(options.json));
      } catch (error) {
        fail(error, Boolean(options.json));
      }
    });

  program
    .command("read")
    .argument("<noteIdOrUrl>", "CodiMD note ID or URL")
    .option("--json", "Print machine-readable JSON")
    .action(async (noteIdOrUrl: string, options: { json?: boolean }) => {
      const database = new CodimdDatabase(config);

      try {
        const note = await database.readNote(noteIdOrUrl);
        print({ ok: true, note }, Boolean(options.json));
      } catch (error) {
        fail(error, Boolean(options.json));
      } finally {
        await database.close();
      }
    });

  program
    .command("create")
    .requiredOption("--title <title>", "Note title")
    .option("--file <path>", "Markdown file to upload")
    .option("--template <name>", "Template name")
    .option("--tag <tag...>", "Tags")
    .option("--json", "Print machine-readable JSON")
    .action((options: { title: string; file?: string; template?: string; tag?: string[]; json?: boolean }) => {
      print(
        {
          ok: false,
          error: "create_not_implemented",
          message: "CodiMD create support is pending authentication/client implementation.",
          title: options.title,
          file: options.file,
          template: options.template,
          tags: options.tag ?? []
        },
        Boolean(options.json)
      );
      process.exitCode = 2;
    });

  program
    .command("update")
    .argument("<noteIdOrUrl>", "CodiMD note ID or URL")
    .option("--append", "Append content")
    .option("--prepend", "Prepend content")
    .option("--replace", "Replace content")
    .option("--file <path>", "Markdown file with update content")
    .option("--yes", "Skip confirmation")
    .option("--json", "Print machine-readable JSON")
    .action((noteIdOrUrl: string, options: { json?: boolean }) => {
      print(
        {
          ok: false,
          error: "update_not_implemented",
          message: "CodiMD update support is pending authentication/client implementation.",
          noteIdOrUrl
        },
        Boolean(options.json)
      );
      process.exitCode = 2;
    });

  program
    .command("sync")
    .option("--full", "Rebuild the full local index")
    .option("--json", "Print machine-readable JSON")
    .action((options: { full?: boolean; json?: boolean }) => {
      print(
        {
          ok: true,
          baseUrl: config.codimdBaseUrl,
          full: Boolean(options.full),
          indexedNotes: 0,
          updatedNotes: 0,
          message: "Index sync scaffold is ready; CodiMD fetch implementation is pending."
        },
        Boolean(options.json)
      );
    });

  program.parse(argv);
}

function print(payload: unknown, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(JSON.stringify(payload, null, 2));
}

function fail(error: unknown, asJson: boolean): void {
  const message = error instanceof Error ? error.message : String(error);
  print({ ok: false, error: "command_failed", message }, asJson);
  process.exitCode = 1;
}
