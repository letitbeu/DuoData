import {
  getSnapshot as getBaseSnapshot,
  type MarketRow,
  type VenueRow,
  type CoverageRow,
  type Snapshot,
} from './market-v10'

const BAD_CLASSES = new Set(['RWA (unclassified)', 'Unclassified', 'TradFi', ''])

function canonicalUnderlying(raw: string) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/(USDT|USDC|USD1|USD)$/, '')
    .replace(/STOCK$/, '')
}

const SAFE_CLASS: Record<string, string> = {
  XAU: 'Commodity', XAG: 'Commodity', WTI: 'Commodity', CL: 'Commodity',
  USOIL: 'Commodity', UKOIL: 'Commodity', BRENT: 'Commodity', NG: 'Commodity',
  SPX: 'Equity Index', SP500: 'Equity Index', NDX: 'Equity Index',
  NAS100: 'Equity Index', DJI: 'Equity Index', DOW: 'Equity Index', VIX: 'Equity Index',
  QQQ: 'ETF', SPY: 'ETF', GLD: 'ETF', SLV: 'ETF', IWM: 'ETF', VTI: 'ETF', TLT: 'ETF',
}

function buildCanonicalClassMap(markets: MarketRow[]) {
  const votes = new Map<string, Map<string, Set<string>>>()

  for (const row of markets) {
    if (row.venue === 'Bitget') continue
    const cls = row.assetClass || row.marketClass
    if (!cls || BAD_CLASSES.has(cls)) continue
    const key = canonicalUnderlying(row.underlying)
    if (!key) continue

    if (!votes.has(key)) votes.set(key, new Map())
    const byClass = votes.get(key)!
    if (!byClass.has(cls)) byClass.set(cls, new Set())
    byClass.get(cls)!.add(row.venue)
  }

  const canonical = new Map<string, { cls: string; venues: number }>()
  for (const [key, byClass] of votes) {
    const ordered = [...byClass.entries()].sort((a,b)=>b[1].size-a[1].size)
    if (!ordered.length) continue
    const [winner, winnerVenues] = ordered[0]
    const runnerUp = ordered[1]?.[1].size ?? 0

    // Accept a unanimous single-source mapping or a strictly dominant multi-venue mapping.
    if (ordered.length === 1 || winnerVenues.size >= 2 && winnerVenues.size > runnerUp) {
      canonical.set(key, { cls: winner, venues: winnerVenues.size })
    }
  }

  for (const [key, cls] of Object.entries(SAFE_CLASS)) {
    if (!canonical.has(key)) canonical.set(key, { cls, venues: 0 })
  }
  return canonical
}

function cleanBitgetClassification(markets: MarketRow[]) {
  const canonical = buildCanonicalClassMap(markets)
  let resolved = 0
  let remaining = 0

  const cleaned = markets.map(row => {
    if (row.venue !== 'Bitget' || row.productLayer !== 'TradFi Perps') return row
    if (row.assetClass && !BAD_CLASSES.has(row.assetClass)) return row

    const key = canonicalUnderlying(row.underlying)
    const hit = canonical.get(key)
    if (!hit) {
      remaining++
      return row
    }

    resolved++
    return {
      ...row,
      marketClass: hit.cls,
      assetClass: hit.cls,
      product: `${hit.cls} Perpetual`,
    }
  })

  return { cleaned, resolved, remaining }
}

function refreshCoverage(rows: CoverageRow[], resolved: number, remaining: number): CoverageRow[] {
  return rows.map(row => {
    if (row.metric === 'TradFi Perps volume by asset class') {
      return {
        ...row,
        note: `Asset class is normalized from venue-native metadata first. Bitget isRwa contracts without a native subclass are reconciled against the cross-venue canonical instrument master; ${resolved} resolved and ${remaining} remain unclassified on this refresh. Conflicts are never force-assigned.`,
        source: 'Venue-native metadata + DuoData cross-venue canonical instrument master',
      }
    }
    return row
  })
}

export async function getSnapshot(): Promise<Snapshot> {
  const base = await getBaseSnapshot()
  const result = cleanBitgetClassification(base.markets)
  const markets = result.cleaned

  return {
    ...base,
    markets,
    coverage: refreshCoverage(base.coverage, result.resolved, result.remaining),
  }
}

export type { MarketRow, VenueRow, CoverageRow, Snapshot }
