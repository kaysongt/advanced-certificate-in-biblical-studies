#!/usr/bin/env python3
"""
KingsWord Training Institute — Advanced Certificate in Biblical Studies
Course scaffold + static site builder.

Usage:
    python3 build.py scaffold     Create missing content/ files (never overwrites)
    python3 build.py scaffold -f  Recreate content/ files, overwriting existing
    python3 build.py build        Render site/ from content/
    python3 build.py status       Report how much content is still unwritten
    python3 build.py all          scaffold (safe) + build

Content lives in content/ as markdown with `---` front matter and ::: directives.
Structure lives in curriculum.json. Edit markdown, re-run build, site updates.

Directives
----------
    :::objectives            ordered list of learning outcomes
    :::scripture Ref         a quoted passage with its reference
    :::quote Source          a pull quote from the textbook
    :::terms                 `Term | gloss | definition` rows (gloss optional)
    :::note Heading          a neutral aside
    :::warn Heading          a caution or common error
    :::quiz                  `Q stem`, `+ correct`, `- wrong`, `= explanation`
"""

import hashlib
import json
import os
import re
import shutil
import sys
from html import escape

ROOT = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(ROOT, "content")
SITE = os.path.join(ROOT, "docs")  # GitHub Pages serves this folder from main
ASSETS = os.path.join(ROOT, "assets")
DATA = os.path.join(ROOT, "curriculum.json")

TODO = "[FROM BOOK]"


# ==========================================================================
# markdown
# ==========================================================================

def render_markdown(text):
    try:
        import markdown as _md
        return _md.markdown(text, extensions=["tables", "fenced_code", "sane_lists", "attr_list"])
    except ImportError:
        return _fallback_markdown(text)


def _inline(s):
    s = escape(s, quote=False)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    return s


def _fallback_markdown(text):
    out, lines, i = [], text.split("\n"), 0
    while i < len(lines):
        line = lines[i]
        st = line.strip()
        if not st:
            i += 1
            continue
        if st.startswith("#"):
            lv = len(st) - len(st.lstrip("#"))
            out.append(f"<h{lv}>{_inline(st[lv:].strip())}</h{lv}>")
            i += 1
            continue
        if re.match(r"^(-{3,}|\*{3,}|_{3,})$", st):
            out.append("<hr>")
            i += 1
            continue
        if "|" in st and i + 1 < len(lines) and re.match(r"^\s*\|?[\s:|-]+\|", lines[i + 1]):
            cells = lambda r: [c.strip() for c in r.strip().strip("|").split("|")]
            head = cells(st)
            i += 2
            body = []
            while i < len(lines) and "|" in lines[i] and lines[i].strip():
                body.append(cells(lines[i]))
                i += 1
            th = "".join(f"<th>{_inline(c)}</th>" for c in head)
            tr = "".join("<tr>" + "".join(f"<td>{_inline(c)}</td>" for c in r) + "</tr>" for r in body)
            out.append(f"<table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>")
            continue
        if st.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip().lstrip(">").strip())
                i += 1
            out.append(f"<blockquote><p>{_inline(' '.join(buf))}</p></blockquote>")
            continue
        if re.match(r"^\s*([-*+]|\d+\.)\s+", line):
            ordered = bool(re.match(r"^\s*\d+\.\s+", line))
            tag = "ol" if ordered else "ul"
            items = []
            while i < len(lines) and re.match(r"^\s*([-*+]|\d+\.)\s+", lines[i]):
                items.append(re.sub(r"^\s*([-*+]|\d+\.)\s+", "", lines[i]))
                i += 1
            out.append(f"<{tag}>" + "".join(f"<li>{_inline(x)}</li>" for x in items) + f"</{tag}>")
            continue
        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(r"^\s*(#|>|[-*+]\s|\d+\.\s|\|)", lines[i]):
            buf.append(lines[i].strip())
            i += 1
        if buf:
            out.append(f"<p>{_inline(' '.join(buf))}</p>")
    return "\n".join(out)


def parse_front_matter(raw):
    if not raw.startswith("---"):
        return {}, raw
    parts = raw.split("---", 2)
    if len(parts) < 3:
        return {}, raw
    meta = {}
    for line in parts[1].strip().split("\n"):
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip().strip('"')
    return meta, parts[2].lstrip("\n")


def front_matter(pairs):
    return "---\n" + "\n".join(f"{k}: {v}" for k, v in pairs) + "\n---\n\n"


# ==========================================================================
# directives
# ==========================================================================

DIRECTIVE = re.compile(r"^:::(\w+)[ \t]*(.*?)[ \t]*$\n(.*?)^:::[ \t]*$", re.M | re.S)


def slugify(s):
    s = re.sub(r"[^\w\s-]", "", s.lower()).strip()
    return re.sub(r"[\s_-]+", "-", s) or "section"


class Collector:
    """Gathers terms and scripture references while rendering."""

    def __init__(self):
        self.terms = []      # (term, gloss, definition, page_title, href)
        self.scriptures = []  # (ref, page_title, href)
        self.ctx = ("", "")

    def at(self, title, href):
        self.ctx = (title, href)


