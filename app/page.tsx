import { getSnapshot } from '@/lib/market'
import { FundingChart, HorizontalRanking, ProductDonut, VenueBarChart } from '@/components/Charts'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const usd=(n:number)=>Math.abs(n)>=1e12?`$${(n/1e12).toFixed(2)}T`:Math.abs(n)>=1e9?`$${(n/1e9).toFixed(2)}B`:Math.abs(n)>=1e6?`$${(n/1e6).toFixed(2)}M`:Math.abs(n)>=1e3?`$${(n/1e3).toFixed(1)}K`:`$${n.toFixed(0)}`
const price=(n:number)=>n>=1000?n.toLocaleString('en-US',{maximumFractionDigits:2}):n.toLocaleString('en-US',{maximumFractionDigits:4})
const pct=(n:number|null)=>n===null?'—':`${n>=0?'+':''}${(n*100).toFixed(3)}%`
const spreadBp=(bid:number|null,ask:number|null)=>bid&&ask&&bid>0&&ask>0?((ask-bid)/((ask+bid)/2))*10000:null

function ChartCard({eyebrow,title,context,children,source,id}:{eyebrow:string;title:string;context:string;children:React.ReactNode;source:string;id?:string}){
  return <article className="chartCard" id={id}>
    <div className="chartHeader"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><span className="contextPill">{context}</span></div>
    <div className="chartBody">{children}</div>
    <div className="chartFooter"><span>{source}</span><a href="#methodology">Methodology</a></div>
  </article>
}

