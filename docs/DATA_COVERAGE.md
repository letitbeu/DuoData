# DuoData Data Coverage Log

> Rule: DuoData does not use fabricated history, synthetic backfills, estimated exchange-private metrics, or cross-product aggregation that mixes economically different wrappers.

Last methodology update: 2026-09-10

## Product taxonomy — mandatory first-level split

DuoData classifies every TradFi-related market into one of four product layers **before** calculating exchange totals, market share, open interest, funding or liquidity metrics.

| Product layer | Definition | Examples | Aggregation rule |
|---|---|---|---|
| **Real Equity** | Customer holds/receives economic ownership through a securities brokerage account | Bitget Stock+ | Never mixed with tokenized spot, perps or CFD volume |
| **Tokenized Spot** | On-chain / exchange token representing stock or ETF economic exposure | Binance bStocks, xStocks, rToken | Spot turnover only; never mixed with derivatives |
| **TradFi Perps** | Perpetual/futures contracts referencing traditional assets | Binance, Bybit, OKX, Bitget, Coinbase INTX, Kraken | Derivatives volume/OI/funding are aggregated only inside this layer |
| **CFD / Broker** | CFD / MT5 / broker-style synthetic exposure | Bybit TradFi CFD / MT5 | Kept separate from exchange perpetual markets |

Asset class is a **second-level dimension**, not a product layer. Current normalized asset classes include Equity, ETF, Equity Index, Commodity, Commodity ETF, Commodity Index, FX, Bond, Pre-IPO / Private and RWA (unclassified).

## Status definitions

- **LIVE** — retrievable from an identified source and already used by DuoData.
- **PARTIAL** — source exists, but coverage/normalization is not yet sufficient for a production metric.
- **COLLECTING** — future values are publicly observable, but a trustworthy historical series must be accumulated by DuoData.
- **KEY REQUIRED** — market data API exists but requires an exchange API credential; not an internal-data requirement.
- **PRIVATE** — requires exchange/broker internal aggregate data or a data partnership.
- **UNAVAILABLE** — no sufficiently reliable source has been identified.

## Venue-level trading data

| Venue / Product | Product layer | Instrument list | 24h venue volume | OI | Funding | L1 quote | Status |
|---|---|---|---:|---:|---:|---:|---|
| Binance TradFi Perpetuals | TradFi Perps | Public Futures metadata | Yes, exact quote volume | Partial | Partial | Yes | **LIVE / PARTIAL** |
| Bybit Stock / Commodity Perpetuals | TradFi Perps | Public V5 API (`symbolType`) | Yes | Yes | Yes | Yes | **LIVE** |
| Bitget RWA Perpetuals | TradFi Perps | Public V2 API (`isRwa=YES`) | Yes | Yes | Yes | Yes | **LIVE** |
| OKX Stock / TradFi Perpetuals | TradFi Perps | Public V5 metadata (`instCategory`) | Exact USD turnover not published | Yes | Partial | Yes | **PARTIAL** |
| Coinbase INTX TradFi Perpetuals | TradFi Perps | Public International Exchange API | Yes | Yes | Predicted funding requires normalization | Yes | **LIVE / PARTIAL** |
| Kraken xStocks / TradFi Perpetuals | TradFi Perps | Public Futures API + official contract IDs | Yes | Partial | Partial | Yes | **LIVE / PARTIAL** |
| Bybit xStocks | Tokenized Spot | Public V5 API (`symbolType=xstocks`) | Yes | N/A | N/A | Yes | **LIVE** |
| Bitget Stock+ real equities | Real Equity | Stock+ / broker APIs | **No validated public customer-turnover field** | N/A | N/A | Underlying quotes available | **PRIVATE / PARTIAL** |
| Binance bStocks | Tokenized Spot | Public/developer APIs | Pending production adapter | N/A | N/A | Pending | **PARTIAL** |
| rToken products | Tokenized Spot | Venue/token issuer APIs | Pending production adapter | N/A | N/A | Pending | **PARTIAL** |
| Bybit TradFi CFD / MT5 | CFD / Broker | Broker/MT5 interfaces | **No validated public venue customer-turnover series** | Product-specific | Product-specific | Product-specific | **UNAVAILABLE / PARTIAL** |

