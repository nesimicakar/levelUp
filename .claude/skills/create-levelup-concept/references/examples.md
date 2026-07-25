# Reference examples

Three gold-standard outputs across domains and body styles. All obey the current
rules: **no `personalNotes`** (not requested), `sourceType` correct for the
source situation, precise non-overstated titles, hooks woven into understanding.
During real invocation you return **only the JSON** (no fences, no prose) — the
fences here are for documentation.

## 1 — History · narrative body · standard depth · no source

`/create-levelup-concept The Silk Road`

```json
{
  "type": "levelup-vault-pack",
  "version": 1,
  "exportedAt": "2026-07-24T00:00:00.000Z",
  "domains": [{ "name": "History", "icon": "🏛️", "color": "#38bdf8" }],
  "concepts": [
    {
      "title": "The Silk Road",
      "domainName": "History",
      "summary": "The Silk Road was not one road but a shifting web of overland and sea routes that linked China, Central Asia, the Middle East, and the Mediterranean for well over a thousand years. Silk gave it its modern name, but the trade ran in both directions and in many goods, and the most consequential things it carried were not goods at all: religions, technologies, and diseases moved along it as reliably as caravans did.\n\nIt is the clearest early case of how connection reshapes the societies it links. Understanding it well means seeing it as a system whose defining trait, connectivity, produced both its prosperity and its worst catastrophes.",
      "keyIdeas": [
        {
          "title": "A Network, Not a Road",
          "body": "There was never a single paved route by this name. It was a relay of caravan trails, mountain passes, and sea lanes running from Chang'an (modern Xi'an) toward the Mediterranean, threaded through Central Asian oasis cities like Samarkand and Bukhara.\n\nCrucially, almost no one traveled the whole length. Goods passed hand to hand through regional middlemen, each covering one leg and selling onward. A bolt of silk could change owners many times and multiply in price before reaching Rome, which is why the western end knew the fabric long before it knew where it came from."
        },
        {
          "title": "The Name Is Modern, Not Ancient",
          "body": "The term \"Silk Road\" (Seidenstraße) was coined by the German geographer Ferdinand von Richthofen in 1877, well over a thousand years after the routes were busiest. No one traveling it in antiquity called it that.\n\nThis is a useful reminder that many tidy \"ancient\" concepts are modern labels imposed on a messier reality. The label is genuinely useful for study, but it can make a loose, ever-shifting trade web sound like a single deliberate highway, which it never was."
        },
        {
          "title": "Ideas and Faiths Traveled With the Cargo",
          "body": "Goods moved both ways: silk, paper, and porcelain west; horses, wool, glass, and silver east. Paper-making in particular spread from China into the Islamic world and eventually to Europe, where it later underpinned printing.\n\nBut belief traveled just as well as freight. Buddhism spread from India into China along these routes, and centuries later Islam moved east through the same trading cities. A route built to move value efficiently moves worldviews just as efficiently, whether or not anyone intends it to."
        },
        {
          "title": "The Same Roads Carried the Black Death",
          "body": "Connectivity cut both ways. Historians generally trace the mid-14th-century westward spread of the Black Death substantially along these trade networks, from Central Asia toward the Black Sea and then by ship into Mediterranean ports.\n\nIt is an early, stark version of a pattern that still holds: the infrastructure that moves prosperity fastest also moves contagion fastest. A network cannot choose to carry only the good things through it."
        },
        {
          "title": "The Mongols Briefly Made It Safer",
          "body": "Trade here long predated the Mongols, but the 13th-14th-century period of Mongol dominance across much of Eurasia reduced the tolls, banditry, and local wars a merchant had to survive. Marco Polo's overland journey to the Mongol court is famous partly because that window of relative safety made such a trip newly plausible for a European.\n\nWhen Mongol power fragmented, that safety went with it and overland trade grew riskier again, one of several reasons European powers later poured resources into finding sea routes to Asia instead."
        }
      ],
      "tags": ["silk road", "trade routes", "central asia", "cultural exchange", "black death", "globalization"],
      "sourceType": "manual"
    }
  ]
}
```

## 2 — Psychology / game theory · labeled body · quick depth · course source

`/create-levelup-concept Prisoner's Dilemma | domain: Psychology | depth: quick | source: Game Theory 101 (course)`

