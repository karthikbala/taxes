import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from './app.mjs';
import {projectRoot} from '../scripts/build-selfhost.mjs';
export async function createServerHTTP({env=process.env,fetcher=fetch,logSink,staticRoot,deadlineMs,lookupClient,lookupLegacy,lookupNeighbors,dbFactory}={}){
 const runtime={...env};
 if(runtime.NODE_ENV==='production'&&!runtime.INVISIA_POC_API_KEY)throw new Error('INVISIA_POC_API_KEY is required in production.');
 let ownedDB;
 if(!runtime.DB){const createDatabase=dbFactory||(await import('./sqlite.mjs')).createSQLiteDB;ownedDB=createDatabase(resolve(runtime.TAXES_DB_PATH||resolve(projectRoot,'runtime/taxes.sqlite')));runtime.DB=ownedDB;}
 if(runtime.INVISIA_BROWSER_ENABLED==='1'){
  let budget;try{budget=await runtime.DB.prepare('SELECT limit_milli_usd,spent_milli_usd,reserved_milli_usd FROM scrape_budgets WHERE id=?').bind('florida-phase1-2026-10-07').first();}catch{}
  if(!budget){runtime.INVISIA_BROWSER_ENABLED='0';console.warn('Managed browser disabled: existing authorized budget ledger is missing. No budget was created.');}
 }
 const handler=createApp({env:runtime,fetcher,logSink,staticRoot,deadlineMs,lookupClient,lookupLegacy,lookupNeighbors});
 const server=createServer(async(req,res)=>{
  const ctl=new AbortController();req.on('aborted',()=>ctl.abort());res.on('close',()=>{if(!res.writableEnded)ctl.abort();});
  try{
   // Fixed local origin prevents client-controlled Host headers from becoming source URLs.
   const init={method:req.method,headers:req.headers,signal:ctl.signal};
   if(!['GET','HEAD'].includes(req.method)){init.body=req;init.duplex='half';}
   const request=new Request(new URL(req.url,'http://localhost'),init);
   const response=await handler(request);if(res.destroyed)return;
   res.writeHead(response.status,Object.fromEntries(response.headers.entries()));
   if(!response.body||req.method==='HEAD'){res.end();return;}
   const reader=response.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;if(res.destroyed){await reader.cancel();return;}if(!res.write(value))await new Promise(resolve=>{res.once('drain',resolve);res.once('close',resolve);});}}finally{reader.releaseLock();}res.end();
  }catch{if(!res.headersSent)res.writeHead(400,{'Content-Type':'application/json','Cache-Control':'no-store'});if(!res.destroyed)res.end(JSON.stringify({error:{code:'invalid_request',message:'Request could not be processed.'}}));}
 });
 server.requestTimeout=150000;server.headersTimeout=15000;server.keepAliveTimeout=5000;server.maxHeadersCount=100;
 server.waitForIdle=handler.waitForIdle;
 server.shutdownComplete=new Promise(resolve=>server.once('close',()=>{handler.waitForIdle().then(()=>{try{ownedDB?.close?.();}catch{console.error('SQLite close failed after backend cleanup.');}resolve();}).catch(()=>{console.error('Backend cleanup failed; database remains open.');resolve();});}));
 return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=await createServerHTTP();const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer from 1 to 65535.');
 server.listen(port,host,()=>console.log(JSON.stringify({event:'selfhost_listening',host,port})));
 let stopping=false;const stop=()=>{if(stopping)return;stopping=true;server.close();const grace=setTimeout(()=>server.closeAllConnections(),150000);grace.unref();server.shutdownComplete.then(()=>clearTimeout(grace));};process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
