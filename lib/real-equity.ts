export type RealEquityVenue={
  venue:string
  securitiesMin:number|null
  securitiesLabel:string
  trading24x5:boolean
  fractional:boolean
  minOrder:string
  funding:string
  structure:string
  regions:string
  transfer:'yes'|'no'|'unverified'
  lending:'yes'|'no'|'unverified'
  ownership:'yes'|'partial'|'unverified'
  fundingAccess:'direct-crypto'|'stablecoin'|'integrated'|'cash-only'
  sourceNote:string
  asOf:string
}

export type BrokerageAccessScore={
  venue:string
  score:number
  band:'Full-stack'|'Advanced'|'Developing'
  coverage:number
  hours:number
  fractional:number
  entry:number
  funding:number
  transfer:number
  lending:number
  ownership:number
}

export const REAL_EQUITY_AS_OF='2026-09-18'

export const realEquityVenues:RealEquityVenue[]=[
  {
    venue:'Binance',
    securitiesMin:7000,
    securitiesLabel:'7,000+',
    trading24x5:true,
    fractional:true,
    minOrder:'$5',
    funding:'USDC; BNB / USDT / U / USD1 can auto-convert',
    structure:'Direct listed stocks/ETFs; beneficial ownership through regulated brokerage / clearing rails',
    regions:'Eligible global markets; jurisdiction dependent',
    transfer:'unverified',
    lending:'yes',
    ownership:'yes',
    fundingAccess:'direct-crypto',
    sourceNote:'Binance Stocks official product pages; FPSL available from Jun 2026',
    asOf:REAL_EQUITY_AS_OF,
  },
  {
    venue:'Bitget',
    securitiesMin:10000,
    securitiesLabel:'10,000+',
    trading24x5:true,
    fractional:true,
    minOrder:'~$10 / 0.0001 share',
    funding:'USDC Stock+ sub-account; crypto can be converted to USDC',
    structure:'Real U.S. securities held through compliant brokers; full shareholder rights',
    regions:'Eligible markets; jurisdiction dependent',
    transfer:'yes',
    lending:'unverified',
    ownership:'yes',
    fundingAccess:'stablecoin',
    sourceNote:'Bitget Stock+ official product/support pages; ACATS-in and shareholder rights verified',
    asOf:REAL_EQUITY_AS_OF,
  },
  {
    venue:'Kraken',
    securitiesMin:11000,
    securitiesLabel:'11,000+',
    trading24x5:true,
    fractional:true,
    minOrder:'Varies by symbol',
    funding:'Brokerage cash rails; stocks and crypto managed in one app',
    structure:'Kraken Securities LLC brokerage; direct securities, separate from xStocks',
    regions:'Eligible U.S. states',
    transfer:'yes',
    lending:'yes',
    ownership:'yes',
    fundingAccess:'integrated',
    sourceNote:'Kraken Stocks official pages; ACATS and Fully Paid Stock Lending verified',
    asOf:REAL_EQUITY_AS_OF,
  },
  {
    venue:'Coinbase',
    securitiesMin:4000,
    securitiesLabel:'~4,000 UK; thousands U.S.',
    trading24x5:true,
    fractional:true,
    minOrder:'$1 / £1',
    funding:'USD / USDC from one Coinbase account',
    structure:'Coinbase Capital Markets brokerage; Apex execution / clearing / custody',
    regions:'U.S. and UK eligible customers',
    transfer:'yes',
    lending:'unverified',
    ownership:'yes',
    fundingAccess:'stablecoin',
    sourceNote:'Coinbase Stocks / CCM official pages; ACATS in/out verified',
    asOf:REAL_EQUITY_AS_OF,
  },
  {
    venue:'Crypto.com',
    securitiesMin:12000,
    securitiesLabel:'12,000+',
    trading24x5:true,
    fractional:true,
    minOrder:'No minimum deposit; fractional available',
    funding:'Bank / card / Apple Pay / Google Pay / crypto',
    structure:'Foris Capital US LLC broker-dealer; FINRA/SIPC',
    regions:'U.S. customers currently',
    transfer:'yes',
    lending:'yes',
    ownership:'yes',
    fundingAccess:'direct-crypto',
    sourceNote:'Crypto.com Stocks official pages; ACATS, 24/5 and securities lending verified',
    asOf:REAL_EQUITY_AS_OF,
  },
  {
    venue:'Gemini',
    securitiesMin:null,
    securitiesLabel:'Thousands',
    trading24x5:true,
    fractional:true,
    minOrder:'Not publicly standardized',
    funding:'Brokerage funding inside Gemini app',
    structure:'Gemini Galactic Markets introducing broker; Apex Clearing custodian / clearing',
    regions:'Eligible U.S. residents',
    transfer:'no',
    lending:'unverified',
    ownership:'yes',
    fundingAccess:'integrated',
    sourceNote:'Gemini Stocks official pages; 24/5 live, transfers not supported at current published status',
    asOf:REAL_EQUITY_AS_OF,
  },
]

const coverageScore=(v:RealEquityVenue)=>{
  const n=v.securitiesMin
  if(n===null)return 15
  if(n>=10000)return 25
  if(n>=7000)return 22
  if(n>=4000)return 18
  if(n>=2000)return 14
  return 8
}
const entryScore=(v:RealEquityVenue)=>{
  if(v.venue==='Coinbase')return 10
  if(v.venue==='Crypto.com')return 9
  if(v.venue==='Binance')return 8
  if(v.venue==='Bitget')return 6
  return 4
}
const fundingScore=(v:RealEquityVenue)=>({
  'direct-crypto':15,
  'stablecoin':15,
  'integrated':8,
  'cash-only':4,
}[v.fundingAccess])
const supportScore=(x:'yes'|'no'|'unverified',points:number)=>x==='yes'?points:0
const ownershipScore=(x:'yes'|'partial'|'unverified')=>x==='yes'?10:x==='partial'?5:0

export const brokerageAccessScores:BrokerageAccessScore[]=realEquityVenues.map(v=>{
  const parts={
    coverage:coverageScore(v),
    hours:v.trading24x5?15:0,
    fractional:v.fractional?10:0,
    entry:entryScore(v),
    funding:fundingScore(v),
    transfer:supportScore(v.transfer,10),
    lending:supportScore(v.lending,5),
    ownership:ownershipScore(v.ownership),
  }
  const score=Object.values(parts).reduce((a,b)=>a+b,0)
  const band:BrokerageAccessScore['band']=score>=90?'Full-stack':score>=80?'Advanced':'Developing'
  return {
    venue:v.venue,
    score,
    band,
    ...parts,
  }
}).sort((a,b)=>b.score-a.score)

export const brokerageAccessBars=brokerageAccessScores.map(x=>({label:x.venue,value:x.score}))

export const publishedCoverageBars=realEquityVenues
  .filter((x):x is RealEquityVenue & {securitiesMin:number}=>x.securitiesMin!==null)
  .map(x=>({label:x.venue,value:x.securitiesMin}))
  .sort((a,b)=>b.value-a.value)
