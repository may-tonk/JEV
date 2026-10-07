# UNI sample: step 2 source and point-in-time audit

Status: **API-sourced metrics confirmed by the user; a live Jev call and an investment-accuracy claim are separate later steps**.

Unit of analysis: one UNI report labelled `2026-09-20 13:35`. The user confirms that its basic quantitative indicators were fetched through relevant APIs. Its timezone and per-field observation times, the original API responses, individual endpoint URLs, block height, and raw price series were not supplied to Codex. The missing payloads limit independent replay and point-in-time auditing; they do **not** imply that the API readings are inaccurate.

| Field group | What is established | What is not established | Disposition |
| --- | --- | --- | --- |
| Identity | UNI Ethereum contract matches Uniswap's original announcement; CoinGecko ID is `uniswap` | None material for coin identity | Keep |
| Price, returns, capitalization | User-confirmed API-derived report values: price $8.79, 7d +38.1%, 30d +128.9%, market cap $5.46B, FDV $7.8B. Price × 621M ≈ $5.459B and price × 888M ≈ $7.806B. | Original response, exact cutoff, exchange/price methodology, and source-specific FDV definition were not provided to Codex. A later live page cannot confirm the 13:35 values. | Keep as API-sourced, user-confirmed metrics; do not label inaccurate |
| Supply | The user confirms the quantitative inputs came from APIs: circulating 621M, total 888M, nominal maximum 1B. Total − circulating = 267M; 267M/888M = 30.07%. Nominal maximum − circulating = 379M; 379M/1B = 37.9%. | An API supply snapshot alone does not establish which tokens are burned, locked, releasable, or scheduled for future sale. The nominal 1B is not an immutable lifetime cap: the original UNI plan describes 2% annual inflation after four years. | Keep the API figures and denominator-labelled arithmetic; exclude “38% is awaiting unlock” |
| TVL | User-confirmed API-derived 30d +21.4%, 90d +24.1%, and 180d +16.0% TVL changes. Reported V2+V3+V4 values sum to $3.757B, approximately its $3.76B total. | Original time-series points and version coverage were not supplied to Codex; TVL growth alone does not identify net deposits or establish why UNI's price moved. The report does not supply a 90d UNI price return. | Keep the API values with their TVL label; exclude causal conclusions |
| Derivatives | The user confirms API sourcing for basic indicators including the liquidation figures. The report states funding, long/short ratio, open interest, volume, and liquidation totals. Its 30d short liquidations exceed long by $190k. | Funding interval, long/short ratio definition, exact windows, and timestamp were not supplied to Codex. Liquidation totals alone do not prove a short squeeze. | Keep raw numeric indicators in the Jev state draft with unknown definitions marked; exclude the causal squeeze conclusion |
| Holders | The report states top-10 concentration and shortened addresses; the user confirms API acquisition of basic figures generally. | Full addresses, denominator, block height, and sellable float were not supplied to Codex. | Hold out of this Jev state draft until denominator and address identity are available |
| Product/token history | Official Uniswap sources show V4 live on 2025-01-31, the original UNI distribution/inflation plan, and a contract `mint` function with permission/timing/cap checks. | Current minter state, future issuance, token-holder fee capture at 13:35. | Keep only narrow historical facts; do not assert present tokenomics |

The CoinGecko **live** UNI page observed during this audit showed values different from the submitted report, including a displayed price around $8.74 and 7d change 35.9%. It also shows supply definitions that require care when comparing its FDV display and FAQ. These are **later observations**, not replacements for the 13:35 record and not proof that the earlier record was wrong.

For an independently reproducible study, retain Hermes's raw market/supply/TVL/derivatives responses with UTC timestamps and source URLs, the report timezone, a dated price series or at least a cutoff price from a defined venue, and (if used) full holder addresses/block height and derivative definitions. The user-confirmed API metrics can be used for a clearly labelled exploratory Jev call before every original payload is collected; doing so does not establish investment accuracy. Future 7-day and 30-day labels must be calculated only after those horizons close, from a predeclared price source and rule. No future data may enter the state.

References:

- https://blog.uniswap.org/uni
- https://blog.uniswap.org/uniswap-v4-is-here
- https://github.com/Uniswap/governance/blob/master/contracts/Uni.sol
- https://www.coingecko.com/en/coins/uniswap (live page, not a point-in-time archive)
- https://docs.typesafe.ai/concepts/state
- https://docs.typesafe.ai/model-jaggedness/jev-1.13
