import {
  getSnapshot as getBaseSnapshot,
  type MarketRow,
  type VenueRow,
  type CoverageRow,
  type Snapshot,
} from './market-v08'

const num = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, {
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(10_000),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DuoData/0.9 (+https://github.com/letitbeu/DuoData)',
    },
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

function stripMexcUnderlying(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/_(USDT|USDC|USD1|USD)$/, '')
    .replace(/(USDT|USDC|USD1|USD)$/, '')
    .replace(/STOCK$/, '')
}

function mexcAssetClass(contract: any): string {
  const zones = (Array.isArray(contract?.conceptPlate) ? contract.conceptPlate : [])
    .map((x: unknown) => String(x).toLowerCase())
  const sym = stripMexcUnderlying(contract?.baseCoin || contract?.symbol || '')

  if (zones.some((z: string) => z.includes('pre-ipo') || z.includes('private'))) return 'Pre-IPO / Private'
  if (zones.some((z: string) => z.includes('etf'))) return 'ETF'
  if (zones.some((z: string) => z.includes('commod') || z.includes('metal'))) return 'Commodity'
  if (zones.some((z: string) => z.includes('forex') || z.endsWith('-fx'))) return 'FX'
  if (zones.some((z: string) => z.includes('index') || z.includes('indices'))) return 'Equity Index'

  // Conservative canonical fallbacks when the generic TradFi zone does not expose a sub-class.
  if (['XAU','XAG','XAUT','PAXG','WTI','USOIL','UKOIL','BRENT','NG'].includes(sym)) return 'Commodity'
  if (['SPX','SP500','NDX','NAS100','DJI','DOW','VIX'].includes(sym)) return 'Equity Index'
  if (String(contract?.baseCoin || '').toUpperCase().endsWith('STOCK')) return 'Equity'

  return 'RWA (unclassified)'
}

function isMexcTradFi(contract: any): boolean {
  const zones = (Array.isArray(contract?.conceptPlate) ? contract.conceptPlate : [])
    .map((x: unknown) => String(x).toLowerCase())
  return String(contract?.typeLabel) === '2' || zones.some((z: string) => z.includes('tradfi'))
}

async function mexcMarkets(): Promise<MarketRow[]> {
  const base = 'https://api.mexc.com'
  const [detail, ticker] = await Promise.all([
    getJson<any>(`${base}/api/v1/contract/detail`),
    getJson<any>(`${base}/api/v1/contract/ticker`),
  ])

  if (detail?.success !== true || !Array.isArray(detail?.data)) {
    throw new Error('MEXC contract detail returned an invalid payload')
  }
  if (ticker?.success !== true) throw new Error('MEXC ticker returned an invalid payload')

  const tickerRows = Array.isArray(ticker.data) ? ticker.data : ticker.data ? [ticker.data] : []
  const tickerMap = new Map(tickerRows.map((x: any) => [String(x.symbol), x]))
  const rows: MarketRow[] = []

  for (const c of detail.data) {
    if (!isMexcTradFi(c)) continue
    if (Number(c.state ?? 0) !== 0) continue
    const t: any = tickerMap.get(String(c.symbol))
    if (!t) continue

    const last = num(t.lastPrice)
    if (last === null || last <= 0) continue

    const contractSize = num(c.contractSize)
    const holdVol = num(t.holdVol)
    const fair = num(t.fairPrice) ?? num(t.indexPrice) ?? last
    const oiUsd = contractSize !== null && holdVol !== null && fair > 0
      ? holdVol * contractSize * fair
      : null

    const cls = mexcAssetClass(c)
    rows.push({
      venue: 'MEXC',
      product: `${cls === 'RWA (unclassified)' ? 'TradFi' : cls} Perpetual`,
      symbol: String(c.symbol),
      underlying: stripMexcUnderlying(c.baseCoin || c.symbol),
      marketClass: cls,
      productLayer: 'TradFi Perps',
      assetClass: cls,
      lastPrice: last,
      volume24hUsd: num(t.amount24),
      openInterestUsd: oiUsd,
      fundingRate: num(t.fundingRate),
      change24h: num(t.riseFallRate),
      bid: num(t.bid1),
      ask: num(t.ask1),
    })
  }

  if (!rows.length) throw new Error('MEXC public metadata returned 0 TradFi-tagged contracts')
  return rows
}

function uniqueMarkets(rows: MarketRow[]) {
  const map = new Map<string, MarketRow>()
  for (const row of rows) map.set(`${row.venue}|${row.symbol}|${row.product}`, row)
  return [...map.values()]
}

function refreshCoverage(rows: CoverageRow[], mexcCount: number): CoverageRow[] {
  return rows.map(row => {
    if (row.metric === 'Product layer: TradFi Perps') {
      return {
        ...row,
        source: 'Binance + Bybit + Bitget + MEXC + OKX + Coinbase INTX + Kraken public market APIs',
        note: `${row.note} MEXC uses typeLabel=2 / TradFi conceptPlate detection and official ticker amount24; ${mexcCount} MEXC contracts loaded on this refresh.`,
      }
    }
    if (row.metric === '24h TradFi Perps volume by exchange' || row.metric === '24h TradFi / RWA trading volume') {
      return {
        ...row,
        source: 'Binance + Bybit + Bitget + MEXC + OKX + Coinbase INTX + Kraken public market APIs',
      }
    }
    return row
  })
}

export async function getSnapshot(): Promise<Snapshot> {
  const base = await getBaseSnapshot()
  let markets = [...base.markets]
  const errors = [...base.errors]
  let mexcCount = 0

  try {
    const mexc = await mexcMarkets()
    mexcCount = mexc.length
    markets.push(...mexc)
  } catch (e) {
    errors.push(`MEXC: ${e instanceof Error ? e.message : String(e)}`)
  }

  markets = uniqueMarkets(markets).sort((a,b)=>(b.volume24hUsd ?? -1)-(a.volume24hUsd ?? -1))

  return {
    ...base,
    markets,
    liveInstruments: markets.length,
    liveVenues: new Set(markets.map(x => x.venue)).size,
    totalVolume24hUsd: markets.reduce((s,x)=>s+(x.volume24hUsd ?? 0),0),
    totalOpenInterestUsd: markets.reduce((s,x)=>s+(x.openInterestUsd ?? 0),0),
    coverage: refreshCoverage(base.coverage, mexcCount),
    errors,
  }
}

export type { MarketRow, VenueRow, CoverageRow, Snapshot }
