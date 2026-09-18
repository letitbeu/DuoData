'use client'

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Row={label:string;value:number;venue?:string}
type TimeRow={t:number;value:number}
const COLORS=['#2563EB','#F97316','#10B981','#7C3AED','#06B6D4','#F43F5E','#F59E0B','#6366F1']
const VENUE_COLORS:Record<string,string>={
  Binance:'#F59E0B', Bitget:'#14B8A6', Bybit:'#F97316', 'Coinbase INTX':'#2563EB',
  Kraken:'#7C3AED', OKX:'#111827', MEXC:'#3B82F6', Gate:'#EF4444'
}
const RESEARCH_COLORS={blue:'#2563EB',violet:'#7C3AED',orange:'#F97316',rose:'#F43F5E',cyan:'#06B6D4',emerald:'#10B981'} as const
const venueColor=(label:string)=>VENUE_COLORS[label]||'#64748B'

const usd=(n:number)=>Math.abs(n)>=1e9?`$${(n/1e9).toFixed(1)}B`:Math.abs(n)>=1e6?`$${(n/1e6).toFixed(1)}M`:Math.abs(n)>=1e3?`$${(n/1e3).toFixed(0)}K`:`$${n.toFixed(0)}`
const bp=(n:number)=>`${n.toFixed(Math.abs(n)<10?1:0)} bp`
const pct=(n:number)=>`${n>=0?'+':''}${n.toFixed(3)}%`
const month=(t:number)=>new Intl.DateTimeFormat('en-US',{month:'short',timeZone:'UTC'}).format(new Date(t))
const researchValue=(n:number,unit:'pct'|'bp'|'index')=>unit==='pct'?`${n>=0?'+':''}${n.toFixed(1)}%`:unit==='bp'?`${n.toFixed(1)} bp`:`${n.toFixed(0)}`

function Tip({active,payload,unit='usd'}:any){if(!active||!payload?.length)return null;const p=payload[0].payload;const v=Number(payload[0].value||0);return <div className="chartTooltip"><strong>{p.label}</strong>{p.venue&&<span>{p.venue}</span>}<b>{unit==='usd'?usd(v):unit==='bp'?bp(v):unit==='pct'?v.toFixed(1)+'%':pct(v)}</b></div>}

function ResearchTip({active,payload,unit}:any){if(!active||!payload?.length)return null;const p=payload[0].payload as TimeRow;const v=Number(payload[0].value||0);return <div className="chartTooltip"><strong>{new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(p.t))}</strong><b>{researchValue(v,unit)}</b></div>}

export function VenueBarChart({data,unit='usd'}:{data:Row[];unit?:'usd'|'bp'|'pct'}){if(!data.length)return <div className="emptyViz">No reliable data available</div>;return <div className="chartBox"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{top:12,right:10,left:2,bottom:4}} barCategoryGap="38%"><CartesianGrid vertical={false} stroke="#edf0f2"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#606770'}} dy={8}/><YAxis axisLine={false} tickLine={false} width={62} tick={{fontSize:10,fill:'#8b929a'}} tickFormatter={(v)=>unit==='usd'?usd(v):unit==='bp'?bp(v):`${Number(v).toFixed(0)}%`}/><Tooltip content={<Tip unit={unit}/>} cursor={{fill:'#f6f7f8'}}/><Bar dataKey="value" radius={[3,3,0,0]} maxBarSize={58}>{data.map((r,i)=><Cell key={i} fill={venueColor(r.label)}/>)}</Bar></BarChart></ResponsiveContainer></div>}

export function HorizontalRanking({data,unit='usd',limit=8}:{data:Row[];unit?:'usd'|'bp';limit?:number}){const rows=data.slice(0,limit).reverse();if(!rows.length)return <div className="emptyViz">No reliable data available</div>;return <div className="chartBox rankChart"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{top:6,right:62,left:8,bottom:2}} barCategoryGap="30%"><CartesianGrid horizontal={false} stroke="#edf0f2"/><XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize:10,fill:'#8b929a'}} tickFormatter={(v)=>unit==='usd'?usd(v):bp(v)}/><YAxis type="category" dataKey="label" axisLine={false} tickLine={false} width={90} tick={{fontSize:10,fill:'#59616a'}}/><Tooltip content={<Tip unit={unit}/>} cursor={{fill:'#f6f7f8'}}/><Bar dataKey="value" radius={[0,3,3,0]} maxBarSize={15}>{rows.map((_,i)=><Cell key={i} fill={COLORS[(rows.length-1-i)%COLORS.length]}/>)}</Bar></BarChart></ResponsiveContainer></div>}

