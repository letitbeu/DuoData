import { getSnapshot } from '@/lib/market'
import { FundingChart, HorizontalRanking, ProductDonut, VenueBarChart } from '@/components/Charts'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const usd=(n:number)=>Math.abs(n)>=1e12?`$${(n/1e12).toFixed(2)}T`:Math.abs(n)>=1e9?`$${(n/1e9).toFixed(2)}B`:Math.abs(n)>=1e6?`$${(n/1e6).toFixed(2)}M`:Math.abs(n)>=1e3?`$${(n/1e3).toFixed(1)}K`:`$${n.toFixed(0)}`
const price=(n:number)=>n>=1000?n.toLocaleString('en-US',{maximumFractionDigits:2}):n.toLocaleString('en-US',{maximumFractionDigits:4})
const pct=(n:number|null)=>n===null?'—':`${n>=0?'+':''}${(n*100).toFixed(3)}%`
const spreadBp=(bid:number|null,ask:number|null)=>bid&&ask&&bid>0&&ask>0?((ask-bid)/((ask+bid)/2))*10000:null
const sumKnown=(xs:(number|null)[])=>{const known=xs.filter((v):v is number=>v!==null);return known.length?known.reduce((s,v)=>s+v,0):null}

function ChartCard({title,context,children,source,id}:{title:string;context:string;children:React.ReactNode;source:string;id?:string}){
  return <article className="chartCard" id={id}>
    <div className="chartHeader"><div><h2>{title}</h2></div><span className="contextPill">{context}</span></div>
    <div className="chartBody">{children}</div>
    <div className="chartFooter"><span>{source}</span><a href="#methodology">Methodology</a></div>
  </article>
}