def _md_span(s):
    """Inline markdown for text inside directives."""
    s = escape(s, quote=False)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", s)
    return s


def _md_block(s):
    return render_markdown(s.strip())


def render_directive(kind, arg, body, coll, counter):
    kind = kind.lower()

    if kind == "objectives":
        items = [re.sub(r"^\s*(\d+\.|[-*])\s*", "", l).strip()
                 for l in body.strip().split("\n") if l.strip()]
        lis = "".join(f"<li>{_md_span(x)}</li>" for x in items)
        head = arg or "By the end of this lesson you will be able to"
        return f'<div class="objectives"><h4>{escape(head)}</h4><ol>{lis}</ol></div>'

    if kind == "scripture":
        txt = " ".join(l.strip() for l in body.strip().split("\n") if l.strip())
        if arg:
            coll.scriptures.append((arg, coll.ctx[0], coll.ctx[1]))
        ref = f'<span class="ref">{escape(arg)}</span>' if arg else ""
        return f'<div class="scripture"><div class="txt">{_md_span(txt)}</div>{ref}</div>'

    if kind == "quote":
        txt = " ".join(l.strip() for l in body.strip().split("\n") if l.strip())
        src = f'<span class="src">{escape(arg)}</span>' if arg else ""
        return f'<div class="pull"><div class="txt">{_md_span(txt)}</div>{src}</div>'

    if kind == "terms":
        rows = []
        for line in body.strip().split("\n"):
            if not line.strip():
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) >= 3:
                term, gloss, definition = parts[0], parts[1], " ".join(parts[2:])
            elif len(parts) == 2:
                term, gloss, definition = parts[0], "", parts[1]
            else:
                continue
            coll.terms.append((term, gloss, definition, coll.ctx[0], coll.ctx[1]))
            g = f'<span class="gk">{_md_span(gloss)}</span>' if gloss else ""
            rows.append(
                f'<div class="term"><dt>{_md_span(term)}{g}</dt>'
                f'<dd>{_md_span(definition)}</dd></div>'
            )
        return f'<dl class="terms">{"".join(rows)}</dl>'

    if kind in ("note", "warn"):
        cls = "note warn" if kind == "warn" else "note"
        hd = f'<div class="hd">{escape(arg)}</div>' if arg else ""
        return f'<div class="{cls}">{hd}{_md_block(body)}</div>'

    if kind == "quiz":
        return render_quiz(arg, body, counter)

    return _md_block(body)


def render_quiz(arg, body, counter):
    questions = []
    cur = None
    for raw in body.split("\n"):
        line = raw.strip()
        if not line:
            continue
        if line.startswith("Q ") or line.startswith("Q\t"):
            if cur:
                questions.append(cur)
            cur = {"stem": line[2:].strip(), "opts": [], "why": ""}
        elif line.startswith(("+ ", "- ")) and cur is not None:
            cur["opts"].append((line[0] == "+", line[2:].strip()))
        elif line.startswith("= ") and cur is not None:
            cur["why"] = (cur["why"] + " " + line[2:].strip()).strip()
        elif cur is not None and cur["opts"]:
            cur["why"] = (cur["why"] + " " + line).strip()
        elif cur is not None:
            cur["stem"] += " " + line
    if cur:
        questions.append(cur)

    counter[0] += 1
    qid = f'q{counter[0]}'
    out = []
    for n, q in enumerate(questions, 1):
        opts = []
        # Authors write the correct option first. Rotate deterministically so the
        # answer is not always A, while staying stable across rebuilds.
        choices = q["opts"]
        if len(choices) > 1:
            k = int(hashlib.md5(q["stem"].encode("utf-8")).hexdigest(), 16) % len(choices)
            choices = choices[-k:] + choices[:-k] if k else choices
        for i, (ok, text) in enumerate(choices):
            mark = chr(65 + i)
            opts.append(
                f'<button type="button" class="opt" data-correct="{1 if ok else 0}">'
                f'<span class="mk">{mark}</span><span>{_md_span(text)}</span></button>'
            )
        why = f'<div class="why">{_md_span(q["why"])}</div>' if q["why"] else ""
        out.append(
            f'<div class="q"><p class="stem"><span class="n">{n}</span>{_md_span(q["stem"])}</p>'
            f'<div class="opts">{"".join(opts)}</div>{why}</div>'
        )
    head = arg or "Check your understanding"
    return (
        f'<section class="quiz" data-quiz="{qid}">'
        f'<header><span class="hd">{escape(head)}</span><span class="score"></span></header>'
        f'{"".join(out)}'
        f'<footer><button type="button" class="btn reset">Reset</button>'
        f'<span class="verdict"></span></footer></section>'
    )