export function ProductDonut({data}:{data:Row[]}){const rows=data.filter(d=>d.value>0);const total=rows.reduce((s,d)=>s+d.value,0);if(!rows.length)return <div className="emptyViz">No reliable data available</div>;return <div className="donutGrid"><div className="donutWrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rows} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={66} outerRadius={90} paddingAngle={1.5} stroke="none">{rows.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip content={<Tip unit="usd"/>}/></PieChart></ResponsiveContainer><div className="donutCenter"><span>Tracked</span><strong>{usd(total)}</strong><small>24H volume</small></div></div><div className="legendList">{rows.slice(0,6).map((d,i)=><div className="legendRow" key={d.label}><i style={{background:COLORS[i%COLORS.length]}}/><span>{d.label}</span><strong>{((d.value/total)*100).toFixed(1)}%</strong></div>)}</div></div>}

export function FundingChart({data,limit=10}:{data:Row[];limit?:number}){const rows=data.slice(0,limit).reverse();if(!rows.length)return <div className="emptyViz">No reliable data available</div>;const max=Math.max(...rows.map(r=>Math.abs(r.value)),.001);return <div className="chartBox rankChart"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{top:6,right:62,left:8,bottom:2}}><CartesianGrid horizontal={false} stroke="#edf0f2"/><XAxis type="number" domain={[-max,max]} axisLine={false} tickLine={false} tick={{fontSize:10,fill:'#8b929a'}} tickFormatter={pct}/><YAxis type="category" dataKey="label" axisLine={false} tickLine={false} width={90} tick={{fontSize:10,fill:'#59616a'}}/><ReferenceLine x={0} stroke="#b7bdc4"/><Tooltip content={<Tip unit="pct"/>} cursor={{fill:'#f6f7f8'}}/><Bar dataKey="value" radius={[2,2,2,2]} maxBarSize={14}>{rows.map((r,i)=><Cell key={i} fill={r.value>=0?'#F43F5E':'#10B981'}/>)}</Bar></BarChart></ResponsiveContainer></div>}

export function ResearchLineChart({data,unit,zeroLine=false,stressLine=false,tone='blue'}:{data:TimeRow[];unit:'pct'|'bp'|'index';zeroLine?:boolean;stressLine?:boolean;tone?:keyof typeof RESEARCH_COLORS}){
  if(!data.length)return <div className="emptyViz">No reliable 2026 history available</div>
  const start=Date.UTC(2026,0,1)
  const end=Date.now()
  const values=data.map(d=>d.value)
  let min=Math.min(...values),max=Math.max(...values)
  if(unit==='index'){min=0;max=100}
  else {const pad=Math.max((max-min)*.14,unit==='bp'?1:3);min-=pad;max+=pad;if(zeroLine){min=Math.min(min,0);max=Math.max(max,0)}}
  const gradId=`duo-${tone}-area`
  return <div className="chartBox"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{top:12,right:14,left:2,bottom:4}}><defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={RESEARCH_COLORS[tone]} stopOpacity={0.24}/><stop offset="75%" stopColor={RESEARCH_COLORS[tone]} stopOpacity={0.05}/><stop offset="100%" stopColor={RESEARCH_COLORS[tone]} stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0f2"/><XAxis type="number" dataKey="t" domain={[start,end]} scale="time" axisLine={false} tickLine={false} tick={{fontSize:10,fill:'#8b929a'}} tickFormatter={month} tickCount={9}/><YAxis domain={[min,max]} axisLine={false} tickLine={false} width={62} tick={{fontSize:10,fill:'#8b929a'}} tickFormatter={(v)=>researchValue(Number(v),unit)}/>{zeroLine&&<ReferenceLine y={0} stroke="#b8bec5" strokeDasharray="3 3"/>}{stressLine&&<ReferenceLine y={80} stroke="#b8bec5" strokeDasharray="3 3"/>}<Tooltip content={<ResearchTip unit={unit}/>} cursor={{stroke:'#d9dee3'}}/><Area type="monotone" dataKey="value" stroke={RESEARCH_COLORS[tone]} strokeWidth={2.5} fill={`url(#${gradId})`} dot={false} activeDot={{r:4,strokeWidth:2,fill:'#fff',stroke:RESEARCH_COLORS[tone]}} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div>
}
