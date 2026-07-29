# Advanced Certificate in Biblical Studies — Course Build

Course scaffold for the KingsWord Training Institute **Advanced Certificate in Biblical Studies**,
generated from `Certificate-in-Biblical-Studies-Course-Catalog.pdf`.

Everything the catalog states is already filled in. Everything that must come from the
textbooks is marked `[FROM BOOK]` and renders on the site as a **TO WRITE** badge.

---

## Program shape

| Module | Series | Courses | Hrs/course | Lessons/course | Hours |
|---|---|---|---|---|---|
| I. Systematic Theology | What We Believe | ST 101–106 (6) | 6 | 6 | 36 |
| II. Biblical Foundations | Unlocked | BF 201–206 (6) | 6 | 6 | 36 |
| III. Old Testament Survey | Foundations of Redemption | OT 301–305 (5) | 6 | 6 | 30 |
| IV. New Testament Survey | Fulfillment of God's Plan | NT 401–405 (5) | 6 | 6 | 30 |
| V. Spiritual Formation | Essentials of Spiritual Growth | SF 501–510 (10) | 4 | 4 | 40 |
| | **Total** | **32** | | **172** | **172** |

**32 courses** matches the catalog's "32 textbooks" — one textbook per course.
At **1 lesson = 1 hour**, the lesson count lands on 172 exactly, matching the stated program hours.

---

## Layout

```
kti-advanced-certificate/
├── curriculum.json     Structure + all catalog copy. Single source of truth.
├── build.py            Scaffolder and site builder.
├── content/            Markdown — this is what you edit.
│   ├── program.md
│   ├── 01-systematic-theology/
│   │   ├── module.md
│   │   ├── st-101/
│   │   │   ├── course.md
│   │   │   ├── lesson-01.md … lesson-06.md
│   │   │   └── assessment.md
│   │   └── st-102/ … st-106/
│   ├── 02-biblical-foundations/   (BF 201–206)
│   ├── 03-old-testament-survey/   (OT 301–305)
│   ├── 04-new-testament-survey/   (NT 401–405)
│   └── 05-spiritual-formation/    (SF 501–510)
├── _templates/         Reference copies of each file type.
└── docs/               Generated. Do not edit — it is deleted on every build.
                        Served by GitHub Pages from main.
```

---

## Commands

```bash
python3 build.py scaffold    # create missing content files (never overwrites your edits)
python3 build.py build       # regenerate docs/ from content/
python3 build.py status      # how many [FROM BOOK] placeholders remain, per course
python3 build.py all         # scaffold (safe) + build
```

`scaffold` is safe to re-run — it skips files that already exist. Pass `-f` only if you
want to wipe your writing and start a file over.

Open the site locally: `docs/index.html`

Published: <https://kaysongt.github.io/advanced-certificate-in-biblical-studies/>

Optional: `pip install markdown` gives better rendering (tables, nested lists).
Without it the builder falls back to a built-in renderer and still works.

---

## Workflow when the book arrives

1. **Map the book to the courses.** For each of the 32 courses, open `course.md` and fill in
   *Required Textbook* → title, and which chapters feed that course.
2. **Split chapters into lessons.** In `course.md`, the *Course Structure* table has one row
   per lesson. Give each lesson a title and its source chapter.
3. **Write the lessons.** Work through `lesson-01.md` … each has the same skeleton:
   objectives → source material → key scriptures → key terms → three-point outline →
   illustrations → application → discussion questions → memory verse → practicum →
   5-question quiz → summary.
4. **Build the assessment.** `assessment.md` is a 100-point paper: 10 MCQ, 5 short answer,
   5 scripture references, 1 essay with rubric.
5. Run `python3 build.py build` and review on the site.
6. Run `python3 build.py status` to see what is still outstanding.

---

## Decisions that need Dr. Kay's confirmation

These are not in the catalog. Reasonable defaults are in place; change them in
`curriculum.json` (grading) or the templates in `build.py`.

- **Lesson length.** Set to 1 hour, which makes the hours add up to 172 exactly.
- **Grading weights.** Currently Lesson Quizzes 30% / Assignments 30% / Final Assessment 40%.
  The component weights remain *PROPOSED*; the pass mark is confirmed at 80%.
- **Assessment format.** 100-point structure described above.
- **Course learning outcomes.** Five per course — placeholder count only.
- **Textbook mapping.** One textbook per course is inferred from "32 textbooks / 32 courses";
  confirm before printing anything.

## Source

Catalog PDF: `~/Downloads/Certificate-in-Biblical-Studies-Course-Catalog.pdf` (14 pages).
All module overviews, course descriptions, program outcomes, tuition, and contact details
in `curriculum.json` are verbatim from it.
