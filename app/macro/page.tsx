import { getMacroSnapshot, macroPulse, type MacroRow } from '@/lib/macro'

export const dynamic='force-dynamic'
export const revalidate=0

const GROUPS=['US Treasury','Curvature','Credit Spread','DM Rates','Commodity','Equity','Currency']

const format=(r:MacroRow,v:number|null,latest=false)=>{
  if(v===null||!Number.isFinite(v))return '—'
  const d=r.decimals??1
  if(latest)return v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})
  const x=Math.abs(v)<.05?0:v
  return `${x>0?'+':''}${x.toFixed(['US Treasury','Curvature','Credit Spread','DM Rates'].includes(r.group)?0:1)}`
}
const unit=(group:string)=>['US Treasury','Curvature','Credit Spread','DM Rates'].includes(group)?'bps':'%'
const heat=(v:number|null,group:string)=>{
  if(v===null||!Number.isFinite(v))return ''
  const a=Math.abs(v),bps=unit(group)==='bps'
  const t1=bps?5:.75,t2=bps?15:3
  if(a<.00001)return 'macroHeatZero'
  if(v>0)return a>=t2?'macroHeatPos3':a>=t1?'macroHeatPos2':'macroHeatPos1'
  return a>=t2?'macroHeatNeg3':a>=t1?'macroHeatNeg2':'macroHeatNeg1'
}
const sourceUrl=(r:MacroRow)=>{
  if(r.group==='Curvature'){
    const pairs:Record<string,[string,string]>={'2y10y':['DGS2','DGS10'],'5y30y':['DGS5','DGS30'],'10y30y':['DGS10','DGS30']}
    const p=pairs[r.name]
    if(p)return `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${p[0]},${p[1]}`
  }
  if(r.group==='DM Rates'&&r.name==='Japan 20y')return 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv'
  if(r.id)return `https://fred.stlouisfed.org/series/${encodeURIComponent(r.id)}`
  if(r.symbol)return `https://finance.yahoo.com/quote/${encodeURIComponent(r.symbol)}`
  return null
}
const latest=(rows:MacroRow[],g:string,n:string)=>rows.find(r=>r.group===g&&r.name===n)?.latest??null
const change=(rows:MacroRow[],g:string,n:string,k:'d5'|'mtd'|'ytd')=>rows.find(r=>r.group===g&&r.name===n)?.[k]??null
const signed=(v:number|null,d=1,suffix='')=>v===null?'—':`${v>0?'+':''}${v.toFixed(d)}${suffix}`

function OwlLogo(){
  return <span className="mark owlMark" aria-label="DuoData logo"><svg viewBox="0 0 64 64" role="img" aria-hidden="true"><rect width="64" height="64" rx="13" fill="#151515"/><path d="M8 13 L25 27 L21 31 L6 18 Q4 15 6.5 12.5 Q8 11 10 13Z" fill="#fff"/><path d="M56 13 L39 27 L43 31 L58 18 Q60 15 57.5 12.5 Q56 11 54 13Z" fill="#fff"/><path d="M8 26 Q12 18 20 20 Q29 23 32 31 Q26 45 14 43 Q5 40 5 31 Q5 28 8 26Z" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M56 26 Q52 18 44 20 Q35 23 32 31 Q38 45 50 43 Q59 40 59 31 Q59 28 56 26Z" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 28 Q18 23 24 27 Q24 35 18 36 Q13 34 14 28Z" fill="#FFC83D"/><path d="M50 28 Q46 23 40 27 Q40 35 46 36 Q51 34 50 28Z" fill="#FFC83D"/><path d="M32 38 L38 45 L32 58 L26 45 Z" fill="#fff"/></svg></span>
}