def md_to_html(text, coll=None, counter=None):
    """Render markdown with ::: directives into HTML."""
    coll = coll or Collector()
    counter = counter if counter is not None else [0]
    blocks = []

    def stash(m):
        blocks.append(render_directive(m.group(1), m.group(2), m.group(3), coll, counter))
        return f"\n\nKTIBLOCK{len(blocks) - 1}KTIEND\n\n"

    text = DIRECTIVE.sub(stash, text)
    html = render_markdown(text)
    for i, b in enumerate(blocks):
        html = re.sub(rf"<p>\s*KTIBLOCK{i}KTIEND\s*</p>", b, html)
        html = html.replace(f"KTIBLOCK{i}KTIEND", b)

    html = html.replace(escape(TODO, quote=False), '<span class="todo">TO WRITE</span>')
    html = html.replace(TODO, '<span class="todo">TO WRITE</span>')
    html = re.sub(r"<table>", '<div class="tablewrap"><table>', html).replace("</table>", "</table></div>")
    return html


def add_heading_ids(html):
    """Give h2 elements stable ids and return (html, [(id, text)])."""
    heads = []
    seen = {}

    def sub(m):
        text = re.sub(r"<[^>]+>", "", m.group(2))
        base = slugify(text)
        seen[base] = seen.get(base, 0) + 1
        hid = base if seen[base] == 1 else f"{base}-{seen[base]}"
        heads.append((hid, text))
        return f'<h2 id="{hid}"{m.group(1)}>{m.group(2)}</h2>'

    html = re.sub(r"<h2([^>]*)>(.*?)</h2>", sub, html, flags=re.S)
    return html, heads


# ==========================================================================
# scaffold templates
# ==========================================================================

def program_md(d):
    p = d["program"]
    L = [front_matter([("type", "program"), ("title", p["title"])])]
    a = L.append
    a(f"{p['summary']}\n")
    a(f"## About the Institute\n\n{p['about']}\n")
    a(f"> {p['motto']}\n")
    a(f"## {p['founder']['role']}\n\n**{p['founder']['name']}** — {p['founder']['bio']}\n")
    a("## Who Should Enroll\n")
    for x in p["audience"]:
        a(f"- {x}")
    a("")
    a("## Program Outcomes\n")
    for x in p["outcomes"]:
        a(f"- {x}")
    a("")
    a("## Program Features\n")
    for x in p["features"]:
        a(f"- {x}")
    a("")
    a(f"## Format\n\n{p['format']}\n")
    a(f"## Tuition\n\n{p['tuition']}\n")
    a(f"## Graduation Requirements\n\n{p['graduation_requirements']}\n")
    g = d["grading"]
    a("## Assessment & Grading\n")
    a(f"*{g['note']}*\n")
    a("| Component | Weight |")
    a("|---|---|")
    for c in g["components"]:
        a(f"| {c['name']} | {c['weight']}% |")
    a(f"\nPass mark: **{g['pass_mark']}%**\n")
    return "\n".join(L)


def module_md(m, d):
    L = [front_matter([("type", "module"), ("numeral", m["numeral"]),
                       ("title", m["title"]), ("series", m["series"]),
                       ("hours", str(m["hours"]))])]
    a = L.append
    a(f"{m['overview']}\n")
    a("## Module Learning Outcomes\n")
    for n in range(1, 5):
        a(f"{n}. {TODO} Outcome {n}")
    a("")
    a("## Module Video\n")
    a(f"{TODO} One video for this module, shown after the final course. "
      "Title, speaker, and running time.\n")
    a("## Module Assignment\n")
    a(f"{TODO} One assignment for the whole module, submitted after all "
      f"{len(m['courses'])} courses are complete.\n")
    pm = d["grading"]["pass_mark"]
    a("## Certificate Requirements\n")
    a(f"- Complete all {len(m['courses'])} courses ({m['hours']} contact hours)")
    a(f"- Pass every topic quiz and course assessment at {pm}% or above")
    a("- Submit the module assignment")
    return "\n".join(L)


def course_md(c, m, d):
    n = m["lessons_per_course"]
    L = [front_matter([("type", "course"), ("code", c["code"]), ("title", c["title"]),
                       ("subtitle", c["subtitle"]), ("module", m["short_title"]),
                       ("hours", str(m["hours_per_course"])), ("lessons", str(n)),
                       ("status", "template")])]
    a = L.append
    a(f"{c['description']}\n")
    a("## Course Learning Outcomes\n")
    for i in range(1, 6):
        a(f"{i}. {TODO} Outcome {i}")
    a("")
    a("## Required Textbook\n")
    a(f"- **Title:** {c.get('textbook') or TODO}")
    a(f"- **Author:** {d['program']['founder']['name']}")
    a("")
    a("## Course Assessment\n")
    a(f"One assessment covering all {n} topics, taken after the last topic is complete. "
      f"Pass mark {d['grading']['pass_mark']}%. There is no separate assignment at course "
      "level — the single assignment sits at the end of the module.")
    return "\n".join(L)


