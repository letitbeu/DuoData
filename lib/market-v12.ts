import {
  getSnapshot as getBaseSnapshot,
  type MarketRow,
  type VenueRow,
  type CoverageRow,
  type Snapshot,
} from './market-v11'

const n=(v:unknown):number|null=>{
  if(v===''||v===null||v===undefined)return null
  const x=Number(v)
  return Number.isFinite(x)?x:null
}
async function json<T>(url:string):Promise<T>{
  const r=await fetch(url,{next:{revalidate:60},signal:AbortSignal.timeout(10_000),headers:{Accept:'application/json','User-Agent':'DuoData/1.2'}})
  if(!r.ok)throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

const BAD=new Set(['RWA (unclassified)','Unclassified','TradFi',''])
function bare(raw:string){
  let x=String(raw||'').toUpperCase().trim()
  x=x.replace(/[-_](USDT|USDC|USD1|USD)$/,'').replace(/(USDT|USDC|USD1|USD)$/,'')
  if(x.endsWith('STOCK'))x=x.slice(0,-5)
  if(/^[A-Z0-9]{4,}X$/.test(x))x=x.slice(0,-1)
  return x
}

function canonical(markets:MarketRow[]){
  const votes=new Map<string,Map<string,Set<string>>>()
  for(const m of markets){
    if(m.productLayer!=='TradFi Perps'||m.venue==='Gate')continue
    const cls=m.assetClass||m.marketClass
    if(!cls||BAD.has(cls))continue
    const key=bare(m.underlying)
    if(!key)continue
    if(!votes.has(key))votes.set(key,new Map())
    const v=votes.get(key)!
    if(!v.has(cls))v.set(cls,new Set())
    v.get(cls)!.add(m.venue)
  }
  const out=new Map<string,string>()
  for(const [key,byClass] of votes){
    const ranked=[...byClass.entries()].sort((a,b)=>b[1].size-a[1].size)
    if(!ranked.length)continue
    const [cls,venues]=ranked[0]
    const runner=ranked[1]?.[1].size??0
    if(ranked.length===1||(venues.size>=2&&venues.size>runner))out.set(key,cls)
  }
  return out
}

async function gateMarkets(baseMarkets:MarketRow[]):Promise<MarketRow[]>{
  const master=canonical(baseMarkets)
  if(!master.size)throw new Error('canonical TradFi universe is empty')

  const [contracts,tickers]=await Promise.all([
    json<any[]>('https://api.gateio.ws/api/v4/futures/usdt/contracts'),
    json<any[]>('https://api.gateio.ws/api/v4/futures/usdt/tickers'),
  ])
  if(!Array.isArray(contracts)||!Array.isArray(tickers))throw new Error('invalid Gate futures payload')

  const tickerMap=new Map(tickers.map((x:any)=>[String(x.contract),x]))
  const rows:MarketRow[]=[]

  for(const c of contracts){
    if(c?.in_delisting===true)continue
    const symbol=String(c?.name||'')
    const underlying=bare(symbol)
    const cls=master.get(underlying)
    if(!cls)continue

    const t:any=tickerMap.get(symbol)
    if(!t)continue
    const last=n(t.last)??n(c.last_price)
    if(last===null||last<=0)continue
    const mark=n(t.mark_price)??n(c.mark_price)??last
    const totalSize=n(t.total_size)
    const multiplier=n(c.quanto_multiplier)
    const oiUsd=totalSize!==null&&multiplier!==null&&mark>0
      ? Math.abs(totalSize)*multiplier*mark
      : null
    const ch=n(t.change_percentage)

    rows.push({
      venue:'Gate',
      product:`${cls} Perpetual`,
      symbol,
      underlying,
      marketClass:cls,
      productLayer:'TradFi Perps',
      assetClass:cls,
      lastPrice:last,
      volume24hUsd:n(t.volume_24h_quote)??n(t.volume_24h_settle),
      openInterestUsd:oiUsd,
      fundingRate:n(t.funding_rate),
      change24h:ch===null?null:ch/100,
      bid:n(t.highest_bid),
      ask:n(t.lowest_ask),
    })
  }
  if(!rows.length)throw new Error('0 Gate contracts matched conservative canonical TradFi universe')
  return rows
}

function unique(rows:MarketRow[]){
  const m=new Map<string,MarketRow>()
  for(const r of rows)m.set(`${r.venue}|${r.symbol}|${r.product}`,r)
  return [...m.values()]
}
function cover(rows:CoverageRow[],count:number):CoverageRow[]{
  return rows.map(r=>{
    if(r.metric==='Product layer: TradFi Perps')return{
      ...r,
      source:'Binance + Bybit + Bitget + MEXC + Gate + OKX + Coinbase INTX + Kraken public market APIs',
      note:`${r.note} Gate uses exact public quote turnover and a conservative cross-venue canonical-underlying match; ${count} Gate contracts matched on this refresh.`,
    }
    if(r.metric==='24h TradFi Perps volume by exchange'||r.metric==='24h TradFi / RWA trading volume')return{
      ...r,source:'Binance + Bybit + Bitget + MEXC + Gate + OKX + Coinbase INTX + Kraken public market APIs',
    }
    return r
  })
}

export async function getSnapshot():Promise<Snapshot>{
  const base=await getBaseSnapshot()
  let markets=[...base.markets]
  const errors=[...base.errors]
  let count=0
  try{
    const gate=await gateMarkets(markets)
    count=gate.length
    markets.push(...gate)
  }catch(e){
    errors.push(`Gate: ${e instanceof Error?e.message:String(e)}`)
  }
  markets=unique(markets).sort((a,b)=>(b.volume24hUsd??-1)-(a.volume24hUsd??-1))
  return{
    ...base,
    markets,
    liveInstruments:markets.length,
    liveVenues:new Set(markets.map(m=>m.venue)).size,
    totalVolume24hUsd:markets.reduce((s,m)=>s+(m.volume24hUsd??0),0),
    totalOpenInterestUsd:markets.reduce((s,m)=>s+(m.openInterestUsd??0),0),
    coverage:cover(base.coverage,count),
    errors,
  }
}
export type {MarketRow,VenueRow,CoverageRow,Snapshot}