function MacroTable({group,rows}:{group:string;rows:MacroRow[]}){
  const xs=rows.filter(r=>r.group===group)
  if(!xs.length)return null
  return <article className="macroPanel">
    <div className="macroPanelHead"><h2>{group}</h2><span>{unit(group)==='bps'?'changes in bp':'changes in %'}</span></div>
    <div className="macroTableWrap"><table className="macroTable"><thead><tr><th>Instrument</th><th>Latest</th><th>5D</th><th>MTD</th><th>YTD</th></tr></thead><tbody>{xs.map(r=>{
      const src=sourceUrl(r)
      return <tr key={`${group}-${r.name}`}><td>{src?<a href={src} target="_blank" rel="noreferrer"><strong>{r.name}</strong><small>{r.provider||'Public source'}</small></a>:<><strong>{r.name}</strong><small>{r.provider||'Public source'}</small></>}</td><td>{format(r,r.latest,true)}</td><td className={heat(r.d5,group)}>{format(r,r.d5)}</td><td className={heat(r.mtd,group)}>{format(r,r.mtd)}</td><td className={heat(r.ytd,group)}>{format(r,r.ytd)}</td></tr>
    })}</tbody></table></div>
    <span className="macroWatermark" aria-hidden="true">Duo Data</span>
  </article>
}