export default async function Home(){
  const data=await getSnapshot()

  const perps=data.markets.filter(m=>m.productLayer==='TradFi Perps')
  const tokenizedSpot=data.markets.filter(m=>m.productLayer==='Tokenized Spot')

  const perpsVolume=sumKnown(perps.map(m=>m.volume24hUsd))
  const perpsOi=sumKnown(perps.map(m=>m.openInterestUsd))
  const perpsVenues=[...new Set(perps.map(m=>m.venue))]

  const venueVolume=perpsVenues.map(venue=>({
    label:venue,
    value:sumKnown(perps.filter(m=>m.venue===venue).map(m=>m.volume24hUsd)),
  })).filter((v):v is {label:string;value:number}=>v.value!==null).sort((a,b)=>b.value-a.value)

  const venueOi=perpsVenues.map(venue=>({
    label:venue,
    value:sumKnown(perps.filter(m=>m.venue===venue).map(m=>m.openInterestUsd)),
  })).filter((v):v is {label:string;value:number}=>v.value!==null&&v.value>0).sort((a,b)=>b.value-a.value)

  const assetClassMap=new Map<string,number>()
  perps.forEach(m=>{if(m.volume24hUsd!==null)assetClassMap.set(m.assetClass,(assetClassMap.get(m.assetClass)||0)+m.volume24hUsd)})
  const assetClasses=[...assetClassMap].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value)

  const topMarkets=perps.filter(m=>m.volume24hUsd!==null).sort((a,b)=>(b.volume24hUsd||0)-(a.volume24hUsd||0)).slice(0,10).map(m=>({label:`${m.underlying} · ${m.venue}`,value:m.volume24hUsd as number}))
  const funding=perps.filter(m=>m.fundingRate!==null).sort((a,b)=>Math.abs(b.fundingRate||0)-Math.abs(a.fundingRate||0)).slice(0,10).map(m=>({label:m.underlying,value:(m.fundingRate||0)*100,venue:m.venue}))
  const tightSpreads=perps.map(m=>({m,s:spreadBp(m.bid,m.ask)})).filter(x=>x.s!==null&&Number.isFinite(x.s)).sort((a,b)=>(a.s||0)-(b.s||0)).slice(0,10).map(x=>({label:`${x.m.underlying} · ${x.m.venue}`,value:x.s||0}))

  const tokenVenues=[...new Set(tokenizedSpot.map(m=>m.venue))]
  const tokenVenueVolume=tokenVenues.map(venue=>({
    label:venue,
    value:sumKnown(tokenizedSpot.filter(m=>m.venue===venue).map(m=>m.volume24hUsd)),
  })).filter((v):v is {label:string;value:number}=>v.value!==null).sort((a,b)=>b.value-a.value)
  const tokenTopMarkets=tokenizedSpot.filter(m=>m.volume24hUsd!==null).sort((a,b)=>(b.volume24hUsd||0)-(a.volume24hUsd||0)).slice(0,10).map(m=>({label:`${m.underlying} · ${m.venue}`,value:m.volume24hUsd as number}))

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
        <div className="navGroup"><span>PRODUCT LAYERS</span><a className="selected" href="#overview">Overview</a><a href="#perps">TradFi Perps</a>{tokenizedSpot.length>0&&<a href="#tokenized-spot">Tokenized Spot</a>}<a className="disabled">Real Equity <em>private volume</em></a><a className="disabled">CFD / Broker <em>pending</em></a></div>
        <div className="navGroup"><span>MARKET STRUCTURE</span><a href="#volume">Volume</a><a href="#open-interest">Open Interest</a><a href="#funding">Funding</a><a href="#liquidity">Liquidity</a></div>
        <div className="navGroup"><span>RESEARCH</span><a className="disabled">Price Discovery <em>collecting</em></a><a className="disabled">Capital Flow <em>private</em></a><a href="#methodology">Data Coverage</a></div>
        <div className="coverageMini"><span>Mapped universe</span><strong>{data.liveVenues} venues · {data.liveInstruments} instruments</strong><small>Product layers are classified first and never blindly summed together.</small></div>
      </aside>

      <main className="content" id="overview">
        <section className="pageHead">
          <div><h1>TradFi on Crypto Exchanges</h1><p>Traditional-asset activity is separated into Real Equity, Tokenized Spot, TradFi Perps and CFD / Broker products before any aggregation. The main dashboard currently focuses on publicly verifiable venue data.</p></div>
          <div className="asOf"><span>LAST UPDATED</span><strong>{asOf} SGT</strong><small>Auto-refresh on request</small></div>
        </section>

        {data.errors.length>0&&<section className="dataNotice"><strong>Partial coverage</strong><span>{data.errors.join(' · ')}</span></section>}

        <section className="metricStrip">
          <div className="metricCell"><span>TradFi Perps 24H Volume</span><strong>{perpsVolume===null?'—':usd(perpsVolume)}</strong><small>Perpetual/futures layer only</small></div>
          <div className="metricCell"><span>TradFi Perps Open Interest</span><strong>{perpsOi===null?'—':usd(perpsOi)}</strong><small>Perpetual/futures layer only</small></div>
          <div className="metricCell"><span>TradFi Perp Instruments</span><strong>{perps.length.toLocaleString()}</strong><small>Explicitly mapped contracts</small></div>
          <div className="metricCell"><span>TradFi Perp Venues</span><strong>{perpsVenues.length} <b>venues</b></strong><small>No Real Equity / Tokenized Spot / CFD mixing</small></div>
        </section>

        <div className="sectionBar" id="perps"><div><h2>TradFi Perps</h2></div><small>Stocks · ETFs · indices · commodities · FX · bonds · pre-IPO, kept within the derivatives layer</small></div>
        <section className="chartGrid" id="volume">
          <ChartCard title="24H TradFi Perps Volume by Exchange" context="ROLLING 24H" source="Exact venue-reported quote/notional turnover only · no spot/CFD/real-equity volume included" id="venue"><VenueBarChart data={venueVolume}/></ChartCard>
          <ChartCard title="Largest TradFi Perp Markets by 24H Volume" context="TOP 10" source="Perpetual/futures contracts only"><HorizontalRanking data={topMarkets} limit={10}/></ChartCard>
          <ChartCard title="TradFi Perps Volume by Asset Class" context="ROLLING 24H" source="Asset class is a second-level dimension inside the TradFi Perps product layer"><ProductDonut data={assetClasses}/></ChartCard>
          <ChartCard title="TradFi Perps Open Interest by Exchange" context="CURRENT" source="Perpetual/futures OI only · venue OI USD or normalized contract/base quantity" id="open-interest"><VenueBarChart data={venueOi}/></ChartCard>
        </section>

        <div className="sectionBar"><div><h2>Market structure</h2></div><small>TradFi Perps only · live snapshot · no historical backfill</small></div>
        <section className="chartGrid">
          <ChartCard title="Most Extreme TradFi Perp Funding Rates" context="CURRENT" source="Perpetual products only; unsupported venues remain blank" id="funding"><FundingChart data={funding}/></ChartCard>
          <ChartCard title="Tightest TradFi Perp Top-of-Book Spreads" context="TOP 10" source="Perpetual products only · best bid / ask, not full depth" id="liquidity"><HorizontalRanking data={tightSpreads} unit="bp" limit={10}/></ChartCard>
        </section>

        {tokenVenueVolume.length>0&&<>
          <div className="sectionBar" id="tokenized-spot"><div><h2>Tokenized Spot</h2></div><small>Separate product layer · tokenized stocks / ETFs only</small></div>
          <section className="chartGrid">
            <ChartCard title="24H Tokenized Spot Volume by Exchange" context="ROLLING 24H" source="Tokenized spot turnover only · no perpetual volume included"><VenueBarChart data={tokenVenueVolume}/></ChartCard>
            <ChartCard title="Largest Tokenized Spot Markets by 24H Volume" context="TOP 10" source="Tokenized stocks / ETFs only"><HorizontalRanking data={tokenTopMarkets} limit={10}/></ChartCard>
          </section>
        </>}

        <section className="marketSection" id="markets">
          <div className="sectionBar tableTitle"><div><h2>TradFi instruments</h2></div><small>{data.markets.length} mapped instruments · each row carries a product layer and asset class</small></div>
          <div className="tableWrap"><table><thead><tr><th>Instrument</th><th>Venue</th><th>Layer</th><th>Asset Class</th><th>Product</th><th>Last</th><th>24H</th><th>24H Volume</th><th>Open Interest</th><th>Funding</th><th>Spread</th></tr></thead><tbody>{data.markets.slice(0,80).map(m=>{const s=spreadBp(m.bid,m.ask);return <tr key={`${m.venue}-${m.symbol}-${m.product}`}><td><strong>{m.underlying}</strong><small>{m.symbol}</small></td><td>{m.venue}</td><td>{m.productLayer||'Unclassified'}</td><td>{m.assetClass}</td><td><span className="productTag">{m.product}</span></td><td>{price(m.lastPrice)}</td><td className={m.change24h===null?'':m.change24h>=0?'positiveText':'negativeText'}>{pct(m.change24h)}</td><td>{m.volume24hUsd===null?'—':usd(m.volume24hUsd)}</td><td>{m.openInterestUsd===null?'—':usd(m.openInterestUsd)}</td><td className={m.fundingRate===null?'':m.fundingRate>=0?'negativeText':'positiveText'}>{pct(m.fundingRate)}</td><td>{s===null?'—':`${s.toFixed(s<10?1:0)} bp`}</td></tr>})}</tbody></table></div>
        </section>

        <section className="methodology" id="methodology">
          <details>
            <summary className="methodHead" style={{cursor:'pointer',listStyle:'none',marginBottom:0}}>
              <div><h2>Coverage & methodology</h2><p style={{marginBottom:0}}>Four-layer product taxonomy, public-data coverage, source limitations and unavailable metrics.</p></div>
              <div className="methodStat"><strong>{coverageLive}/{data.coverage.length}</strong><span>metrics live · click to expand</span></div>
            </summary>
            <div className="coverageTable" style={{marginTop:16}}><div className="coverageRow coverageHeader"><span>Metric</span><span>Status</span><span>Source / limitation</span></div>{data.coverage.map(c=><div className="coverageRow" key={c.metric}><strong>{c.metric}</strong><span><i className={`statusDot ${c.status.toLowerCase()}`}/>{c.status}</span><p>{c.note}<small>{c.source}</small></p></div>)}</div>
          </details>
        </section>

        <footer className="pageFooter"><strong>DuoData</strong><span>Independent market intelligence for TradFi on crypto exchanges.</span><span>V0.6 · Four-layer taxonomy · Public-data-only policy</span></footer>
      </main>
    </div>
  </div>
}
