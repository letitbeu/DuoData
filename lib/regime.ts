import type { ResearchPoint, ResearchSeries } from './research'

export type RegimeName='Healthy Expansion'|'Overheated Expansion'|'Quiet / Reset'|'Stress Contraction'
export type RegimePoint={
  t:number
  expansion:number
  stress:number
  regime:RegimeName
  activity:number
  breadth:number
  dispersion:number
  funding:number
}
export type RegimeModel={
  points:RegimePoint[]
  current:RegimePoint|null
  previous30d:RegimePoint|null
}

const clamp=(x:number,min=-100,max=100)=>Math.max(min,Math.min(max,x))
const map=(xs:ResearchPoint[])=>new Map(xs.map(x=>[x.t,x.value]))

function percentile(window:number[],x:number){
  if(!window.length)return 50
  return window.filter(v=>v<=x).length/window.length*100
}
function ema(xs:number[],period=7){
  const a=2/(period+1)
  const out:number[]=[]
  xs.forEach((x,i)=>out.push(i?x*a+out[i-1]*(1-a):x))
  return out
}
function name(x:number,y:number):RegimeName{
  if(x>=0&&y<0)return 'Healthy Expansion'
  if(x>=0&&y>=0)return 'Overheated Expansion'
  if(x<0&&y<0)return 'Quiet / Reset'
  return 'Stress Contraction'
}

export function buildRegimeModel(r:ResearchSeries):RegimeModel{
  const activity=map(r.activityMomentum)
  const breadth=map(r.participationBreadth)
  const dispersion=map(r.priceDispersion)
  const funding=map(r.fundingStress)

  const dates=[...activity.keys()]
    .filter(t=>breadth.has(t)&&dispersion.has(t)&&funding.has(t))
    .sort((a,b)=>a-b)

  const raw=dates.map((t,i)=>{
    const a=activity.get(t)!
    const b=breadth.get(t)!
    const d=dispersion.get(t)!
    const f=funding.get(t)!

    // Activity is centered on 0 and softly bounded so early base effects cannot dominate.
    // +/-25% momentum maps to roughly +/-76 on this component.
    const activityComponent=Math.tanh(a/25)*100
    const breadthComponent=clamp((b-50)*2)

    // Dispersion uses only information available up to each date (no look-ahead).
    const trailing=dates.slice(Math.max(0,i-59),i+1)
      .map(x=>dispersion.get(x)!)
      .filter(Number.isFinite)
    const dispersionPct=trailing.length>=20?percentile(trailing,d):50
    const dispersionComponent=clamp((dispersionPct-50)*2)
    const fundingComponent=clamp((f-50)*2)

    return {
      t,
      expansion:clamp((activityComponent+breadthComponent)/2),
      stress:clamp((dispersionComponent+fundingComponent)/2),
      activity:a,breadth:b,dispersion:d,funding:f,
    }
  })

  const xEma=ema(raw.map(x=>x.expansion),7)
  const yEma=ema(raw.map(x=>x.stress),7)
  const points:RegimePoint[]=raw.map((x,i)=>({
    ...x,
    expansion:xEma[i],
    stress:yEma[i],
    regime:name(xEma[i],yEma[i]),
  }))

  const current=points.at(-1)??null
  const target=current?current.t-30*86400000:0
  const previous30d=current
    ? [...points].reverse().find(x=>x.t<=target)??points[0]??null
    : null

  return {points,current,previous30d}
}