## DuoData metrics

| Metric | Current status | Methodology |
|---|---|---|
| 24h TradFi Perps volume by exchange | **LIVE** | Sum exact quote/notional turnover for instruments classified as TradFi Perps only |
| TradFi Perps open interest | **LIVE / PARTIAL** | Perpetual/futures OI only; no tokenized spot or real-equity positions |
| TradFi Perps funding rates | **PARTIAL** | Funding only where units/settlement intervals are normalized |
| TradFi Perps top-of-book spread | **LIVE** | Bid/ask for perpetual/futures layer only |
| TradFi Perps volume by asset class | **LIVE / PARTIAL** | Asset class is second-level classification inside TradFi Perps; ambiguous RWA remains unclassified |
| Tokenized Spot 24h volume | **PARTIAL** | Kept fully separate from TradFi Perps; current live coverage is incomplete across issuers/venues |
| Real Equity customer turnover | **PRIVATE** | Underlying exchange market volume must not be substituted for crypto-platform customer stock turnover |
| CFD / Broker customer turnover | **UNAVAILABLE / PARTIAL** | Kept separate until a reliable public venue-specific series is validated |
| Historical DuoData volume / OI | **COLLECTING** | Persistent snapshots only; no synthetic backfill |
| ±10 / ±25 / ±50 bp depth | **PARTIAL** | Rate-limit-aware L2 collector per instrument |
| $10k / $100k / $500k slippage | **PARTIAL** | L2 collector + standardized execution simulation |
| TradFi Tracking Error Index | **PARTIAL** | Independent consolidated underlying reference-price feed required |
| Off-Hours Volume Share | **PARTIAL / COLLECTING** | Trade timestamps normalized to underlying-market sessions, calculated within a product layer |
| Weekend Price Discovery Score | **COLLECTING** | 24/7 CEX observations + verified Monday cash-market open |
| TradFi Penetration Ratio | **PARTIAL** | Must define the numerator by product layer before comparing with crypto turnover |
| Crypto–TradFi Rotation Index | **COLLECTING** | Historical series must preserve product-layer definitions |
| Synthetic Leverage Ratio | **PARTIAL** | TradFi Perps OI divided by matching Tokenized Spot market cap/supply; cross-layer ratio, not volume aggregation |
| Unique TradFi traders / new accounts / geography | **PRIVATE** | Exchange internal aggregate user analytics |
| USDT/USDC → real stock conversion flow | **PRIVATE** | Exchange internal ledger / brokerage settlement data |
| Stock+ customer net buy/sell | **PRIVATE** | Exchange/broker customer flow data |
| TradFi product revenue / fees | **PRIVATE** | Exchange internal financial data |

## Important methodology distinctions

### 1. Product layer comes before asset class
“Equity” alone is not enough. AAPL held through a brokerage account, tokenized AAPL spot and AAPL perpetual are three economically different products. DuoData therefore classifies wrapper/product layer first, then asset class.

### 2. Underlying-market volume is not exchange customer volume
A Stock+ quote endpoint may expose AAPL's price, volume and turnover from the underlying securities market. DuoData must not label that as “Bitget user Stock+ volume” unless the exchange explicitly reports customer venue turnover.

### 3. Cross-layer totals are prohibited by default
Real Equity, Tokenized Spot, TradFi Perps and CFD / Broker activity are not added together into a generic “TradFi Volume” number. Any future cross-layer index must explicitly define weighting and economic interpretation.

### 4. Historical series start when measurement starts
If an exchange does not expose adequate historical snapshots, DuoData begins collecting from the deployment date. The UI should show the actual available window instead of generating a visually complete but unverifiable history.

### 5. API credential is not the same as internal data
Some market-data APIs require a normal developer API key. DuoData labels these **KEY REQUIRED**, not **PRIVATE**. Private means the metric itself is not externally observable even with ordinary public/developer API access.
