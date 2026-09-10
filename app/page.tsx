import { getSnapshot } from '@/lib/market'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const usd = (n: number) => {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

const price = (n: number) => n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : n.toLocaleString('en-US', { maximumFractionDigits: 4 })
const pct = (n: number | null, scale = 100) => n === null ? '—' : `${n >= 0 ? '+' : ''}${(n * scale).toFixed(3)}%`

function BarList({ rows, valueKey }: { rows: { label: string; value: number; sub?: string }[]; valueKey: string }) {
  const max = Math.max(...rows.map(r => r.value), 1)
  return <div className="bars" data-key={valueKey}>
    {rows.map(r => <div className="barRow" key={r.label}>
      <div className="barMeta"><span>{r.label}</span><strong>{usd(r.value)}</strong></div>
      <div className="track"><div className="fill" style={{ width: `${Math.max(2, r.value / max * 100)}%` }} /></div>
      {r.sub && <div className="barSub">{r.sub}</div>}
    </div>)}
  </div>
}

export default async function Home() {
  const data = await getSnapshot()
  const venueVolume = data.venues.map(v => ({ label: v.venue, value: v.volume24hUsd, sub: `${v.instruments} live instruments` }))
  const venueOi = data.venues.map(v => ({ label: v.venue, value: v.openInterestUsd, sub: `median funding ${pct(v.fundingMedian)}` }))
  const productMap = new Map<string, number>()
  data.markets.forEach(m => productMap.set(m.product, (productMap.get(m.product) || 0) + m.volume24hUsd))
  const products = [...productMap].map(([label, value]) => ({ label, value })).sort((a,b) => b.value-a.value)
  const funding = data.markets.filter(m => m.fundingRate !== null).sort((a,b) => Math.abs(b.fundingRate || 0) - Math.abs(a.fundingRate || 0)).slice(0, 8)

  return <main>
    <header className="topbar">
      <div className="brand"><span className="duoMark">D</span><span>DUO DATA</span></div>
      <nav><a className="active">Overview</a><a href="#markets">Markets</a><a href="#funding">Funding</a><a href="#coverage">Data Coverage</a></nav>
      <div className="live"><i /> LIVE</div>
    </header>

    <section className="hero shell">
      <div>
        <div className="eyebrow">CRYPTO EXCHANGES × TRADFI</div>
        <h1>TradFi Market Intelligence</h1>
        <p>Real market data for traditional assets traded on crypto-native venues. No synthetic backfills. No estimated exchange data.</p>
      </div>
      <div className="timestamp">Updated {new Date(data.asOf).toLocaleString('en-GB', { timeZone: 'Asia/Singapore', hour12: false })} SGT</div>
    </section>

    {data.errors.length > 0 && <section className="shell alert"><strong>Partial data</strong>{data.errors.map(e => <span key={e}>{e}</span>)}</section>}

    <section className="metrics shell">
      <div className="metric"><span>24H TradFi Volume</span><strong>{usd(data.totalVolume24hUsd)}</strong><small>public exchange turnover</small></div>
      <div className="metric"><span>Open Interest</span><strong>{usd(data.totalOpenInterestUsd)}</strong><small>USD notional where available</small></div>
      <div className="metric"><span>Live Instruments</span><strong>{data.liveInstruments}</strong><small>explicit TradFi / RWA metadata</small></div>
      <div className="metric"><span>Live Venues</span><strong>{data.liveVenues}</strong><small>Bybit · Bitget in V0.1</small></div>
    </section>

    <section className="grid shell">
      <article className="card"><div className="cardHead"><div><span className="kicker">VOLUME</span><h2>24H TradFi Volume by Exchange</h2></div><span className="tag">LIVE</span></div><BarList rows={venueVolume} valueKey="venue-volume"/><footer>Source: exchange public REST APIs · rolling 24h quote turnover</footer></article>
      <article className="card"><div className="cardHead"><div><span className="kicker">OPEN INTEREST</span><h2>TradFi Open Interest by Exchange</h2></div><span className="tag">LIVE</span></div><BarList rows={venueOi} valueKey="venue-oi"/><footer>Bybit OI value reported directly · Bitget size × mark price</footer></article>
      <article className="card"><div className="cardHead"><div><span className="kicker">PRODUCT MIX</span><h2>24H Volume by Product Type</h2></div><span className="tag">LIVE</span></div><BarList rows={products} valueKey="products"/><footer>Product types follow exchange metadata; categories are not merged across different legal wrappers.</footer></article>
      <article className="card" id="funding"><div className="cardHead"><div><span className="kicker">POSITIONING</span><h2>Largest Absolute Funding Rates</h2></div><span className="tag">LIVE</span></div><div className="rankList">{funding.map((m,i)=><div className="rank" key={`${m.venue}-${m.symbol}`}><span className="rankNo">{String(i+1).padStart(2,'0')}</span><div><strong>{m.underlying}</strong><small>{m.venue} · {m.product}</small></div><b className={(m.fundingRate||0)>=0?'pos':'neg'}>{pct(m.fundingRate)}</b></div>)}</div><footer>Current funding rate; settlement intervals may differ by instrument.</footer></article>
    </section>

    <section className="shell section" id="markets">
      <div className="sectionTitle"><div><span className="kicker">MARKETS</span><h2>Top TradFi Markets</h2></div><span>{data.markets.length} instruments detected</span></div>
      <div className="tableWrap"><table><thead><tr><th>Underlying</th><th>Venue</th><th>Product</th><th>Last</th><th>24H Change</th><th>24H Volume</th><th>Open Interest</th><th>Funding</th><th>Spread</th></tr></thead><tbody>
        {data.markets.slice(0, 30).map(m => {
          const spread = m.bid && m.ask && m.bid > 0 ? ((m.ask-m.bid)/((m.ask+m.bid)/2))*10000 : null
          return <tr key={`${m.venue}-${m.symbol}-${m.product}`}><td><strong>{m.underlying}</strong><small>{m.symbol}</small></td><td>{m.venue}</td><td>{m.product}</td><td>{price(m.lastPrice)}</td><td className={(m.change24h||0)>=0?'pos':'neg'}>{pct(m.change24h)}</td><td>{usd(m.volume24hUsd)}</td><td>{m.openInterestUsd===null?'—':usd(m.openInterestUsd)}</td><td className={(m.fundingRate||0)>=0?'pos':'neg'}>{pct(m.fundingRate)}</td><td>{spread===null?'—':`${spread.toFixed(1)} bp`}</td></tr>
        })}
      </tbody></table></div>
    </section>

    <section className="shell section" id="coverage">
      <div className="sectionTitle"><div><span className="kicker">METHODOLOGY</span><h2>Data Coverage Log</h2></div><span>No estimates used to fill missing data</span></div>
      <div className="coverageGrid">{data.coverage.map(c => <article className="coverage" key={c.metric}><div><span className={`status s-${c.status.toLowerCase()}`}>{c.status}</span><h3>{c.metric}</h3></div><p>{c.note}</p><small>{c.source}</small></article>)}</div>
    </section>

    <footer className="footer shell"><strong>DUO DATA</strong><span>TradFi on crypto exchanges · V0.1</span><span>Data shown only when retrievable from an identified source.</span></footer>
  </main>
}
