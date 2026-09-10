export type MarketRow = {
  venue: string
  product: string
  symbol: string
  underlying: string
  marketClass: string
  lastPrice: number
  volume24hUsd: number
  openInterestUsd: number | null
  fundingRate: number | null
  change24h: number | null
  bid: number | null
  ask: number | null
}

export type VenueRow = {
  venue: string
  volume24hUsd: number
  openInterestUsd: number
  instruments: number
  fundingMedian: number | null
  status: 'live' | 'partial' | 'unavailable'
  note?: string
}

export type CoverageRow = {
  metric: string
  status: 'LIVE' | 'PARTIAL' | 'COLLECTING' | 'PRIVATE' | 'UNAVAILABLE'
  source: string
  note: string
}

export type Snapshot = {
  asOf: string
  totalVolume24hUsd: number
  totalOpenInterestUsd: number
  liveInstruments: number
  liveVenues: number
  venues: VenueRow[]
  markets: MarketRow[]
  coverage: CoverageRow[]
  errors: string[]
}

const num = (v: unknown) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

const nullableNum = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

const median = (xs: number[]) => {
  if (!xs.length) return null
  const a = [...xs].sort((x, y) => x - y)
  const i = Math.floor(a.length / 2)
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'DuoData/0.1 (+https://github.com/letitbeu/DuoData)' },
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

async function bybit(): Promise<MarketRow[]> {
  const base = 'https://api.bybit.com'
  const [stocks, commodities, xstocks, linearTickers, spotTickers] = await Promise.all([
    getJson<any>(`${base}/v5/market/instruments-info?category=linear&symbolType=stock&limit=1000`),
    getJson<any>(`${base}/v5/market/instruments-info?category=linear&symbolType=commodity&limit=1000`),
    getJson<any>(`${base}/v5/market/instruments-info?category=spot&symbolType=xstocks`),
    getJson<any>(`${base}/v5/market/tickers?category=linear`),
    getJson<any>(`${base}/v5/market/tickers?category=spot`),
  ])

  for (const response of [stocks, commodities, xstocks, linearTickers, spotTickers]) {
    if (response?.retCode !== 0) throw new Error(`Bybit API: ${response?.retMsg || 'unknown error'}`)
  }

  const linearMap = new Map((linearTickers.result?.list || []).map((x: any) => [x.symbol, x]))
  const spotMap = new Map((spotTickers.result?.list || []).map((x: any) => [x.symbol, x]))
  const rows: MarketRow[] = []

  const addLinear = (items: any[], product: string, marketClass: string) => {
    for (const i of items || []) {
      const t: any = linearMap.get(i.symbol)
      if (!t) continue
      rows.push({
        venue: 'Bybit',
        product,
        symbol: i.symbol,
        underlying: i.underlyingTicker || i.baseCoin || i.symbol,
        marketClass,
        lastPrice: num(t.lastPrice),
        volume24hUsd: num(t.turnover24h),
        openInterestUsd: nullableNum(t.openInterestValue),
        fundingRate: nullableNum(t.fundingRate),
        change24h: nullableNum(t.price24hPcnt),
        bid: nullableNum(t.bid1Price),
        ask: nullableNum(t.ask1Price),
      })
    }
  }

  addLinear(stocks.result?.list, 'Stock Perpetual', 'Equity')
  addLinear(commodities.result?.list, 'Commodity Perpetual', 'Commodity')

  for (const i of xstocks.result?.list || []) {
    const t: any = spotMap.get(i.symbol)
    if (!t) continue
    rows.push({
      venue: 'Bybit',
      product: 'xStock Token',
      symbol: i.symbol,
      underlying: i.underlyingTicker || i.baseCoin || i.symbol,
      marketClass: 'Tokenized Equity',
      lastPrice: num(t.lastPrice),
      volume24hUsd: num(t.turnover24h),
      openInterestUsd: null,
      fundingRate: null,
      change24h: nullableNum(t.price24hPcnt),
      bid: nullableNum(t.bid1Price),
      ask: nullableNum(t.ask1Price),
    })
  }

  return rows
}

async function bitget(): Promise<MarketRow[]> {
  const base = 'https://api.bitget.com'
  const [contracts, tickers] = await Promise.all([
    getJson<any>(`${base}/api/v2/mix/market/contracts?productType=usdt-futures`),
    getJson<any>(`${base}/api/v2/mix/market/tickers?productType=usdt-futures`),
  ])
  if (contracts?.code !== '00000') throw new Error(`Bitget contracts: ${contracts?.msg || 'unknown error'}`)
  if (tickers?.code !== '00000') throw new Error(`Bitget tickers: ${tickers?.msg || 'unknown error'}`)

  const rwa = (contracts.data || []).filter((x: any) => String(x.isRwa).toUpperCase() === 'YES')
  const tickerMap = new Map((tickers.data || []).map((x: any) => [x.symbol, x]))

  return rwa.flatMap((i: any) => {
    const t: any = tickerMap.get(i.symbol)
    if (!t) return []
    const price = num(t.markPrice || t.lastPr)
    const oiSize = nullableNum(t.holdingAmount)
    return [{
      venue: 'Bitget',
      product: 'RWA Perpetual',
      symbol: i.symbol,
      underlying: i.baseCoin || i.symbol,
      marketClass: 'RWA',
      lastPrice: num(t.lastPr),
      volume24hUsd: num(t.usdtVolume || t.quoteVolume),
      openInterestUsd: oiSize === null ? null : oiSize * price,
      fundingRate: nullableNum(t.fundingRate),
      change24h: nullableNum(t.change24h ?? t.changeUtc24h),
      bid: nullableNum(t.bidPr),
      ask: nullableNum(t.askPr),
    } satisfies MarketRow]
  })
}