def lesson_md(n, c, m):
    L = [front_matter([("type", "lesson"), ("course", c["code"]), ("lesson", str(n)),
                       ("title", f"{TODO} Lesson {n} title"), ("reading", TODO),
                       ("duration", "1 hr"), ("status", "template")])]
    a = L.append
    a(":::objectives")
    for i in range(1, 4):
        a(f"{i}. {TODO} Objective {i}")
    a(":::\n")
    a("## Key Scriptures\n")
    a(f"- {TODO}\n")
    a("## Key Terms\n")
    a(":::terms")
    a(f"{TODO} | | {TODO}")
    a(":::\n")
    a(f"## {TODO} First main point\n")
    a(f"{TODO} Teaching content. The teaching lives here — this page IS the lesson,")
    a("not a summary of reading done elsewhere.\n")
    a("## Reflection\n")
    a(f"{TODO} One short self-study exercise. No live class — do not reference sessions,")
    a("groups, or classmates.\n")
    a("## Topic Quiz\n")
    a(":::quiz")
    a(f"Q {TODO} Question")
    a(f"+ {TODO} Correct option")
    a(f"- {TODO} Distractor")
    a(f"= {TODO} Explanation")
    a(":::\n")
    a("## Summary\n")
    a(f"{TODO} Three to five sentences restating the lesson's core truth.")
    return "\n".join(L)


def assessment_md(c, m, d):
    n = m["lessons_per_course"]
    L = [front_matter([("type", "assessment"), ("course", c["code"]),
                       ("title", f"{c['code']} Course Assessment"), ("status", "template")])]
    a = L.append
    a(f"This assessment covers all {n} lessons of {c['code']}. "
      f"Pass mark: **{d['grading']['pass_mark']}%**.\n")
    a("## Section A — Multiple Choice\n")
    a(":::quiz Section A")
    for i in range(1, 4):
        a(f"Q {TODO} Question {i}")
        a(f"+ {TODO} Correct")
        a(f"- {TODO} Distractor")
        a(f"= {TODO} Explanation")
    a(":::\n")
    a("## Section B — Short Answer\n")
    for i in range(1, 6):
        a(f"**B{i}.** {TODO} Question\n")
    a("## Section C — Essay\n")
    a(f"**C1.** {TODO} Integrative essay question, 500 to 750 words.\n")
    a("| Criterion | Points |")
    a("|---|---|")
    a("| Biblical accuracy and use of Scripture | 10 |")
    a("| Clarity and structure of argument | 8 |")
    a("| Engagement with course material | 7 |")
    a("| Practical application | 5 |")
    return "\n".join(L)


def write(path, text, force, created, skipped):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path) and not force:
        skipped.append(path)
        return
    with open(path, "w", encoding="utf-8") as f:
        f.write(text.rstrip() + "\n")
    created.append(path)


def scaffold(d, force=False):
    created, skipped = [], []
    write(os.path.join(CONTENT, "program.md"), program_md(d), force, created, skipped)
    for m in d["modules"]:
        mdir = os.path.join(CONTENT, m["slug"])
        write(os.path.join(mdir, "module.md"), module_md(m, d), force, created, skipped)
        for c in m["courses"]:
            cdir = os.path.join(mdir, c["slug"])
            write(os.path.join(cdir, "course.md"), course_md(c, m, d), force, created, skipped)
            for n in range(1, m["lessons_per_course"] + 1):
                write(os.path.join(cdir, f"lesson-{n:02d}.md"), lesson_md(n, c, m),
                      force, created, skipped)
            write(os.path.join(cdir, "assessment.md"), assessment_md(c, m, d),
                  force, created, skipped)
    print(f"Scaffold: {len(created)} written, {len(skipped)} preserved.")
    if skipped and not force:
        print("  (existing files untouched — use -f to overwrite)")


# ==========================================================================
# site
# ==========================================================================

SHELL = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{desc}">
<title>{title}</title>
<link rel="icon" type="image/png" href="{root}assets/favicon.png">
<link rel="apple-touch-icon" href="{root}assets/favicon.png">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{root}assets/logo.jpg">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="{root}assets/theme.css">
<script>(function(){{try{{var t=localStorage.getItem('kti.theme');if(t)document.documentElement.setAttribute('data-theme',t);}}catch(e){{}}}})();</script>
</head>
<body>
<header class="masthead"><div class="inner">
  <a class="wordmark" href="{root}index.html" aria-label="KingsWord Training Institute — home"><img class="mark" src="{root}assets/logo-mark.jpg" alt="" width="440" height="268"><span class="wm-txt"><span class="kw">KingsWord</span> Training Institute</span></a>
  <nav class="mastnav">{nav}
    <a href="{root}glossary.html" class="hide-sm{gl}">Glossary</a>
    <a href="{root}scriptures.html" class="hide-sm{sc}">Scriptures</a>
    <button class="themetoggle" type="button">Dark</button>
  </nav>
</div></header>
<main class="shell">
{crumbs}
{body}
</main>
<footer class="sitefoot"><div class="inner">
  <span>{institute}</span>
  <span class="right"><a href="tel:{phoneraw}">{phone}</a> &nbsp; <a href="mailto:{email}">{email}</a> &nbsp; <a href="https://{website}">{website}</a></span>
