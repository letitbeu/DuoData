import {
  getSnapshot as getBaseSnapshot,
  type MarketRow,
  type VenueRow,
  type CoverageRow,
  type Snapshot,
} from './market-v04'

const nullableNum = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

const errText = (e: unknown) => e instanceof Error ? e.message : String(e)

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DuoData/0.5 (+https://github.com/letitbeu/DuoData)',
    },
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

const BINANCE_TRADFI_TYPES = new Set([
  'EQUITY', 'CN_EQUITY', 'HK_EQUITY', 'KR_EQUITY', 'COMMODITY', 'PREMARKET', 'FOREX', 'FX', 'BOND',
])

const BINANCE_CLASS: Record<string, string> = {
  EQUITY: 'Equity',
  CN_EQUITY: 'China Equity',
  HK_EQUITY: 'Hong Kong Equity',
  KR_EQUITY: 'Korea Equity',
  COMMODITY: 'Commodity',
  PREMARKET: 'Pre-market',
  FOREX: 'FX',
  FX: 'FX',
  BOND: 'Bond',
}

async function binanceRescue(): Promise<MarketRow[]> {
  // Keep the required call set deliberately small: exchange metadata + exact quote turnover.
  // L1 book / funding are optional metrics and must not be allowed to take the entire venue offline.
  const base = 'https://fapi.binance.com'
  const [exchangeInfo, tickers] = await Promise.all([
    getJson<any>(`${base}/fapi/v1/exchangeInfo`),
    getJson<any[]>(`${base}/fapi/v1/ticker/24hr`),
  ])
  const tickerMap = new Map((Array.isArray(tickers) ? tickers : []).map((x: any) => [String(x.symbol), x]))
  const rows: MarketRow[] = []

  for (const i of exchangeInfo?.symbols || []) {
    const underlyingType = String(i.underlyingType || '').toUpperCase()
    const contractType = String(i.contractType || '').toUpperCase()
    const isTradFi = contractType === 'TRADIFI_PERPETUAL' || BINANCE_TRADFI_TYPES.has(underlyingType)
    if (!isTradFi) continue
    if (String(i.status || '').toUpperCase() !== 'TRADING') continue
    const t: any = tickerMap.get(String(i.symbol))
    if (!t) continue
    const last = nullableNum(t.lastPrice)
    const quoteVolume = nullableNum(t.quoteVolume)
    if (last === null || last <= 0 || quoteVolume === null) continue
    const klass = BINANCE_CLASS[underlyingType] || (contractType === 'TRADIFI_PERPETUAL' ? 'TradFi' : underlyingType || 'TradFi')
    const pct = nullableNum(t.priceChangePercent)

    rows.push({
      venue: 'Binance',
      product: `${klass} Perpetual`,
      symbol: String(i.symbol),
      underlying: String(i.baseAsset || i.pair || i.symbol),
      marketClass: klass,
      lastPrice: last,
      volume24hUsd: quoteVolume,
      openInterestUsd: null,
      fundingRate: null,
      change24h: pct === null ? null : pct / 100,
      bid: null,
      ask: null,
    })
  }
  if (!rows.length) throw new Error('API reachable but returned 0 matched TRADIFI_PERPETUAL instruments')
  return rows
}

