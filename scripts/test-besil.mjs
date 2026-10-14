import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export const besilPlan=JSON.parse(readFileSync(new URL('../docs/regression/besil-cases.json',import.meta.url),'utf8'));
export function selectBesilTests(county='all') {
 if(county!=='all'&&!Object.hasOwn(besilPlan.counties,county))throw Error('Choose all, miami-dade-fl, osceola-fl or bradford-fl.');
 const counties=county==='all'?Object.keys(besilPlan.counties):[county];
 const names=[...new Set([...besilPlan.shared_offline_tests,...counties.flatMap(id=>besilPlan.counties[id].offline_tests)])];
 return names.map(name=>{
  if(!/^[a-z0-9-]+\.test\.mjs$/.test(name)||!existsSync(new URL('../tests/'+name,import.meta.url)))throw Error('Missing or invalid regression test: '+name);
  return 'tests/'+name;
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 const args=process.argv.slice(2);let county='all',list=false;
 while(args.length){const arg=args.shift();if(arg==='--county'&&args.length)county=args.shift();else if(arg==='--list')list=true;else throw Error('Usage: npm run test:besil -- [--county COUNTY-ID] [--list]');}
 const tests=selectBesilTests(county);
 console.log(JSON.stringify({county,mode:'offline_only',cases:besilPlan.cases.filter(c=>county==='all'||c.input.county===county).map(c=>c.id),test_files:tests}));
 if(!list){
  const result=spawnSync(process.execPath,['--import',fileURLToPath(new URL('./test.mjs',import.meta.url)),'--test',...tests],{
   cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',
   env:{...process.env,INVISIA_OFFLINE_TEST_WORKER:'1',INVISIA_BROWSER_ENABLED:'0',INVISIA_BROWSER_API_KEY:'',INVISIA_POC_API_KEY:'',SCRAPEDO_API_KEY:''}
  });
  if(result.error)throw result.error;process.exitCode=result.status??1;
 }
}
