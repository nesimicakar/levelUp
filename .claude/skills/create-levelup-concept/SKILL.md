---
name: create-levelup-concept
description: Generate one excellent, import-ready LevelUp Vault Pack (JSON) for a single Knowledge Vault concept from a title. Use when the user runs /create-levelup-concept, or asks to write/draft/create a new Vault concept, knowledge card, or key-idea deck for the LevelUp app. Authoring only — never imports or modifies app data.
---

# Create LevelUp Concept

Turn a title into one import-ready JSON concept for LevelUp's Vault Pack. The
goal is **useful, lasting general knowledge** — the reader should come away able
to hold the topic in conversation, not just recite trivia. Authoring only: this
skill writes JSON and never touches `src/`, IndexedDB, or imports.

`/create-levelup-concept The Silk Road` should produce an excellent, import-ready
concept with no follow-up.

## Do this every time

1. **Parse** the request (title, domain, depth, source, emphasis, any Vault
   catalog). Only the title is required.
2. **Ask the one optional source/coverage question** *only* if the request has no
   source **and** no emphasis (see below). Otherwise proceed — don't interrogate
   the user for a routine topic.
3. **Write to the coverage target** for the depth mode (below) and the quality
   bar in `references/rubric.md`. Lead with foundational general knowledge; save
   niche detail for deep mode.
4. **Apply factual caution** (below) — verify only what's genuinely risky, hedge
   what you can't confirm.
5. **Emit valid JSON only** — one object, no prose, no fences, quotes and
   newlines escaped (`\"`, `\n`).
6. **Validate** (read-only) before returning:
   `python3 .claude/skills/create-levelup-concept/scripts/validate.py <file>`
   (or pipe on stdin). `VALID` checks schema, not truth.

## Coverage & depth — general knowledge first

A **standard** concept builds balanced general knowledge, not a clever thematic
essay. It should leave the reader able to answer:

- What or who is this?
- Why does it matter?
- What are the main works, events, ideas, or mechanisms?
- What broader context should I understand?
- What's memorable or useful in conversation?

Shape it as **4–6 strong key ideas**, roughly **70% foundational understanding /
30% memorable conversation hooks**. Cover the essentials before any niche angle,
and **never replace foundational knowledge with a clever interpretation**. Any
supplied lesson/chapter titles are **must-cover** guidance.

| depth | target |
|---|---|
| quick | 2–4 key ideas — orientation and essentials only |
| standard | 4–6 key ideas — balanced general knowledge (the default) |
| deep | 6–9 key ideas — adds specialist detail, debates, lesser-known works, deeper interpretation |

Reserve specialist debates, obscure details, and deep textual analysis for
**deep** mode. For a **person** (author, leader, scientist, artist), a standard
concept usually covers identity/background, main career stages, most important
works/achievements, distinctive contribution, historical influence, one major
controversy or nuance, and one or two memorable hooks. (Fuller template in
`references/rubric.md`.)

## Factual caution

Reasonable caution, not exhaustive research:

- **Verify only what's risky** — claims that are specific, uncertain, disputed,
  or especially memorable (hard numbers, precise dates, superlatives,
  quotations, neat anecdotes). Scrutinize conversation hooks hardest; a
  wrong-but-memorable hook is the one that gets repeated.
- **Prefer sturdy over fragile** — avoid fragile quotations, exact numbers, or
  niche anecdotes unless they materially improve understanding.
