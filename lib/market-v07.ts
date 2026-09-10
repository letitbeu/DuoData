import {
  getSnapshot as getBaseSnapshot,
  type MarketRow,
  type VenueRow,
  type CoverageRow,
  type Snapshot,
} from './market-v06'

const nullableNum = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DuoData/0.7 (+https://github.com/letitbeu/DuoData)',
    },
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

async function mapLimit<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let cursor = 0

  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return out
}

async function enrichBinanceOpenInterest(markets: MarketRow[]): Promise<{ markets: MarketRow[]; success: number; failed: number }> {
  const targets = markets.filter(
    m => m.venue === 'Binance' && m.productLayer === 'TradFi Perps' && m.openInterestUsd === null,
  )

  if (!targets.length) return { markets, success: 0, failed: 0 }

  let markMap = new Map<string, number>()
  try {
    const premium = await getJson<any[]>('https://fapi.binance.com/fapi/v1/premiumIndex')
    if (Array.isArray(premium)) {
      markMap = new Map(
        premium
          .map((x: any) => [String(x.symbol), nullableNum(x.markPrice)] as const)
          .filter((x): x is readonly [string, number] => x[1] !== null),
      )
    }
  } catch {
    // Current venue last price remains a valid fallback for notional conversion.
  }

  const results = await mapLimit(targets, 16, async row => {
    try {
      const oi = await getJson<any>(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${encodeURIComponent(row.symbol)}`)
      const qty = nullableNum(oi?.openInterest)
      const mark = markMap.get(row.symbol) ?? row.lastPrice
      if (qty === null || qty < 0 || !Number.isFinite(mark) || mark <= 0) return null
      return { key: `${row.venue}|${row.symbol}|${row.product}`, value: qty * mark }
    } catch {
      return null
    }
  })

  const oiMap = new Map(results.filter((x): x is { key: string; value: number } => x !== null).map(x => [x.key, x.value]))
  const enriched = markets.map(row => {
    const key = `${row.venue}|${row.symbol}|${row.product}`
    const value = oiMap.get(key)
    return value === undefined ? row : { ...row, openInterestUsd: value }
  })

  return {
    markets: enriched,
    success: oiMap.size,
    failed: Math.max(0, targets.length - oiMap.size),
  }
}

function refreshCoverage(rows: CoverageRow[], success: number, failed: number): CoverageRow[] {
  return rows.map(row => {
    if (row.metric !== 'TradFi Perps open interest') return row
    return {
      ...row,
      status: failed === 0 && success > 0 ? 'LIVE' : row.status,
      source: 'Binance + Bybit + Bitget + OKX + Coinbase INTX public market APIs',
      note: `Binance current OI is fetched per TradFi contract from /fapi/v1/openInterest and converted to USD notional with Binance mark price. ${success} Binance contracts enriched${failed ? `; ${failed} requests unavailable on this refresh` : ''}.`,
    }
  })
}

export async function getSnapshot(): Promise<Snapshot> {
  const base = await getBaseSnapshot()
  const enriched = await enrichBinanceOpenInterest(base.markets)
  const markets = enriched.markets

  const totalOpenInterestUsd = markets.reduce((sum, row) => sum + (row.openInterestUsd ?? 0), 0)
  const errors = [...base.errors]
  if (enriched.failed > 0) {
    errors.push(`Binance OI: ${enriched.success} contracts loaded, ${enriched.failed} unavailable on this refresh`)
  }

  return {
    ...base,
    markets,
    totalOpenInterestUsd,
    coverage: refreshCoverage(base.coverage, enriched.success, enriched.failed),
    errors,
  }
}

export type { MarketRow, VenueRow, CoverageRow, Snapshot }
