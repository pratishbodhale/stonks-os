function decodeBasicHtmlEntities(s: string): string {
  let out = s;
  for (let i = 0; i < 6; i++) {
    const next = out
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
    if (next === out) {
      break;
    }
    out = next;
  }
  return out;
}

/**
 * Removes `<think>…</think>` blocks (and common variants: spaces, attributes, entities, fullwidth brackets).
 */
const PAIRED_BLOCK = /<\s*think\b[^>]*>[\s\S]*?<\s*\/\s*think\s*>/gi;

const PAIRED_BLOCK_FULLWIDTH =
  /\uFF1C\s*think\b[^\uFF1E]*\uFF1E[\s\S]*?\uFF1C\s*\/\s*think\s*\uFF1E/gi;

const LONE_CLOSE = /<\s*\/\s*think\s*>|\uFF1C\s*\/\s*think\s*\uFF1E/i;

function stripLoneClosingTags(s: string): string {
  let out = s;
  while (true) {
    const m = out.match(LONE_CLOSE);
    if (!m || m.index === undefined) {
      break;
    }
    out = out.slice(m.index + m[0].length).trimStart();
  }
  return out;
}

export function stripThinkingTags(raw: string): string {
  let s = decodeBasicHtmlEntities(raw);
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(PAIRED_BLOCK, "");
    s = s.replace(PAIRED_BLOCK_FULLWIDTH, "");
  }
  s = stripLoneClosingTags(s);
  return s.trim();
}

/** Prepare LLM markdown for react-markdown (strip thinking blocks and code fences). */
export function normalizeAiMarkdown(raw: string): string {
  let s = stripThinkingTags(raw);
  const fenced = s.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i);
  if (fenced) {
    s = fenced[1];
  } else {
    s = s.replace(/^```(?:markdown|md)?\s*\n/i, "");
    s = s.replace(/\n```\s*$/i, "");
  }
  return s.trim();
}
