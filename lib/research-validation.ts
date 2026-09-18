import type { ResearchPoint, ResearchSeries } from './research'

export type ValidationStatus='Supported'|'Indicative'|'No edge'|'Contradicted'|'Low sample'
export type ThresholdValidationRow={
  metric:string
  threshold:string
  hypothesis:string
  horizon7:{n:number;hitRate:number|null;ciLow:number|null;ciHigh:number|null}
  horizon30:{n:number;hitRate:number|null;ciLow:number|null;ciHigh:number|null}
  status:ValidationStatus
}
export type ResearchValidation={
  rows:ThresholdValidationRow[]
  start:number|null
  end:number|null
  observations:number
  methodology:string
}

type Direction='above'|'below'|'meanRevert'
type Rule={
  metric:string
  threshold:string
  hypothesis:string
  series:ResearchPoint[]
  active:(i:number)=>boolean
  hit:(entry:ResearchPoint,future:ResearchPoint)=>boolean
}

const DAY=86400000
const sorted=(xs:ResearchPoint[])=>[...xs].sort((a,b)=>a.t-b.t)

function percentile(xs:number[],x:number){
  if(!xs.length)return 50
  return xs.filter(v=>v<=x).length/xs.length*100
}
function wilson(hits:number,n:number){
  if(!n)return {low:null,high:null}
  const z=1.96,p=hits/n,z2=z*z
  const den=1+z2/n
  const centre=(p+z2/(2*n))/den
  const margin=z*Math.sqrt((p*(1-p)+z2/(4*n))/n)/den
  return {low:Math.max(0,centre-margin),high:Math.min(1,centre+margin)}
}
function nearestAtOrAfter(xs:ResearchPoint[],target:number,maxLagDays=3){
  const x=xs.find(p=>p.t>=target)
  return x&&x.t-target<=maxLagDays*DAY?x:null
}
function entryEvents(xs:ResearchPoint[],active:(i:number)=>boolean){
  const out:ResearchPoint[]=[]
  for(let i=0;i<xs.length;i++){
    if(!active(i))continue
    const prev=i>0&&active(i-1)
    if(!prev)out.push(xs[i])
  }
  return out
}
function evaluate(rule:Rule,days:number){
  const xs=sorted(rule.series)
  const events=entryEvents(xs,rule.active)
  let hits=0,n=0
  for(const entry of events){
    const future=nearestAtOrAfter(xs,entry.t+days*DAY)
    if(!future)continue
    n++
    if(rule.hit(entry,future))hits++
  }
  const ci=wilson(hits,n)
  return {n,hitRate:n?hits/n:null,ciLow:ci.low,ciHigh:ci.high}
}
function statusOf(x:{n:number;hitRate:number|null;ciLow:number|null;ciHigh:number|null}):ValidationStatus{
  if(x.n<8)return 'Low sample'
  if(x.ciLow!==null&&x.ciLow>0.5)return 'Supported'
  if(x.hitRate!==null&&x.hitRate>=0.60)return 'Indicative'
  if(x.ciHigh!==null&&x.ciHigh<0.5)return 'Contradicted'
  return 'No edge'
}

export function buildResearchValidation(r:ResearchSeries):ResearchValidation{
  const activity=sorted(r.activityMomentum)
  const breadth=sorted(r.participationBreadth)
  const funding=sorted(r.fundingStress)
  const dispersion=sorted(r.priceDispersion)

  const dispersionPct=dispersion.map((p,i)=>{
    const trailing=dispersion.slice(Math.max(0,i-59),i+1).map(x=>x.value)
    return {t:p.t,value:trailing.length>=20?percentile(trailing,p.value):50}
  })

  const rules:Rule[]=[
    {
      metric:'Activity Momentum',
      threshold:'≥ +10%',
      hypothesis:'Expansion persists: 7D/30D forward momentum remains > 0',
      series:activity,
      active:i=>activity[i].value>=10,
      hit:(_entry,future)=>future.value>0,
    },
    {
      metric:'Activity Momentum',
      threshold:'≤ −10%',
      hypothesis:'Contraction persists: 7D/30D forward momentum remains < 0',
      series:activity,
      active:i=>activity[i].value<=-10,
      hit:(_entry,future)=>future.value<0,
    },
    {
      metric:'Participation Breadth',
      threshold:'≥ 60',
      hypothesis:'Broad participation persists: forward breadth remains > 50',
      series:breadth,
      active:i=>breadth[i].value>=60,
      hit:(_entry,future)=>future.value>50,
    },
    {
      metric:'Participation Breadth',
      threshold:'≤ 40',
      hypothesis:'Narrow participation persists: forward breadth remains < 50',
      series:breadth,
      active:i=>breadth[i].value<=40,
      hit:(_entry,future)=>future.value<50,
    },
    {
      metric:'Funding Stress',
      threshold:'≥ 80th pct',
      hypothesis:'Crowding mean-reverts: forward stress is below entry level',
      series:funding,
      active:i=>funding[i].value>=80,
      hit:(entry,future)=>future.value<entry.value,
    },
    {
      metric:'Price Dispersion',
      threshold:'≥ trailing 80th pct',
      hypothesis:'Cross-venue dislocation mean-reverts: forward dispersion percentile is lower',
      series:dispersionPct,
      active:i=>dispersionPct[i].value>=80&&i>=19,
      hit:(entry,future)=>future.value<entry.value,
    },
  ]

  const rows=rules.map(rule=>{
    const horizon7=evaluate(rule,7)
    const horizon30=evaluate(rule,30)
    return {
      metric:rule.metric,
      threshold:rule.threshold,
      hypothesis:rule.hypothesis,
      horizon7,
      horizon30,
      status:statusOf(horizon7),
    }
  })

  const all=[...activity,...breadth,...funding,...dispersion]
  const dates=all.map(x=>x.t).filter(Number.isFinite)
  return {
    rows,
    start:dates.length?Math.min(...dates):null,
    end:dates.length?Math.max(...dates):null,
    observations:new Set(dates).size,
    methodology:'Event-based walk-forward validation. Only threshold-entry events are counted; consecutive days inside the same regime are not double-counted. 7D/30D outcomes use the first observation within three calendar days of the target horizon. Wilson 95% confidence intervals are reported; no synthetic backfill.',
  }
}