```json
{
  "type": "levelup-vault-pack",
  "version": 1,
  "exportedAt": "2026-07-24T00:00:00.000Z",
  "domains": [{ "name": "Psychology", "icon": "🧠", "color": "#ec4899" }],
  "concepts": [
    {
      "title": "Prisoner's Dilemma",
      "domainName": "Psychology",
      "summary": "The Prisoner's Dilemma is a two-player scenario from game theory showing how individually rational choices can leave everyone worse off than cooperation would have. It is the cleanest model of why trust is fragile, and why bad collective outcomes can arise without anyone behaving irrationally or maliciously.",
      "keyIdeas": [
        {
          "title": "The Setup",
          "body": "The situation:\n\nTwo suspects are held separately and each can stay silent (cooperate) or betray the other (defect). If both stay silent, both get a light sentence. If both betray, both get a moderate one. If one betrays while the other stays silent, the betrayer walks free and the silent one takes the harshest sentence.\n\nThe trap:\n\nEach reasons that betraying is safer no matter what the other does. Both betray, and both land on the moderate sentence, worse for each than the silence they could have shared."
        },
        {
          "title": "Rational Choices, Worse Result",
          "body": "The mechanism:\n\nDefecting is each player's dominant strategy, the better individual move regardless of the other's choice, even though mutual cooperation beats mutual defection for both.\n\nWhere you see it:\n\nPrice wars, arms races, and overfishing all share this shape. Each party's locally sensible move (undercut, arm up, catch more) sums to an outcome, exhausted budgets or collapsed fish stocks, worse for everyone than restraint would have been."
        },
        {
          "title": "Repetition Changes the Game",
          "body": "The shift:\n\nA one-shot game rewards betrayal, but when the same players meet repeatedly, cooperation becomes far more stable, because future rounds let each side reward or punish the other's past behavior.\n\nThe evidence:\n\nIn a well-known series of tournaments run by political scientist Robert Axelrod, the simplest entrant, \"Tit for Tat\" (cooperate first, then copy the opponent's last move), consistently outperformed far more elaborate strategies, largely by being forgiving, clear, and easy to trust."
        }
      ],
      "tags": ["game theory", "prisoner's dilemma", "cooperation", "decision making", "tit for tat"],
      "sourceType": "course",
      "sourceTitle": "Game Theory 101 (course)"
    }
  ]
}
```

## 3 — Economics · mixed body · standard depth · no source

`/create-levelup-concept Compound Interest | domain: Business`

```json
{
  "type": "levelup-vault-pack",
  "version": 1,
  "exportedAt": "2026-07-24T00:00:00.000Z",
  "domains": [{ "name": "Business", "icon": "💼", "color": "#22c55e" }],
  "concepts": [
    {
      "title": "Compound Interest",
      "domainName": "Business",
      "summary": "Compound interest is what happens when the returns on an amount start earning returns of their own. Instead of growing by the same fixed step each period, the base itself keeps expanding, so growth accelerates over time. It is the single most important idea in personal finance, and the same mechanism, running in reverse, is what makes debt so dangerous.",
      "keyIdeas": [
        {
          "title": "Interest on Interest",
          "body": "Simple interest pays only on your original principal: $100 at 10% adds $10 every year, forever. Compound interest pays on principal plus all previously earned interest, so year two earns on $110, year three on $121, and the yearly gain keeps rising.\n\nThe difference is invisible early and enormous late. Over a year or two the two are nearly identical; over decades they diverge dramatically, because each period's growth is building on a larger base than the last."
        },
        {
          "title": "Time Matters More Than Rate",
          "body": "Because growth feeds on itself, the length of time invested tends to matter more than the interest rate or the amount added. A modest sum left for forty years commonly ends up ahead of a larger sum left for fifteen at the same rate.\n\nThis is why starting early is the most repeated advice in investing: the years you cannot get back are the ones doing the heaviest lifting, since they are the ones with the most time to compound on top of everything that follows."
        },
        {
          "title": "The Rule of 72",
          "body": "A handy shortcut: divide 72 by the annual percentage rate to estimate the years for money to roughly double. At 8%, about 9 years; at 6%, about 12.\n\nIt is an approximation, not an exact formula, but it is close enough for mental math and makes the effect of different rates tangible without a calculator, which is why it has stuck around for centuries."
        },
        {
          "title": "It Runs in Reverse on Debt",
          "body": "The same engine works against you when you owe money. Unpaid interest on a credit-card balance gets added to what you owe, so the next charge is calculated on a larger amount, and the balance can grow even while you make small payments.\n\nHigh-interest debt is compound interest pointed the wrong way. Understanding it as the same mechanism, not a separate one, is why paying down expensive debt is often a better \"return\" than investing the same money elsewhere."
        }
      ],
      "tags": ["compound interest", "investing", "personal finance", "rule of 72", "debt"],
      "sourceType": "manual"
    }
  ]
}
```
