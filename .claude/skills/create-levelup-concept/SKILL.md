---
name: create-levelup-concept
description: Generate one excellent, import-ready LevelUp Vault Pack (JSON) for a single Knowledge Vault concept from a title. Use when the user runs /create-levelup-concept, or asks to write/draft/create a new Vault concept, knowledge card, or key-idea deck for the LevelUp app. Authoring only — never imports or modifies app data.
---

# Create LevelUp Concept

Turn a topic title into a single JSON concept matching LevelUp's Vault Pack
import schema exactly — good enough that the user imports it with no edits.
This skill only **writes JSON**. It never touches IndexedDB, never edits files
under `src/`, and never runs an import.

`/create-levelup-concept The Silk Road` should reliably produce an excellent,
import-ready concept with no follow-up.

## Do this every time

1. **Parse the request** (below). Decide title, domain, depth, source, emphasis,
   and whether a trusted catalog of existing Vault titles was provided.
2. **Anchor source & coverage, then ask a clarifying question only if genuinely
   necessary** (both below). If the request carries **no** source *and* no
   coverage/emphasis, ask the one combined source-or-coverage question before
   generating. Otherwise proceed — don't interrogate the user for a routine
   topic.
3. **Write the concept** to the quality bar in `references/rubric.md`. Read that
   file if you have not this session — it is the standard you're graded on, not
   schema validity.
4. **Verify facts** that are current, disputed, unusually specific, or shaky
   using WebSearch/WebFetch when available (especially at `deep` depth and for
   any hard number, date, or superlative). Never state a guess as settled fact.
   See `references/rubric.md` → *Factual discipline* for the exact rules. In
   short: verify every **direct quotation, exact number, precise date,
   superlative, and memorable anecdote** before it ships; scrutinize
   **conversation hooks hardest**, because a wrong-but-memorable hook is worse
   than an ordinary error — it's the part the user will repeat out loud.
5. **Run the factual-risk pass** (below, and in `references/rubric.md`) as a
   dedicated final scan before emitting. Do not skip it because the concept
   "feels" solid — the memorable errors are the ones that feel solid.
6. **Emit valid JSON only** — one fenced-free JSON object, no prose, no markdown
   fences, no explanation. (The exception is a clarifying question in step 2.)
   Ensure every quotation, apostrophe, and line break is correctly escaped
   (`\"`, `\n`) so the object parses.
7. **Self-check** with the validator before returning (read-only):
   `python3 .claude/skills/create-levelup-concept/scripts/validate.py <file>`
   or pipe the JSON on stdin. A clean `VALID` is necessary but not sufficient —
   it checks schema, not truth.

## Final factual-risk pass (do this before emitting)

Before returning the JSON, re-read the whole concept once looking **only** for
factual risk, scanning these five categories in order. Fix or soften anything
you can't stand behind:

1. **Quotations** — Is every quoted phrase verbatim from a verified source, with
   the right speaker and work? If wording or attribution is uncertain,
   paraphrase instead of quoting. Do not include a direct quotation you have not
   confirmed. (A famous quote is often misremembered — verify, don't trust
   recall.)
2. **Dates** — Is each date correct and the *right kind* of event? Do not
   conflate related-but-distinct events (e.g. a comet's **perihelion** /
   closest-to-sun vs. its **closest approach to Earth**; publication vs. writing
   vs. setting; birth vs. baptism). Name the specific event the date belongs to.
3. **Numbers** — Is each figure supported? When reputable estimates differ, give
   a **range**, **attribute** it ("by most accounts," "an estimated"), or use
   cautious wording — never a false-precise single number.
4. **First / only / greatest claims** — Replace absolutes ("the first," "the
   only," "the greatest") with precise, qualified language ("among the first,"
   "one of the earliest major," "widely regarded as") unless priority is firmly
   and uncontestedly established.
5. **Neat coincidences and anecdotes** — The tidier and more repeatable a story
   is, the harder to verify it must be. Confirm the memorable version is the true
   version; if the clean telling is embroidered, tell the accurate one even if
   it's slightly less neat. Do not assert **intent** the record doesn't support
   ("he tossed it off as a joke," "a throwaway title") — describe what happened,
   not what he privately meant.

## Schema (summary — full detail in `references/reference.md`)

```jsonc
{
  "type": "levelup-vault-pack",
  "version": 1,
  "exportedAt": "<ISO-8601>",
  "domains": [ { "name": "History", "icon": "🏛️", "color": "#38bdf8" } ],
  "concepts": [ {
    "title": "…",              // required
    "domainName": "History",   // required — matches a domains[] entry (case-insensitive)
    "summary": "…",            // required — orients fast, says why it matters
    "keyIdeas": [ { "title": "…", "body": "…" } ],
    "tags": ["…"],
    "relatedConceptTitles": ["…"],   // only from a trusted catalog — see below
    "sourceType": "manual",          // closed enum — see below
    "sourceTitle": "…"               // only with a real named source
  } ]
}
```