</div></footer>
<script src="{root}assets/course.js"></script>
</body>
</html>
"""


def shell(title, body, crumbs, depth, d, desc="", active=None):
    root = "../" * depth
    p = d["program"]
    nav = "".join(
        f'<a href="{root}modules/{m["slug"]}.html" class="{"on" if active == m["slug"] else ""}"'
        f' title="{escape(m["short_title"])}">{m["numeral"]}</a>'
        for m in d["modules"]
    )
    return SHELL.format(
        title=escape(title), desc=escape(desc or p["summary"][:150]), root=root, nav=nav,
        crumbs=crumbs, body=body, institute=escape(p["institute"]),
        phone=p["contact"]["phone"], phoneraw=p["contact"]["phone"].replace(" ", ""),
        email=p["contact"]["email"], website=p["contact"]["website"],
        gl=" on" if active == "glossary" else "", sc=" on" if active == "scriptures" else "",
    )


def crumbs(items, depth):
    root = "../" * depth
    bits = []
    for i, (label, href) in enumerate(items):
        if i:
            bits.append('<span class="sep">/</span>')
        bits.append(f'<a href="{root}{href}">{escape(label)}</a>' if href else escape(label))
    return '<div class="breadcrumb">' + "".join(bits) + "</div>"


def read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return parse_front_matter(f.read())
    except FileNotFoundError:
        return {}, ""


def count_todos(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read().count(TODO)
    except FileNotFoundError:
        return 0


def clean_title(meta, fallback):
    t = (meta.get("title") or "").replace(TODO, "").strip()
    return t or fallback


def ring(ids):
    return (
        f'<div data-progress="{",".join(ids)}" style="display:flex;align-items:center;gap:12px">'
        f'<div class="ring"><svg width="40" height="40">'
        f'<circle class="bg" cx="20" cy="20" r="16" fill="none" stroke-width="3"/>'
        f'<circle class="fg" cx="20" cy="20" r="16" fill="none" stroke-width="3"/>'
        f'</svg><span class="lbl">0%</span></div>'
        f'<span class="facts" style="margin:0"><span data-count>0 of {len(ids)} complete</span></span></div>'
    )


def build(d):
    if not os.path.isdir(CONTENT):
        sys.exit("No content/. Run: python3 build.py scaffold")

    if os.path.isdir(SITE):
        shutil.rmtree(SITE)
    os.makedirs(os.path.join(SITE, "assets"), exist_ok=True)
    for f in ("theme.css", "course.js", "logo.jpg", "logo-mark.jpg", "favicon.png"):
        shutil.copy(os.path.join(ASSETS, f), os.path.join(SITE, "assets", f))

    # Tells GitHub Pages to serve these files as-is, without running Jekyll.
    open(os.path.join(SITE, ".nojekyll"), "w").close()

    p = d["program"]
    coll = Collector()
    pages = 0

    # ---------------- collect lesson metadata ----------------
    index = {}   # course slug -> list of dicts
    for m in d["modules"]:
        for c in m["courses"]:
            cdir = os.path.join(CONTENT, m["slug"], c["slug"])
            rows = []
            for n in range(1, m["lessons_per_course"] + 1):
                path = os.path.join(cdir, f"lesson-{n:02d}.md")
                meta, _ = read(path)
                rows.append({
                    "n": n,
                    "title": clean_title(meta, f"Lesson {n}"),
                    "reading": (meta.get("reading") or "").replace(TODO, "").strip(),
                    "duration": meta.get("duration", "1 hr"),
                    "lid": f'{c["slug"]}-{n}',
                    "href": f"lesson-{n:02d}.html",
                    "todos": count_todos(path),
                })
            index[c["slug"]] = rows

    # ---------------- program index ----------------
    meta, body = read(os.path.join(CONTENT, "program.md"))
    all_ids = [r["lid"] for m in d["modules"] for c in m["courses"] for r in index[c["slug"]]]
    head = f"""<div class="brandhero">
  <img src="assets/logo.jpg" alt="{escape(p['institute'])} — Equip, Empower, Transform"
       width="1200" height="812">
</div>
<div class="pagehead">
  <div class="eyebrow">{escape(p['institute'])}</div>
  <h1>{escape(p['title'])}</h1>
  <p class="deck">{escape(p['tagline'])}</p>
</div>
<div class="figures">
  <div class="figure"><div class="n">{p['total_hours']}</div><div class="l">Hours</div></div>
  <div class="figure"><div class="n">{p['total_certificates']}</div><div class="l">Certificates</div></div>
  <div class="figure"><div class="n">{p['total_courses']}</div><div class="l">Courses</div></div>
  <div class="figure"><div class="n">{p['total_textbooks']}</div><div class="l">Textbooks</div></div>
