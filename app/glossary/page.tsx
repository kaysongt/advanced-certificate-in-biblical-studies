import type { Metadata } from "next";

import { getIndexes } from "@/lib/content";

export const metadata: Metadata = {
  title: "Glossary",
  description: "Theological terms defined across the program.",
};

export default function GlossaryPage() {
  const { terms } = getIndexes();

  type Entry = {
    term: string;
    gloss: string;
    definition: string;
    sources: { title: string; href: string }[];
  };

  // Deduplicate by term, keeping the first definition and up to three sources.
  const seen = new Map<string, Entry>();

  for (const t of terms) {
    const key = t.term.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, { term: t.term, gloss: t.gloss, definition: t.definition, sources: [] });
    }
    const entry = seen.get(key)!;
    if (!entry.sources.some((s) => s.href === t.href)) {
      entry.sources.push({ title: t.pageTitle, href: t.href });
    }
  }

  const groups = new Map<string, Entry[]>();
  for (const key of [...seen.keys()].sort()) {
    const entry = seen.get(key)!;
    const letter = key[0].toUpperCase();
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(entry);
  }
  const letters = [...groups.keys()].sort();

  return (
    <main className="shell">
      <div className="pagehead">
        <div className="eyebrow">Reference</div>
        <h1>Glossary</h1>
        <p className="deck">
          Theological terms defined across the program, {seen.size} in total, each linked to
          the topic that introduces it.
        </p>
      </div>

      {seen.size === 0 ? (
        <p className="deck">No terms have been published yet.</p>
      ) : (
        <>
          <div className="alpha">
            {letters.map((l) => (
              <a href={`#l-${l}`} key={l}>
                {l}
              </a>
            ))}
          </div>

          {letters.map((letter) => (
            <div className="gloss-group" id={`l-${letter}`} key={letter}>
              <h3>{letter}</h3>
              <dl className="terms">
                {groups.get(letter)!.map((entry) => (
                  <div className="term" key={entry.term}>
                    <dt>
                      {entry.term}
                      {entry.gloss ? <span className="gk">{entry.gloss}</span> : null}
                    </dt>
                    <dd>
                      {entry.definition}
                      <div className="gloss-src">
                        {entry.sources.slice(0, 3).map((s, i) => (
                          <span key={s.href}>
                            {i > 0 ? " · " : ""}
                            {s.title}
                          </span>
                        ))}
                      </div>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </>
      )}
    </main>
  );
}
