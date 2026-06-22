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