</div>
<div style="margin:26px 0">{ring(all_ids)}</div>"""
    cards = "".join(
        f'<a class="card" href="modules/{m["slug"]}.html">'
        f'<span class="eyebrow">Module {m["numeral"]} &middot; {m["hours"]} hrs</span>'
        f'<span class="t">{escape(m["short_title"])}</span>'
        f'<p>{escape(m["catalog_blurb"])}</p>'
        f'<span class="foot">{len(m["courses"])} courses &middot; {m["series"]}</span></a>'
        for m in d["modules"]
    )
    coll.at(p["title"], "index.html")
    html = head + f'<h2>The Five Certificate Programs</h2><div class="cards">{cards}</div>' \
        + f'<div class="prose">{md_to_html(body, coll)}</div>'
    with open(os.path.join(SITE, "index.html"), "w", encoding="utf-8") as f:
        f.write(shell(f"{p['title']} — {p['institute']}", html, "", 0, d, p["summary"]))
    pages += 1

    # ---------------- modules ----------------
    os.makedirs(os.path.join(SITE, "modules"), exist_ok=True)
    for m in d["modules"]:
        meta, body = read(os.path.join(CONTENT, m["slug"], "module.md"))
        ids = [r["lid"] for c in m["courses"] for r in index[c["slug"]]]
        head = f"""<div class="pagehead">
  <div class="eyebrow">Module {m['numeral']} &middot; {escape(m['series'])}</div>
  <h1>{escape(m['title'])}</h1>
  <p class="deck">{escape(m['catalog_blurb'])}</p>
  <div class="facts"><span class="tag">{m['hours']} Hours</span>
    <span class="tag">{len(m['courses'])} Courses</span>
    <span class="tag">{len(ids)} Lessons</span></div>
  <div style="margin:22px 0 0">{ring(ids)}</div>
</div>"""
        rows = "".join(
            f'<a class="row" href="../courses/{c["slug"]}/index.html">'
            f'<span class="code">{escape(c["code"])}</span>'
            f'<span class="body"><span class="t">{escape(c["title"])}</span>'
            f'<span class="s">{escape(c["subtitle"])}</span></span>'
            f'<span class="meta">{m["hours_per_course"]} hrs<br>{m["lessons_per_course"]} lessons</span></a>'
            for c in m["courses"]
        )
        coll.at(m["short_title"], f"modules/{m['slug']}.html")
        html = head + f'<h2>Courses</h2><div class="stack">{rows}</div>' \
            + f'<div class="prose">{md_to_html(body, coll)}</div>'
        cr = crumbs([(p["title"], "index.html"), (m["short_title"], None)], 1)
        with open(os.path.join(SITE, "modules", f"{m['slug']}.html"), "w", encoding="utf-8") as f:
            f.write(shell(f"{m['title']} — {p['institute']}", html, cr, 1, d,
                          m["catalog_blurb"], active=m["slug"]))
        pages += 1

    # ---------------- courses ----------------
    for m in d["modules"]:
        for ci, c in enumerate(m["courses"]):
            cdir = os.path.join(CONTENT, m["slug"], c["slug"])
            out = os.path.join(SITE, "courses", c["slug"])
            os.makedirs(out, exist_ok=True)
            rows = index[c["slug"]]
            ids = [r["lid"] for r in rows]
            base = [(p["title"], "index.html"), (m["short_title"], f"modules/{m['slug']}.html")]

            def bar(cur):
                bits = []
                if cur != 0:
                    bits.append('<a href="index.html">Overview</a>')
                for r in rows:
                    if r["n"] == cur:
                        bits.append(f'<span class="cur">{r["n"]}</span>')
                    else:
                        bits.append(f'<a href="{r["href"]}" data-lid="{r["lid"]}">{r["n"]}</a>')
                if cur == "a":
                    bits.append('<span class="cur">Assessment</span>')
                else:
                    bits.append('<a href="assessment.html">Assessment</a>')
                return f'<div class="lessonbar">{"".join(bits)}</div>'

            # --- course overview
            meta, body = read(os.path.join(cdir, "course.md"))
            head = f"""<div class="pagehead">
  <div class="eyebrow">{escape(c['code'])} &middot; Module {m['numeral']}</div>
  <h1>{escape(c['title'])}</h1>
  <p class="deck">{escape(c['subtitle'])}</p>
  <div class="facts"><span class="tag">{m['hours_per_course']} Hours</span>
    <span class="tag">{len(rows)} Lessons</span>
    {'<span class="tag gold">' + escape(c['series_line']) + '</span>' if c.get('series_line') else ''}</div>
  <div style="margin:22px 0 0">{ring(ids)}</div>
