import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {Script} from 'node:vm';
import {charlotteBundledCaptureCode,makeManagedBrowser} from '../lib/live/managed-browser.mjs';
import {floridaLookup} from '../lib/live/florida.mjs';
const assessorUrl='https://www.ccappraiser.com/Show_parcel.asp?acct=412306353004&gen=T&tax=T&bld=T&oth=T&sal=T&lnd=T&leg=T';
const token=btoa('charlotte:real_estate:parents:fdd52189-e509-11eb-954b-00505681cba7');
const collectorUrl='https://county-taxes.net/charlotte/property-tax/'+token;
const iframe='https://county-taxes.net/iframe-taxsys/charlotte.county-taxes.com/govhub/property-tax/'+token;
// Minimal test markup uses values independently recorded by the real collector.
const collectorHtml='<h1>Account # 412306353004</h1><div class="owner">CITY OF PUNTA GORDA</div><div id="bill-history"><table class="bills"><tbody><tr class="regular"><th class="description"><a>2025 Annual bill</a></th><td class="status"><span class="label">No Balance Due</span></td><td class="balance">$0.00</td></tr></tbody><tfoot><tr><th>Total amount due</th><td class="balance">$0.00</td></tr></tfoot></table></div>';
test('Charlotte blocked assessor and collector share one fresh capture without saved-source fallback',async()=>{
 const assessorHtml=await readFile(new URL('./fixtures/phase-one/charlotte-certified-20261012.html',import.meta.url),'utf8');
 const config=JSON.parse((await readFile(new URL('./fixtures/phase-one/collectors-taxsys-public-config-fixture.json',import.meta.url),'utf8')).replaceAll('broward','charlotte'));
 config['/payhub/data-pub/settings/charlotte/charlotte/taxsys/taxsysClientId/value']='charlotte';
 let releaseAssessor,captures=0;
 const blockedAssessor=new Promise(resolve=>{releaseAssessor=()=>resolve(new Response('denied',{status:403}));});
 const r=await floridaLookup({county:'charlotte-fl',parcel_id:'412306353004',include_pdf:false},async url=>{
  if(url===assessorUrl)return blockedAssessor;
  if(url.includes('config.grantstreet.com'))return Response.json(config);
  if(url.includes('algolia.net'))return Response.json({results:[{nbHits:1,hits:[{external_id:'412306353004',objectID:'/Taxsys-GovHub/v0/items/charlotte:real_estate:parents:fdd52189-e509-11eb-954b-00505681cba7'}]}]});
  return new Response('denied',{status:403});
 },{managedBrowser:async args=>{
  captures++;assert.equal(args.url,collectorUrl);assert.equal(args.assessmentUrl,assessorUrl);
  releaseAssessor();return {url:iframe,html:collectorHtml,pdf:null,assessment:{url:assessorUrl,html:assessorHtml}};
 }});
 assert.equal(captures,1);assert.equal(r.status,'succeeded');assert.deepEqual(r.errors,[]);
 assert.equal(r.assessment.year_status,'Certified');assert.equal(r.assessment.assessed_total,'5317274');
 assert.equal(r.join.collector_account_id,'412306353004');assert.equal(r.taxes.summary.balance_due,'0.00');
 assert.equal(r.sources.find(s=>s.id==='assessment_county').method,'BROWSER');
});
test('Charlotte bundled script compiles and arbitrary assessor references are rejected before charging',async()=>{
 const code=charlotteBundledCaptureCode(collectorUrl,assessorUrl,true);new Script('(async()=>{'+code+'})');
 assert.ok(code.indexOf(assessorUrl)<code.indexOf(collectorUrl));assert.match(code,/assessment_error/);
 const browser=makeManagedBrowser({DB:{},INVISIA_BROWSER_ENABLED:'1',INVISIA_BROWSER_API_KEY:'TEST_ONLY'});
 for(const assessmentUrl of ['https://example.com/','http://www.ccappraiser.com/Show_parcel.asp?acct=412306353004',assessorUrl+'&redirect=x'])await assert.rejects(()=>browser({url:collectorUrl,county:'charlotte-fl',includePdf:false,assessmentUrl}),e=>e.code==='source_url_rejected');
 await assert.rejects(()=>browser({url:collectorUrl,county:'pinellas-fl',assessmentUrl:assessorUrl}),e=>e.code==='source_url_rejected');
});
