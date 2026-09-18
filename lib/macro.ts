export type MacroRow={
  group:string
  name:string
  decimals:number
  latest:number|null
  d5:number|null
  mtd:number|null
  ytd:number|null
  asOf:string|null
  provider?:string
  symbol?:string
  id?:string
  error?:string
}

export type MacroSnapshot={
  generatedAt:string
  rows:MacroRow[]
  failures:{name:string;error:string}[]
}

const YAHOO_HOSTS=['https://query1.finance.yahoo.com','https://query2.finance.yahoo.com']
const FRED_CSV='https://fred.stlouisfed.org/graph/fredgraph.csv'
const JGB_CSV='https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv'

const MARKET_ASSETS=[
  ['Equity','Dow Jones','^DJI',1],['Equity','S&P 500','^GSPC',1],['Equity','NASDAQ','^IXIC',1],['Equity','Russell 2k','^RUT',1],['Equity','PHLX Semi','^SOX',1],['Equity','VIX','^VIX',1],
  ['Equity','Euro Stox','^STOXX50E',1],['Equity','UK','^FTSE',1],['Equity','France','^FCHI',1],['Equity','Germany','^GDAXI',1],['Equity','Swiss','^SSMI',1],['Equity','Nikkei','^N225',1],['Equity','Hang Seng','^HSI',1],['Equity','CSI 300','000300.SS',1],['Equity','Taiwan','^TWII',1],['Equity','Singapore','^STI',1],['Equity','India','^BSESN',1],['Equity','Australia','^AXJO',1],
  ['Currency','USD Index','DX-Y.NYB',2],['Currency','EUR','EURUSD=X',2],['Currency','GBP','GBPUSD=X',2],['Currency','CHF','CHF=X',2],['Currency','JPY','JPY=X',2],['Currency','AUD','AUDUSD=X',2],['Currency','HKD','HKD=X',2],['Currency','THB','THB=X',2],['Currency','MYR','MYR=X',2],['Currency','INR','INR=X',2],['Currency','IDR','IDR=X',2],['Currency','KRW','KRW=X',2],['Currency','CNH','CNH=X',2],
  ['Commodity','Gold','GC=F',1],['Commodity','Silver','SI=F',1],['Commodity','Copper','HG=F',1],['Commodity','Brent','BZ=F',1],['Commodity','WTI','CL=F',1],['Commodity','N.Gas','NG=F',2],['Commodity','BTC','BTC-USD',1],['Commodity','ETH','ETH-USD',1],['Commodity','SOL','SOL-USD',1],
] as const

const FRED_SERIES=[
  ['US Treasury','3m','DGS3MO',2],['US Treasury','1y','DGS1',2],['US Treasury','2y','DGS2',2],['US Treasury','5y','DGS5',2],['US Treasury','10y','DGS10',2],['US Treasury','30y','DGS30',2],
  ['Credit Spread','US IG','BAMLC0A0CM',1,100],['Credit Spread','US HY','BAMLH0A0HYM2',1,100],
  ['DM Rates','UK 10y','IRLTLT01GBM156N',2],['DM Rates','DE 10y','IRLTLT01DEM156N',2],['DM Rates','Italy 10y','IRLTLT01ITM156N',2],['DM Rates','Aussie 10y','IRLTLT01AUM156N',2],
] as const

const num=(x:unknown)=>{const n=Number(x);return Number.isFinite(n)?n:null}
const pct=(a:number|null,b:number|null)=>a!==null&&b!==null&&b!==0?(a/b-1)*100:null

function previousBefore(points:{t:number;v:number}[],ts:number){
  for(let i=points.length-1;i>=0;i--)if(points[i].t<ts)return points[i].v
  return null
}
function firstOnOrAfter(points:{t:number;v:number}[],ts:number){
  for(const p of points)if(p.t>=ts)return p.v
  return null
}
function stats(points:{t:number;v:number}[],mode:'pct'|'bps'='pct',multiplier=1){
  const p=[...points].sort((a,b)=>a.t-b.t)
  if(!p.length)return {latest:null,d5:null,mtd:null,ytd:null,asOf:null}
  const last=p[p.length-1],latest=last.v*multiplier
  const d5base=(p.length>=6?p[p.length-6]:p[0]).v
  const d=new Date(last.t),ms=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1),ys=Date.UTC(d.getUTCFullYear(),0,1)
  let mb=previousBefore(p,ms);if(mb===null)mb=firstOnOrAfter(p,ms)??p[0].v
  let yb=previousBefore(p,ys);if(yb===null)yb=firstOnOrAfter(p,ys)??p[0].v
  const change=(b:number)=>mode==='bps'?(last.v-b)*100:pct(last.v,b)
  return {latest,d5:change(d5base),mtd:change(mb),ytd:change(yb),asOf:new Date(last.t).toISOString().slice(0,10)}
}