const coverage: CoverageRow[] = [
  { metric: '24h TradFi / RWA trading volume', status: 'LIVE', source: 'Bybit + Bitget public REST APIs', note: 'Aggregated from exchange-reported quote turnover for TradFi/RWA instruments only.' },
  { metric: 'Open interest (USD)', status: 'LIVE', source: 'Bybit + Bitget public REST APIs', note: 'Bybit reports OI value directly; Bitget OI size is converted with mark price.' },
  { metric: 'Funding rate', status: 'LIVE', source: 'Bybit + Bitget public REST APIs', note: 'Current exchange-reported funding rate for perpetual products.' },
  { metric: 'Best bid / ask & top-of-book spread', status: 'LIVE', source: 'Bybit + Bitget public REST APIs', note: 'Current L1 quote. Deeper liquidity metrics are not inferred from L1.' },
  { metric: 'TradFi instrument coverage', status: 'LIVE', source: 'Bybit symbolType + Bitget isRwa', note: 'Uses explicit exchange metadata, not a hand-maintained ticker guess list.' },
  { metric: 'Historical DuoData volume / OI series', status: 'COLLECTING', source: 'DuoData collector', note: 'No synthetic backfill. History starts only after persistent collection is enabled.' },
  { metric: '±10/25/50bp depth & $100k slippage', status: 'PARTIAL', source: 'Public order-book APIs', note: 'Technically available per symbol; V1 aggregation not enabled yet to avoid rate-limit-heavy fan-out.' },
  { metric: 'Cross-venue tracking error', status: 'PARTIAL', source: 'Exchange index/mark + reference market', note: 'Exchange marks are public; independent consolidated US equity reference feed still needs to be selected.' },
  { metric: 'Weekend Price Discovery Score', status: 'COLLECTING', source: '24/7 CEX prices + Monday cash open', note: 'Requires accumulated weekend observations and a verified cash-market opening-price source.' },
  { metric: 'TradFi Penetration Ratio (TradFi/Crypto)', status: 'PARTIAL', source: 'Exchange public market data', note: 'TradFi leg is available; denominator needs a rigorously normalized exchange-wide crypto turnover series.' },
  { metric: 'USDT/USDC → real stock conversion flow', status: 'PRIVATE', source: 'Exchange internal ledger', note: 'Not observable from public market APIs; DuoData will not estimate it.' },
  { metric: 'Unique TradFi traders / new accounts / geography', status: 'PRIVATE', source: 'Exchange internal analytics', note: 'Requires partner or internal user-level aggregate data.' },
  { metric: 'Real Stock+ customer net buy / sell flow', status: 'PRIVATE', source: 'Broker / exchange internal data', note: 'Public quotes are available on some venues, but customer flow is not public.' },
]

function venueAggregate(rows: MarketRow[]): VenueRow[] {
  const venues = [...new Set(rows.map(r => r.venue))]
  return venues.map(venue => {
    const x = rows.filter(r => r.venue === venue)
    const fundings = x.map(r => r.fundingRate).filter((v): v is number => v !== null)
    return {
      venue,
      volume24hUsd: x.reduce((s, r) => s + r.volume24hUsd, 0),
      openInterestUsd: x.reduce((s, r) => s + (r.openInterestUsd || 0), 0),
      instruments: x.length,
      fundingMedian: median(fundings),
      status: 'live' as const,
    }
  }).sort((a, b) => b.volume24hUsd - a.volume24hUsd)
}

export async function getSnapshot(): Promise<Snapshot> {
  const errors: string[] = []
  const settled = await Promise.allSettled([bybit(), bitget()])
  const markets: MarketRow[] = []

  settled.forEach((r, idx) => {
    const venue = idx === 0 ? 'Bybit' : 'Bitget'
    if (r.status === 'fulfilled') markets.push(...r.value)
    else errors.push(`${venue}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
  })

  markets.sort((a, b) => b.volume24hUsd - a.volume24hUsd)
  const venues = venueAggregate(markets)

  return {
    asOf: new Date().toISOString(),
    totalVolume24hUsd: markets.reduce((s, r) => s + r.volume24hUsd, 0),
    totalOpenInterestUsd: markets.reduce((s, r) => s + (r.openInterestUsd || 0), 0),
    liveInstruments: markets.length,
    liveVenues: venues.length,
    venues,
    markets,
    coverage,
    errors,
  }
}
