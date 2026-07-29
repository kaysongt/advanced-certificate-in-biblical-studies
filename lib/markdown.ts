/**
 * TypeScript port of the markdown + ::: directive renderer in build.py.
 *
 * Kept deliberately faithful to the Python so that content/ renders identically
 * whichever pipeline produces it. If you change rendering here, change build.py
 * too — content/ is the shared source of truth.
 */

import { createHash } from "node:crypto";

export const TODO = "[FROM BOOK]";

// ---------------------------------------------------------------- escaping

export function escapeHtml(s: string, quote = true): string {
  let out = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (quote) out = out.replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  return out;
}

/** Inline markdown: links, bold, italic, code. Mirrors build.py `_inline`. */
function inline(s: string): string {
  let out = escapeHtml(s, false);
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
}

/** Inline markdown for text inside directives. Mirrors build.py `_md_span`. */
function mdSpan(s: string): string {
  let out = escapeHtml(s, false);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  return out;
}

// ---------------------------------------------------------------- markdown

/** Block-level markdown. Mirrors build.py `_fallback_markdown`. */
export function renderMarkdown(text: string): string {
  const out: string[] = [];
  const lines = text.split("\n");
  let i = 0;

  const cells = (row: string) =>
    row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];
    const st = line.trim();

    if (!st) {
      i += 1;
      continue;
    }

    if (st.startsWith("#")) {
      const lv = st.length - st.replace(/^#+/, "").length;
      out.push(`<h${lv}>${inline(st.slice(lv).trim())}</h${lv}>`);
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(st)) {
      out.push("<hr>");
      i += 1;
      continue;
    }

    if (st.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1])) {
      const head = cells(st);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        body.push(cells(lines[i]));
        i += 1;
      }
      const th = head.map((c) => `<th>${inline(c)}</th>`).join("");
      const tr = body
        .map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>")
        .join("");
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`);
      continue;
    }

    if (st.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        buf.push(lines[i].trim().replace(/^>+/, "").trim());
        i += 1;
      }
      out.push(`<blockquote><p>${inline(buf.join(" "))}</p></blockquote>`);
      continue;
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const tag = ordered ? "ol" : "ul";
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, ""));
        i += 1;
      }
      out.push(`<${tag}>` + items.map((x) => `<li>${inline(x)}</li>`).join("") + `</${tag}>`);
      continue;
    }

    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(#|>|[-*+]\s|\d+\.\s|\|)/.test(lines[i])
    ) {
      buf.push(lines[i].trim());
      i += 1;
    }
    if (buf.length) out.push(`<p>${inline(buf.join(" "))}</p>`);
    // Guard against a line that matched none of the branches above.
    if (!buf.length && i < lines.length && lines[i].trim()) i += 1;
  }

  return out.join("\n");
}

// ------------------------------------------------------------ front matter

export type FrontMatter = Record<string, string>;

/**
 * Mirrors build.py `parse_front_matter`.
 *
 * Deliberately NOT a YAML parser: values legitimately contain `[FROM BOOK]`,
 * which YAML would read as an empty array, and unquoted colons.
 */
export function parseFrontMatter(raw: string): { meta: FrontMatter; body: string } {
  if (!raw.startsWith("---")) return { meta: {}, body: raw };

  // Python's raw.split("---", 2) — at most three pieces.
  const first = raw.indexOf("---");
  const second = raw.indexOf("---", first + 3);
  if (second === -1) return { meta: {}, body: raw };

  const block = raw.slice(first + 3, second);
  const rest = raw.slice(second + 3);

  const meta: FrontMatter = {};
  for (const line of block.trim().split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
    meta[k] = v;
  }
  return { meta, body: rest.replace(/^\n+/, "") };
}

export function slugify(s: string): string {
  const base = s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-");
  return base || "section";
}

// ---------------------------------------------------------------- collector

export type TermEntry = {
  term: string;
  gloss: string;
  definition: string;
  pageTitle: string;
  href: string;
};

export type ScriptureEntry = { ref: string; pageTitle: string; href: string };

/** Gathers terms and scripture references while rendering, for the indexes. */
export class Collector {
  terms: TermEntry[] = [];
  scriptures: ScriptureEntry[] = [];
  private ctx: [string, string] = ["", ""];

  at(title: string, href: string) {
    this.ctx = [title, href];
  }

  get context(): [string, string] {
    return this.ctx;
  }
}

// --------------------------------------------------------------- directives

export type QuizQuestion = {
  id: string;
  stem: string;
  options: { correct: boolean; text: string }[];
  explanation: string;
};

type ParsedQuizQuestion = { stem: string; opts: [boolean, string][]; why: string };

function parseQuizBody(body: string): ParsedQuizQuestion[] {
  const questions: ParsedQuizQuestion[] = [];
  let cur: ParsedQuizQuestion | null = null;

  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("Q ") || line.startsWith("Q\t")) {
      if (cur) questions.push(cur);
      cur = { stem: line.slice(2).trim(), opts: [], why: "" };
    } else if ((line.startsWith("+ ") || line.startsWith("- ")) && cur) {
      cur.opts.push([line[0] === "+", line.slice(2).trim()]);
    } else if (line.startsWith("= ") && cur) {
      cur.why = (cur.why + " " + line.slice(2).trim()).trim();
    } else if (cur && cur.opts.length) {
      cur.why = (cur.why + " " + line).trim();
    } else if (cur) {
      cur.stem += " " + line;
    }
  }
  if (cur) questions.push(cur);

  return questions;
}

function renderQuiz(arg: string, body: string, counter: { n: number }): string {
  const questions = parseQuizBody(body);

  counter.n += 1;
  const qid = `q${counter.n}`;
  const out: string[] = [];

  questions.forEach((q, idx) => {
    let choices = q.opts;
    // Authors write the correct option first. Rotate deterministically so the
    // answer is not always A, while staying stable across rebuilds.
    if (choices.length > 1) {
      const digest = createHash("md5").update(q.stem, "utf8").digest("hex");
      const k = Number(BigInt("0x" + digest) % BigInt(choices.length));
      if (k) choices = [...choices.slice(-k), ...choices.slice(0, -k)];
    }
    const opts = choices
      .map(([ok, text], i) => {
        const mark = String.fromCharCode(65 + i);
        return (
          `<button type="button" class="opt" data-correct="${ok ? 1 : 0}">` +
          `<span class="mk">${mark}</span><span>${mdSpan(text)}</span></button>`
        );
      })
      .join("");
    const why = q.why ? `<div class="why">${mdSpan(q.why)}</div>` : "";
    out.push(
      `<div class="q"><p class="stem"><span class="n">${idx + 1}</span>${mdSpan(q.stem)}</p>` +
        `<div class="opts">${opts}</div>${why}</div>`
    );
  });

  const head = arg || "Check your understanding";
  return (
    `<section class="quiz" data-quiz="${qid}">` +
    `<header><span class="hd">${escapeHtml(head)}</span><span class="score"></span></header>` +
    out.join("") +
    `<footer><button type="button" class="btn reset">Reset</button>` +
    `<span class="verdict"></span></footer></section>`
  );
}

function renderDirective(
  kind: string,
  arg: string,
  body: string,
  coll: Collector,
  counter: { n: number }
): string {
  kind = kind.toLowerCase();

  if (kind === "objectives") {
    const items = body
      .trim()
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => l.replace(/^\s*(\d+\.|[-*])\s*/, "").trim());
    const lis = items.map((x) => `<li>${mdSpan(x)}</li>`).join("");
    const head = arg || "By the end of this topic you will be able to";
    return `<div class="objectives"><h4>${escapeHtml(head)}</h4><ol>${lis}</ol></div>`;
  }

  if (kind === "scripture") {
    const txt = body
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ");
    if (arg) {
      const [title, href] = coll.context;
      coll.scriptures.push({ ref: arg, pageTitle: title, href });
    }
    const ref = arg ? `<span class="ref">${escapeHtml(arg)}</span>` : "";
    return `<div class="scripture"><div class="txt">${mdSpan(txt)}</div>${ref}</div>`;
  }

  if (kind === "quote") {
    const txt = body
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ");
    const src = arg ? `<span class="src">${escapeHtml(arg)}</span>` : "";
    return `<div class="pull"><div class="txt">${mdSpan(txt)}</div>${src}</div>`;
  }

  if (kind === "terms") {
    const rows: string[] = [];
    for (const line of body.trim().split("\n")) {
      if (!line.trim()) continue;
      const parts = line.split("|").map((p) => p.trim());
      let term: string, gloss: string, definition: string;
      if (parts.length >= 3) {
        term = parts[0];
        gloss = parts[1];
        definition = parts.slice(2).join(" ");
      } else if (parts.length === 2) {
        term = parts[0];
        gloss = "";
        definition = parts[1];
      } else {
        continue;
      }
      const [title, href] = coll.context;
      coll.terms.push({ term, gloss, definition, pageTitle: title, href });
      const g = gloss ? `<span class="gk">${mdSpan(gloss)}</span>` : "";
      rows.push(
        `<div class="term"><dt>${mdSpan(term)}${g}</dt>` +
          `<dd>${mdSpan(definition)}</dd></div>`
      );
    }
    return `<dl class="terms">${rows.join("")}</dl>`;
  }

  if (kind === "note" || kind === "warn") {
    const cls = kind === "warn" ? "note warn" : "note";
    const hd = arg ? `<div class="hd">${escapeHtml(arg)}</div>` : "";
    return `<div class="${cls}">${hd}${renderMarkdown(body.trim())}</div>`;
  }

  if (kind === "quiz") return renderQuiz(arg, body, counter);

  return renderMarkdown(body.trim());
}

// ------------------------------------------------------------------ render

const DIRECTIVE = /^:::(\w+)[ \t]*(.*?)[ \t]*$\n([\s\S]*?)^:::[ \t]*$/gm;

/** Extract structured quiz questions for randomized course assessments. */
export function extractQuizQuestions(text: string, idPrefix: string): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  let quizNumber = 0;

  for (const match of text.matchAll(DIRECTIVE)) {
    const [, kind, , body] = match;
    if (kind.toLowerCase() !== "quiz") continue;
    quizNumber += 1;
    parseQuizBody(body).forEach((question, questionIndex) => {
      questions.push({
        id: `${idPrefix}-${quizNumber}-${questionIndex + 1}`,
        stem: question.stem,
        options: question.opts.map(([correct, optionText]) => ({ correct, text: optionText })),
        explanation: question.why,
      });
    });
  }

  return questions;
}

/** Render markdown with ::: directives into HTML. Mirrors build.py `md_to_html`. */
export function mdToHtml(text: string, coll?: Collector): string {
  const collector = coll ?? new Collector();
  const counter = { n: 0 };
  const blocks: string[] = [];

  const stashed = text.replace(DIRECTIVE, (_m, kind, arg, body) => {
    blocks.push(renderDirective(kind, arg, body, collector, counter));
    return `\n\nKTIBLOCK${blocks.length - 1}KTIEND\n\n`;
  });

  let html = renderMarkdown(stashed);
  blocks.forEach((b, i) => {
    html = html.replace(new RegExp(`<p>\\s*KTIBLOCK${i}KTIEND\\s*</p>`), () => b);
    html = html.split(`KTIBLOCK${i}KTIEND`).join(b);
  });

  html = html.split(escapeHtml(TODO, false)).join('<span class="todo">TO WRITE</span>');
  html = html.split(TODO).join('<span class="todo">TO WRITE</span>');
  html = html.replace(/<table>/g, '<div class="tablewrap"><table>').split("</table>").join("</table></div>");
  return html;
}

/** Give h2 elements stable ids. Mirrors build.py `add_heading_ids`. */
export function addHeadingIds(html: string): {
  html: string;
  headings: { id: string; text: string }[];
} {
  const headings: { id: string; text: string }[] = [];
  const seen = new Map<string, number>();

  const out = html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/g, (_m, attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, "");
    const base = slugify(text);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const hid = count === 1 ? base : `${base}-${count}`;
    headings.push({ id: hid, text });
    return `<h2 id="${hid}"${attrs}>${inner}</h2>`;
  });

  return { html: out, headings };
}
