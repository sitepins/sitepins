/**
 * Determines whether a user's prompt is an informational query / explanation request
 * (which should be answered in the sidebar chat box) vs a code editing instruction
 * (which should directly modify the editor).
 */
export function isExplanationQuery(rawPrompt: string): boolean {
  const prompt = rawPrompt.trim().toLowerCase();
  if (!prompt) return false;

  // 1. Exact or leading explanation questions
  const explicitQuestionStarters = [
    "what does",
    "what is",
    "what are",
    "what it does",
    "what it do",
    "what this does",
    "what happens",
    "what's this",
    "whats this",
    "why does",
    "why is",
    "why are",
    "why did",
    "how does",
    "how do i",
    "how can i",
    "how is",
    "how it works",
    "how to use",
    "tell me about",
    "tell me what",
    "help me understand",
    "walk me through",
    "meaning of",
    "purpose of",
  ];

  for (const starter of explicitQuestionStarters) {
    if (prompt.startsWith(starter) || prompt.includes(` ${starter}`)) {
      return true;
    }
  }

  // 2. Explicit explanation verbs
  const explanationVerbs = [
    "explain",
    "describe",
    "summarize",
    "summary",
    "clarify",
    "overview",
    "break down",
    "breakdown",
    "audit",
    "analyze",
    "analysis",
    "critique",
    "review",
  ];

  for (const verb of explanationVerbs) {
    const regex = new RegExp(
      `(^|\\b)(can you |could you |please )?${verb}\\b`,
      "i",
    );
    if (regex.test(prompt)) {
      // If combined with an explicit edit action, it's asking to modify code (e.g. "explain and fix", "review and refactor")
      if (
        /\b(and |then )?(fix|refactor|edit|change|update|rewrite|modify|add)\b/i.test(
          prompt,
        )
      ) {
        return false;
      }
      return true;
    }
  }

  // 3. Question format inquiries without code-edit action verbs
  const isQuestion =
    prompt.endsWith("?") ||
    /^(is|are|can|could|does|do|will|should|would|has|have)\b/i.test(prompt);

  const editActionVerbs = [
    "add",
    "insert",
    "append",
    "remove",
    "delete",
    "replace",
    "change",
    "modify",
    "update",
    "refactor",
    "fix",
    "implement",
    "create",
    "generate",
    "make",
    "convert",
    "rewrite",
    "optimize",
    "rename",
    "format",
    "extract",
    "wrap",
  ];

  const hasEditAction = editActionVerbs.some((v) => {
    const regex = new RegExp(`\\b${v}\\b`, "i");
    return regex.test(prompt);
  });

  if (isQuestion && !hasEditAction) {
    return true;
  }

  // 4. Common phrases like "what it does", "what this does", "what does it do"
  if (
    /\bwhat (it|this) does\b/i.test(prompt) ||
    /\bwhat (does|is) (it|this)\b/i.test(prompt)
  ) {
    return true;
  }

  // Default to code edit
  return false;
}