// Kraken public Futures ticker data is matched only against contract codes documented by Kraken.
// This is an official-specification whitelist, not a ticker-name guess. It avoids false positives
// such as PF_SNXUSD while removing the previous dependency on a changed xStocks registry endpoint.
const KRAKEN_TRADFI: Record<string, { underlying: string; marketClass: string; product: string }> = {
  PF_AAPLXUSD: { underlying: 'AAPL', marketClass: 'Equity', product: 'xStock Perpetual' },
  PF_AMZNXUSD: { underlying: 'AMZN', marketClass: 'Equity', product: 'xStock Perpetual' },
  PF_COINXUSD: { underlying: 'COIN', marketClass: 'Equity', product: 'xStock Perpetual' },
  PF_CRCLXUSD: { underlying: 'CRCL', marketClass: 'Equity', product: 'xStock Perpetual' },
  PF_GLDXUSD: { underlying: 'GLD', marketClass: 'ETF / Gold', product: 'xStock Perpetual' },
  PF_GOOGLXUSD: { underlying: 'GOOGL', marketClass: 'Equity', product: 'xStock Perpetual' },
  PF_HOODXUSD: { underlying: 'HOOD', marketClass: 'Equity', product: 'xStock Perpetual' },
  PF_METAXUSD: { underlying: 'META', marketClass: 'Equity', product: 'xStock Perpetual' },
  PF_MSTRXUSD: { underlying: 'MSTR', marketClass: 'Equity', product: 'xStock Perpetual' },
  PF_NVDAXUSD: { underlying: 'NVDA', marketClass: 'Equity', product: 'xStock Perpetual' },
  PF_QQQXUSD: { underlying: 'QQQ', marketClass: 'ETF / Index', product: 'xStock Perpetual' },
  PF_SPYXUSD: { underlying: 'SPY', marketClass: 'ETF / Index', product: 'xStock Perpetual' },
  PF_TSLAXUSD: { underlying: 'TSLA', marketClass: 'Equity', product: 'xStock Perpetual' },
  PF_SPCXXUSD: { underlying: 'SPCX', marketClass: 'Pre-IPO', product: 'Pre-IPO Perpetual' },
  PF_ANTHROPICXUSD: { underlying: 'ANTHROPIC', marketClass: 'Pre-IPO', product: 'Pre-IPO Perpetual' },
  PF_OPENAIXUSD: { underlying: 'OPENAI', marketClass: 'Pre-IPO', product: 'Pre-IPO Perpetual' },
  PF_EURUSD: { underlying: 'EURUSD', marketClass: 'FX', product: 'FX Perpetual' },
  PF_GBPUSD: { underlying: 'GBPUSD', marketClass: 'FX', product: 'FX Perpetual' },
  PF_AUDUSD: { underlying: 'AUDUSD', marketClass: 'FX', product: 'FX Perpetual' },
  PF_CHFUSD: { underlying: 'CHFUSD', marketClass: 'FX', product: 'FX Perpetual' },
  PF_JPYUSD: { underlying: 'JPYUSD', marketClass: 'FX', product: 'FX Perpetual' },
  PF_WTIOILUSD: { underlying: 'WTI', marketClass: 'Commodity', product: 'Commodity Perpetual' },
}

async function krakenRescue(): Promise<MarketRow[]> {
  const response = await getJson<any>('https://futures.kraken.com/derivatives/api/v3/tickers')
  const tickers = Array.isArray(response) ? response : response?.tickers || response?.result?.tickers || []
  if (!Array.isArray(tickers)) throw new Error('unexpected Futures tickers response')
  const rows: MarketRow[] = []

  for (const t of tickers) {
    const symbol = String(t.product_id || t.symbol || '').toUpperCase()
    const spec = KRAKEN_TRADFI[symbol]
    if (!spec) continue
    const last = nullableNum(t.last ?? t.markPrice ?? t.mark_price)
    if (last === null || last <= 0) continue
    const quoteVolume = nullableNum(t.volumeQuote ?? t.volume_quote)
    const pct = nullableNum(t.change ?? t.change24h)

    rows.push({
      venue: 'Kraken',
      product: spec.product,
      symbol,
      underlying: spec.underlying,
      marketClass: spec.marketClass,
      lastPrice: last,
      volume24hUsd: quoteVolume,
      openInterestUsd: null,
      fundingRate: null,
      change24h: pct === null ? null : pct / 100,
      bid: nullableNum(t.bid),
      ask: nullableNum(t.ask),
    })
  }
  if (!rows.length) throw new Error('Futures API reachable but returned 0 documented TradFi contracts')
  return rows
}

