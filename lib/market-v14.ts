import {
  getSnapshot as getBaseSnapshot,
  type MarketRow,
  type VenueRow,
  type CoverageRow,
  type Snapshot,
} from './market-v13'

const n=(v:unknown):number|null=>{
  if(v===''||v===null||v===undefined)return null
  const x=Number(v)
  return Number.isFinite(x)?x:null
}
async function json<T>(url:string,headers:Record<string,string>={}):Promise<T>{
  const r=await fetch(url,{next:{revalidate:60},signal:AbortSignal.timeout(10_000),headers:{Accept:'application/json','User-Agent':'DuoData/1.4',...headers}})
  if(!r.ok)throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}
const ETF=new Set(['QQQ','SPY','GLD','SLV','IWM','VTI','TLT','DIA','ARKK','XLK','XLF','XLE','XLI','XLV','XLY','XLP','XLU','XLB','XLRE'])
function assetClass(u:string){return ETF.has(u.toUpperCase())?'ETF':'Equity'}
function unique(rows:MarketRow[]){
  const m=new Map<string,MarketRow>()
  for(const r of rows)m.set(`${r.venue}|${r.symbol}|${r.product}`,r)
  return [...m.values()]
}

async function bitgetTokenizedSpot():Promise<MarketRow[]>{
  const base='https://api.bitget.com'
  const [inst,tickers,stockInfo]=await Promise.all([
    json<any>(`${base}/api/v3/market/instruments?category=SPOT`),
    json<any>(`${base}/api/v3/market/tickers?category=SPOT`),
    json<any>(`${base}/api/v3/reality/market/stock-info`),
  ])
  if(inst?.code!=='00000'||!Array.isArray(inst?.data))throw new Error('invalid Bitget spot instruments payload')
  if(tickers?.code!=='00000'||!Array.isArray(tickers?.data))throw new Error('invalid Bitget spot tickers payload')
  const tickerMap=new Map(tickers.data.map((x:any)=>[String(x.symbol).toUpperCase(),x]))
  const stockMap=new Map(
    (Array.isArray(stockInfo?.data)?stockInfo.data:[])
      .map((x:any)=>[String(x.symbol).toUpperCase(),String(x.code||'').toUpperCase()] as const)
      .filter((x:any)=>x[0]&&x[1])
  )
  const rows:MarketRow[]=[]
  for(const i of inst.data){
    if(String(i.isReality||'').toLowerCase()!=='yes')continue
    const symbol=String(i.symbol||'').toUpperCase()
    const t:any=tickerMap.get(symbol)
    if(!t)continue
    const last=n(t.lastPrice)
    if(last===null||last<=0)continue
    const underlying=stockMap.get(symbol)||symbol.replace(/^R/,'').replace(/USDT$/,'')
    const open=n(t.openPrice24h)
    rows.push({
      venue:'Bitget',
      product:'rToken Spot',
      symbol,
      underlying,
      marketClass:assetClass(underlying),
      productLayer:'Tokenized Spot',
      assetClass:assetClass(underlying),
      lastPrice:last,
      volume24hUsd:n(t.platformTurnover24h)??n(t.turnover24h),
      openInterestUsd:null,
      fundingRate:null,
      change24h:n(t.price24hPcnt)??(open&&open>0?last/open-1:null),
      bid:n(t.bid1Price),
      ask:n(t.ask1Price),
    })
  }
  if(!rows.length)throw new Error('0 Bitget Reality spot markets matched')
  return rows
}

async function krakenTokenizedSpot():Promise<MarketRow[]>{
  const [assets,pairs,tickers]=await Promise.all([
    json<any>('https://api.kraken.com/0/public/Assets?aclass=tokenized_asset'),
    json<any>('https://api.kraken.com/0/public/AssetPairs'),
    json<any>('https://api.kraken.com/0/public/Ticker'),
  ])
  if(Array.isArray(assets?.error)&&assets.error.length)throw new Error(`Assets: ${assets.error.join(', ')}`)
  if(Array.isArray(pairs?.error)&&pairs.error.length)throw new Error(`AssetPairs: ${pairs.error.join(', ')}`)
  if(Array.isArray(tickers?.error)&&tickers.error.length)throw new Error(`Ticker: ${tickers.error.join(', ')}`)

  const tokenized=new Map<string,string>()
  for(const [assetKey,v] of Object.entries<any>(assets?.result||{})){
    const alt=String(v?.altname||assetKey).toUpperCase()
    const underlying=alt.endsWith('X')?alt.slice(0,-1):alt
    tokenized.set(String(assetKey).toUpperCase(),underlying)
    tokenized.set(alt,underlying)
  }
  if(!tokenized.size)throw new Error('Kraken tokenized_asset universe returned 0 assets')

  const tickerResult=tickers?.result||{}
  const rows:MarketRow[]=[]
  for(const [pairKey,p] of Object.entries<any>(pairs?.result||{})){
    const base=String(p?.base||'').toUpperCase()
    const altBase=String(p?.wsname||'').split('/')[0].toUpperCase()
    const underlying=tokenized.get(base)||tokenized.get(altBase)
    if(!underlying)continue
    const quote=String(p?.quote||'').toUpperCase()
    const wsQuote=String(p?.wsname||'').split('/')[1]?.toUpperCase()||''
    if(!['USD','ZUSD','USDT','USDC'].includes(quote)&&!['USD','USDT','USDC'].includes(wsQuote))continue

    const t:any=tickerResult[pairKey]??tickerResult[p?.altname]
    if(!t)continue
    const last=n(t?.c?.[0])
    const baseVol=n(t?.v?.[1])
    const vwap=n(t?.p?.[1])
    if(last===null||last<=0)continue
    const quoteTurnover=baseVol!==null&&vwap!==null?baseVol*vwap:null

    rows.push({
      venue:'Kraken',
      product:'xStock Spot',
      symbol:String(p?.altname||pairKey),
      underlying,
      marketClass:assetClass(underlying),
      productLayer:'Tokenized Spot',
      assetClass:assetClass(underlying),
      lastPrice:last,
      volume24hUsd:quoteTurnover,
      openInterestUsd:null,
      fundingRate:null,
      change24h:null,
      bid:n(t?.b?.[0]),
      ask:n(t?.a?.[0]),
    })
  }
  if(!rows.length)throw new Error('0 Kraken xStocks spot markets matched')
  return rows
}

