export type TransferSupport='bidirectional'|'inbound'|'unsupported'|'unverified'

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
  transfer:TransferSupport
  lending:'yes'|'no'|'unverified'
  ownership:'yes'|'partial'|'unverified'
  fundingAccess:'direct-crypto'|'stablecoin'|'integrated'|'cash-only'
  friction:{
    geography:number
    transfer:number
    funding:number
    hours:number
    entry:number
    account:number
    uncertainty:number
    note:string
  }
  sourceNote:string
  asOf:string
}

export type BrokerageAccessScore={
  venue:string
  score:number
  accessScore:number
  frictionScore:number
  usabilityScore:number
  band:'Full-stack'|'Advanced'|'Developing'
  access:{
    coverage:number
    hours:number
    fractional:number
    funding:number
    transfer:number
    lending:number
    ownership:number
  }
  friction:RealEquityVenue['friction']
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
    transfer:'bidirectional',
    lending:'yes',
    ownership:'yes',
    fundingAccess:'direct-crypto',
    friction:{
      geography:8,transfer:10,funding:2,hours:4,entry:3,account:5,uncertainty:2,
      note:'Broad access, but jurisdiction limits remain. DTC transfers are manual/batched; transfer-in may take 14+ business days and transfer-out requests are batched weekly.',
    },
    sourceNote:'Binance Stocks official pages; DTC transfer-in/out and FPSL verified Aug 2026',
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
    transfer:'inbound',
    lending:'unverified',
    ownership:'yes',
    fundingAccess:'stablecoin',
    friction:{
      geography:10,transfer:8,funding:3,hours:3,entry:5,account:5,uncertainty:5,
      note:'Inbound stock transfer is verified and typically takes several business days; outbound transfer and securities lending are not counted until publicly verified.',
    },
    sourceNote:'Bitget Stock+ official pages; inbound stock transfer, 24/5 and shareholder rights verified',
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
    transfer:'bidirectional',
    lending:'yes',
    ownership:'yes',
    fundingAccess:'integrated',
    friction:{
      geography:20,transfer:15,funding:8,hours:3,entry:5,account:5,uncertainty:2,
      note:'Real-equity brokerage is geographically narrow. ACATS-out costs $100; fractional shares cannot be transferred and transfers generally take several business days.',
    },
    sourceNote:'Kraken Stocks official pages; ACATS, $100 transfer-out fee and Fully Paid Stock Lending verified',
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
    transfer:'bidirectional',
    lending:'unverified',
    ownership:'yes',
    fundingAccess:'stablecoin',
    friction:{
      geography:12,transfer:5,funding:2,hours:5,entry:1,account:4,uncertainty:4,
      note:'Low funding and entry friction, but stock access remains region-limited and 24/5 availability is symbol-dependent. Securities lending is not scored without public verification.',
    },
    sourceNote:'Coinbase Stocks / CCM official pages; 24/5, fractional trading, USD/USDC funding and ACATS verified',
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
    transfer:'bidirectional',
    lending:'yes',
    ownership:'yes',
    fundingAccess:'direct-crypto',
    friction:{
      geography:22,transfer:18,funding:4,hours:6,entry:0,account:5,uncertainty:1,
      note:'Feature coverage is broad, but stocks are U.S.-only and outbound ACATS costs $100. Crypto purchases convert into brokerage cash before securities execution.',
    },
    sourceNote:'Crypto.com Stocks official pages; U.S.-only access, $100 transfer-out fee, 24/5 and securities lending verified',
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
    regions:'Eligible U.S. residents except published exclusions',
    transfer:'unsupported',
    lending:'unverified',
    ownership:'yes',
    fundingAccess:'integrated',
    friction:{
      geography:22,transfer:20,funding:8,hours:8,entry:6,account:5,uncertainty:6,
      note:'U.S.-only rollout with exclusions. Stock transfers are not supported at the current published status; 24/5 is limited to eligible securities and limit orders.',
    },
    sourceNote:'Gemini Stocks official pages; 24/5 verified, stock transfers currently unsupported',
    asOf:REAL_EQUITY_AS_OF,
  },
]

const coverageScore=(v:RealEquityVenue)=>{
  const n=v.securitiesMin
  if(n===null)return 16
  if(n>=10000)return 30
  if(n>=7000)return 26
  if(n>=4000)return 20
  if(n>=2000)return 15
  return 8
}
const fundingScore=(v:RealEquityVenue)=>({
  'direct-crypto':15,
  'stablecoin':15,
  'integrated':10,
  'cash-only':4,
}[v.fundingAccess])
const transferScore=(x:TransferSupport)=>x==='bidirectional'?15:x==='inbound'?8:0
const supportScore=(x:'yes'|'no'|'unverified',points:number)=>x==='yes'?points:0
const ownershipScore=(x:'yes'|'partial'|'unverified')=>x==='yes'?10:x==='partial'?5:0

export const brokerageAccessScores:BrokerageAccessScore[]=realEquityVenues.map(v=>{
  const access={
    coverage:coverageScore(v),
    hours:v.trading24x5?15:0,
    fractional:v.fractional?10:0,
    funding:fundingScore(v),
    transfer:transferScore(v.transfer),
    lending:supportScore(v.lending,5),
    ownership:ownershipScore(v.ownership),
  }
  const accessScore=Object.values(access).reduce((a,b)=>a+b,0)
  const frictionScore=Math.min(100,Object.entries(v.friction)
    .filter(([k])=>k!=='note')
    .reduce((s,[,n])=>s+Number(n),0))
  const usabilityScore=100-frictionScore
  const score=Math.round(accessScore*.65+usabilityScore*.35)
  const band:BrokerageAccessScore['band']=score>=85?'Full-stack':score>=70?'Advanced':'Developing'
  return {venue:v.venue,score,accessScore,frictionScore,usabilityScore,band,access,friction:v.friction}
}).sort((a,b)=>b.score-a.score)

export const brokerageAccessBars=brokerageAccessScores.map(x=>({label:x.venue,value:x.score}))
export const accessScoreBars=brokerageAccessScores.map(x=>({label:x.venue,value:x.accessScore}))
export const frictionScoreBars=brokerageAccessScores
  .slice()
  .sort((a,b)=>a.frictionScore-b.frictionScore)
  .map(x=>({label:x.venue,value:x.frictionScore}))

export const publishedCoverageBars=realEquityVenues
  .filter((x):x is RealEquityVenue & {securitiesMin:number}=>x.securitiesMin!==null)
  .map(x=>({label:x.venue,value:x.securitiesMin}))
  .sort((a,b)=>b.value-a.value)