async function fetchJson(url:string){
  const r=await fetch(url,{next:{revalidate:300},headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json,text/plain,*/*'}})
  if(!r.ok)throw new Error(`HTTP ${r.status}`)
  return r.json()
}
async function fetchText(url:string){
  const r=await fetch(url,{next:{revalidate:300},headers:{'User-Agent':'Mozilla/5.0'}})
  if(!r.ok)throw new Error(`HTTP ${r.status}`)
  return r.text()
}
async function fetchYahooOne(meta:{group:string;name:string;symbol:string;decimals:number}):Promise<MacroRow>{
  let lastError='Yahoo request failed'
  for(const host of YAHOO_HOSTS){
    try{
      const j=await fetchJson(`${host}/v8/finance/chart/${encodeURIComponent(meta.symbol)}?range=1y&interval=1d&includePrePost=false&events=div%2Csplits`)
      const result=j?.chart?.result?.[0]
      if(!result)throw new Error('empty response')
      const ts:number[]=result.timestamp||[]
      const close:unknown[]=result?.indicators?.quote?.[0]?.close||[]
      const points=ts.map((x,i)=>({t:x*1000,v:num(close[i])})).filter((x):x is {t:number;v:number}=>x.v!==null&&x.v>0)
      if(!points.length)throw new Error('no valid prices')
      return {...meta,...stats(points,'pct',1),provider:'Yahoo Finance'}
    }catch(e){lastError=e instanceof Error?e.message:String(e)}
  }
  return {...meta,latest:null,d5:null,mtd:null,ytd:null,asOf:null,provider:'Yahoo Finance',error:lastError}
}
async function mapLimit<T,R>(items:T[],limit:number,fn:(x:T)=>Promise<R>){
  const out=new Array<R>(items.length);let next=0
  async function worker(){while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i])}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker))
  return out
}
function parseFred(text:string){
  return text.trim().split(/\r?\n/).slice(1).map(line=>{
    const i=line.indexOf(',');if(i<0)return null
    const date=line.slice(0,i),v=num(line.slice(i+1))
    return v===null?null:{t:Date.parse(date+'T00:00:00Z'),v}
  }).filter((x):x is {t:number;v:number}=>Boolean(x))
}
async function fetchFred(meta:{group:string;name:string;id:string;decimals:number;multiplier:number}):Promise<MacroRow>{
  try{
    const start=new Date();start.setUTCFullYear(start.getUTCFullYear()-2)
    const text=await fetchText(`${FRED_CSV}?id=${encodeURIComponent(meta.id)}&cosd=${start.toISOString().slice(0,10)}`)
    return {...meta,...stats(parseFred(text),'bps',meta.multiplier),provider:'FRED'}
  }catch(e){
    return {...meta,latest:null,d5:null,mtd:null,ytd:null,asOf:null,provider:'FRED',error:e instanceof Error?e.message:String(e)}
  }
}
function curves(rows:MacroRow[]):MacroRow[]{
  const m=Object.fromEntries(rows.filter(x=>x.group==='US Treasury').map(x=>[x.name,x]))
  return [['2y10y','2y','10y'],['5y30y','5y','30y'],['10y30y','10y','30y']].map(([name,a,b])=>{
    const s=m[a],l=m[b],val=(x:number|null,y:number|null)=>x===null||y===null?null:y-x
    return {group:'Curvature',name,decimals:1,latest:s&&l?val(s.latest,l.latest)!*100:null,d5:s&&l?val(s.d5,l.d5):null,mtd:s&&l?val(s.mtd,l.mtd):null,ytd:s&&l?val(s.ytd,l.ytd):null,asOf:l?.asOf||s?.asOf||null,provider:'FRED'}
  })
}
async function fetchJgb20():Promise<MacroRow>{
  try{
    const text=await fetchText(JGB_CSV),lines=text.split(/\r?\n/).filter(Boolean)
    let header=-1,idx=-1
    for(let i=0;i<Math.min(lines.length,8);i++){
      const cols=lines[i].split(',').map(s=>s.trim().replace(/^"|"$/g,''))
      const k=cols.findIndex(x=>x==='20Y'||x==='20')
      if(k>=0){header=i;idx=k;break}
    }
    if(header<0)throw new Error('20Y column not found')
    const points:{t:number;v:number}[]=[]
    for(let i=header+1;i<lines.length;i++){
      const c=lines[i].split(',').map(s=>s.trim().replace(/^"|"$/g,''))
      const v=num(c[idx]);if(!c[0]||v===null)continue
      const parts=c[0].split('/').map(Number);if(parts.length!==3)continue
      points.push({t:Date.UTC(parts[0],parts[1]-1,parts[2]),v})
    }
    return {group:'DM Rates',name:'Japan 20y',decimals:2,...stats(points,'bps',1),provider:'MOF Japan'}
  }catch(e){
    return {group:'DM Rates',name:'Japan 20y',decimals:2,latest:null,d5:null,mtd:null,ytd:null,asOf:null,provider:'MOF Japan',error:e instanceof Error?e.message:String(e)}
  }
}

export async function getMacroSnapshot():Promise<MacroSnapshot>{
  const yahooMeta=MARKET_ASSETS.map(([group,name,symbol,decimals])=>({group,name,symbol,decimals}))
  const fredMeta=FRED_SERIES.map(([group,name,id,decimals,multiplier=1])=>({group,name,id,decimals,multiplier}))
  const [yahoo,fred,japan]=await Promise.all([
    mapLimit(yahooMeta,6,fetchYahooOne),
    Promise.all(fredMeta.map(fetchFred)),
    fetchJgb20(),
  ])
  const order=['UK 10y','DE 10y','Italy 10y','Japan 20y','Aussie 10y']
  const dm=[...fred.filter(x=>x.group==='DM Rates'),japan].sort((a,b)=>order.indexOf(a.name)-order.indexOf(b.name))
  const core=fred.filter(x=>x.group!=='DM Rates')
  const rows=[...core,...curves(core),...dm,...yahoo]
  return {
    generatedAt:new Date().toISOString(),
    rows,
    failures:rows.filter(x=>x.error).map(x=>({name:x.name,error:x.error||'unknown error'})),
  }
}

const row=(rows:MacroRow[],g:string,n:string)=>rows.find(r=>r.group===g&&r.name===n)
const val=(rows:MacroRow[],g:string,n:string,k:'latest'|'d5'|'mtd'|'ytd')=>row(rows,g,n)?.[k]??null
const clamp=(x:number)=>Math.max(-2,Math.min(2,x))

export function macroPulse(rows:MacroRow[],key:'d5'|'mtd'='d5'){
  const y10=val(rows,'US Treasury','10y',key),hy=val(rows,'Credit Spread','US HY',key),usd=val(rows,'Currency','USD Index',key),vix=val(rows,'Equity','VIX',key)
  const sp=val(rows,'Equity','S&P 500',key),rut=val(rows,'Equity','Russell 2k',key),semi=val(rows,'Equity','PHLX Semi',key),cu=val(rows,'Commodity','Copper',key),br=val(rows,'Commodity','Brent',key)
  let liquidity=0,growth=0,inflation=0
  if(y10!==null)liquidity+=y10<=-7?1:y10>=7?-1:y10<=-3?.5:y10>=3?-.5:0
  if(hy!==null)liquidity+=hy<=-7?1:hy>=7?-1:hy<=-3?.5:hy>=3?-.5:0
  if(usd!==null)liquidity+=usd<=-.75?.6:usd>=.75?-.6:0
  if(vix!==null)liquidity+=vix<=-7?.5:vix>=7?-.5:0
  if(cu!==null)growth+=cu>=2?1:cu<=-2?-1:cu>=.7?.5:cu<=-.7?-.5:0
  if(rut!==null)growth+=rut>=1?.6:rut<=-1?-.6:0
  if(sp!==null)growth+=sp>=.7?.5:sp<=-.7?-.5:0
  if(semi!==null)growth+=semi>=2?.7:semi<=-2?-.7:0
  if(br!==null)inflation+=br>=7?1.5:br>=3?1:br<=-5?-.8:br<=-3?-.5:0
  const hyLatest=val(rows,'Credit Spread','US HY','latest')
  const credit=hyLatest===null?'Watch':hyLatest<300?'Healthy':hyLatest<400?'Watch':'Stressed'
  const L=clamp(liquidity),G=clamp(growth),I=clamp(inflation)
  const score=1.15*L+.95*G-.95*I-(credit==='Stressed'?1.5:credit==='Watch'?.35:0)
  const tone=score>=1.05?'Constructive':score<=-1.05?'Cautious':'Neutral'
  const state=(type:'liquidity'|'growth'|'inflation',x:number)=>{
    if(type==='liquidity')return x>=.7?'Supportive':x<=-.7?'Tightening':'Neutral'
    if(type==='growth')return x>=.7?'Resilient':x<=-.7?'Soft':'Neutral'
    return x>=.7?'Reflationary':x<=-.5?'Contained':'Neutral'
  }
  return {
    tone,score,
    liquidity:{score:L,state:state('liquidity',L)},
    growth:{score:G,state:state('growth',G)},
    inflation:{score:I,state:state('inflation',I)},
    credit:{state:credit,latest:hyLatest},
  }
}
