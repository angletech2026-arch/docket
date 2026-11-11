# Data sources

All files in this folder are derived from Taiwan government open data, downloaded on 2026-11-11.
Licence: 政府資料開放授權條款－第1版 (Open Government Data License, version 1.0), https://data.gov.tw/license

| Dataset | Publisher | URL | Used for |
|---|---|---|---|
| 海關進口稅則資料 (Customs import tariff: 11-digit code, Chinese/English description, duty columns, import rules) | 財政部關務署 Customs Administration | https://opendata.customs.gov.tw/data/80871/csv.csv (data.gov.tw dataset 80871) | `tariff.json` |
| 稅則預先審核案例 (Advance tariff classification rulings, 2008–2018: declared name, material, use, ruled code, reason) | 財政部關務署 Customs Administration | https://opendata.customs.gov.tw/data/6713/csv.csv (data.gov.tw dataset 6713) | `rulings.json`, `benchmark/` |
| 貨品基本資料 (2–11 digit goods codes with names, including retired codes) | 經濟部國際貿易署 International Trade Administration | https://www.trade.gov.tw/OpenData/getOpenData.aspx?oid=1BD193ED6DABAEE6 (data.gov.tw dataset 5971) | reference only, not shipped |
| 貨品輸出入規定資料 (import/export rule codes per goods code, with effective dates) | 經濟部國際貿易署 International Trade Administration | https://www.trade.gov.tw/OpenData/getOpenData.aspx?oid=63377200539E3F94 (data.gov.tw dataset 6338) | reference only, not shipped |

`tariff.json` and `rulings.json` are produced by `node scripts/build-data.mjs` from the first two CSVs.
Text fields are whitespace-collapsed and capped at 400 characters. Nothing else is changed.

Duty rates and import rule codes shown in the app always come from `tariff.json`, never from a language model.
