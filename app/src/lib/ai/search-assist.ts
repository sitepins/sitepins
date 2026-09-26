/**
 * File picking for the global search's Copilot (`/api/ai/search`): given a
 * question and an index of the project's files, the model returns the few
 * files most likely to answer it, whose contents the client then reads and
 * hands to `/api/ai/chat`. Pure functions so the prompt and the response
 * sanitizing are testable without a model.
 */

export type TSearchIndexFile = {
  /** Short numeric id so the model can answer cheaply and unambiguously. */
  id: number;
  path: string;
  collection?: string;
  /** ISO date of the last commit, when the client knows it. */
  updated?: string;
  /** ISO date of the first commit, when the client knows it. */
  created?: string;
  size?: number;
};

export type TSearchAssistResult = { fileIds: number[] };

export const MAX_AI_FILE_MATCHES = 3;

const day = (iso?: string) => (iso ? iso.slice(0, 10) : "");

export function formatFileIndexLine(file: TSearchIndexFile): string {
  const parts = [String(file.id), file.path, file.collection ?? ""];
  const updated = day(file.updated);
  const created = day(file.created);
  if (updated || created || file.size) {
    parts.push(updated, created, file.size ? String(file.size) : "");
  }
  return parts.join("|").replace(/\|+$/, "");
}

/**
 * Renders as many index lines as fit in `maxChars`, so large repositories
 * degrade by truncation instead of blowing the model's context.
 */
export function buildFileIndexBlock(
  files: TSearchIndexFile[],
  maxChars: number,
): { block: string; omitted: number } {
  const lines: string[] = [];
  let used = 0;
  for (const file of files) {
    const line = formatFileIndexLine(file);
    if (used + line.length + 1 > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  return { block: lines.join("\n"), omitted: files.length - lines.length };
}

export function buildSearchAssistPrompt({
  query,
  files,
  today,
  maxIndexChars,
}: {
  query: string;
  files: TSearchIndexFile[];
  today: string;
  maxIndexChars: number;
}): { system: string; prompt: string } {
  const { block, omitted } = buildFileIndexBlock(files, maxIndexChars);

  const system = `You pick files for an assistant inside Sitepins, a Git-based CMS.
Given the user's question and the list of files in their site's repository, return ONLY a JSON object:
{ "fileIds": number[] }

RULES:
- Up to ${MAX_AI_FILE_MATCHES} ids from FILES whose contents would best help answer the question, most useful first. Match on meaning, synonyms, slugs and folder names. Use the updated/created dates for time-based questions and size for size-based ones.
- Empty when the question isn't about specific files or content (e.g. how to use the CMS).
- Never invent ids. Output JSON only, no prose.`;

  const prompt = `TODAY: ${today}

QUESTION: ${query}

FILES (id|path|collection|updated|created|bytes):
${block || "(none)"}${omitted > 0 ? `\n… ${omitted} more files not shown` : ""}`;

  return { system, prompt };
}

const toNumber = (value: unknown): number | null => {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) ? n : null;
};

/** Drops ids the model invented, dedupes, and caps the list. */
export function sanitizeSearchAssistResult(
  raw: unknown,
  { fileIds }: { fileIds: Set<number> },
): TSearchAssistResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const files = Array.isArray(obj.fileIds) ? obj.fileIds : [];
  return {
    fileIds: [
      ...new Set(
        files
          .map(toNumber)
          .filter((id): id is number => id !== null && fileIds.has(id)),
      ),
    ].slice(0, MAX_AI_FILE_MATCHES),
  };
}