export default async function MacroPage(){
  const data=await getMacroSnapshot()
  const pulse=macroPulse(data.rows,'d5')
  const asOf=new Date(data.generatedAt).toLocaleString('en-GB',{timeZone:'Asia/Singapore',hour12:false,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
  const y10=latest(data.rows,'US Treasury','10y')
  const hy=latest(data.rows,'Credit Spread','US HY')
  const sp5=change(data.rows,'Equity','S&P 500','d5')
  const dxy5=change(data.rows,'Currency','USD Index','d5')
  const brent5=change(data.rows,'Commodity','Brent','d5')
  const btc5=change(data.rows,'Commodity','BTC','d5')
  const regime=`Liquidity is ${pulse.liquidity.state.toLowerCase()}, growth is ${pulse.growth.state.toLowerCase()}, inflation impulse is ${pulse.inflation.state.toLowerCase()}, and credit is ${pulse.credit.state.toLowerCase()}.`

  return <div className="appShell">
    <header className="globalHeader">
      <div className="wordmark"><OwlLogo/><div><strong>DuoData</strong><small>MARKET INTELLIGENCE</small></div></div>
      <nav className="globalNav"><a className="active" href="/#overview">Data</a><a href="/#markets">Markets</a><a href="/#methodology">Methodology</a></nav>
      <div className="liveState"><i/>Live public APIs</div>
    </header>

    <div className="terminal shell">
      <aside className="sideNav">
        <div className="navGroup"><span>DATA MODULES</span><a className="disabled">Market Overview <em>soon</em></a><a className="disabled">Crypto Markets <em>soon</em></a><a href="/#overview">TradFi on CEX</a><a className="disabled">Stablecoins <em>soon</em></a><a className="disabled">Tokenized Assets / RWA <em>soon</em></a><a className="disabled">On-chain <em>soon</em></a><a className="disabled">Exchanges <em>soon</em></a><a className="disabled">Derivatives <em>soon</em></a><a className="selected" href="/macro">Macro & Liquidity</a><a className="disabled">Prediction Markets <em>soon</em></a></div>
        <div className="navGroup"><span>MACRO MODULE</span><a href="#pulse">Daily Macro Pulse</a><a href="#rates">Rates & Credit</a><a href="#cross-asset">Cross-Asset Matrix</a><a href="#sources">Data Coverage</a></div>
        <div className="coverageMini"><span>Macro universe</span><strong>{data.rows.length} series · {data.failures.length} unavailable</strong><small>Yahoo Finance, FRED and Japan MOF. Missing series remain blank; no synthetic values.</small></div>
      </aside>

      <main className="content">
        <section className="pageHead">
          <div><h1>Macro & Liquidity</h1><p>Cross-asset macro conditions through rates, credit, equities, currencies and commodities. The module preserves the original macroenv data methodology while using DuoData's common product language and interface.</p></div>
          <div className="asOf"><span>LAST UPDATED</span><strong>{asOf} SGT</strong><small>5-minute server cache</small></div>
        </section>

        {data.failures.length>0&&<section className="dataNotice"><strong>Partial coverage</strong><span>{data.failures.slice(0,5).map(x=>x.name).join(' · ')}{data.failures.length>5?` · +${data.failures.length-5} more`:''}</span></section>}

        <section className="macroPulse" id="pulse">
          <div className="macroPulseLead"><span>DAILY MACRO PULSE</span><h2>{pulse.tone}</h2><p>{regime} The composite score is {pulse.score.toFixed(2)}.</p></div>
          <div className="macroDriver"><span>Liquidity / Financial Conditions</span><strong>{pulse.liquidity.state}</strong><small>score {pulse.liquidity.score.toFixed(1)}</small></div>
          <div className="macroDriver"><span>Growth / Earnings</span><strong>{pulse.growth.state}</strong><small>score {pulse.growth.score.toFixed(1)}</small></div>
          <div className="macroDriver"><span>Inflation / Commodities</span><strong>{pulse.inflation.state}</strong><small>score {pulse.inflation.score.toFixed(1)}</small></div>
          <div className="macroDriver"><span>Credit</span><strong>{pulse.credit.state}</strong><small>{hy===null?'HY unavailable':`US HY ${hy.toFixed(0)} bp`}</small></div>
        </section>

        <section className="metricStrip macroMetrics">
          <div className="metricCell"><span>US 10Y</span><strong>{y10===null?'—':`${y10.toFixed(2)}%`}</strong><small>FRED · latest</small></div>
          <div className="metricCell"><span>S&P 500 · 5D</span><strong>{signed(sp5,1,'%')}</strong><small>Yahoo Finance</small></div>
          <div className="metricCell"><span>DXY · 5D</span><strong>{signed(dxy5,1,'%')}</strong><small>Yahoo Finance</small></div>
          <div className="metricCell"><span>Brent · 5D</span><strong>{signed(brent5,1,'%')}</strong><small>Yahoo Finance</small></div>
          <div className="metricCell"><span>BTC · 5D</span><strong>{signed(btc5,1,'%')}</strong><small>Yahoo Finance</small></div>
        </section>

        <div className="sectionBar" id="rates"><div><h2>Rates & Credit</h2></div><small>Latest levels with 5D / MTD / YTD changes</small></div>
        <section className="macroGrid">
          {['US Treasury','Curvature','Credit Spread','DM Rates'].map(g=><MacroTable key={g} group={g} rows={data.rows}/>)}
        </section>

        <div className="sectionBar" id="cross-asset"><div><h2>Cross-Asset Macro Matrix</h2></div><small>Public market data · heat colors show direction and magnitude, not investment signals</small></div>
        <section className="macroGrid">
          {['Commodity','Equity','Currency'].map(g=><MacroTable key={g} group={g} rows={data.rows}/>)}
        </section>

        <section className="methodology" id="sources">
          <details>
            <summary className="methodHead" style={{cursor:'pointer',listStyle:'none',marginBottom:0}}>
              <div><h2>Coverage & methodology</h2><p style={{marginBottom:0}}>Ported from the macroenv engine. Yahoo Finance supplies market prices, FRED supplies U.S. rates/credit and developed-market yields, and Japan MOF supplies JGB 20Y. All changes are computed from observed historical points; unavailable sources stay blank.</p></div>
              <div className="methodStat"><strong>{data.rows.length-data.failures.length}/{data.rows.length}</strong><span>series live · click to expand</span></div>
            </summary>
            <div className="coverageTable" style={{marginTop:16}}>
              <div className="coverageRow coverageHeader"><span>Source</span><span>Status</span><span>Coverage</span></div>
              <div className="coverageRow"><strong>Yahoo Finance</strong><span><i className="statusDot live"/>LIVE</span><p>Global equities, FX, commodities and crypto benchmark prices.<small>1Y daily history · 5D / MTD / YTD changes</small></p></div>
              <div className="coverageRow"><strong>FRED</strong><span><i className="statusDot live"/>LIVE</span><p>U.S. Treasury yields, IG/HY credit spreads and selected developed-market sovereign yields.<small>Observed series only · no interpolation</small></p></div>
              <div className="coverageRow"><strong>Japan MOF</strong><span><i className="statusDot live"/>LIVE</span><p>20-year JGB historical yield series.<small>Official Ministry of Finance CSV</small></p></div>
            </div>
          </details>
        </section>

        <footer className="pageFooter"><strong>DuoData</strong><span>Macro & Liquidity · cross-asset market intelligence.</span><span>macroenv methodology integrated into DuoData</span></footer>
      </main>
    </div>
  </div>
}
