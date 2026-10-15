// Generates unverified planning slots. It performs no network or paid calls.
import {countyAdapters} from '../lib/live/county-adapters.mjs';
import {phaseOne} from '../lib/live/phase-one.mjs';
import {acceptanceCategories} from '../server/county-tracking.mjs';
import {requestedFields} from '../lib/reliability/parcel.mjs';
const matrix=Object.entries(countyAdapters).flatMap(([county,adapter])=>acceptanceCategories.map((category,index)=>({county,phase:phaseOne[county]?1:2,case:index+1,category,parcel_id:null,job_id:null,status:'NOT_VERIFIED',required_sections:Object.keys(requestedFields),candidate_seed:index===0?adapter.sample:null,seed_is_acceptance:false})));
console.log(JSON.stringify({generated_at:new Date().toISOString(),required:240,verified:0,cases:matrix},null,2));
