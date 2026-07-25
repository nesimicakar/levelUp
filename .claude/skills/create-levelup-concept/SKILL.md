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
2. **Ask a clarifying question only if genuinely necessary** (below). Otherwise
   proceed — don't interrogate the user for a routine topic.
3. **Write the concept** to the quality bar in `references/rubric.md`. Read that
   file if you have not this session — it is the standard you're graded on, not
   schema validity.
4. **Verify facts** that are current, disputed, unusually specific, or shaky
   using WebSearch/WebFetch when available (especially at `deep` depth and for
   any hard number, date, or superlative). Never state a guess as settled fact.
5. **Emit valid JSON only** — one fenced-free JSON object, no prose, no markdown
   fences, no explanation. (The exception is a clarifying question in step 2.)
6. **Self-check** with the validator before returning (read-only):
   `python3 .claude/skills/create-levelup-concept/scripts/validate.py <file>`
   or pipe the JSON on stdin. A clean `VALID` is necessary but not sufficient.

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
| source | A book, course, note, or app export | none → `sourceType: "manual"`, no `sourceTitle` |
| emphasis/notes | Angle or aspects to stress | none |
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

Do not ask about domain, depth, or source — infer sensible defaults and proceed.

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