function venueAggregate(rows: MarketRow[]): VenueRow[] {
  const venues = [...new Set(rows.map(r => r.venue))]
  return venues.map(venue => {
    const x = rows.filter(r => r.venue === venue)
    const volumes = x.map(r => r.volume24hUsd).filter((v): v is number => v !== null)
    const oiValues = x.map(r => r.openInterestUsd).filter((v): v is number => v !== null)
    const funding = x.map(r => r.fundingRate).filter((v): v is number => v !== null).sort((a,b)=>a-b)
    const fundingMedian = funding.length ? funding[Math.floor(funding.length/2)] : null
    return {
      venue,
      volume24hUsd: volumes.length ? volumes.reduce((s,v)=>s+v,0) : null,
      openInterestUsd: oiValues.reduce((s,v)=>s+v,0),
      instruments: x.length,
      fundingMedian,
      status: 'live' as const,
    }
  }).sort((a,b)=>(b.volume24hUsd ?? -1)-(a.volume24hUsd ?? -1))
}

function uniqueMarkets(rows: MarketRow[]) {
  const map = new Map<string, MarketRow>()
  for (const row of rows) map.set(`${row.venue}|${row.symbol}|${row.product}`, row)
  return [...map.values()]
}

function refreshedCoverage(base: CoverageRow[]): CoverageRow[] {
  return base.map(c => {
    if (c.metric === '24h TradFi / RWA trading volume') return {
      ...c,
      source: 'Binance + Kraken + Bitget + Bybit + Coinbase INTX public market APIs',
      note: 'Exact venue-reported quote/notional volume only. OKX remains excluded from this chart where exact 24h USD quote turnover is not published.',
    }
    if (c.metric === 'TradFi instrument coverage') return {
      ...c,
      source: 'Venue-native metadata + official Kraken contract specifications',
      note: 'Binance uses TRADIFI_PERPETUAL/underlyingType; Kraken uses documented contract IDs; Bybit uses symbolType; Bitget isRwa; OKX instCategory; Coinbase underlying_type.',
    }
    return c
  })
}

export async function getSnapshot(): Promise<Snapshot> {
  const base = await getBaseSnapshot()
  let markets = [...base.markets]
  let errors = [...base.errors]

  if (!markets.some(m => m.venue === 'Binance')) {
    try {
      const rescued = await binanceRescue()
      markets.push(...rescued)
      errors = errors.filter(e => !e.startsWith('Binance:'))
    } catch (e) {
      const msg = `Binance: ${errText(e)}`
      errors = errors.filter(x => !x.startsWith('Binance:'))
      errors.push(msg)
    }
  }

  if (!markets.some(m => m.venue === 'Kraken')) {
    try {
      const rescued = await krakenRescue()
      markets.push(...rescued)
      errors = errors.filter(e => !e.startsWith('Kraken:'))
    } catch (e) {
      const msg = `Kraken: ${errText(e)}`
      errors = errors.filter(x => !x.startsWith('Kraken:'))
      errors.push(msg)
    }
  }

  markets = uniqueMarkets(markets).sort((a,b)=>(b.volume24hUsd ?? -1)-(a.volume24hUsd ?? -1))
  const venues = venueAggregate(markets)
  const exactVolume = markets.map(m=>m.volume24hUsd).filter((v):v is number=>v!==null)
  const oi = markets.map(m=>m.openInterestUsd).filter((v):v is number=>v!==null)

  return {
    ...base,
    asOf: new Date().toISOString(),
    totalVolume24hUsd: exactVolume.reduce((s,v)=>s+v,0),
    totalOpenInterestUsd: oi.reduce((s,v)=>s+v,0),
    liveInstruments: markets.length,
    liveVenues: venues.length,
    venues,
    markets,
    coverage: refreshedCoverage(base.coverage),
    errors,
  }
}

export type { MarketRow, VenueRow, CoverageRow, Snapshot }
