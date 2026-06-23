export function buildFrontmatter(title: string, tags: string[], date: string): string {
  const tagLines = tags.map((tag) => `  - ${tag}`).join("\n");

  return [
    "---",
    `title: ${title}`,
    "tags:",
    tagLines || "  - uncategorized",
    "source: codimd",
    `created: ${date}`,
    `updated: ${date}`,
    "---"
  ].join("\n");
}

export function buildNoteMarkdown(title: string, tags: string[], body: string, date = currentDate()): string {
  const normalizedBody = body.trimStart();
  const heading = normalizedBody.startsWith("#") ? "" : `# ${title}\n\n`;

  return `${buildFrontmatter(title, tags, date)}\n\n${heading}${normalizedBody}`.trimEnd() + "\n";
}

export function applyTemplateVariables(template: string, title: string, tags: string[], date = currentDate()): string {
  const tagLines = tags.length > 0 ? tags.map((tag) => `  - ${tag}`).join("\n") : "  - uncategorized";

  return template
    .replace(/^title:\s.*$/m, `title: ${title}`)
    .replace(/^created:\s.*$/m, `created: ${date}`)
    .replace(/^updated:\s.*$/m, `updated: ${date}`)
    .replace(/tags:\n(?:  - .*\n?)+/m, `tags:\n${tagLines}\n`)
    .replace(/^# .*/m, `# ${title}`);
}

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}
