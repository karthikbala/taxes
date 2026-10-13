import {Worker,isMainThread} from 'node:worker_threads';
import {semaphore,documentLimits} from './transport.mjs';
import {pdfRuntime} from './pdf-context.mjs';
import {pythonExtraction} from './pdf-extract.mjs';
const one=semaphore();
const problem=(code,message)=>Object.assign(new Error(message),{code});
export {isMainThread};
function runWorker(data,signal){return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('../../workers/pdf-worker.mjs',import.meta.url),{workerData:data,resourceLimits:{maxOldGenerationSizeMb:768,maxYoungGenerationSizeMb:128},execArgv:[]});
 let settled=false;const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(value);};
 const abort=()=>done(problem('lookup_cancelled','Document processing cancelled.'));
 const timer=setTimeout(()=>done(problem('document_worker_timeout','Document worker exceeded its deadline.')),120000);
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 worker.once('message',message=>done(null,message));
 worker.once('error',()=>done(problem('document_worker_failed','Document worker failed.')));
 worker.once('exit',()=>{if(!settled)done(problem('document_worker_failed','Document worker exited before returning a result.'));});
});}
export function parseInWorker(kind,bytes,expectedId,expectedYear,{signal}={}){
 const runtime=pdfRuntime.getStore();signal??=runtime?.signal;
 if(bytes.length>documentLimits.bytes)return Promise.reject(problem('source_too_large','PDF exceeds 25 MiB.'));
 return one(async()=>{
  const data={kind,bytes:bytes.slice(),expectedId,expectedYear};let message=await runWorker(data,signal);
  if(message.fallback){
   // The main coordinator owns child processes so worker termination cannot orphan Python/OCR.
   const extraction=await pythonExtraction(bytes,{ocr:message.fallback.ocr,signal});
   runtime?.onDerived?.({...extraction,derived:true,original_format:'PDF'});
   message=await runWorker({...data,forcedExtraction:extraction},signal);
   if(!message.error&&extraction.method==='ocr')throw problem('document_ocr_review_required','OCR text is retained for review; identity and amounts require independent verification before acceptance.');
  }
  if(message.error)throw problem(message.error.code,message.error.message);
  return message.result;
 },signal);
}