- **Hedge when you can't verify** — ranges or attribution over false precision
  ("an estimated," "by most accounts"), qualified superlatives ("among the
  first"), and no intent the record doesn't support ("a throwaway title").
- **Don't conflate related events** — perihelion vs. closest approach to Earth;
  publication vs. writing; birth vs. baptism.

Full rules and the five-category final scan (quotations · dates · numbers ·
first/only/greatest · anecdotes) live in `references/rubric.md` → *Factual
discipline*. Load it when a concept leans on risky claims.

## Source & coverage anchoring (one optional question)

Ask this once, *instead of* emitting JSON, only when the request has **no source
and no emphasis**:

> Do you have a source or preferred coverage for this concept? You can provide a
> book, course, Yuno lesson titles, notes, topics to emphasize, or reply "skip."

- **Read the reply as natural language** (no pipe syntax needed) and infer source
  + emphasis. `"skip"` / empty → `sourceType: "manual"`, infer domain/depth,
  generate.
- **Ask at most once** — a second question only if the reply is genuinely
  ambiguous in a way that changes the concept.
- **Lesson/chapter titles → must-cover emphasis, not evidence.** Steer coverage;
  every claim still gets normal caution. Pasted notes/transcripts → primary
  source, adding only necessary verified context.

Map the source to the closed enum and a concise `sourceTitle`:

| Reply indicates | sourceType | sourceTitle |
|---|---|---|
| A book | `book` | book title |
| A course / lecture series | `course` | course title |
| Yuno lesson(s) | `yuno` | lesson/unit title |
| Recall / MemoryOS export | `recall` / `memoryos` | item title |
| Own notes / transcript (no platform) | `note` | short name, or omit |
| Only emphasis, or "skip" | `manual` | omit |

## Schema hard rules (full detail in `references/reference.md`)

```jsonc
{ "type":"levelup-vault-pack", "version":1, "exportedAt":"<ISO-8601>",
  "domains":[{ "name":"History", "icon":"🏛️", "color":"#38bdf8" }],
  "concepts":[{ "title":"…", "domainName":"History", "summary":"…",
    "keyIdeas":[{ "title":"…", "body":"…" }], "tags":["…"],
    "relatedConceptTitles":["…"], "sourceType":"manual", "sourceTitle":"…" }] }
```

- **Never emit an `id`** (the importer mints UUIDs). **Never invent fields**;
  never use legacy `keyTakeaways` (always `keyIdeas`); never set review fields.
- **`sourceType` is a closed enum:** `book | course | recall | yuno | memoryos |
  note | manual`. Default `manual` when unsourced; never `topic`/`article`/`ai`.
- **No `personalNotes`** unless the user asks. **Always include a `domains[]`
  entry** for the concept's domain. Return **one concept** unless several were
  requested.
- **`relatedConceptTitles`:** only from a Vault catalog the user actually
  supplied this conversation; never guess a title exists (unmatched are silently
  dropped). Omit otherwise.

## Parsing the request

Free text after the command; `|`-delimited also works. Only the title is required.

| Field | Read it as | Default |
|---|---|---|
| title | the topic | required |
| domain | domain name | infer a fitting single-word domain |
| depth | quick / standard / deep | standard |
| source / lessons / emphasis | book/course/Yuno/notes, lesson titles, angle — from the command or the one question | none → ask (or `manual` on skip) |
| existing concepts | Vault titles the user pasted | none → omit `relatedConceptTitles` |

**Domain palette** (reuse when it fits): 💡 `#a855f7` Philosophy · 🏛️ `#38bdf8`
History · 🧠 `#ec4899` Psychology · 💼 `#22c55e` Business · ☪️ `#f59e0b` Religion
· 🔬 `#14b8a6` Science · 🧬 `#8b5cf6` Memory · 🗣️ `#38bdf8` Communication. Use
the user's domain name verbatim; add a `domains[]` entry with a fitting emoji + hex.

Ask a clarifying question *instead of* the source one only when the **title is
genuinely ambiguous** (Rome: city / empire / HBO series?) or **too broad for one
concept** ("World History" — recommend narrowing).

## Writing conventions (full rubric in `references/rubric.md`)

- **Summary:** 1–2 tight paragraphs — what it is and why it matters, not a teaser
  or contents list.
- **Key-idea titles:** meaningful and memorable, never scaffolding ("Background",
  "Conclusion"), never overstated.
- **Bodies:** causal reasoning and concrete examples over fact lists. Prose for
  narrative/mechanism; `Definition:` / `Example:` / `Why It Matters:` labels for
  parallel items (renderer detail in `references/reference.md`).
- **Tags:** lowercase, deduped, 4–8, retrieval-useful.
- **Avoid AI tells:** generic conclusions, "This shows that…" refrains, hype,
  em-dash overuse, repeating the summary in the last idea.

## Reference material (load only when needed)

- `references/rubric.md` — quality bar, coverage model, people template, factual
  discipline + fast-fail checklist.
- `references/reference.md` — full schema, import behavior, `sourceType` map,
  renderer rules.
- `references/examples.md` — three gold-standard concepts.
- `scripts/validate.py` — read-only validator.

## Boundaries

Authoring only. Don't edit `src/`, touch the database, or run an import. If asked
to save the JSON to a file, confirm the path first. Don't offer to refactor the
importer or redesign the Vault in the same turn.
