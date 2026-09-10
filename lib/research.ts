import type { MarketRow } from './market'

export type ResearchPoint = { t: number; value: number }
export type ResearchSeries = {
  activityMomentum: ResearchPoint[]
  participationBreadth: ResearchPoint[]
  priceDispersion: ResearchPoint[]
  fundingStress: ResearchPoint[]
  meta: {
    venues: string[]
    underlyings: string[]
    candleSeries: number
    errors: string[]
  }
}

type Candle = { t: number; close: number; turnover: number }
type HistSeries = { venue: string; underlying: string; symbol: string; candles: Candle[] }

const YEAR_START = Date.UTC(2026, 0, 1)
const NOW = Date.now()
const CORE = ['XAU', 'XAG', 'WTI', 'NVDA', 'TSLA', 'AAPL', 'META', 'AMZN', 'GOOGL', 'QQQ', 'SPY', 'SPX'] as const
const HIST_VENUES = new Set(['Binance', 'Bybit', 'Bitget'])

const n = (v: unknown): number | null => {
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null
  const a = [...xs].sort((x, y) => x - y)
  const i = Math.floor(a.length / 2)
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2
}

const day = (t: number) => Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate())

async function cachedJson<T>(url: string): Promise<T> {
  const r = await fetch(url, {
    next: { revalidate: 21600 },
    signal: AbortSignal.timeout(8_000),
    headers: { Accept: 'application/json', 'User-Agent': 'DuoData-Research/0.1' },
  })
  if (!r.ok) throw new Error(`${new URL(url).hostname}: ${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

async function bybitJson<T>(path: string): Promise<T> {
  const errors: string[] = []
  for (const base of ['https://api.bybit.com', 'https://api.bytick.com']) {
    try { return await cachedJson<T>(`${base}${path}`) }
    catch (e) { errors.push(e instanceof Error ? e.message : String(e)) }
  }
  throw new Error(errors.join(' / '))
}

function coreUnderlying(row: MarketRow): string | null {
  const u = String(row.underlying || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const s = String(row.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const exact = (k: string) => u === k || s === k || s.startsWith(`${k}USDT`) || s.startsWith(`${k}USD`)

  if (u === 'GOLD' || exact('XAU')) return 'XAU'
  if (u === 'SILVER' || exact('XAG')) return 'XAG'
  if (u === 'WTI' || u === 'CL' || u === 'OIL' || /^CL(?:USDT|USD)/.test(s) || /^WTI(?:USDT|USD)/.test(s)) return 'WTI'
  for (const k of ['NVDA','TSLA','AAPL','META','AMZN','GOOGL','QQQ','SPY','SPX']) {
    if (exact(k)) return k
  }
  return null
}

function selectSeries(markets: MarketRow[]) {
  const candidates = markets
    .filter(m => m.productLayer === 'TradFi Perps' && HIST_VENUES.has(m.venue))
    .map(m => ({ row: m, core: coreUnderlying(m) }))
    .filter((x): x is { row: MarketRow; core: string } => Boolean(x.core))
    .sort((a, b) => (b.row.volume24hUsd ?? -1) - (a.row.volume24hUsd ?? -1))

  const chosen = new Map<string, { row: MarketRow; core: string }>()
  const venueCounts = new Map<string, number>()
  for (const x of candidates) {
    const key = `${x.row.venue}|${x.core}`
    if (chosen.has(key)) continue
    const count = venueCounts.get(x.row.venue) || 0
    if (count >= 10) continue
    chosen.set(key, x)
    venueCounts.set(x.row.venue, count + 1)
  }
  return [...chosen.values()]
}

async function binanceCandles(symbol: string): Promise<Candle[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=1d&startTime=${YEAR_START}&endTime=${NOW}&limit=1000`
  const rows = await cachedJson<any[]>(url)
  if (!Array.isArray(rows)) throw new Error(`Binance ${symbol}: invalid kline response`)
  return rows.flatMap(r => {
    const t = n(r?.[0]), close = n(r?.[4]), turnover = n(r?.[7])
    return t !== null && close !== null && turnover !== null ? [{ t: day(t), close, turnover }] : []
  })
}

async function bybitCandles(symbol: string): Promise<Candle[]> {
  const q = `/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=D&start=${YEAR_START}&end=${NOW}&limit=1000`
  const res = await bybitJson<any>(q)
  if (res?.retCode !== 0) throw new Error(`Bybit ${symbol}: ${res?.retMsg || 'API error'}`)
  return (res?.result?.list || []).flatMap((r: any[]) => {
    const t = n(r?.[0]), close = n(r?.[4]), turnover = n(r?.[6])
    return t !== null && close !== null && turnover !== null ? [{ t: day(t), close, turnover }] : []
  }).sort((a: Candle, b: Candle) => a.t - b.t)
}

async function bitgetCandles(symbol: string): Promise<Candle[]> {
  const split = Math.max(YEAR_START, NOW - 89 * 86400000)
  const olderUrl = `https://api.bitget.com/api/v3/market/history-candles?category=USDT-FUTURES&symbol=${encodeURIComponent(symbol)}&interval=1D&startTime=${YEAR_START}&endTime=${split}&limit=1000`
  const recentUrl = `https://api.bitget.com/api/v3/market/candles?category=USDT-FUTURES&symbol=${encodeURIComponent(symbol)}&interval=1D&startTime=${split}&endTime=${NOW}&limit=1000`
  const [older, recent] = await Promise.allSettled([cachedJson<any>(olderUrl), cachedJson<any>(recentUrl)])
  const payloads = [older, recent].flatMap(x => x.status === 'fulfilled' ? [x.value] : [])
  if (!payloads.length) throw new Error(`Bitget ${symbol}: historical candle endpoints failed`)
  const map = new Map<number, Candle>()
  for (const res of payloads) {
    if (res?.code && res.code !== '00000') continue
    for (const r of res?.data || []) {
      const t = n(r?.[0]), close = n(r?.[4]), turnover = n(r?.[6])
      if (t !== null && close !== null && turnover !== null) map.set(day(t), { t: day(t), close, turnover })
    }
  }
  return [...map.values()].sort((a, b) => a.t - b.t)
}

async function fetchCandles(venue: string, symbol: string): Promise<Candle[]> {
  if (venue === 'Binance') return binanceCandles(symbol)
  if (venue === 'Bybit') return bybitCandles(symbol)
  if (venue === 'Bitget') return bitgetCandles(symbol)
  return []
}

function rollingMean(xs: number[], end: number, window: number) {
  if (end + 1 < window) return null
  const a = xs.slice(end + 1 - window, end + 1)
  if (a.some(v => !Number.isFinite(v))) return null
  return a.reduce((s, v) => s + v, 0) / window
}

function activityAndBreadth(series: HistSeries[]) {
  const momentum = new Map<number, number[]>()
  const breadth = new Map<number, number[]>()

  for (const s of series) {
    const vols = s.candles.map(c => c.turnover)
    s.candles.forEach((c, i) => {
      const m7 = rollingMean(vols, i, 7)
      const m30 = rollingMean(vols, i, 30)
      if (m7 === null || m30 === null || m30 <= 0) return
      const mom = (m7 / m30 - 1) * 100
      if (!momentum.has(c.t)) momentum.set(c.t, [])
      if (!breadth.has(c.t)) breadth.set(c.t, [])
      momentum.get(c.t)!.push(mom)
      breadth.get(c.t)!.push(m7 > m30 ? 1 : 0)
    })
  }

  const activityMomentum = [...momentum].sort((a,b)=>a[0]-b[0]).flatMap(([t, xs]) => {
    const v = median(xs)
    return v === null ? [] : [{ t, value: v }]
  })
  const participationBreadth = [...breadth].sort((a,b)=>a[0]-b[0]).flatMap(([t, xs]) =>
    xs.length ? [{ t, value: xs.reduce((s,v)=>s+v,0) / xs.length * 100 }] : []
  )
  return { activityMomentum, participationBreadth }
}

function dispersion(series: HistSeries[]): ResearchPoint[] {
  const byDateUnderlying = new Map<string, number[]>()
  for (const s of series) {
    for (const c of s.candles) {
      const key = `${c.t}|${s.underlying}`
      if (!byDateUnderlying.has(key)) byDateUnderlying.set(key, [])
      byDateUnderlying.get(key)!.push(c.close)
    }
  }

  const daily = new Map<number, number[]>()
  for (const [key, prices] of byDateUnderlying) {
    if (prices.length < 2) continue
    const clean = prices.filter(p => p > 0)
    if (clean.length < 2) continue
    const min = Math.min(...clean), max = Math.max(...clean)
    if (max / min > 1.25) continue // protects against contract unit mismatches
    const mid = median(clean)
    if (mid === null || mid <= 0) continue
    const d = clean.reduce((s,p)=>s + Math.abs(p / mid - 1) * 10000, 0) / clean.length
    const t = Number(key.split('|')[0])
    if (!daily.has(t)) daily.set(t, [])
    daily.get(t)!.push(d)
  }

  return [...daily].sort((a,b)=>a[0]-b[0]).flatMap(([t, xs]) => {
    const v = median(xs)
    return v === null ? [] : [{ t, value: v }]
  })
}

async function binanceFunding(symbol: string): Promise<Array<{t:number; rate:number}>> {
  const out: Array<{t:number; rate:number}> = []
  let start = YEAR_START
  for (let page = 0; page < 3 && start <= NOW; page++) {
    const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&startTime=${start}&endTime=${NOW}&limit=1000`
    const rows = await cachedJson<any[]>(url)
    if (!Array.isArray(rows) || !rows.length) break
    for (const r of rows) {
      const t = n(r?.fundingTime), rate = n(r?.fundingRate)
      if (t !== null && rate !== null) out.push({ t, rate })
    }
    const last = n(rows[rows.length - 1]?.fundingTime)
    if (last === null || rows.length < 1000) break
    start = last + 1
  }
  return out
}

async function fundingStress(selected: Array<{row: MarketRow; core: string}>, errors: string[]): Promise<ResearchPoint[]> {
  const binance = selected.filter(x => x.row.venue === 'Binance').slice(0, 10)
  const settled = await Promise.allSettled(binance.map(x => binanceFunding(x.row.symbol)))
  const daily = new Map<number, number[]>()
  settled.forEach((r, i) => {
    if (r.status === 'rejected') {
      errors.push(`Funding ${binance[i]?.row.symbol}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
      return
    }
    for (const x of r.value) {
      const t = day(x.t)
      if (!daily.has(t)) daily.set(t, [])
      daily.get(t)!.push(Math.abs(x.rate))
    }
  })
  const raw = [...daily].sort((a,b)=>a[0]-b[0]).flatMap(([t, xs]) => {
    const v = median(xs)
    return v === null ? [] : [{t, raw:v}]
  })
  const out: ResearchPoint[] = []
  raw.forEach((x, i) => {
    const window = raw.slice(Math.max(0, i - 59), i + 1).map(y => y.raw)
    if (window.length < 20) return
    const rank = window.filter(v => v <= x.raw).length / window.length * 100
    out.push({ t: x.t, value: rank })
  })
  return out
}

export async function getResearchSeries(markets: MarketRow[]): Promise<ResearchSeries> {
  const selected = selectSeries(markets)
  const errors: string[] = []
  const settled = await Promise.allSettled(selected.map(async x => ({
    venue: x.row.venue,
    underlying: x.core,
    symbol: x.row.symbol,
    candles: await fetchCandles(x.row.venue, x.row.symbol),
  })))

  const series: HistSeries[] = []
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.candles.length) series.push(r.value)
    else if (r.status === 'rejected') errors.push(`${selected[i]?.row.venue} ${selected[i]?.row.symbol}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
  })

  const { activityMomentum, participationBreadth } = activityAndBreadth(series)
  const priceDispersion = dispersion(series)
  const fundingStressSeries = await fundingStress(selected, errors)

  return {
    activityMomentum,
    participationBreadth,
    priceDispersion,
    fundingStress: fundingStressSeries,
    meta: {
      venues: [...new Set(series.map(s => s.venue))],
      underlyings: [...new Set(series.map(s => s.underlying))],
      candleSeries: series.length,
      errors,
    },
  }
}