Hard rules (verified against `src/lib/logic/vaultPack.ts` and `src/types/index.ts`):

- **Never emit an `id`** on a domain or concept. The importer mints its own
  UUIDs and ignores yours; inventing one violates "never invent IDs."
- **Never invent schema fields.** Only the fields above. Never use the legacy
  `keyTakeaways` — always `keyIdeas`. Never set review fields.
- **`sourceType` is a closed enum:** `book | course | recall | yuno | memoryos
  | note | manual`. Anything else (e.g. `topic`, `article`, `ai`) is invalid.
- **Default `sourceType` is `manual`** for pure AI generation with no real
  source. Use `book`/`course`/`note`/etc. only when the user names a real one,
  with its title in `sourceTitle`. (Do not default to `note`.)
- **Do NOT emit `personalNotes`** unless the user explicitly asks for notes.
- **Always include a `domains[]` entry** for the concept's domain (harmless if
  it already exists; the importer reuses by name and ignores your icon/color).
- Return **exactly one concept** unless the user explicitly asked for several.

## Parsing the request

Free text after the command; parse naturally (a `|`-delimited form also works).
Only the title is required.

| Field | How to read it | Default |
|---|---|---|
| title | The topic. | required |
| domain | Domain name. | infer one fitting single-word domain from the topic |
| depth | `quick` \| `standard` \| `deep` | `standard` |
| source | A book, course, Yuno/Recall/MemoryOS export, or note | none **and** no emphasis → **ask the combined source-or-coverage question** (below); on `skip` → `sourceType: "manual"` |
| lessons/chapters | `lessons:` or `chapters:` list (e.g. `Career; Tom Sawyer`), `;`- or `,`-separated, or named in a natural-language reply | none → cover the topic normally |
| emphasis/notes | Angle or topics to stress — from the command or the combined question's reply | none |
| existing concepts | Vault titles the user pasted/listed | none → omit `relatedConceptTitles` |

**Depth** (guidance, not a quota — never split one idea into weak halves, never
pad a thin topic): `quick` ≈ 2–4 key ideas, `standard` ≈ 4–6, `deep` ≈ 6–9.
See `references/rubric.md` for length/shape.

**Domain reuse:** use the user's domain name verbatim as `domainName`, and add a
`domains[]` entry with a fitting emoji + hex. Palette already in this Vault:
💡 `#a855f7` Philosophy · 🏛️ `#38bdf8` History · 🧠 `#ec4899` Psychology ·
💼 `#22c55e` Business · ☪️ `#f59e0b` Religion · 🔬 `#14b8a6` Science ·
🧬 `#8b5cf6` Memory · 🗣️ `#38bdf8` Communication. Reuse one when it fits.

## When to ask a clarifying question

Ask **one** short question (instead of emitting JSON) only when:

- **The title is genuinely ambiguous** across substantially different meanings
  (e.g. "Rome" — city, empire, or the HBO series?; "Mercury" — planet, element,
  or Roman god?).
- **The topic is too broad for one useful concept** (e.g. "World History",
  "Psychology"). Don't produce a shallow mega-concept — briefly recommend a
  narrower concept or a small series, and let the user pick.
- **The user's framing would materially change the concept** and you can't tell
  which they want.

Do not ask about domain or depth — infer sensible defaults and proceed. Source
is different: it gets exactly one optional question, described next.

## Source & coverage anchoring (the one optional question)

If the request carries **no source and no coverage/emphasis information**, ask
this single combined question *instead of* emitting JSON, then wait for the
reply:

> Do you have a source or preferred coverage for this concept? You can provide a
> book, course, Yuno lesson titles, notes, topics to emphasize, or reply "skip."

Rules:

- **Only ask when both are absent.** If the command or earlier conversation
  already supplies a source (any `source:`/`lessons:`/`chapters:` field, a named
  book/course, or pasted notes) **or** an emphasis/angle, skip the question and
  proceed.
- **Ask at most once.** Never re-prompt or chain follow-ups. Take whatever the
  reply gives and generate. Only ask a *second* question if the reply is
  genuinely ambiguous in a way that would materially change the concept (e.g. it
  names a title that could be one of several different works) — not to tidy up
  minor gaps you can reasonably infer.
- **Accept a natural-language reply — no pipe syntax required.** Read the answer
  as plain prose and infer each field from it. All of these are valid answers to
  the one question, and you parse them yourself:
  - *"the Ron Chernow biography"* → `sourceType: book`, `sourceTitle` = that book.
  - *"Yuno lessons: Career, Tom Sawyer, Huckleberry Finn, The Gilded Age"* →
    `sourceType: yuno`, lesson titles steer emphasis (see below).
  - *"just focus on his bankruptcy and the world tour"* → no source
    (`sourceType: manual`), but set **emphasis** to those topics.
  - *"here are my notes: …"* → pasted notes become the primary source.
  - *"skip"* / *"no"* / empty → `sourceType: "manual"`, no `sourceTitle`; infer
    domain and depth and generate normally.
