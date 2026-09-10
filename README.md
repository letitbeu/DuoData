# DuoData

**TradFi market intelligence for crypto-native venues.**

DuoData measures how equities, tokenized equities, commodities and TradFi perpetuals trade on crypto exchanges. The project deliberately separates different legal/product wrappers and does not fabricate unavailable data.

## V0.1

Live adapters currently implemented:

- Bybit Stock Perpetuals — discovered with `symbolType=stock`
- Bybit Commodity Perpetuals — discovered with `symbolType=commodity`
- Bybit xStocks — discovered with `symbolType=xstocks`
- Bitget RWA Perpetuals — discovered with `isRwa=YES`

Live fields currently shown:

- 24h quote turnover
- Open interest in USD where derivable from official fields
- Current funding rate
- Last price and 24h change
- Best bid / ask and top-of-book spread
- Instrument and product coverage

The dashboard refreshes every 60 seconds. `/api/snapshot` exposes the normalized live snapshot as JSON.

## Data policy

1. No fake data.
2. No synthetic historical backfill.
3. No underlying-market turnover relabeled as exchange customer turnover.
4. Real equities, tokenized equities, perpetuals and CFDs remain separate product types.
5. Missing or partner-only metrics are explicitly logged.

See [`docs/DATA_COVERAGE.md`](docs/DATA_COVERAGE.md) for the detailed coverage matrix.

## Local development

```bash
npm install
npm run dev
```

## Deployment

The app is a standard Next.js App Router project and can be imported directly into Vercel from this GitHub repository. No environment variables are required for the currently enabled Bybit and Bitget public endpoints.

Future API-key-gated adapters should use Vercel environment variables and must never commit credentials to the repository.
