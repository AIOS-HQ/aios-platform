/**
 * Dependency-free Markdown parser for Harmony chat replies.
 *
 * Pure (no React) so it can be unit-tested in isolation and reused. The React
 * layer (harmony-markdown.tsx) maps this AST to elements — escaping is handled
 * by React, so there is NO dangerouslySetInnerHTML and no XSS surface here.
 *
 * Scope is deliberately the subset Harmony actually emits: headings, emphasis,
 * inline code, fenced code blocks (with language), GFM tables, ordered/unordered
 * lists, blockquotes, links, horizontal rules, and paragraphs. It is tolerant of
 * INCOMPLETE markdown (an unclosed code fence, a half-typed table) because
 * replies stream in token-by-token — a partial fence renders as code-in-progress
 * rather than corrupting the rest of the message.
 */

export type Align = "left" | "center" | "right" | null;

export type Inline =
  | { kind: "text"; value: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "del"; children: Inline[] }
  | { kind: "code"; value: string }
  | { kind: "link"; href: string; children: Inline[] }
  | { kind: "br" };

export type Block =
  | { type: "heading"; level: number; inline: Inline[] }
  | { type: "paragraph"; inline: Inline[] }
  | { type: "code"; lang: string; value: string; closed: boolean }
  | { type: "hr" }
  | { type: "blockquote"; inline: Inline[] }
  | { type: "list"; ordered: boolean; start: number; items: Inline[][] }
  | { type: "table"; header: Inline[][]; align: Align[]; rows: Inline[][][] };