export default async function Home(){
  const data=await getSnapshot()
  const venueVolume=data.venues.filter(v=>v.volume24hUsd!==null).map(v=>({label:v.venue,value:v.volume24hUsd as number}))
  const venueOi=data.venues.filter(v=>v.openInterestUsd>0).map(v=>({label:v.venue,value:v.openInterestUsd}))
  const productMap=new Map<string,number>()
  data.markets.forEach(m=>{if(m.volume24hUsd!==null)productMap.set(m.product,(productMap.get(m.product)||0)+m.volume24hUsd)})
  const products=[...productMap].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value)
  const topMarkets=data.markets.filter(m=>m.volume24hUsd!==null).slice(0,10).map(m=>({label:`${m.underlying} · ${m.venue}`,value:m.volume24hUsd as number}))
  const funding=data.markets.filter(m=>m.fundingRate!==null).sort((a,b)=>Math.abs(b.fundingRate||0)-Math.abs(a.fundingRate||0)).slice(0,10).map(m=>({label:m.underlying,value:(m.fundingRate||0)*100,venue:m.venue}))
  const tightSpreads=data.markets.map(m=>({m,s:spreadBp(m.bid,m.ask)})).filter(x=>x.s!==null&&Number.isFinite(x.s)).sort((a,b)=>(a.s||0)-(b.s||0)).slice(0,10).map(x=>({label:`${x.m.underlying} · ${x.m.venue}`,value:x.s||0}))
  const coverageLive=data.coverage.filter(c=>c.status==='LIVE').length
  const coveragePartial=data.coverage.filter(c=>c.status==='PARTIAL'||c.status==='COLLECTING').length
  const coverageUnavailable=data.coverage.filter(c=>c.status==='PRIVATE'||c.status==='UNAVAILABLE').length
  const asOf=new Date(data.asOf).toLocaleString('en-GB',{timeZone:'Asia/Singapore',hour12:false,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'})

  return <div className="appShell">
    <header className="globalHeader">
      <div className="wordmark"><span className="mark">D</span><div><strong>DuoData</strong><small>MARKET INTELLIGENCE</small></div></div>
      <nav className="globalNav"><a className="active" href="#overview">Data</a><a href="#markets">Markets</a><a href="#methodology">Methodology</a></nav>
      <div className="liveState"><i/>Live public APIs</div>
    </header>

    <div className="terminal shell">
      <aside className="sideNav">
        <div className="navGroup"><span>TRADFI DATA</span><a className="selected" href="#overview">Overview</a><a href="#venue">Exchanges</a><a href="#markets">Markets</a></div>
        <div className="navGroup"><span>MARKET STRUCTURE</span><a href="#volume">Volume</a><a href="#open-interest">Open Interest</a><a href="#funding">Funding</a><a href="#liquidity">Liquidity</a></div>
        <div className="navGroup"><span>RESEARCH</span><a className="disabled">Price Discovery <em>collecting</em></a><a className="disabled">Capital Flow <em>private</em></a><a href="#methodology">Data Coverage</a></div>
        <div className="coverageMini"><span>Current universe</span><strong>{data.liveVenues} venues · {data.liveInstruments} instruments</strong><small>Only explicitly identified TradFi/RWA markets are included.</small></div>
      </aside>

      <main className="content" id="overview">
        <section className="pageHead">
          <div><span className="sectionLabel">CRYPTO EXCHANGES × TRADITIONAL MARKETS</span><h1>TradFi on Crypto Exchanges</h1><p>A normalized view of traditional-asset trading activity on crypto-native venues. Every displayed value is sourced from a public exchange API; unavailable data is left unavailable.</p></div>
          <div className="asOf"><span>LAST UPDATED</span><strong>{asOf} SGT</strong><small>Auto-refresh on request</small></div>
        </section>

        {data.errors.length>0&&<section className="dataNotice"><strong>Partial coverage</strong><span>{data.errors.join(' · ')}</span></section>}

        <section className="metricStrip">
          <div className="metricCell"><span>Tracked 24H Volume</span><strong>{usd(data.totalVolume24hUsd)}</strong><small>Exact venue-reported quote notional only</small></div>
          <div className="metricCell"><span>Tracked Open Interest</span><strong>{usd(data.totalOpenInterestUsd)}</strong><small>Perpetual markets where available</small></div>
          <div className="metricCell"><span>TradFi Instruments</span><strong>{data.liveInstruments.toLocaleString()}</strong><small>Explicit venue metadata only</small></div>
          <div className="metricCell"><span>Coverage</span><strong>{data.liveVenues} <b>venues</b></strong><small>{coverageLive} live metrics · {coveragePartial+coverageUnavailable} partial/private</small></div>
        </section>

        <div className="sectionBar" id="volume"><div><span>MARKET OVERVIEW</span><h2>Trading activity</h2></div><small>Current snapshot · no zero-filling for unavailable metrics</small></div>
        <section className="chartGrid">
          <ChartCard eyebrow="VOLUME" title="24H TradFi Volume by Exchange" context="ROLLING 24H" source="Exact quote turnover where venue publishes it · OKX excluded from this chart" id="venue"><VenueBarChart data={venueVolume}/></ChartCard>
          <ChartCard eyebrow="MARKETS" title="Largest TradFi Markets by 24H Volume" context="TOP 10" source="Exact venue-reported quote turnover only"><HorizontalRanking data={topMarkets} limit={10}/></ChartCard>
          <ChartCard eyebrow="PRODUCT MIX" title="TradFi Volume by Product Wrapper" context="ROLLING 24H" source="Product classification follows venue-native metadata"><ProductDonut data={products}/></ChartCard>
          <ChartCard eyebrow="OPEN INTEREST" title="TradFi Open Interest by Exchange" context="CURRENT" source="Venue OI USD or contract/base quantity × venue mark" id="open-interest"><VenueBarChart data={venueOi}/></ChartCard>
        </section>

        <div className="sectionBar"><div><span>POSITIONING & LIQUIDITY</span><h2>Market structure</h2></div><small>Live snapshot · no historical backfill</small></div>
        <section className="chartGrid">
          <ChartCard eyebrow="FUNDING" title="Most Extreme Funding Rates" context="CURRENT" source="Current normalized funding only; unsupported venues remain blank" id="funding"><FundingChart data={funding}/></ChartCard>
          <ChartCard eyebrow="LIQUIDITY" title="Tightest Top-of-Book Spreads" context="TOP 10" source="Best bid / ask only; not full depth" id="liquidity"><HorizontalRanking data={tightSpreads} unit="bp" limit={10}/></ChartCard>
        </section>

        <section className="marketSection" id="markets">
          <div className="sectionBar tableTitle"><div><span>MARKET DIRECTORY</span><h2>TradFi instruments</h2></div><small>{data.markets.length} live instruments · turnover unavailable fields shown as —</small></div>
          <div className="tableWrap"><table><thead><tr><th>Instrument</th><th>Venue</th><th>Product</th><th>Last</th><th>24H</th><th>24H Volume</th><th>Open Interest</th><th>Funding</th><th>Spread</th></tr></thead><tbody>{data.markets.slice(0,60).map(m=>{const s=spreadBp(m.bid,m.ask);return <tr key={`${m.venue}-${m.symbol}-${m.product}`}><td><strong>{m.underlying}</strong><small>{m.symbol}</small></td><td>{m.venue}</td><td><span className="productTag">{m.product}</span></td><td>{price(m.lastPrice)}</td><td className={m.change24h===null?'':m.change24h>=0?'positiveText':'negativeText'}>{pct(m.change24h)}</td><td>{m.volume24hUsd===null?'—':usd(m.volume24hUsd)}</td><td>{m.openInterestUsd===null?'—':usd(m.openInterestUsd)}</td><td className={m.fundingRate===null?'':m.fundingRate>=0?'negativeText':'positiveText'}>{pct(m.fundingRate)}</td><td>{s===null?'—':`${s.toFixed(s<10?1:0)} bp`}</td></tr>})}</tbody></table></div>
        </section>

        <section className="methodology" id="methodology">
          <details>
            <summary className="methodHead" style={{cursor:'pointer',listStyle:'none',marginBottom:0}}>
              <div><span className="sectionLabel">DATA GOVERNANCE</span><h2>Coverage & methodology</h2><p style={{marginBottom:0}}>Public-data coverage, source limitations and unavailable metrics.</p></div>
              <div className="methodStat"><strong>{coverageLive}/{data.coverage.length}</strong><span>metrics live · click to expand</span></div>
            </summary>
            <div className="coverageTable" style={{marginTop:16}}><div className="coverageRow coverageHeader"><span>Metric</span><span>Status</span><span>Source / limitation</span></div>{data.coverage.map(c=><div className="coverageRow" key={c.metric}><strong>{c.metric}</strong><span><i className={`statusDot ${c.status.toLowerCase()}`}/>{c.status}</span><p>{c.note}<small>{c.source}</small></p></div>)}</div>
          </details>
        </section>

        <footer className="pageFooter"><strong>DuoData</strong><span>Independent market intelligence for TradFi on crypto exchanges.</span><span>V0.3 · Public-data-only policy</span></footer>
      </main>
    </div>
  </div>
}
