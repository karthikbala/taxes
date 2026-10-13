import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLocalBrowser,browserRequestAllowed} from '../server/local-browser.mjs';
import {approvedSource} from '../lib/reliability/sources.mjs';
const url='https://county-taxes.net/iframe-taxsys/miamidade.county-taxes.com/govhub/property-tax/EXAMPLE';
const args={url,county:'miami-dade-fl',includePdf:false};
test('security-check assets load only from the exact dependency host and never become source evidence',()=>{
 const request=(url,type='script',parent={})=>({url:()=>url,resourceType:()=>type,frame:()=>({parentFrame:()=>parent})});
 const asset='https://challenges.cloudflare.com/turnstile/v0/api.js';
 assert.equal(browserRequestAllowed('miami-dade-fl',request(asset)),true);
 assert.equal(browserRequestAllowed('osceola-fl',request('https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/frame','document')),true);
 for(const [county,r]of [['miami-dade-fl',request(asset,'document',null)],['bradford-fl',request(asset)],['miami-dade-fl',request(asset.replace('https:','http:'))],['miami-dade-fl',request(asset.replace('challenges.cloudflare.com','challenges.cloudflare.com.evil.invalid'))],['miami-dade-fl',request('https://challenges.cloudflare.com/unreviewed')]])assert.equal(browserRequestAllowed(county,r),false);
 assert.throws(()=>approvedSource('miami-dade-fl',asset),e=>e.code==='source_url_rejected');
});
test('local recovery is disabled by default and rejects unreviewed sources before launching',async()=>{
 assert.equal(makeLocalBrowser({}),null);let launches=0;
 const run=makeLocalBrowser({TAXES_LOCAL_BROWSER_ENABLED:'1'},{loadChromium:async()=>{launches++;throw Error('must not launch');}});
 await assert.rejects(run({...args,url:'https://unreviewed.invalid'}),e=>e.code==='source_url_rejected');assert.equal(launches,0);
 assert.equal(await run({...args,profile:'unreviewed-profile'}),null);assert.equal(launches,0);
});
test('operator Chromium path preserves sandbox, TLS validation, host restrictions and cleanup',async()=>{
 let launched,options,closed=0,routeGuard;
 const locator={waitFor:async()=>{},first(){return this;},count:async()=>0};
 const frame={url:()=>url,locator:()=>locator,content:async()=>'<h1>Verified account</h1>'};
 const page={goto:async()=>{},frames:()=>[frame],url:()=>url};
 const browser={newContext:async opts=>{options=opts;return {route:async(_pattern,callback)=>{routeGuard=callback;},newPage:async()=>page};},close:async()=>{closed++;}};
 const run=makeLocalBrowser({TAXES_LOCAL_BROWSER_ENABLED:'1',TAXES_LOCAL_BROWSER_EXECUTABLE_PATH:'/opt/chromium/chrome'},{loadChromium:async()=>({launch:async opts=>{launched=opts;return browser;}})});
 const result=await run(args);assert.match(result.html,/Verified account/);assert.deepEqual(launched,{headless:true,chromiumSandbox:true,executablePath:'/opt/chromium/chrome'});assert.equal(options.ignoreHTTPSErrors,false);assert.equal(closed,1);
 let allowed=0,blocked=0;await routeGuard({request:()=>({url:()=>url}),continue:()=>allowed++,abort:()=>blocked++});await routeGuard({request:()=>({url:()=> 'https://unreviewed.invalid'}),continue:()=>allowed++,abort:()=>blocked++});assert.equal(allowed,1);assert.equal(blocked,1);
});
test('cancelled, elapsed and invalid-executable requests do not launch a browser',async()=>{
 let launches=0;const options={loadChromium:async()=>{launches++;throw Error('must not launch');}};
 const run=makeLocalBrowser({TAXES_LOCAL_BROWSER_ENABLED:'1'},options),ctl=new AbortController();ctl.abort();
 await assert.rejects(run({...args,signal:ctl.signal}),e=>e.code==='lookup_cancelled');
 await assert.rejects(run({...args,deadline:Date.now()-1}),e=>e.code==='lookup_deadline');
 await assert.rejects(makeLocalBrowser({TAXES_LOCAL_BROWSER_ENABLED:'1',TAXES_LOCAL_BROWSER_EXECUTABLE_PATH:'relative/chrome'},options)(args),e=>e.code==='local_browser_unavailable');assert.equal(launches,0);
});
