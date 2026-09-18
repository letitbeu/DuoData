import type { MarketRow } from './market'

export type PenetrationRow = {
  venue: string
  tradFiVolume: number
  allPerpsVolume: number
  ratioPct: number
  source: string
}

const n=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:null}

async function json<T>(url:string):Promise<T>{
  const r=await fetch(url,{next:{revalidate:60},signal:AbortSignal.timeout(8_000),headers:{Accept:'application/json','User-Agent':'DuoData-TPR/1.0'}})
  if(!r.ok)throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

const sum=(xs:(number|null)[])=>xs.reduce<number>((s,v)=>s+(v??0),0)

async function denominator(venue:string):Promise<{value:number;source:string}|null>{
  if(venue==='Binance'){
    const x=await json<any[]>('https://fapi.binance.com/fapi/v1/ticker/24hr')
    return {value:sum((Array.isArray(x)?x:[]).map(r=>n(r.quoteVolume))),source:'Binance USD-M Futures quoteVolume'}
  }
  if(venue==='Bybit'){
    const x=await json<any>('https://api.bybit.com/v5/market/tickers?category=linear')
    if(x?.retCode!==0)throw new Error(x?.retMsg||'Bybit API error')
    return {value:sum((x?.result?.list||[]).map((r:any)=>n(r.turnover24h))),source:'Bybit linear turnover24h'}
  }
  if(venue==='Bitget'){
    const x=await json<any>('https://api.bitget.com/api/v2/mix/market/tickers?productType=usdt-futures')
    if(x?.code!=='00000')throw new Error(x?.msg||'Bitget API error')
    return {value:sum((x?.data||[]).map((r:any)=>n(r.usdtVolume??r.quoteVolume))),source:'Bitget USDT futures turnover'}
  }
  if(venue==='MEXC'){
    const x=await json<any>('https://api.mexc.com/api/v1/contract/ticker')
    if(x?.success!==true)throw new Error('MEXC ticker error')
    const rows=Array.isArray(x.data)?x.data:(x.data?[x.data]:[])
    return {value:sum(rows.map((r:any)=>n(r.amount24))),source:'MEXC contract amount24'}
  }
  if(venue==='Coinbase INTX'){
    const x=await json<any[]>('https://api.international.coinbase.com/api/v1/instruments')
    const rows=Array.isArray(x)?x:[]
    return {value:sum(rows.filter((r:any)=>String(r.type).toUpperCase()==='PERP').map((r:any)=>n(r.notional_24hr))),source:'Coinbase INTX perp notional_24hr'}
  }
  if(venue==='Kraken'){
    const x=await json<any>('https://futures.kraken.com/derivatives/api/v3/tickers')
    const rows=Array.isArray(x)?x:x?.tickers||x?.result?.tickers||[]
    return {value:sum(rows.filter((r:any)=>String(r.product_id||r.symbol||'').startsWith('PF_')).map((r:any)=>n(r.volumeQuote??r.volume_quote))),source:'Kraken perpetual volumeQuote'}
  }
  return null
}

export async function getPenetrationRatios(markets:MarketRow[]):Promise<{rows:PenetrationRow[];errors:string[]}>{
  const perps=markets.filter(m=>m.productLayer==='TradFi Perps'&&m.volume24hUsd!==null)
  const venues=[...new Set(perps.map(m=>m.venue))].filter(v=>v!=='OKX')
  const results=await Promise.allSettled(venues.map(async venue=>{
    const tradFiVolume=perps.filter(m=>m.venue===venue).reduce((s,m)=>s+(m.volume24hUsd??0),0)
    const d=await denominator(venue)
    if(!d||d.value<=0||tradFiVolume<0)return null
    const ratioPct=tradFiVolume/d.value*100
    if(!Number.isFinite(ratioPct)||ratioPct<0||ratioPct>100.5)throw new Error(`${venue} invalid ratio ${ratioPct}`)
    return {venue,tradFiVolume,allPerpsVolume:d.value,ratioPct,source:d.source}
  }))
  const rows:PenetrationRow[]=[]
  const errors:string[]=[]
  results.forEach((r,i)=>{
    if(r.status==='fulfilled'&&r.value)rows.push(r.value)
    else if(r.status==='rejected')errors.push(`${venues[i]} TPR: ${r.reason instanceof Error?r.reason.message:String(r.reason)}`)
  })
  return {rows:rows.sort((a,b)=>b.ratioPct-a.ratioPct),errors}
}