- **A reply can carry source, coverage, both, or neither.** Extract whatever is
  present: `sourceType` + `sourceTitle`, any lesson/chapter titles, and any
  preferred emphasis. Absent pieces fall back to their normal defaults.

Interpreting the source part — map it to the closed `sourceType` enum (`book |
course | recall | yuno | memoryos | note | manual`) and a concise `sourceTitle`:

| The reply indicates… | sourceType | sourceTitle |
|---|---|---|
| A book | `book` | the book title |
| A course / lecture series | `course` | the course title |
| **Yuno** lesson(s) | `yuno` | the lesson or unit title (concise) |
| Recall / MemoryOS export | `recall` / `memoryos` | that item's title |
| Their own written notes | `note` | a short note name (optional) |
| Pasted notes or a transcript with no platform named | `note` | short name if one is clear, else omit |
| Only emphasis/topics, no source | `manual` | omit |
| "skip" / nothing | `manual` | omit |

How the source and coverage shape the concept:

- **Preferred emphasis / topics steer coverage and weighting.** When the reply
  names angles or topics to stress ("focus on X and Y"), make those threads
  prominent and give them the most room, while still meeting the depth mode's
  shape. Emphasis changes *what gets attention*, never the factual bar.

- **Lesson / chapter titles guide emphasis and coverage, not claims.** Use them
  to decide which facets to include and how to weight them (e.g. Yuno lessons
  `Career; Tom Sawyer; Huckleberry Finn; The Gilded Age` → make sure those
  threads are covered and prominent). A title is **not** evidence for any
  specific fact — every detailed claim still goes through normal verification and
  the factual-risk pass. Never fabricate what a lesson "must have said."
- **Pasted notes or transcripts are the primary source.** Build the concept from
  their content, preserving the user's framing and facts; add only the minimum
  outside context needed to make it stand alone, and verify that added context
  as usual. Don't contradict the notes silently — if a note looks wrong, note the
  discrepancy briefly rather than fabricating a correction.
- **Store a concise, valid `sourceTitle`.** Keep it short and human (a title, not
  a paragraph). Invent **no** new schema fields — lesson lists and transcripts
  inform the writing but are never stored as their own keys. If several lessons
  are given, `sourceTitle` names the source/unit, not the whole semicolon list.
- After the reply (source, coverage, both, or "skip"), return the **normal
  import-ready JSON only** — same rubric, depth modes, factual-risk pass,
  validator, and conversation-hook standards as any other run.

## Related concepts

- Populate `relatedConceptTitles` **only** from a catalog the user actually
  supplied this conversation (pasted titles, a list, or an exported pack).
- **Never guess that a concept exists.** Unmatched titles are silently dropped
  on import, so a guess is at best useless and at worst misleading.
- When you do have a catalog, include only **genuinely useful** relationships
  (shared mechanism, cause/effect, illuminating contrast) — not keyword overlap.
  A few strong links beat many weak ones.
- No trusted catalog → omit the field (or use `[]`). If the user wants real
  links, tell them to paste their Vault titles or exported pack first.

## Writing conventions (full rubric in `references/rubric.md`)

- **Summary** orients in 1–2 tight paragraphs and establishes why the topic
  matters — not a teaser, not a contents list.
- **Key-idea titles** are meaningful and memorable, never generic scaffolding
  ("Background", "Importance", "Conclusion"). And never *overstated*: a
  memorable title must still be true — don't inflate a narrow/contested fact
  into an absolute.
- **Bodies** explain with causal reasoning and concrete examples over fact
  lists. Follow the renderer's `Label:` convention (see `references/reference.md`):
  narrative prose for stories/mechanisms; `Definition:` / `Example:` /
  `Why It Matters:` labels for parallel items or recall scaffolds.
- **Conversation hooks** are woven in and load-bearing — a specific fact, irony,
  tension, or connection that deepens understanding, accurate enough to survive
  scrutiny. Not trivia bolted on.
- **Tags:** lowercase, deduped, retrieval-useful, 4–8, no vague filler.
- Avoid AI tells: generic conclusions, "This shows that…"/"This highlights…"
  refrains, excessive em dashes, hype, and repeating the summary in the last idea.

## Reference material (load as needed)

- `references/reference.md` — full schema, import behavior, `sourceType` map, and
  the renderer's formatting rules. Read before your first concept this session.
- `references/rubric.md` — the quality bar and a fast-fail checklist. Grade
  against it every time.
- `references/examples.md` — three gold-standard concepts (History narrative,
  game-theory labeled, economics mixed) across body styles.
- `scripts/validate.py` — read-only validator; run before returning.

## Boundaries

Concept authoring only. Do not edit files under `src/`, access the database, or
run an import. If the user asks you to also save the JSON to a file, confirm the
path first — that's a separate, explicit action. Don't offer to refactor the
importer or redesign the Vault in the same turn.
