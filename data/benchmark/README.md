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
| `rag` | What the app does. Pass 1: the model names likely HS 4-digit headings. Pass 2: it picks one code from a candidate list built from similar past rulings, every code under the proposed headings, and tariff descriptions that match by wording. |

Duty rates and import rule codes are never taken from the model; they are looked up in the tariff file.

## Running

```
node scripts/build-data.mjs                      # rebuild data/tariff.json and data/rulings.json
node scripts/benchmark.mjs --modes nearest       # no key needed
node scripts/benchmark.mjs --modes llm,rag --n 300 --concurrency 8 --resume   # needs LLM_API_KEY or GMI_API_KEY in .env.local
```

Optional in `.env.local`: `LLM_BASE_URL` (default `https://api.gmi-serving.com/v1`) and `LLM_MODEL`.

## Results

`results.json` holds whatever the last runs produced: the per-mode counts and every test item with
the truth and each mode's prediction. The numbers quoted anywhere else in this repo are copied from
that file. Nothing is tuned on the test set after the fact; if a mode has not been run it is simply
absent from the file.
