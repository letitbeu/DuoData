import { getSnapshot } from '../lib/market'
import { getResearchSeries } from '../lib/research'
import { buildResearchValidation } from '../lib/research-validation'

async function main(){
  const snap=await getSnapshot()
  const research=await getResearchSeries(snap.markets)
  const validation=buildResearchValidation(research)
  console.log('DUODATA_VALIDATION_START')
  console.log(JSON.stringify({
    asOf:snap.asOf,
    researchMeta:research.meta,
    validation
  },null,2))
  console.log('DUODATA_VALIDATION_END')
}
main().catch(e=>{console.error(e);process.exit(1)})
