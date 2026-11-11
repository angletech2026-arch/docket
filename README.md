# Docket

Every job in a trading company becomes a card. AI opens the card and does most of the work. The system hands it to whoever is free and allowed to take it. A person makes the decision. When someone is out, or quits, their cards move to someone else and nothing stops, because what is needed to finish the job is on the card and not in one person's head.

Built on Nov 11, 2026 at the c0mpiled Taipei hackathon, for the YC Request for Startups topic "The $15-an-Hour Expert".

## Why

I used to work at my family's auto parts import business in Taiwan. One import shipment passes through a handful of people, and each step has something only one or two of them know how to do:

- how much to reorder, and whether an urgent order is worth flying in
- when to buy the dollars. Margins are 15 to 20 percent, and a 2.5 to 3.5 percent move in the dollar takes a real share of that
- the 11-digit customs code for every line on the invoice, matched by hand, and matched again whenever the supplier revises a part number
- rebooking the truck, the hired forklift and the unloading crew when the vessel is late, before the forklift vendor's cancel fee applies
- what a garage means when it asks on LINE for a 李仔串 or a 水龜

When one of those people is away, that step waits. A new hire needs years to cover for them.

Chang Chun, a grain importer in Taiwan, asked me to build this for them. Grain adds its own steps: plant quarantine, border food inspection, best-before dates, shrinkage, lots kept apart by origin, repacking.

## What is in the demo

Run it and open the wall. One shipment is a chain of cards.

- **The wall.** Each card says what has to be decided in the trade's own terms, who has it, and how much money depends on it. The shipment header adds it up: expected margin, how much of that rides on open decisions, how much is already sold and how much goes to stock and comes back over months.
- **Customs codes card.** A supplier invoice with seven lines. Four carry over the code on file, including one revised part number. Three are new parts. For each new part the card proposes an 11-digit code with a reason, cites the past customs rulings it read, and lists the alternatives. Duty rates and import rules come from the tariff table, never from the model. The person holding the card checks, then the packet goes to the customs broker, whose licensed staff file the declaration.
- **Inquiry card.** A garage asks for three parts in Taiwanese repair slang. Two words are in the company glossary. One is not. The model's guess is shown with its confidence and is not used to quote. The card goes up to a senior, who answers once. The answer is saved to the company glossary and the card goes back to the new hire with the reply drafted.
- **Typhoon delays the ship.** Truck, forklift and unloading crew are rebooked two days later. The tender delivery that will now miss its date is taken off the junior and sent to the owner with the two options and their cost.
- **Someone quits.** Pick a person. Their open cards are reassigned by skill, level and load. Each card keeps its history.
- **Only one person can do this.** A list of the kinds of work that a single employee covers.
- **Customs code test.** The accuracy numbers below, with every test item.
- **Set up a company.** The owner describes the business in plain words and gets the chain of cards for one shipment, plus a list of what they did not mention.

## Does the customs card get the code right?

Taiwan Customs publishes its advance classification rulings: the goods as the importer described them, and the code Customs ruled. We use them two ways. Past rulings are what the card reads before it proposes a code. And they are the test.

Protocol: a time split. The system only sees rulings dated before 2018. The test set is 300 rulings from 2018, a random sample across every kind of goods (seed 20261111), whose ruled code still exists in today's tariff. A prediction is right when it matches the ruled code at 4, 6, 8 or all 11 digits. Eight digits sets the duty rate. Six digits is the international HS level.

A time split, and not leave-one-out, because many rulings are near-copies of each other (the same product in five sizes, ruled the same day). Leave-one-out would let the system read the answer.

| Method | 4 digits | 6 digits | 8 digits | 11 digits |
|---|---|---|---|---|
| Copy the nearest past ruling, no model | 35.7% | 24.7% | 23.0% | 22.7% |
| Ask the model directly, no retrieval | 61.3% | 49.0% | 18.7% | 0.0% |
| Model reads past rulings (what the card does) | 66.0% | 58.0% | 56.7% | 55.3% |

Model: `claude-haiku-5-5`, 900 calls, about US$0.56 for the whole run.

Asked directly, the model usually knows the chapter and often the 6-digit international code, but it cannot recall Taiwan's national digits: 297 of the 300 codes it wrote do not exist in the tariff. Given past rulings and a list of real codes to choose from, it never returns a code that does not exist, and it is right at the duty-rate level three times as often.

The numbers are read from `data/benchmark/results.json`, which the benchmark script writes. To reproduce:

```bash
node scripts/benchmark.mjs --modes nearest,llm,rag --n 300
```

## What is real and what is simulated

Real:
- The tariff table (12,680 codes with duty rates and import rules) and 13,433 advance rulings, from Taiwan government open data. See `data/SOURCES.md`.
- Code suggestions on the customs card, the model's guess on the inquiry card, and the cards generated on the setup page are live model calls. Without an API key the customs card falls back to copying the nearest ruling and says so.
- The benchmark numbers.
- The trade terms 李仔串 (stabilizer link) and 水龜 (thermostat) were checked against public sources. 鳳梨頭 is a term we could not find in any public source. In the demo a person types in what it means. That is the point of the card.

Simulated:
- Both companies, their people, suppliers, customers, quantities and prices are sample data.
- Assignment, the typhoon rebooking, warehouse placement and the reply to the garage are rules over that sample data, not model calls.
- Nothing is sent anywhere: no email, no LINE, no broker system.

## How it is built

- Next.js 16, TypeScript, no database. Board state lives in the browser and resets on reload.
- `lib/engine` is the card engine: assignment, escalation, reassignment when someone leaves, the delay event, the single-point list.
- `lib/ccc` retrieves similar past rulings (BM25 over character bigrams and word tokens), builds a candidate list of real codes, and asks the model to pick one from that list with a reason.
- `lib/llm.ts` reaches a model one of two ways: Claude through the Anthropic SDK (`lib/anthropic.mjs`), or any OpenAI-compatible endpoint. The demo and the benchmark ran on Claude.
- `scripts/build-data.mjs` builds the compact JSON from the government CSV files. `scripts/benchmark.mjs` runs the test.

## Run it

```bash
npm install
cp .env.example .env.local   # then put your key in
npm run dev
```

`.env.local`, one of the two:

```
# Claude through the Anthropic API
ANTHROPIC_API_KEY=...

# or any OpenAI-compatible endpoint
LLM_API_KEY=...
LLM_BASE_URL=https://api.gmi-serving.com/v1
LLM_MODEL=meta-llama/Llama-3.3-70B-Instruct
```

## Next: the model runs inside the company

This demo calls a hosted model. A trading company will not send its supplier prices, customer list and landed costs to someone else's server, so the plan for real use is a model running on a machine the company owns.

The code is already split for that. Everything the model does goes through one function in `lib/llm.ts`, and its second path speaks the OpenAI-compatible protocol that local servers such as Ollama and vLLM use. Pointing `LLM_BASE_URL` at one is a configuration change. What is not done yet: running the benchmark above on an open-weight model to see how far the accuracy drops, and choosing the smallest model that still holds it. Duty rates, import rules and the past rulings never depended on the model, so they stay exact whichever model is used.

## Outside Taiwan

The same method applies to the US tariff schedule and CBP's published rulings. In the US, giving someone a code beyond six digits for goods being entered is customs business and needs a licensed broker. The card is already built that way round: it prepares, the importer checks, the licensed broker decides and files.

## Data and licence

Tariff and rulings data: Customs Administration and International Trade Administration, Taiwan, under the Open Government Data License, version 1.0. Downloaded 2026-11-11. Sources and URLs are in `data/SOURCES.md`.
