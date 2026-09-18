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
  sourceNote:string
  asOf:string
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
    funding:'USDC; supported crypto can auto-convert',
    structure:'Direct listed stocks/ETFs via external regulated brokerage / clearing rails',
    regions:'Eligible global markets; jurisdiction dependent',
    sourceNote:'Binance Stocks official product pages, Jun–Aug 2026',
    asOf:REAL_EQUITY_AS_OF,
  },
  {
    venue:'Bitget',
    securitiesMin:10000,
    securitiesLabel:'10,000+',
    trading24x5:true,
    fractional:true,
    minOrder:'~$10 / 0.0001 share',
    funding:'USDC Stock+ sub-account',
    structure:'Real U.S. securities held through compliant broker; shareholder rights',
    regions:'Eligible markets; jurisdiction dependent',
    sourceNote:'Bitget Stock+ official product/support pages, 2026',
    asOf:REAL_EQUITY_AS_OF,
  },
  {
    venue:'Kraken',
    securitiesMin:11000,
    securitiesLabel:'11,000+',
    trading24x5:true,
    fractional:true,
    minOrder:'Varies by symbol',
    funding:'Brokerage cash rails; crypto and equities managed in one app',
    structure:'Regulated stock/ETF brokerage offering; direct securities, separate from xStocks',
    regions:'Eligible U.S. states and supported EEA markets',
    sourceNote:'Kraken Stocks / equities support pages, Aug 2026',
    asOf:REAL_EQUITY_AS_OF,
  },
  {
    venue:'Coinbase',
    securitiesMin:4000,
    securitiesLabel:'~4,000 UK; thousands U.S.',
    trading24x5:true,
    fractional:true,
    minOrder:'$1 / £1',
    funding:'USD / USDC',
    structure:'Coinbase Capital Markets brokerage; real U.S.-listed securities',
    regions:'U.S. and UK eligible customers',
    sourceNote:'Coinbase Stocks official pages, 2026; UK page states nearly 4,000 stocks',
    asOf:REAL_EQUITY_AS_OF,
  },
  {
    venue:'Crypto.com',
    securitiesMin:12000,
    securitiesLabel:'12,000+',
    trading24x5:true,
    fractional:true,
    minOrder:'$1',
    funding:'Stocks Cash; supported wallet funds can be converted for purchases',
    structure:'Foris Capital US LLC broker-dealer; FINRA/SIPC',
    regions:'U.S. customers currently',
    sourceNote:'Crypto.com Stocks official help/product pages, updated 2026',
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
    structure:'Gemini Galactic Markets introducing broker; Apex Clearing custodian/clearing',
    regions:'Eligible U.S. residents',
    sourceNote:'Gemini Stocks official page / Jul–Aug 2026 announcements',
    asOf:REAL_EQUITY_AS_OF,
  },
]

export const publishedCoverageBars=realEquityVenues
  .filter((x):x is RealEquityVenue & {securitiesMin:number}=>x.securitiesMin!==null)
  .map(x=>({label:x.venue,value:x.securitiesMin}))
  .sort((a,b)=>b.value-a.value)
