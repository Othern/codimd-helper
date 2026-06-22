export interface MarkdownChunk {
  chunkIndex: number;
  content: string;
  summary: string;
}

export interface ChunkOptions {
  maxChars: number;
  overlapChars: number;
}

export function chunkMarkdown(markdown: string, options: ChunkOptions): MarkdownChunk[] {
  const maxChars = Math.max(200, options.maxChars);
  const overlapChars = Math.min(Math.max(0, options.overlapChars), Math.floor(maxChars / 2));
  const blocks = markdown
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const block of blocks) {
    if (block.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }

      chunks.push(...splitLongBlock(block, maxChars, overlapChars));
      continue;
    }

    const next = current ? `${current}\n\n${block}` : block;
    if (next.length > maxChars && current) {
      chunks.push(current);
      current = withOverlap(current, overlapChars, block);
      continue;
    }

    current = next;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.map((content, chunkIndex) => ({
    chunkIndex,
    content,
    summary: summarizeChunk(content)
  }));
}

function splitLongBlock(block: string, maxChars: number, overlapChars: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < block.length) {
    const end = Math.min(block.length, start + maxChars);
    chunks.push(block.slice(start, end).trim());

    if (end === block.length) {
      break;
    }

    start = Math.max(0, end - overlapChars);
  }

  return chunks.filter(Boolean);
}

function withOverlap(previous: string, overlapChars: number, nextBlock: string): string {
  if (overlapChars === 0) {
    return nextBlock;
  }

  return `${previous.slice(-overlapChars)}\n\n${nextBlock}`;
}

function summarizeChunk(content: string): string {
  return content
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/[#>*_`[\]()!]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}