</div>"""
            lrows = "".join(
                f'<a class="row" href="{r["href"]}">'
                f'<span class="code">{r["n"]:02d}</span>'
                f'<span class="body"><span class="t">{escape(r["title"])}</span>'
                + (f'<span class="s">{escape(r["reading"])}</span>' if r["reading"] else "")
                + f'</span><span class="meta">{escape(r["duration"])}</span></a>'
                for r in rows
            )
            lrows += ('<a class="row" href="assessment.html"><span class="code">&mdash;</span>'
                      '<span class="body"><span class="t">Course Assessment</span>'
                      f'<span class="s">Covers all topics. Pass mark {d["grading"]["pass_mark"]}%.</span></span>'
                      '<span class="meta">100 pts</span></a>')
            coll.at(f'{c["code"]} {c["title"]}', f'courses/{c["slug"]}/index.html')
            html = bar(0) + head + f'<h2>Lessons</h2><div class="stack">{lrows}</div>' \
                + f'<div class="prose">{md_to_html(body, coll)}</div>'
            cr = crumbs(base + [(c["code"], None)], 2)
            with open(os.path.join(out, "index.html"), "w", encoding="utf-8") as f:
                f.write(shell(f'{c["code"]} {c["title"]} — {p["institute"]}', html, cr, 2, d,
                              c["description"][:150], active=m["slug"]))
            pages += 1

            # --- lessons
            for i, r in enumerate(rows):
                meta, body = read(os.path.join(cdir, f'lesson-{r["n"]:02d}.md'))
                coll.at(f'{c["code"]} L{r["n"]}: {r["title"]}',
                        f'courses/{c["slug"]}/{r["href"]}')
                inner, heads = add_heading_ids(md_to_html(body, coll))
                nav = "".join(f'<li><a href="#{h}">{escape(t)}</a></li>' for h, t in heads)
                rail = (f'<aside class="rail"><div class="rail-inner"><h5>On this page</h5>'
                        f'<ol>{nav}</ol>'
                        f'<h5>Progress</h5>{ring(ids)}</div></aside>') if nav else ""
                head = f"""<div class="pagehead">
  <div class="eyebrow">{escape(c['code'])} &middot; Lesson {r['n']} of {len(rows)}</div>
  <h1>{escape(r['title'])}</h1>
  {'<p class="deck">' + escape(meta.get('subtitle','')) + '</p>' if meta.get('subtitle') else ''}
  <div class="facts">
    <span>{escape(r['duration'])}</span>
    {'<span class="dot">&middot;</span><span>' + escape(r['reading']) + '</span>' if r['reading'] else ''}
  </div>
</div>"""
                prev_l = rows[i - 1] if i > 0 else None
                next_l = rows[i + 1] if i + 1 < len(rows) else None
                pg = ['<nav class="pager">']
                if prev_l:
                    pg.append(f'<a href="{prev_l["href"]}"><span class="dir">Previous</span>'
                              f'<span class="nm">{escape(prev_l["title"])}</span></a>')
                else:
                    pg.append(f'<a href="index.html"><span class="dir">Back</span>'
                              f'<span class="nm">Course overview</span></a>')
                if next_l:
                    pg.append(f'<a href="{next_l["href"]}" style="text-align:right">'
                              f'<span class="dir">Next</span>'
                              f'<span class="nm">{escape(next_l["title"])}</span></a>')
                else:
                    pg.append('<a href="assessment.html" style="text-align:right">'
                              '<span class="dir">Next</span>'
                              '<span class="nm">Course assessment</span></a>')
                pg.append("</nav>")
                done = (f'<div class="done-strip" data-lesson="{r["lid"]}">'
                        f'<button type="button" class="btn primary">Mark complete</button>'
                        f'<span class="txt"></span></div>')
                html = (bar(r["n"]) + head + '<div class="lesson-grid">' + rail
                        + f'<div class="prose">{inner}{done}{"".join(pg)}</div></div>')
                cr = crumbs(base + [(c["code"], f'courses/{c["slug"]}/index.html'),
                                    (f'Lesson {r["n"]}', None)], 2)
                with open(os.path.join(out, r["href"]), "w", encoding="utf-8") as f:
                    f.write(shell(f'{c["code"]} L{r["n"]}: {r["title"]} — {p["institute"]}',
                                  html, cr, 2, d, r["title"], active=m["slug"]))
                pages += 1

            # --- assessment
            meta, body = read(os.path.join(cdir, "assessment.md"))
            coll.at(f'{c["code"]} Assessment', f'courses/{c["slug"]}/assessment.html')
            head = f"""<div class="pagehead">
  <div class="eyebrow">{escape(c['code'])} &middot; Final</div>
  <h1>Course Assessment</h1>
  <p class="deck">{escape(c['title'])}: {escape(c['subtitle'])}</p>
