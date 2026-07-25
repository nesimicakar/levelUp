# Vault Pack — schema, import behavior, renderer

Authoritative sources in the repo. Re-read these if anything below seems stale;
do not trust this doc over the actual code:

- `src/lib/logic/vaultPack.ts` — `VaultPack`, `VaultPackConcept`, `VaultPackDomain`, `validateVaultPack`, `importVaultPack`, `exportVaultPack`
- `src/types/index.ts` — `KnowledgeConcept`, `KeyIdea`, `KnowledgeSourceType`
- `src/components/ConceptBodyText.tsx` — how a key-idea `body` string renders

## Output envelope

```jsonc
{
  "type": "levelup-vault-pack",   // exact literal — validateVaultPack rejects anything else
  "version": 1,                    // must be the number 1
  "exportedAt": "<ISO-8601>",      // e.g. "2026-07-24T00:00:00.000Z"
  "domains": [ /* VaultPackDomain */ ],
  "concepts": [ /* VaultPackConcept */ ]
}
```

### VaultPackDomain

```jsonc
{ "name": "History", "icon": "🏛️", "color": "#38bdf8" }
```

- `name` required. `icon`/`color` optional.
- **No `id`.** Not part of the type; the importer mints UUIDs itself.

### VaultPackConcept

```jsonc
{
  "title": "string",                 // REQUIRED
  "domainName": "string",            // REQUIRED — see domain matching
  "summary": "string",               // REQUIRED
  "keyIdeas": [ { "title": "string", "body": "string" } ],  // preferred body format
  "tags": ["string"],                // optional
  "personalNotes": "string",         // optional — DO NOT emit unless user asks (see SKILL.md)
  "relatedConceptTitles": ["string"],// optional — only from a trusted catalog
  "sourceType": "manual",            // optional — closed enum below; default "manual" when unsourced
  "sourceTitle": "string"            // optional — the book/course/etc. name
}
```

- **No `id`.** Same rule as domains.
- `keyTakeaways?: string[]` exists only for legacy backward-compat on import.
  Never emit it — always use `keyIdeas`.
- Do not add any field not listed above; `validateVaultPack` won't reject an
  extra field, but it is silently dropped and signals invented schema.

## `sourceType` — closed enum

Exactly these seven values (`KnowledgeSourceType`):

```
book | course | recall | yuno | memoryos | note | manual
```

Mapping rule for generated concepts:

| Situation | sourceType | sourceTitle |
|---|---|---|
| No real source supplied (pure AI generation) | `manual` | omit |
| User names a book | `book` | the book title |
| User names a course/lecture series | `course` | the course title |
| User points to their own written notes | `note` | the note name (optional) |
| From Recall / Yuno / MemoryOS app export | `recall` / `yuno` / `memoryos` | that item's title |

`"topic"`, `"article"`, `"web"`, `"ai"` etc. are **invalid** — they are not in
the union. (A real earlier pack used `"topic"`; that was a bug. Never reproduce it.)

## Import behavior — what actually happens (`importVaultPack`)

1. **Domains matched by lowercased `name`.** If a domain with that name already
   exists, it is *reused* and your `icon`/`color` are ignored. So always include
   a `domains[]` entry for the concept's domain — it's harmless if it exists and
   correct if it doesn't. A new domain with no icon/color defaults to 📚 / `#64748b`.
2. **Concepts deduped by `domainId | lowercased title`.** A concept whose title
   already exists in that domain is skipped, not updated.
3. **`domainName` with no matching `domains[]` entry is auto-created** as a new
   domain (📚 / `#64748b`). Prefer to always declare the domain explicitly.
4. **`relatedConceptTitles` resolved in a second pass** by exact
   lowercased-title match against *all* concepts in the Vault after import
   (existing + just-imported). Unmatched titles are silently dropped — no error,
   no creation. Self-references are ignored.
5. Every imported concept starts at `retentionScore: 0`, `reviewCount: 0`,
   `reviewIntervalDays: 1`, due immediately. You don't set review fields — the
   importer owns them. Never include them in the pack.

## Renderer — how a key-idea `body` displays (`ConceptBodyText.tsx`)

The renderer scans each `body` for short capitalized `Label:` markers and turns
them into small uppercase section headers above the following text. A label is:
starts with a capital letter, ≤ 50 chars, contains no `: . ,` or newline before
its colon. Three input shapes all render correctly:

- `"Label:\nvalue"` — already multiline (preferred; write it this way).
- `"Label: value. Next Label: value."` — inline, auto-split at `. ` before a label.
- Plain prose with no `Label:` — renders as a normal paragraph.

Practical consequences for writing bodies:
- To create a header, put a short capitalized phrase followed by a colon on its
  own, then the text (ideally `"Header:\n\nText"`).
- A stray `"Word: something"` mid-sentence can be misread as a header. Avoid
  colon-led fragments you don't intend as headers.
- Blank lines between paragraphs are preserved and read as paragraph breaks.
- Two body idioms are both established and valid — pick by content shape:
  - **Prose** (no labels): best for narratives, mechanisms, developments.
  - **Labeled** (`Definition:` / `Example:` / `Why It Matters:`): best for sets
    of parallel items (terms, biases, laws, archetypes) or when a consistent
    scaffold aids recall. Don't force labels onto flowing narrative.

## Quick self-check before returning

Run the validator (read-only, never touches app data):

```bash
python3 .claude/skills/create-levelup-concept/scripts/validate.py <yourfile.json>
# or pipe:  printf '%s' "$JSON" | python3 .../scripts/validate.py
```

It verifies the envelope, required fields, the `sourceType` enum, absence of
`id`, key-idea shape, and array field types, and warns on `personalNotes`
presence and unknown fields. A clean `VALID` is necessary but not sufficient —
still judge the writing against `references/rubric.md`.
