# DuoData Data Coverage Log

> Rule: DuoData does not use fabricated history, synthetic backfills, or estimated exchange-private metrics to fill missing data.

Last methodology update: 2026-09-10

## Status definitions

- **LIVE** — retrievable from an identified source and already used by DuoData.
- **PARTIAL** — source exists, but coverage/normalization is not yet sufficient for a production metric.
- **COLLECTING** — future values are publicly observable, but a trustworthy historical series must be accumulated by DuoData.
- **KEY REQUIRED** — market data API exists but requires an exchange API credential; not an internal-data requirement.
- **PRIVATE** — requires exchange/broker internal aggregate data or a data partnership.
- **UNAVAILABLE** — no sufficiently reliable source has been identified.

## Venue-level trading data

| Venue / Product | Instrument list | 24h venue volume | OI | Funding | L1 quote | Order book | Historical market data | Status |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Bybit Stock Perpetual | Public V5 API (`symbolType=stock`) | Yes | Yes | Yes | Yes | Yes | Yes | **LIVE** |
| Bybit Commodity Perpetual | Public V5 API (`symbolType=commodity`) | Yes | Yes | Yes | Yes | Yes | Yes | **LIVE** |
| Bybit xStocks | Public V5 API (`symbolType=xstocks`) | Yes | N/A | N/A | Yes | Yes | Yes | **LIVE** |
| Bitget RWA Perpetual | Public V2 API (`isRwa=YES`) | Yes | Yes | Yes | Yes | Yes | Yes | **LIVE** |
| Bitget Stock+ real equities | Stock+ API | **No public customer-volume field identified** | N/A | N/A | Underlying quote available | Underlying market data available | Underlying market history available | **KEY REQUIRED / PARTIAL** |
| Binance Stocks | Stocks Trading REST API | Customer venue-volume not yet validated | N/A | N/A | Yes | To verify | To verify | **KEY REQUIRED** |
| Binance TradFi derivatives | Futures public market APIs | To normalize | To normalize | To normalize | To normalize | To normalize | Available | **PARTIAL** |
| OKX Stock Perpetual | Public V5 market APIs | Source exists | Source exists | Source exists | Source exists | Source exists | Source exists | **PARTIAL** — reliable instrument classification mapping pending |
| Coinbase TradFi products | To validate against current public product API | — | — | — | — | — | — | **PARTIAL** |
| Kraken / xStocks products | To validate against current public product API | — | — | — | — | — | — | **PARTIAL** |

## DuoData metrics

| Metric | V0.1 status | What is needed |
|---|---|---|
| 24h TradFi / RWA volume by exchange | **LIVE** | Bybit + Bitget public exchange turnover |
| TradFi open interest | **LIVE** | Bybit OI value; Bitget OI size × mark price |
| Funding rates | **LIVE** | Public perpetual ticker/funding endpoints |
| Current top-of-book spread | **LIVE** | Public bid/ask |
| TradFi product mix | **LIVE** | Explicit exchange instrument metadata |
| Historical DuoData volume | **COLLECTING** | Persistent snapshots; no fake backfill |
| Historical DuoData OI | **COLLECTING** | Persistent snapshots; no fake backfill |
| ±10 / ±25 / ±50 bp depth | **PARTIAL** | Rate-limit-aware L2 collector per instrument |
| $10k / $100k / $500k slippage | **PARTIAL** | L2 collector + standardized execution simulation |
| TradFi Tracking Error Index | **PARTIAL** | Independent consolidated underlying reference-price feed |
| Off-Hours Volume Share | **PARTIAL / COLLECTING** | Trade-level timestamps normalized to underlying-market sessions |
| Weekend Price Discovery Score | **COLLECTING** | Weekend CEX observations + verified Monday cash-market open |
| TradFi Penetration Ratio | **PARTIAL** | Normalized TradFi numerator + same-venue crypto denominator |
| Crypto–TradFi Rotation Index | **COLLECTING** | Stable normalized historical series for both legs |
| Synthetic Leverage Ratio | **PARTIAL** | Tokenized spot market cap/supply plus derivative OI on matching underlying |
| TradFi Funding Stress Index | **COLLECTING** | Historical funding distributions by instrument/venue |
| Crypto Native Sentiment Premium | **COLLECTING** | 24/7 CEX fair-price basket + underlying cash-market reference |
| Unique TradFi traders | **PRIVATE** | Exchange internal aggregate user analytics |
| New TradFi accounts | **PRIVATE** | Exchange internal aggregate user analytics |
| Customer geography | **PRIVATE** | Exchange internal aggregate user analytics |
| USDT/USDC → real stock conversion flow | **PRIVATE** | Exchange internal ledger / brokerage settlement data |
| Stock+ customer net buy/sell | **PRIVATE** | Exchange/broker customer flow data |
| TradFi product revenue / fees | **PRIVATE** | Exchange internal financial data |

## Important methodology distinctions

### 1. Underlying-market volume is not exchange customer volume
A Stock+ quote endpoint may expose AAPL's price, volume and turnover from the underlying securities market. DuoData must not label that as “Bitget user Stock+ volume” unless the exchange explicitly reports customer venue turnover.

### 2. Product wrappers are kept separate
Real equities, tokenized equities, perpetual swaps, CFDs and broker/MT5 products are not summed blindly. Aggregation is allowed only after the metric explicitly defines what is being combined.

### 3. Historical series start when measurement starts
If an exchange does not expose adequate historical snapshots, DuoData begins collecting from the deployment date. The UI should show the actual available window instead of generating a visually complete but unverifiable history.

### 4. API credential is not the same as internal data
Some market-data APIs require a normal developer API key. DuoData labels these **KEY REQUIRED**, not **PRIVATE**. Private means the metric itself is not externally observable even with ordinary public/developer API access.