/** Only allow safe link schemes; anything else renders as plain text. */
function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  // Allow root-relative and anchor links; reject javascript:, data:, etc.
  if (/^[/#]/.test(href)) return href;
  return null;
}

const WORD = /[0-9A-Za-z]/;

/** Find the index of `token` at or after `from`, or -1. */
function indexOfToken(src: string, token: string, from: number): number {
  return src.indexOf(token, from);
}

/**
 * Parse inline markdown into a node list. Precedence: code span, link, strong
 * (** / __), strikethrough (~~), emphasis (* / _). Unmatched delimiters degrade
 * to literal text (streaming-safe). Underscore emphasis is only honored at word
 * boundaries so snake_case identifiers are left intact.
 */
export function parseInline(src: string): Inline[] {
  const nodes: Inline[] = [];
  let buf = "";
  let i = 0;

  const flush = () => {
    if (buf) {
      nodes.push({ kind: "text", value: buf });
      buf = "";
    }
  };

  while (i < src.length) {
    const ch = src[i];

    // Inline code — content is literal, never further parsed.
    if (ch === "`") {
      const close = indexOfToken(src, "`", i + 1);
      if (close !== -1) {
        flush();
        nodes.push({ kind: "code", value: src.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }

    // Link [text](href)
    if (ch === "[") {
      const m = /^\[([^\]]*)\]\(([^)\s]+)\)/.exec(src.slice(i));
      if (m) {
        const href = safeHref(m[2]);
        if (href) {
          flush();
          nodes.push({ kind: "link", href, children: parseInline(m[1]) });
          i += m[0].length;
          continue;
        }
      }
    }

    // Strong: ** or __
    if (src.startsWith("**", i) || src.startsWith("__", i)) {
      const delim = src.slice(i, i + 2);
      const usesUnderscore = delim === "__";
      const prev = src[i - 1] ?? "";
      const boundaryOk = !usesUnderscore || !WORD.test(prev);
      if (boundaryOk) {
        const close = indexOfToken(src, delim, i + 2);
        if (close !== -1 && close > i + 2) {
          const after = src[close + 2] ?? "";
          if (!usesUnderscore || !WORD.test(after)) {
            flush();
            nodes.push({ kind: "strong", children: parseInline(src.slice(i + 2, close)) });
            i = close + 2;
            continue;
          }
        }
      }
    }

    // Strikethrough ~~
    if (src.startsWith("~~", i)) {
      const close = indexOfToken(src, "~~", i + 2);
      if (close !== -1 && close > i + 2) {
        flush();
        nodes.push({ kind: "del", children: parseInline(src.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
    }

    // Emphasis: single * or _
    if (ch === "*" || ch === "_") {
      const usesUnderscore = ch === "_";
      const prev = src[i - 1] ?? "";
      const boundaryOk = !usesUnderscore || !WORD.test(prev);
      const nextCh = src[i + 1] ?? "";
      if (boundaryOk && nextCh && nextCh !== ch && nextCh !== " ") {
        // Find the next single delimiter that is not part of a doubled run.
        let j = i + 1;
        let close = -1;
        while (j < src.length) {
          if (src[j] === ch && src[j + 1] !== ch && src[j - 1] !== ch) {
            close = j;
            break;
          }
          j++;
        }
        if (close !== -1) {
          const after = src[close + 1] ?? "";
          if (!usesUnderscore || !WORD.test(after)) {
            flush();
            nodes.push({ kind: "em", children: parseInline(src.slice(i + 1, close)) });
            i = close + 1;
            continue;
          }
        }
      }
    }

    buf += ch;
    i++;
  }

  flush();
  return nodes;
}

const FENCE = /^(```+|~~~+)(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const UL = /^(\s*)[-*+]\s+(.*)$/;
const OL = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;

/** A GFM delimiter row: | :---: | ---- | etc. */
function isTableDelimiter(line: string): boolean {
  if (!line.includes("-")) return false;
  const cells = splitTableRow(line);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

/** Split a table row on unescaped pipes, trimming the optional outer pipes. */
function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (ch === "|") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function alignFrom(cell: string): Align {
  const c = cell.trim();
  const left = c.startsWith(":");
  const right = c.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

/**
 * Parse a full markdown document into blocks. Robust to partial input.
 */
export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line — skip (block separator).
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block.
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1][0].repeat(3);
      const lang = fence[2].trim().split(/\s+/)[0] ?? "";
      const body: string[] = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        if (lines[i].trimEnd().startsWith(marker) && FENCE.test(lines[i].trim())) {
          closed = true;
          i++;
          break;
        }
        body.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code", lang, value: body.join("\n"), closed });
      continue;
    }

    // Heading.
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, inline: parseInline(heading[2]) });
      i++;
      continue;
    }

    // Horizontal rule.
    if (HR.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Table: a header row followed by a delimiter row.
    if (line.includes("|") && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
      const header = splitTableRow(line).map((c) => parseInline(c));
      const align = splitTableRow(lines[i + 1]).map(alignFrom);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitTableRow(lines[i]).map((c) => parseInline(c)));
        i++;
      }
      blocks.push({ type: "table", header, align, rows });
      continue;
    }

    // Blockquote (consecutive > lines).
    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(QUOTE.exec(lines[i])![1]);
        i++;
      }
      const inline: Inline[] = [];
      quoted.forEach((q, idx) => {
        if (idx > 0) inline.push({ kind: "br" });
        inline.push(...parseInline(q));
      });
      blocks.push({ type: "blockquote", inline });
      continue;
    }

    // Lists (unordered / ordered). A run of consecutive matching items.
    if (UL.test(line) || OL.test(line)) {
      const ordered = OL.test(line);
      const start = ordered ? parseInt(OL.exec(line)![2], 10) : 1;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const cur = lines[i];
        const m = ordered ? OL.exec(cur) : UL.exec(cur);
        if (m) {
          const text = ordered ? m[3] : m[2];
          items.push(parseInline(text));
          i++;
        } else if (cur.trim() !== "" && /^\s+/.test(cur) && items.length > 0) {
          // Continuation / simple nested line — fold into the previous item.
          items[items.length - 1].push({ kind: "br" }, ...parseInline(cur.trim()));
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: "list", ordered, start, items });
      continue;
    }

    // Paragraph — consecutive non-blank lines that don't start another block.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      const l = lines[i];
      if (
        FENCE.test(l) ||
        HEADING.test(l) ||
        HR.test(l) ||
        QUOTE.test(l) ||
        UL.test(l) ||
        OL.test(l) ||
        (l.includes("|") && i + 1 < lines.length && isTableDelimiter(lines[i + 1]))
      ) {
        break;
      }
      para.push(l);
      i++;
    }
    const inline: Inline[] = [];
    para.forEach((p, idx) => {
      if (idx > 0) inline.push({ kind: "br" });
      inline.push(...parseInline(p));
    });
    blocks.push({ type: "paragraph", inline });
  }

  return blocks;
}
