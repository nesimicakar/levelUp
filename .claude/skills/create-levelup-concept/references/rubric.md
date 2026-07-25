# Concept quality rubric

The bar: months from now, this concept should still leave the reader genuinely
understanding the topic and holding at least one thing worth saying about it out
loud. Schema-valid but shallow is a failure. Grade every generated concept
against these before returning it.

## The 8 checks

1. **Teaches an intelligent non-expert.** Assumes curiosity, not background.
   No unexplained jargon; no condescension. If a term is essential, it's defined
   in passing the first time.

2. **Core idea first, then detail.** The summary and the opening key idea
   establish *what this is and why it's worth knowing* before drilling into
   mechanism or chronology. A reader who stops after the summary still gained
   something true and useful.

3. **Explains, doesn't list.** Prefer causal chains ("X happened because Y, which
   forced Z") and mechanisms over bullet piles of facts. A fact earns its place
   only if it changes understanding.

4. **Why it matters is concrete.** Significance is historical, practical,
   scientific, cultural, or present-day — and specific. "It was very influential"
   is filler. "It let one printer out-produce every scribe in a city, so ideas
   spread faster than any authority could suppress them" is significance.

5. **Conversation hooks are woven in, accurate, and load-bearing.** Each hook is
   a specific fact, irony, tension, or connection that *deepens* understanding —
   not trivia bolted on. It must survive scrutiny (see Factual discipline). One
   or two strong hooks beat five weak ones.

6. **Essential vs. supporting is clear.** The most important ideas come first and
   get the most room. Supporting detail is subordinate, not equal-weighted.

7. **No filler or AI tells.** No generic conclusions ("In conclusion, X is a
   fascinating topic"), no "This shows that…" / "This highlights…" refrains, no
   throat-clearing, no repetition of the summary in the last key idea. Vary
   sentence and paragraph openings.

8. **Precise language, honest certainty.** Established facts stated plainly;
   debated or estimated ones marked as such ("roughly," "most historians argue,"
   "an estimated"). No invented numbers, dates, or quotes. No title or sentence
   that inflates a narrow or contested fact into an absolute.

## Titles

- Key-idea titles are **meaningful and memorable**, never generic scaffolding.
  Bad: "Background", "Overview", "Importance", "Conclusion", "Key Facts".
  Good: "A Network, Not a Road", "Rational Choices, Irrational Result",
  "Repetition Changes the Game".
- Titles must not overstate. "It Paid for Itself With Indulgences" asserts a
  clean causal claim that's actually murkier; "Indulgences Were an Early Revenue
  Stream" is honest. Prefer a memorable title that's still *true*.

## Length & shape by depth

Use judgment, not a quota. Never split one idea into weak halves to hit a number,
and never pad a thin topic to look deep.

| depth | key ideas (typical) | feel |
|---|---|---|
| quick | 2–4 | fast, high-signal orientation |
| standard | 4–6 | genuine working understanding |
| deep | 6–9 | broader context, tensions, nuance |

- **Summary:** 1–2 tight paragraphs. Orients fast and says why the topic matters.
  Not a table of contents, not a teaser.
- **Key-idea body:** usually 1–3 short paragraphs. Enough to explain a mechanism
  or land a hook; not an essay.

## Tags

- Lowercase, retrieval-oriented, deduplicated. Include the topic itself, its
  domain area, and 2–5 distinguishing terms someone might search.
- 4–8 is plenty. Avoid near-duplicates ("ww2" and "world war 2" — pick one) and
  vague tags ("history", "important").

## Factual discipline

- Verify current, disputed, unusually specific, or shaky claims with WebSearch/
  WebFetch when available — especially for `deep` depth and for any hard number,
  date, death toll, or "first/oldest/largest" superlative.
- If a fact can't be confirmed, drop it, soften it, or ask — never state a guess
  with false confidence.
- Separate established fact from interpretation. Attributions like "historians
  generally trace…" are honest where the causation is genuinely debated.

## Fast fail list (reject and rewrite if any are true)

- [ ] Reads like a shortened encyclopedia entry.
- [ ] A key idea is just a list of facts with no "so what."
- [ ] A conversation hook is trivia with no bearing on understanding.
- [ ] A title or sentence overstates a contested/narrow fact.
- [ ] Contains an invented number, date, quote, or a hedge-free shaky claim.
- [ ] Generic conclusion paragraph or repeated "This shows that…" phrasing.
- [ ] `personalNotes` present without the user asking for it.
- [ ] `sourceType` is `note`/other when no real source was supplied (should be `manual`).
