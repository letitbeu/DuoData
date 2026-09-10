export type MarketRow = {
  venue: string
  product: string
  symbol: string
  underlying: string
  marketClass: string
  lastPrice: number
  volume24hUsd: number | null
  openInterestUsd: number | null
  fundingRate: number | null
  change24h: number | null
  bid: number | null
  ask: number | null
}

export type VenueRow = {
  venue: string
  volume24hUsd: number | null
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

const errText = (e: unknown) => e instanceof Error ? e.message : String(e)

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'DuoData/0.3 (+https://github.com/letitbeu/DuoData)',
    },
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

async function bybitJson<T>(path: string): Promise<T> {
  const bases = ['https://api.bybit.com', 'https://api.bytick.com']
  const errors: string[] = []
  for (const base of bases) {
    try {
      return await getJson<T>(`${base}${path}`)
    } catch (e) {
      errors.push(`${new URL(base).hostname}: ${errText(e)}`)
    }
  }
  throw new Error(`all official endpoints failed (${errors.join(' / ')})`)
}

async function bybit(): Promise<MarketRow[]> {
  const [stocks, commodities, xstocks, linearTickers, spotTickers] = await Promise.all([
    bybitJson<any>('/v5/market/instruments-info?category=linear&symbolType=stock&limit=1000'),
    bybitJson<any>('/v5/market/instruments-info?category=linear&symbolType=commodity&limit=1000'),
    bybitJson<any>('/v5/market/instruments-info?category=spot&symbolType=xstocks'),
    bybitJson<any>('/v5/market/tickers?category=linear'),
    bybitJson<any>('/v5/market/tickers?category=spot'),
  ])

  for (const response of [stocks, commodities, xstocks, linearTickers, spotTickers]) {
    if (response?.retCode !== 0) throw new Error(`API: ${response?.retMsg || 'unknown error'}`)
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
        volume24hUsd: nullableNum(t.turnover24h),
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
      volume24hUsd: nullableNum(t.turnover24h),
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
  if (contracts?.code !== '00000') throw new Error(`contracts: ${contracts?.msg || 'unknown error'}`)
  if (tickers?.code !== '00000') throw new Error(`tickers: ${tickers?.msg || 'unknown error'}`)

  const rwa = (contracts.data || []).filter((x: any) => String(x.isRwa).toUpperCase() === 'YES')
  const tickerMap = new Map((tickers.data || []).map((x: any) => [x.symbol, x]))

  return rwa.flatMap((i: any) => {
    const t: any = tickerMap.get(i.symbol)
    if (!t) return []
    const mark = num(t.markPrice || t.lastPr)
    const oiSize = nullableNum(t.holdingAmount)
    return [{
      venue: 'Bitget',
      product: 'RWA Perpetual',
      symbol: i.symbol,
      underlying: i.baseCoin || i.symbol,
      marketClass: 'RWA',
      lastPrice: num(t.lastPr),
      volume24hUsd: nullableNum(t.usdtVolume || t.quoteVolume),
      openInterestUsd: oiSize === null ? null : oiSize * mark,
      fundingRate: nullableNum(t.fundingRate),
      change24h: nullableNum(t.change24h ?? t.changeUtc24h),
      bid: nullableNum(t.bidPr),
      ask: nullableNum(t.askPr),
    } satisfies MarketRow]
  })
}

type OkxResponse = { code?: string; msg?: string; data?: any[] }
const OKX_CLASS: Record<string, string> = {
  '3': 'Equity',
  '4': 'Commodity',
  '5': 'FX',
  '6': 'Bond',
}

async function okx(): Promise<MarketRow[]> {
  const base = 'https://www.okx.com'
  const [swapInst, futureInst, swapTickers, futureTickers, swapOi, futureOi] = await Promise.all([
    getJson<OkxResponse>(`${base}/api/v5/public/instruments?instType=SWAP`),
    getJson<OkxResponse>(`${base}/api/v5/public/instruments?instType=FUTURES`),
    getJson<OkxResponse>(`${base}/api/v5/market/tickers?instType=SWAP`),
    getJson<OkxResponse>(`${base}/api/v5/market/tickers?instType=FUTURES`),
    getJson<OkxResponse>(`${base}/api/v5/public/open-interest?instType=SWAP`),
    getJson<OkxResponse>(`${base}/api/v5/public/open-interest?instType=FUTURES`),
  ])

  for (const response of [swapInst, futureInst, swapTickers, futureTickers, swapOi, futureOi]) {
    if (response?.code !== '0') throw new Error(`API: ${response?.msg || 'unknown error'}`)
  }

  const instruments = [...(swapInst.data || []), ...(futureInst.data || [])]
  const tickerMap = new Map([...(swapTickers.data || []), ...(futureTickers.data || [])].map((x: any) => [x.instId, x]))
  const oiMap = new Map([...(swapOi.data || []), ...(futureOi.data || [])].map((x: any) => [x.instId, x]))
  const rows: MarketRow[] = []

  for (const i of instruments) {
    const marketClass = OKX_CLASS[String(i.instCategory)]
    if (!marketClass) continue
    const t: any = tickerMap.get(i.instId)
    if (!t) continue
    const last = nullableNum(t.last)
    if (last === null || last <= 0) continue
    const open = nullableNum(t.open24h)
    const oi: any = oiMap.get(i.instId)
    const isXPerp = String(i.ruleType).toLowerCase() === 'xperp'
    const product = i.instType === 'SWAP'
      ? `${marketClass} Perpetual`
      : isXPerp ? `${marketClass} X-Perp` : `${marketClass} Future`

    rows.push({
      venue: 'OKX',
      product,
      symbol: i.instId,
      underlying: String(i.uly || i.instFamily || i.instId).split('-')[0],
      marketClass,
      lastPrice: last,
      // OKX ticker volCcy24h is base-currency volume for derivatives, not exact quote notional.
      // DuoData intentionally leaves USD turnover unavailable rather than multiplying by last price.
      volume24hUsd: null,
      openInterestUsd: nullableNum(oi?.oiUsd),
      fundingRate: null,
      change24h: open && open > 0 ? last / open - 1 : null,
      bid: nullableNum(t.bidPx),
      ask: nullableNum(t.askPx),
    })
  }

  return rows
}

const COINBASE_TRADFI_TYPES = new Set([
  'EQUITY',
  'EQUITY_ETF',
  'EQUITY_INDEX',
  'COMMOD',
  'COMMOD_INDEX',
  'COMMOD_ETF',
])

const COINBASE_CLASS: Record<string, string> = {
  EQUITY: 'Equity',
  EQUITY_ETF: 'ETF',
  EQUITY_INDEX: 'Equity Index',
  COMMOD: 'Commodity',
  COMMOD_INDEX: 'Commodity Index',
  COMMOD_ETF: 'Commodity ETF',
}

async function coinbase(): Promise<MarketRow[]> {
  const instruments = await getJson<any[]>('https://api.international.coinbase.com/api/v1/instruments')
  if (!Array.isArray(instruments)) throw new Error('unexpected instruments response')

  const rows: MarketRow[] = []
  for (const i of instruments) {
    const underlyingType = String(i.underlying_type || '').toUpperCase()
    if (!COINBASE_TRADFI_TYPES.has(underlyingType)) continue
    if (String(i.trading_state || '').toUpperCase() === 'DELISTED') continue

    const q = i.quote || {}
    const last = nullableNum(q.trade_price ?? q.mark_price)
    if (last === null || last <= 0) continue
    const oiQty = nullableNum(i.open_interest)
    const multiplier = nullableNum(i.base_asset_multiplier) ?? 1
    const mark = nullableNum(q.mark_price) ?? last
    const marketClass = COINBASE_CLASS[underlyingType] || 'TradFi'

    rows.push({
      venue: 'Coinbase INTX',
      product: `${marketClass} ${String(i.type).toUpperCase() === 'PERP' ? 'Perpetual' : 'Spot'}`,
      symbol: i.symbol,
      underlying: i.base_asset_name || String(i.symbol || '').split('-')[0],
      marketClass,
      lastPrice: last,
      volume24hUsd: nullableNum(i.notional_24hr),
      openInterestUsd: String(i.type).toUpperCase() === 'PERP' && oiQty !== null ? oiQty * mark * multiplier : null,
      // Coinbase exposes predicted_funding. It is deliberately excluded until interval/unit normalization is implemented.
      fundingRate: null,
      change24h: null,
      bid: nullableNum(q.best_bid_price),
      ask: nullableNum(q.best_ask_price),
    })
  }
  return rows
}

const coverage: CoverageRow[] = [
  { metric: '24h TradFi / RWA trading volume', status: 'LIVE', source: 'Bybit + Bitget + Coinbase INTX public REST APIs', note: 'Uses venue-reported quote notional only. OKX is excluded from this metric because its derivatives ticker publishes base-currency volume, not exact 24h quote turnover.' },
  { metric: 'Open interest (USD)', status: 'LIVE', source: 'Bybit + Bitget + OKX + Coinbase INTX public REST APIs', note: 'Direct USD OI where published; Bitget and Coinbase contract/base quantity are converted with the venue mark price and multiplier.' },
  { metric: 'Funding rate', status: 'PARTIAL', source: 'Bybit + Bitget public REST APIs', note: 'Current venue-reported rates are shown. OKX per-instrument funding and Coinbase predicted funding are not mixed in until interval/unit normalization is implemented.' },
  { metric: 'Best bid / ask & top-of-book spread', status: 'LIVE', source: 'Bybit + Bitget + OKX + Coinbase INTX public REST APIs', note: 'Current L1 quote. Deeper liquidity metrics are not inferred from L1.' },
  { metric: 'TradFi instrument coverage', status: 'LIVE', source: 'Venue-native metadata', note: 'Bybit symbolType, Bitget isRwa, OKX instCategory and Coinbase underlying_type are used. No hand-maintained ticker guess list.' },
  { metric: 'Historical DuoData volume / OI series', status: 'COLLECTING', source: 'DuoData collector', note: 'No synthetic backfill. History starts only after persistent collection is enabled.' },
  { metric: '±10/25/50bp depth & $100k slippage', status: 'PARTIAL', source: 'Public order-book APIs', note: 'Technically available per symbol; aggregation is not enabled yet to avoid rate-limit-heavy fan-out.' },
  { metric: 'Cross-venue tracking error', status: 'PARTIAL', source: 'Exchange index/mark + reference market', note: 'Exchange marks are public; an independent consolidated US equity reference feed still needs to be selected.' },
  { metric: 'Weekend Price Discovery Score', status: 'COLLECTING', source: '24/7 CEX prices + Monday cash open', note: 'Requires accumulated weekend observations and a verified cash-market opening-price source.' },
  { metric: 'TradFi Penetration Ratio (TradFi/Crypto)', status: 'PARTIAL', source: 'Exchange public market data', note: 'TradFi leg is available on several venues; denominator needs a rigorously normalized exchange-wide crypto turnover series.' },
  { metric: 'USDT/USDC → real stock conversion flow', status: 'PRIVATE', source: 'Exchange internal ledger', note: 'Not observable from public market APIs; DuoData will not estimate it.' },
  { metric: 'Unique TradFi traders / new accounts / geography', status: 'PRIVATE', source: 'Exchange internal analytics', note: 'Requires partner or internal user-level aggregate data.' },
  { metric: 'Real Stock+ customer net buy / sell flow', status: 'PRIVATE', source: 'Broker / exchange internal data', note: 'Public quotes are available on some venues, but customer flow is not public.' },
]

function venueAggregate(rows: MarketRow[]): VenueRow[] {
  const venues = [...new Set(rows.map(r => r.venue))]
  return venues.map(venue => {
    const x = rows.filter(r => r.venue === venue)
    const fundings = x.map(r => r.fundingRate).filter((v): v is number => v !== null)
    const volumes = x.map(r => r.volume24hUsd).filter((v): v is number => v !== null)
    return {
      venue,
      volume24hUsd: volumes.length ? volumes.reduce((s, v) => s + v, 0) : null,
      openInterestUsd: x.reduce((s, r) => s + (r.openInterestUsd || 0), 0),
      instruments: x.length,
      fundingMedian: median(fundings),
      status: 'live' as const,
    }
  }).sort((a, b) => (b.volume24hUsd ?? -1) - (a.volume24hUsd ?? -1))
}

export async function getSnapshot(): Promise<Snapshot> {
  const errors: string[] = []
  const sources = [
    { venue: 'Bybit', promise: bybit() },
    { venue: 'Bitget', promise: bitget() },
    { venue: 'OKX', promise: okx() },
    { venue: 'Coinbase INTX', promise: coinbase() },
  ]
  const settled = await Promise.allSettled(sources.map(s => s.promise))
  const markets: MarketRow[] = []

  settled.forEach((r, idx) => {
    const venue = sources[idx].venue
    if (r.status === 'fulfilled') markets.push(...r.value)
    else errors.push(`${venue}: ${errText(r.reason)}`)
  })

  markets.sort((a, b) => (b.volume24hUsd ?? -1) - (a.volume24hUsd ?? -1))
  const venues = venueAggregate(markets)

  return {
    asOf: new Date().toISOString(),
    totalVolume24hUsd: markets.reduce((s, r) => s + (r.volume24hUsd || 0), 0),
    totalOpenInterestUsd: markets.reduce((s, r) => s + (r.openInterestUsd || 0), 0),
    liveInstruments: markets.length,
    liveVenues: venues.length,
    venues,
    markets,
    coverage,
    errors,
  }
}