</div>"""
            html = bar("a") + head + f'<div class="prose">{md_to_html(body, coll)}</div>'
            cr = crumbs(base + [(c["code"], f'courses/{c["slug"]}/index.html'),
                                ("Assessment", None)], 2)
            with open(os.path.join(out, "assessment.html"), "w", encoding="utf-8") as f:
                f.write(shell(f'{c["code"]} Assessment — {p["institute"]}', html, cr, 2, d,
                              active=m["slug"]))
            pages += 1

    # ---------------- glossary ----------------
    seen = {}
    for term, gloss, definition, title, href in coll.terms:
        k = term.lower()
        if k not in seen:
            seen[k] = (term, gloss, definition, [])
        if (title, href) not in seen[k][3]:
            seen[k][3].append((title, href))
    groups = {}
    for k in sorted(seen):
        groups.setdefault(k[0].upper(), []).append(seen[k])
    alpha = "".join(f'<a href="#l-{g}">{g}</a>' for g in sorted(groups))
    body = []
    for g in sorted(groups):
        body.append(f'<div class="gloss-group" id="l-{g}"><h3>{g}</h3><dl class="terms">')
        for term, gloss, definition, srcs in groups[g]:
            gl = f'<span class="gk">{_md_span(gloss)}</span>' if gloss else ""
            links = " &middot; ".join(f'<a href="{h}">{escape(t)}</a>' for t, h in srcs[:3])
            body.append(f'<div class="term"><dt>{_md_span(term)}{gl}</dt>'
                        f'<dd>{_md_span(definition)}'
                        f'<div class="gloss-src">{links}</div></dd></div>')
        body.append("</dl></div>")
    html = (f'<div class="pagehead"><div class="eyebrow">Reference</div>'
            f'<h1>Glossary</h1><p class="deck">Theological terms defined across the programme, '
            f'{len(seen)} in total, each linked to the lesson that introduces it.</p></div>'
            f'<div class="alpha">{alpha}</div>' + "".join(body))
    with open(os.path.join(SITE, "glossary.html"), "w", encoding="utf-8") as f:
        f.write(shell(f"Glossary — {p['institute']}",
                      html, crumbs([(p["title"], "index.html"), ("Glossary", None)], 0),
                      0, d, "Theological glossary", active="glossary"))
    pages += 1

    # ---------------- scripture index ----------------
    BOOKS = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges",
             "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles",
             "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalm", "Psalms",
             "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
             "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah",
             "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah",
             "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans",
             "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians",
             "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy",
             "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter", "1 John",
             "2 John", "3 John", "Jude", "Revelation"]
    order = {b: i for i, b in enumerate(BOOKS)}

    def book_of(ref):
        for b in sorted(BOOKS, key=len, reverse=True):
            if ref.startswith(b):
                return b
        return "Other"

    def chap_of(ref, b):
        mm = re.search(r"(\d+)", ref[len(b):]) if b != "Other" else None
        return int(mm.group(1)) if mm else 0

    byref = {}
    for ref, title, href in coll.scriptures:
        byref.setdefault(ref, [])
        if (title, href) not in byref[ref]:
            byref[ref].append((title, href))
    grouped = {}
    for ref in byref:
        grouped.setdefault(book_of(ref), []).append(ref)
    body = []
    for b in sorted(grouped, key=lambda x: order.get(x, 999)):
        refs = sorted(grouped[b], key=lambda r: (chap_of(r, b), r))
        body.append(f'<div class="gloss-group"><h3>{escape(b)}</h3><dl class="terms">')
        for ref in refs:
            links = " &middot; ".join(f'<a href="{h}">{escape(t)}</a>' for t, h in byref[ref])
            body.append(f'<div class="term"><dt>{escape(ref)}</dt><dd>{links}</dd></div>')
        body.append("</dl></div>")
    html = (f'<div class="pagehead"><div class="eyebrow">Reference</div>'
            f'<h1>Scripture Index</h1><p class="deck">Every passage quoted in the programme, '
            f'{len(byref)} references in canonical order, linked to where it is taught.</p></div>'
            + "".join(body))
    with open(os.path.join(SITE, "scriptures.html"), "w", encoding="utf-8") as f:
        f.write(shell(f"Scripture Index — {p['institute']}",
                      html, crumbs([(p["title"], "index.html"), ("Scripture Index", None)], 0),
                      0, d, "Scripture index", active="scriptures"))
    pages += 1

    print(f"Build: {pages} pages, {len(seen)} glossary terms, {len(byref)} scripture refs")
    print(f"Open:  file://{os.path.join(SITE, 'index.html')}")


# ==========================================================================

def status(d):
    print(f"\n{d['program']['title']} — content status\n")
    print(f"{'Module / Course':<46}{'Files':>6}{'To write':>10}")
    print("-" * 62)
    gf = gt = 0
    for m in d["modules"]:
        mf = mt = 0
        rows = []
        for c in m["courses"]:
            cdir = os.path.join(CONTENT, m["slug"], c["slug"])
            files = ["course.md", "assessment.md"] + \
                    [f"lesson-{n:02d}.md" for n in range(1, m["lessons_per_course"] + 1)]
            t = sum(count_todos(os.path.join(cdir, f)) for f in files)
            n = sum(1 for f in files if os.path.exists(os.path.join(cdir, f)))
            flag = "  done" if t == 0 else ""
            rows.append(f"  {c['code']} {c['title'][:32]:<34}{n:>6}{t:>10}{flag}")
            mf += n
            mt += t
        mt += count_todos(os.path.join(CONTENT, m["slug"], "module.md"))
        print(f"{m['numeral']}. {m['short_title'][:42]:<43}{mf:>6}{mt:>10}")
        for r in rows:
            print(r)
        gf += mf
        gt += mt
        print()
    print("-" * 62)
    print(f"{'TOTAL':<46}{gf:>6}{gt:>10}\n")


def main():
    with open(DATA, encoding="utf-8") as f:
        d = json.load(f)
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    force = "-f" in sys.argv or "--force" in sys.argv
    if cmd == "scaffold":
        scaffold(d, force)
    elif cmd == "build":
        build(d)
    elif cmd == "status":
        status(d)
    elif cmd == "all":
        scaffold(d, force)
        build(d)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
