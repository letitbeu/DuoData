import type { MarketRow } from './market'
import type { PenetrationRow } from './penetration'

export type ValidationStatus='PASS'|'WARN'|'REVIEW'|'REFERENCE'|'STALE'
export type ValidationRow={
  venue:string
  metric:'TradFi 24H Volume'|'TradFi OI'|'All Derivatives 24H Volume'|'All Derivatives OI'
  direct:number|null
  external:number
  deltaPct:number|null
  source:'DefiLlama'|'CoinMarketCap'
  observedAt:string
  status:ValidationStatus
}

const REVIEWED_AT='2026-09-18T02:30:00Z'

// External values are audit snapshots only. They are never used in DuoData live totals.
// DefiLlama values are used for TradFi/RWA perp subset checks.
// CoinMarketCap values are used as a broad all-derivatives reference for TPR denominators.
const DEFILLAMA:Record<string,{volume?:number;oi?:number;observedAt:string}>={
  Binance:{volume:14.104e9,oi:4.158e9,observedAt:REVIEWED_AT},
  OKX:{volume:2.458e9,oi:838.04e6,observedAt:REVIEWED_AT},
  Bybit:{volume:709.48e6,oi:479.87e6,observedAt:REVIEWED_AT},
}

const CMC:Record<string,{volume?:number;oi?:number;observedAt:string}>={
  Binance:{volume:56.156217321e9,oi:32.581812198e9,observedAt:REVIEWED_AT},
  OKX:{volume:21.684365334e9,oi:7.205958242e9,observedAt:REVIEWED_AT},
  Bybit:{volume:12.447987836e9,oi:6.082535305e9,observedAt:REVIEWED_AT},
  Gate:{volume:12.071085130e9,oi:11.219732441e9,observedAt:REVIEWED_AT},
  Bitget:{volume:6.934170123e9,oi:4.132094429e9,observedAt:REVIEWED_AT},
  MEXC:{volume:10.245161257e9,oi:5.017145593e9,observedAt:REVIEWED_AT},
}

const ageHours=(iso:string)=>(Date.now()-new Date(iso).getTime())/36e5
const delta=(direct:number|null,external:number)=>direct===null||external<=0?null:(direct/external-1)*100
const status=(d:number|null,observedAt:string,reference=false):ValidationStatus=>{
  if(ageHours(observedAt)>36)return 'STALE'
  if(reference)return 'REFERENCE'
  if(d===null)return 'REVIEW'
  const a=Math.abs(d)
  if(a<=5)return 'PASS'
  if(a<=15)return 'WARN'
  return 'REVIEW'
}

export function buildExternalValidation(markets:MarketRow[],penetration:PenetrationRow[]):ValidationRow[]{
  const perps=markets.filter(m=>m.productLayer==='TradFi Perps')
  const venues=[...new Set(perps.map(m=>m.venue))]
  const rows:ValidationRow[]=[]

  for(const venue of venues){
    const xs=perps.filter(m=>m.venue===venue)
    const knownVol=xs.filter(m=>m.volume24hUsd!==null)
    const knownOi=xs.filter(m=>m.openInterestUsd!==null)
    const directVol=knownVol.length?knownVol.reduce((s,m)=>s+(m.volume24hUsd??0),0):null
    const directOi=knownOi.length?knownOi.reduce((s,m)=>s+(m.openInterestUsd??0),0):null

    const dl=DEFILLAMA[venue]
    if(dl?.volume){
      const d=delta(directVol,dl.volume)
      rows.push({venue,metric:'TradFi 24H Volume',direct:directVol,external:dl.volume,deltaPct:d,source:'DefiLlama',observedAt:dl.observedAt,status:status(d,dl.observedAt)})
    }
    if(dl?.oi){
      const d=delta(directOi,dl.oi)
      rows.push({venue,metric:'TradFi OI',direct:directOi,external:dl.oi,deltaPct:d,source:'DefiLlama',observedAt:dl.observedAt,status:status(d,dl.observedAt)})
    }

    const cmc=CMC[venue]
    const p=penetration.find(x=>x.venue===venue)
    if(cmc?.volume){
      const directAll=p?.allPerpsVolume??null
      const d=delta(directAll,cmc.volume)
      rows.push({venue,metric:'All Derivatives 24H Volume',direct:directAll,external:cmc.volume,deltaPct:d,source:'CoinMarketCap',observedAt:cmc.observedAt,status:status(d,cmc.observedAt,true)})
    }
    if(cmc?.oi){
      rows.push({venue,metric:'All Derivatives OI',direct:null,external:cmc.oi,deltaPct:null,source:'CoinMarketCap',observedAt:cmc.observedAt,status:status(null,cmc.observedAt,true)})
    }
  }
  return rows
}
