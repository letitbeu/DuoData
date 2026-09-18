import {
  getSnapshot as getBaseSnapshot,
  type MarketRow,
  type VenueRow,
  type CoverageRow,
  type Snapshot,
} from './market-v09'

const n = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'application/json', 'User-Agent': 'DuoData/1.0 (+https://github.com/letitbeu/DuoData)' },
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

const KRAKEN_ETF = new Set(['GLD','QQQ','SPY','VTI','IWM','TLT','SLV'])
const KRAKEN_PRIVATE = new Set(['SPCX','OPENAI','ANTHROPIC'])

function cleanXStockUnderlying(altname: string) {
  const x = altname.toUpperCase()
  return x.endsWith('X') ? x.slice(0, -1) : x
}

function krakenAssetClass(underlying: string) {
  if (KRAKEN_PRIVATE.has(underlying)) return 'Pre-IPO / Private'
  if (KRAKEN_ETF.has(underlying)) return 'ETF'
  return 'Equity'
}

async function dynamicKrakenXStockPerps(): Promise<MarketRow[]> {
  const [assets, tickerResponse] = await Promise.all([
    getJson<any>('https://api.kraken.com/0/public/Assets?aclass=tokenized_asset'),
    getJson<any>('https://futures.kraken.com/derivatives/api/v3/tickers'),
  ])

  if (Array.isArray(assets?.error) && assets.error.length) {
    throw new Error(`Kraken Assets: ${assets.error.join(', ')}`)
  }

  const tokenized = new Set<string>()
  for (const value of Object.values<any>(assets?.result || {})) {
    const alt = String(value?.altname || '').toUpperCase()
    if (alt) tokenized.add(alt)
  }
  if (!tokenized.size) throw new Error('tokenized_asset universe returned 0 assets')

  const tickers = Array.isArray(tickerResponse)
    ? tickerResponse
    : tickerResponse?.tickers || tickerResponse?.result?.tickers || []
  if (!Array.isArray(tickers)) throw new Error('Kraken Futures ticker payload invalid')

  const rows: MarketRow[] = []
  for (const t of tickers) {
    const symbol = String(t.product_id || t.symbol || '').toUpperCase()
    const match = symbol.match(/^PF_(.+)USD$/)
    if (!match) continue
    const futuresBase = match[1]
    if (!tokenized.has(futuresBase)) continue

    const last = n(t.last ?? t.markPrice ?? t.mark_price)
    if (last === null || last <= 0) continue

    const underlying = cleanXStockUnderlying(futuresBase)
    const assetClass = krakenAssetClass(underlying)
    const pct = n(t.change ?? t.change24h)

    rows.push({
      venue: 'Kraken',
      product: 'xStock Perpetual',
      symbol,
      underlying,
      marketClass: assetClass,
      productLayer: 'TradFi Perps',
      assetClass,
      lastPrice: last,
      volume24hUsd: n(t.volumeQuote ?? t.volume_quote),
      // Kraken Futures exposes venue-native OI, but USD normalization remains separate
      // until contract-size semantics are programmatically validated for all xStock perps.
      openInterestUsd: null,
      fundingRate: n(t.funding_rate ?? t.fundingRate),
      change24h: pct === null ? null : pct / 100,
      bid: n(t.bid),
      ask: n(t.ask),
    })
  }

  if (!rows.length) throw new Error('0 futures contracts matched official tokenized_asset universe')
  return rows
}

function unique(rows: MarketRow[]) {
  const m = new Map<string, MarketRow>()
  for (const row of rows) m.set(`${row.venue}|${row.symbol}|${row.product}`, row)
  return [...m.values()]
}

function coverage(rows: CoverageRow[], count: number): CoverageRow[] {
  return rows.map(row => {
    if (row.metric === 'Product layer: TradFi Perps') {
      return {
        ...row,
        note: `${row.note} Kraken xStock perps are dynamically discovered by joining official tokenized_asset assets with Futures tickers; ${count} live contracts matched on this refresh.`,
      }
    }
    return row
  })
}

export async function getSnapshot(): Promise<Snapshot> {
  const base = await getBaseSnapshot()
  let markets = base.markets.filter(m => m.venue !== 'Kraken')
  const errors = base.errors.filter(e => !e.startsWith('Kraken:'))
  let krakenCount = 0

  try {
    const kraken = await dynamicKrakenXStockPerps()
    krakenCount = kraken.length
    markets.push(...kraken)
  } catch (e) {
    // Preserve the previous engine's Kraken rows if the dynamic source is temporarily unavailable,
    // but explicitly surface the degradation.
    const fallback = base.markets.filter(m => m.venue === 'Kraken')
    markets.push(...fallback)
    krakenCount = fallback.length
    errors.push(`Kraken dynamic discovery degraded: ${e instanceof Error ? e.message : String(e)}`)
  }

  markets = unique(markets).sort((a,b)=>(b.volume24hUsd ?? -1)-(a.volume24hUsd ?? -1))
  return {
    ...base,
    markets,
    liveInstruments: markets.length,
    liveVenues: new Set(markets.map(m=>m.venue)).size,
    totalVolume24hUsd: markets.reduce((s,m)=>s+(m.volume24hUsd ?? 0),0),
    totalOpenInterestUsd: markets.reduce((s,m)=>s+(m.openInterestUsd ?? 0),0),
    coverage: coverage(base.coverage, krakenCount),
    errors,
  }
}

export type { MarketRow, VenueRow, CoverageRow, Snapshot }
