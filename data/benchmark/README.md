# CCC classification benchmark

What is measured: given the declared name, material and use of an imported product, predict the
11-digit Taiwan CCC code that Customs actually ruled.

## Data

Taiwan Customs publishes its advance classification rulings as open data (2008–2018, about 13,400
rulings). Each one has the importer's own description of the goods and the code Customs decided.
See `../SOURCES.md`.

## Protocol

- **Reference pool:** every ruling dated before 2018-01-01. This is all the system may look at.
- **Test set:** a random sample (fixed seed 20261111, default 300) of rulings from 2018 whose ruled
  code still exists in the current tariff and whose declared name is at least 4 characters.
  The exact items are in `testset.json`.
- **Truth:** the code Customs ruled.
- **Score:** exact prefix match at 4, 6, 8 and all 11 digits. `invalid` counts predictions that are
  not a real code in the current tariff. `errors` counts items where the model call failed.

### Why a time split

Many rulings are near-duplicates: the same product family filed several times with different model
numbers, often on the same day. Holding out one ruling at a time would let the system find its twin
in the pool and copy the answer, which inflates accuracy. Splitting by year keeps every 2018 ruling
out of the pool, so the test is closer to real use: classify something new using only what was
ruled before.

## Modes

| Mode | What it does |
|---|---|
| `nearest` | No model. Finds the most similar past ruling by text (BM25 over character bigrams and word tokens) and copies its code. |
| `llm` | The model alone: no past rulings, no candidate list. It has to produce an 11-digit code from memory. |
| `rag` | What the app does. Pass 1: the model names 3 to 5 likely HS 4-digit headings. Pass 2: it picks one code from a candidate list printed heading by heading: every code under the shortlisted headings, the codes of similar past rulings, and tariff lines that match by wording. Under each shortlisted heading it also sees the past rulings Customs placed there that read most like the goods. Pass 2 runs at high reasoning effort on Claude (`--effort`). |

Duty rates and import rule codes are never taken from the model; they are looked up in the tariff file.

## Running

```
node scripts/build-data.mjs                      # rebuild data/tariff.json and data/rulings.json
node scripts/benchmark.mjs --modes nearest       # no key needed
node scripts/benchmark.mjs --modes llm,rag --n 300 --concurrency 12 --model claude-haiku-5-5
```

The model modes need `ANTHROPIC_API_KEY` in `.env.local`, or `LLM_API_KEY` / `GMI_API_KEY` for an
OpenAI-compatible endpoint (`LLM_BASE_URL`, `LLM_MODEL`). `--resume` keeps predictions already in
`results.json` and only fills in what is missing.

## Results

`results.json` holds whatever the last runs produced: the per-mode counts and every test item with
the truth and each mode's prediction. The numbers quoted anywhere else in this repo are copied from
that file. If a mode has not been run it is simply absent from the file.

### Run history, 2026-11-11, model `claude-haiku-5-5`, n = 300

| Run | 4 digits | 6 digits | 8 digits | 11 digits | not a real code |
|---|---|---|---|---|---|
| `nearest` | 35.7% | 24.7% | 23.0% | 22.7% | 0 |
| `llm` | 61.3% | 49.0% | 18.7% | 0.0% | 297 |
| `rag`, first version | 66.0% | 58.0% | 56.7% | 55.3% | 0 |
| `rag`, current version | 70.0% | 63.3% | 61.7% | 60.3% | 0 |

The `rag` method was revised once after its first full run. The first version capped each heading
at 45 lines, showed the model only wording-matched rulings, and ran pass 2 at low effort. The true
code was on its candidate list for 88% of the items, yet it picked it for 55%, so the weak step was
the choice and not the list. The current version lists whole headings (true code on the list for
93%), groups the list by heading with the rulings Customs placed under each, tells the model that
wording-matched rulings are often different goods, and runs the choice at high effort.

That revision was made after seeing the first scores on this same test set, so the second number is
not a clean held-out result and should be read as slightly optimistic. No rule was written for any
individual test item, the reference pool and the test items did not change, and no 2018 ruling
reaches a prompt. Most remaining misses are the right chapter and a rival heading: advance rulings
are requested because the goods are hard to place.