async function binanceBStocks():Promise<MarketRow[]>{
  const apiKey=process.env.BINANCE_API_KEY
  if(!apiKey)return []
  const headers={'X-MBX-APIKEY':apiKey}
  const [assets,spotInfo,tickers]=await Promise.all([
    json<any[]>('https://api.binance.com/sapi/v1/equity/market/tokenized-assets',headers),
    json<any>('https://api.binance.com/api/v3/exchangeInfo'),
    json<any[]>('https://api.binance.com/api/v3/ticker/24hr'),
  ])
  if(!Array.isArray(assets))throw new Error('invalid Binance tokenized-assets payload')
  const tokenMap=new Map(assets.map((a:any)=>[String(a.assetCode).toUpperCase(),String(a.underlyingEquitySymbol||'').toUpperCase()]))
  const tickerMap=new Map((Array.isArray(tickers)?tickers:[]).map((x:any)=>[String(x.symbol).toUpperCase(),x]))
  const rows:MarketRow[]=[]
  for(const s of spotInfo?.symbols||[]){
    const base=String(s.baseAsset||'').toUpperCase()
    const underlying=tokenMap.get(base)
    if(!underlying||String(s.quoteAsset||'').toUpperCase()!=='USDT'||String(s.status||'').toUpperCase()!=='TRADING')continue
    const t:any=tickerMap.get(String(s.symbol).toUpperCase())
    if(!t)continue
    const last=n(t.lastPrice)
    if(last===null||last<=0)continue
    rows.push({
      venue:'Binance',
      product:'bStock Spot',
      symbol:String(s.symbol),
      underlying,
      marketClass:assetClass(underlying),
      productLayer:'Tokenized Spot',
      assetClass:assetClass(underlying),
      lastPrice:last,
      volume24hUsd:n(t.quoteVolume),
      openInterestUsd:null,
      fundingRate:null,
      change24h:n(t.priceChangePercent)===null?null:(n(t.priceChangePercent)!/100),
      bid:n(t.bidPrice),
      ask:n(t.askPrice),
    })
  }
  return rows
}

function updateCoverage(rows:CoverageRow[],counts:Record<string,number>,binanceKey:boolean):CoverageRow[]{
  return rows.map(r=>{
    if(r.metric!=='Product layer: Tokenized Spot')return r
    return {
      ...r,
      status:'PARTIAL',
      source:'Bybit xStocks + Bitget rToken + Kraken xStocks public market APIs'+(binanceKey?' + Binance bStocks':''),
      note:`Tokenized spot remains separate from perpetuals. Live adapters on this refresh: Bybit plus Bitget ${counts.Bitget||0} markets, Kraken ${counts.Kraken||0} markets${binanceKey?', Binance '+(counts.Binance||0)+' markets':'. Binance bStocks adapter is ready but its official tokenized-assets discovery endpoint requires BINANCE_API_KEY.'}`,
    }
  })
}

export async function getSnapshot():Promise<Snapshot>{
  const base=await getBaseSnapshot()
  let markets=[...base.markets]
  const errors=[...base.errors]
  const counts:Record<string,number>={}
  const jobs=[
    {venue:'Bitget',fn:bitgetTokenizedSpot},
    {venue:'Kraken',fn:krakenTokenizedSpot},
    {venue:'Binance',fn:binanceBStocks},
  ]
  const settled=await Promise.allSettled(jobs.map(j=>j.fn()))
  settled.forEach((r,i)=>{
    const venue=jobs[i].venue
    if(r.status==='fulfilled'){
      counts[venue]=r.value.length
      markets.push(...r.value)
    }else{
      errors.push(`${venue} tokenized spot: ${r.reason instanceof Error?r.reason.message:String(r.reason)}`)
    }
  })
  markets=unique(markets).sort((a,b)=>(b.volume24hUsd??-1)-(a.volume24hUsd??-1))
  return {
    ...base,
    markets,
    liveInstruments:markets.length,
    liveVenues:new Set(markets.map(m=>m.venue)).size,
    totalVolume24hUsd:markets.reduce((s,m)=>s+(m.volume24hUsd??0),0),
    coverage:updateCoverage(base.coverage,counts,Boolean(process.env.BINANCE_API_KEY)),
    errors,
  }
}
export type {MarketRow,VenueRow,CoverageRow,Snapshot}
