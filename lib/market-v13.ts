import {
  getSnapshot as getBaseSnapshot,
  type MarketRow,
  type VenueRow,
  type CoverageRow,
  type Snapshot,
} from './market-v12'

const BAD=new Set(['RWA (unclassified)','Unclassified','TradFi',''])
const SAFE:Record<string,string>={
  XAU:'Commodity',XAG:'Commodity',XAUT:'Commodity',PAXG:'Commodity',
  WTI:'Commodity',CL:'Commodity',USOIL:'Commodity',UKOIL:'Commodity',BRENT:'Commodity',NG:'Commodity',
  SPX:'Equity Index',SP500:'Equity Index',NDX:'Equity Index',NAS100:'Equity Index',
  DJI:'Equity Index',DOW:'Equity Index',JP225:'Equity Index',VIX:'Equity Index',
  QQQ:'ETF',SPY:'ETF',GLD:'ETF',SLV:'ETF',IWM:'ETF',VTI:'ETF',TLT:'ETF',
}
function key(raw:string){
  return String(raw||'').toUpperCase().replace(/[^A-Z0-9]/g,'')
    .replace(/(USDT|USDC|USD1|USD)$/,'').replace(/STOCK$/,'')
}
function master(markets:MarketRow[]){
  const votes=new Map<string,Map<string,Set<string>>>()
  for(const m of markets){
    if(m.venue==='MEXC'||m.productLayer!=='TradFi Perps')continue
    const cls=m.assetClass||m.marketClass
    if(!cls||BAD.has(cls))continue
    const k=key(m.underlying)
    if(!k)continue
    if(!votes.has(k))votes.set(k,new Map())
    const v=votes.get(k)!
    if(!v.has(cls))v.set(cls,new Set())
    v.get(cls)!.add(m.venue)
  }
  const out=new Map<string,string>()
  for(const [k,byClass] of votes){
    const ranked=[...byClass.entries()].sort((a,b)=>b[1].size-a[1].size)
    if(!ranked.length)continue
    const [cls,venues]=ranked[0]
    const runner=ranked[1]?.[1].size??0
    if(ranked.length===1||(venues.size>=2&&venues.size>runner))out.set(k,cls)
  }
  for(const [k,cls] of Object.entries(SAFE))if(!out.has(k))out.set(k,cls)
  return out
}
function clean(markets:MarketRow[]){
  const m=master(markets)
  let resolved=0,remaining=0
  const rows=markets.map(r=>{
    if(r.venue!=='MEXC'||r.productLayer!=='TradFi Perps'||!BAD.has(r.assetClass||r.marketClass))return r
    const cls=m.get(key(r.underlying))
    if(!cls){remaining++;return r}
    resolved++
    return {...r,assetClass:cls,marketClass:cls,product:`${cls} Perpetual`}
  })
  return {rows,resolved,remaining}
}
function coverage(rows:CoverageRow[],resolved:number,remaining:number):CoverageRow[]{
  return rows.map(r=>r.metric==='TradFi Perps volume by asset class'?{
    ...r,
    source:'Venue-native metadata + DuoData cross-venue canonical instrument master',
    note:`${r.note} MEXC ambiguous TradFi contracts are reconciled only when another venue or a safe canonical mapping provides a non-conflicting class; ${resolved} MEXC contracts resolved and ${remaining} remain unclassified on this refresh.`,
  }:r)
}
export async function getSnapshot():Promise<Snapshot>{
  const base=await getBaseSnapshot()
  const x=clean(base.markets)
  return {...base,markets:x.rows,coverage:coverage(base.coverage,x.resolved,x.remaining)}
}
export type {MarketRow,VenueRow,CoverageRow,Snapshot}
