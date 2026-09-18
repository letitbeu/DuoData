import {
  getSnapshot as getBaseSnapshot,
  type MarketRow,
  type VenueRow,
  type CoverageRow,
  type Snapshot,
} from './market-v07'

const num = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(8_000),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DuoData/0.8 (+https://github.com/letitbeu/DuoData)',
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
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker()))
  return out
}

type OkxVolumeResult = { key: string; volume: number } | null

async function okxRolling24hQuoteVolume(row: MarketRow): Promise<OkxVolumeResult> {
  const res = await getJson<any>(
    `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(row.symbol)}&bar=5m&limit=300`,
  )
  if (res?.code !== '0' || !Array.isArray(res?.data)) throw new Error(res?.msg || 'invalid OKX candle response')

  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  let total = 0
  let bars = 0

  for (const c of res.data) {
    const ts = num(c?.[0])
    const quoteTurnover = num(c?.[7])
    if (ts === null || quoteTurnover === null || ts < cutoff) continue
    total += quoteTurnover
    bars++
  }

  // 5m candles should provide ~288 observations in a full rolling day.
  // A lower threshold prevents a partial/API-truncated series from being presented as a full 24h value.
  if (bars < 270 || total < 0) return null

  return {
    key: `${row.venue}|${row.symbol}|${row.product}`,
    volume: total,
  }
}

async function enrichOkxVolume(markets: MarketRow[]) {
  const targets = markets.filter(
    m => m.venue === 'OKX' && m.productLayer === 'TradFi Perps' && m.volume24hUsd === null,
  )
  if (!targets.length) return { markets, success: 0, failed: 0 }

  const results = await mapLimit(targets, 10, async row => {
    try { return await okxRolling24hQuoteVolume(row) }
    catch { return null }
  })

  const volumeMap = new Map(
    results
      .filter((x): x is Exclude<OkxVolumeResult, null> => x !== null)
      .map(x => [x.key, x.volume]),
  )

  return {
    markets: markets.map(row => {
      const v = volumeMap.get(`${row.venue}|${row.symbol}|${row.product}`)
      return v === undefined ? row : { ...row, volume24hUsd: v }
    }),
    success: volumeMap.size,
    failed: Math.max(0, targets.length - volumeMap.size),
  }
}

function refreshCoverage(rows: CoverageRow[], okxSuccess: number, okxFailed: number): CoverageRow[] {
  return rows.map(row => {
    if (row.metric === '24h TradFi Perps volume by exchange' || row.metric === '24h TradFi / RWA trading volume') {
      return {
        ...row,
        source: 'Binance + Bybit + Bitget + OKX + Coinbase INTX + Kraken public market APIs',
        note: `Direct venue quote/notional turnover is used where published. OKX is reconstructed from official 5-minute candle volCcyQuote over the rolling 24h window; ${okxSuccess} contracts loaded${okxFailed ? `, ${okxFailed} unavailable on this refresh` : ''}. No base-volume × current-price estimate is used.`,
      }
    }
    return row
  })
}

export async function getSnapshot(): Promise<Snapshot> {
  const base = await getBaseSnapshot()
  const okx = await enrichOkxVolume(base.markets)
  const markets = okx.markets

  const errors = [...base.errors]
  if (okx.failed > 0) errors.push(`OKX 24H volume: ${okx.success} contracts reconstructed, ${okx.failed} unavailable`)

  return {
    ...base,
    markets,
    totalVolume24hUsd: markets.reduce((s, row) => s + (row.volume24hUsd ?? 0), 0),
    coverage: refreshCoverage(base.coverage, okx.success, okx.failed),
    errors,
  }
}

export type { MarketRow, VenueRow, CoverageRow, Snapshot }
