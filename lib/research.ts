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
    fundingVenues: string[]
    fundingSeries: number
    errors: string[]
  }
}

type Candle = { t: number; close: number; turnover: number }
type HistSeries = { venue: string; underlying: string; symbol: string; candles: Candle[] }

const YEAR_START = Date.UTC(2026, 0, 1)
const NOW = Date.now()
const CORE = ['XAU', 'XAG', 'WTI', 'NVDA', 'TSLA', 'AAPL', 'META', 'AMZN', 'GOOGL', 'QQQ', 'SPY', 'SPX'] as const
const HIST_VENUES = new Set(['Binance', 'Bybit', 'Bitget'])
const FUNDING_VENUES = new Set(['Binance', 'Bybit', 'Bitget', 'OKX'])

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
    headers: { Accept: 'application/json', 'User-Agent': 'DuoData-Research/0.2' },
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
  // Fixed underlying basket: selection must not depend on TODAY's volume, OI or return.
  // Deterministic symbol ordering is used only to de-duplicate equivalent venue/core contracts.
  const candidates = markets
    .filter(m => m.productLayer === 'TradFi Perps' && HIST_VENUES.has(m.venue))
    .map(m => ({ row: m, core: coreUnderlying(m) }))
    .filter((x): x is { row: MarketRow; core: string } => Boolean(x.core))
    .sort((a, b) =>
      `${a.row.venue}|${a.core}|${a.row.symbol}`.localeCompare(
        `${b.row.venue}|${b.core}|${b.row.symbol}`,
      ),
    )

  const chosen = new Map<string, { row: MarketRow; core: string }>()
  for (const x of candidates) {
    const key = `${x.row.venue}|${x.core}`
    if (!chosen.has(key)) chosen.set(key, x)
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
  // First compute venue-level momentum, then collapse venues inside each underlying.
  // This prevents an underlying listed on 3 venues from receiving 3x the weight.
  const byDateUnderlying = new Map<string, number[]>()

  for (const s of series) {
    const vols = s.candles.map(c => c.turnover)
    s.candles.forEach((c, i) => {
      const m7 = rollingMean(vols, i, 7)
      const m30 = rollingMean(vols, i, 30)
      if (m7 === null || m30 === null || m30 <= 0) return
      const mom = (m7 / m30 - 1) * 100
      const key = `${c.t}|${s.underlying}`
      if (!byDateUnderlying.has(key)) byDateUnderlying.set(key, [])
      byDateUnderlying.get(key)!.push(mom)
    })
  }

  const daily = new Map<number, number[]>()
  for (const [key, venueMoms] of byDateUnderlying) {
    const underlyingMom = median(venueMoms)
    if (underlyingMom === null) continue
    const t = Number(key.split('|')[0])
    if (!daily.has(t)) daily.set(t, [])
    daily.get(t)!.push(underlyingMom)
  }

  const activityMomentum: ResearchPoint[] = []
  const participationBreadth: ResearchPoint[] = []
  for (const [t, underlyingMoms] of [...daily].sort((a,b)=>a[0]-b[0])) {
    const v = median(underlyingMoms)
    if (v !== null) activityMomentum.push({ t, value: v })
    if (underlyingMoms.length) {
      participationBreadth.push({
        t,
        value: underlyingMoms.filter(x => x > 0).length / underlyingMoms.length * 100,
      })
    }
  }

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

type FundingObs={t:number;rate:number}

async function binanceFunding(symbol:string):Promise<FundingObs[]>{
  const out:FundingObs[]=[]
  let start=YEAR_START
  for(let page=0;page<3&&start<=NOW;page++){
    const url=`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&startTime=${start}&endTime=${NOW}&limit=1000`
    const rows=await cachedJson<any[]>(url)
    if(!Array.isArray(rows)||!rows.length)break
    for(const r of rows){
      const t=n(r?.fundingTime),rate=n(r?.fundingRate)
      if(t!==null&&rate!==null&&t>=YEAR_START)out.push({t,rate})
    }
    const last=n(rows[rows.length-1]?.fundingTime)
    if(last===null||rows.length<1000)break
    start=last+1
  }
  return out.sort((a,b)=>a.t-b.t)
}

async function bybitFunding(symbol:string):Promise<FundingObs[]>{
  const out:FundingObs[]=[]
  let end=NOW
  for(let page=0;page<8;page++){
    const q=`/v5/market/funding/history?category=linear&symbol=${encodeURIComponent(symbol)}&endTime=${end}&limit=200`
    const res=await bybitJson<any>(q)
    if(res?.retCode!==0)throw new Error(`Bybit funding ${symbol}: ${res?.retMsg||'API error'}`)
    const rows=Array.isArray(res?.result?.list)?res.result.list:[]
    if(!rows.length)break
    let oldest=Infinity
    for(const r of rows){
      const t=n(r?.fundingRateTimestamp),rate=n(r?.fundingRate)
      if(t!==null){oldest=Math.min(oldest,t);if(rate!==null&&t>=YEAR_START)out.push({t,rate})}
    }
    if(!Number.isFinite(oldest)||oldest<=YEAR_START||rows.length<200)break
    end=oldest-1
  }
  return out.sort((a,b)=>a.t-b.t)
}

async function bitgetFunding(symbol:string):Promise<FundingObs[]>{
  const out:FundingObs[]=[]
  for(let page=1;page<=10;page++){
    const url=`https://api.bitget.com/api/v2/mix/market/history-fund-rate?symbol=${encodeURIComponent(symbol)}&productType=USDT-FUTURES&pageSize=100&pageNo=${page}`
    const res=await cachedJson<any>(url)
    if(res?.code&&res.code!=='00000')throw new Error(`Bitget funding ${symbol}: ${res?.msg||res.code}`)
    const rows=Array.isArray(res?.data)?res.data:[]
    if(!rows.length)break
    let oldest=Infinity
    for(const r of rows){
      const t=n(r?.fundingTime),rate=n(r?.fundingRate)
      if(t!==null){oldest=Math.min(oldest,t);if(rate!==null&&t>=YEAR_START)out.push({t,rate})}
    }
    if(oldest<=YEAR_START||rows.length<100)break
  }
  return out.sort((a,b)=>a.t-b.t)
}

async function okxFunding(symbol:string):Promise<FundingObs[]>{
  const out:FundingObs[]=[]
  let after:string|undefined
  for(let page=0;page<4;page++){
    const qs=new URLSearchParams({instId:symbol,limit:'400'})
    if(after)qs.set('after',after)
    const res=await cachedJson<any>(`https://www.okx.com/api/v5/public/funding-rate-history?${qs.toString()}`)
    if(res?.code!=='0')throw new Error(`OKX funding ${symbol}: ${res?.msg||res?.code||'API error'}`)
    const rows=Array.isArray(res?.data)?res.data:[]
    if(!rows.length)break
    let oldest=Infinity
    for(const r of rows){
      const t=n(r?.fundingTime),rate=n(r?.realizedRate??r?.fundingRate)
      if(t!==null){oldest=Math.min(oldest,t);if(rate!==null&&t>=YEAR_START)out.push({t,rate})}
    }
    if(!Number.isFinite(oldest)||oldest<=YEAR_START||rows.length<400)break
    after=String(oldest)
  }
  return out.sort((a,b)=>a.t-b.t)
}

async function fetchFunding(venue:string,symbol:string):Promise<FundingObs[]>{
  if(venue==='Binance')return binanceFunding(symbol)
  if(venue==='Bybit')return bybitFunding(symbol)
  if(venue==='Bitget')return bitgetFunding(symbol)
  if(venue==='OKX')return okxFunding(symbol)
  return []
}

function normalizeFunding8h(xs:FundingObs[]){
  if(!xs.length)return []
  const sorted=[...xs].sort((a,b)=>a.t-b.t)
  return sorted.map((x,i)=>{
    const prev=i>0?sorted[i-1]:null
    const next=i+1<sorted.length?sorted[i+1]:null
    let hours=8
    const gapPrev=prev?(x.t-prev.t)/3600000:null
    const gapNext=next?(next.t-x.t)/3600000:null
    const gap=gapPrev&&gapPrev>0&&gapPrev<=24?gapPrev:gapNext&&gapNext>0&&gapNext<=24?gapNext:null
    if(gap)hours=gap
    return {t:x.t,rate8h:x.rate*(8/hours)}
  })
}

async function fundingStress(
  selected:Array<{row:MarketRow;core:string}>,
  errors:string[],
):Promise<{series:ResearchPoint[];venues:string[];fundingSeries:number}>{
  const universe=selected.filter(x=>FUNDING_VENUES.has(x.row.venue))
  const settled=await Promise.allSettled(universe.map(async x=>({
    venue:x.row.venue,
    core:x.core,
    symbol:x.row.symbol,
    data:normalizeFunding8h(await fetchFunding(x.row.venue,x.row.symbol)),
  })))

  const dailyUnderlying=new Map<string,number[]>()
  const liveVenues=new Set<string>()
  let fundingSeries=0

  settled.forEach((r,i)=>{
    if(r.status==='rejected'){
      errors.push(`Funding ${universe[i]?.row.venue} ${universe[i]?.row.symbol}: ${r.reason instanceof Error?r.reason.message:String(r.reason)}`)
      return
    }
    if(!r.value.data.length)return
    liveVenues.add(r.value.venue)
    fundingSeries++
    for(const x of r.value.data){
      const key=`${day(x.t)}|${r.value.core}`
      if(!dailyUnderlying.has(key))dailyUnderlying.set(key,[])
      dailyUnderlying.get(key)!.push(Math.abs(x.rate8h))
    }
  })

  const daily=new Map<number,number[]>()
  for(const [key,venueRates] of dailyUnderlying){
    const v=median(venueRates)
    if(v===null)continue
    const t=Number(key.split('|')[0])
    if(!daily.has(t))daily.set(t,[])
    daily.get(t)!.push(v)
  }

  const raw=[...daily].sort((a,b)=>a[0]-b[0]).flatMap(([t,xs])=>{
    const v=median(xs)
    return v===null?[]:[{t,raw:v}]
  })
  const series:ResearchPoint[]=[]
  raw.forEach((x,i)=>{
    const window=raw.slice(Math.max(0,i-59),i+1).map(y=>y.raw)
    if(window.length<20)return
    const rank=window.filter(v=>v<=x.raw).length/window.length*100
    series.push({t:x.t,value:rank})
  })
  return {series,venues:[...liveVenues],fundingSeries}
}

export async function getResearchSeries(markets: MarketRow[]): Promise<ResearchSeries> {
  const selected = selectSeries(markets)
  const fundingSelected = markets
    .filter(m=>m.productLayer==='TradFi Perps'&&FUNDING_VENUES.has(m.venue))
    .map(m=>({row:m,core:coreUnderlying(m)}))
    .filter((x):x is {row:MarketRow;core:string}=>Boolean(x.core))
    .sort((a,b)=>`${a.row.venue}|${a.core}|${a.row.symbol}`.localeCompare(`${b.row.venue}|${b.core}|${b.row.symbol}`))
  const fundingChosen=new Map<string,{row:MarketRow;core:string}>()
  for(const x of fundingSelected){const key=`${x.row.venue}|${x.core}`;if(!fundingChosen.has(key))fundingChosen.set(key,x)}
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
  const fundingResult = await fundingStress([...fundingChosen.values()], errors)

  return {
    activityMomentum,
    participationBreadth,
    priceDispersion,
    fundingStress: fundingResult.series,
    meta: {
      venues: [...new Set(series.map(s => s.venue))],
      underlyings: [...new Set(series.map(s => s.underlying))],
      candleSeries: series.length,
      fundingVenues: fundingResult.venues,
      fundingSeries: fundingResult.fundingSeries,
      errors,
    },
  }
}
