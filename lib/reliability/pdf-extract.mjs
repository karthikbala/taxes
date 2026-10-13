import {AsyncLocalStorage} from 'node:async_hooks';
import {getDocumentProxy,extractTextItems} from 'unpdf';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {documentLimits} from './transport.mjs';
export const extractionContext=new AsyncLocalStorage();
const problem=(code,message)=>Object.assign(new Error(message),{code});
export async function extractPdf(bytes){
 const context=extractionContext.getStore();
 if(context?.extraction)return context.extraction;
 const task=(async()=>{
  if(bytes.length>documentLimits.bytes)throw problem('source_too_large','PDF exceeds the 25 MiB processing limit.');
  if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw problem('document_not_pdf','Source did not return a PDF.');
  if(context?.forced)return context.forced;
  let pdf;
  try{
   pdf=await getDocumentProxy(bytes.slice(),{isEvalSupported:false});
   if(pdf.numPages>documentLimits.pages)throw problem('document_page_limit','PDF exceeds the 50-page processing limit.');
   const data=await extractTextItems(pdf),pages=[];
   for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i);pages.push({page:i,width:p.view[2]-p.view[0],height:p.view[3]-p.view[1]});}
   const items=data.items.flatMap((page,i)=>page.filter(t=>t.str.trim()).map(t=>({...t,page:i+1})));
   const missingPages=pages.filter(p=>!items.some(i=>i.page===p.page)).map(p=>p.page);
   if(missingPages.length)throw Object.assign(problem('document_needs_ocr','At least one PDF page has no extractable text.'),{missingPages,partialExtraction:{items,totalPages:pdf.numPages,pages,engine:'unpdf',engine_version:'1.8.1',method:'embedded_text'}});
   return {items,totalPages:pdf.numPages,pages,engine:'unpdf',engine_version:'1.8.1',method:'embedded_text'};
  }finally{await pdf?.loadingTask.destroy();}
 })();
 if(context)context.extraction=task;return task;
}
export function pythonExtraction(bytes,{ocr=false,python=process.env.TAXES_PYTHON||'python3',signal}={}){
 if(process.env.TAXES_PYMUPDF_LICENSE_APPROVED!=='1')return Promise.reject(problem('pdf_license_pending','PyMuPDF requires approved licensing before activation.'));
 return externalExtraction(bytes,{ocr,python,signal,image:process.env.TAXES_PDF_CONTAINER_IMAGE,scriptName:'pdf_extract.py',imageName:'taxes-pdf-worker',args:ocr?['--ocr']:[]});
}
export function tesseractExtraction(bytes,{pages,python=process.env.TAXES_PYTHON||'python3',signal}={}){
 if(process.env.TAXES_OCR_ENABLED!=='1')return Promise.reject(problem('document_ocr_disabled','Tesseract OCR is disabled.'));
 if(bytes.length>documentLimits.bytes)return Promise.reject(problem('source_too_large','PDF exceeds 25 MiB.'));
 if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')return Promise.reject(problem('document_not_pdf','Source did not return a PDF.'));
 if(pages&&(!Array.isArray(pages)||!pages.length||pages.length>documentLimits.pages||pages.some(p=>!Number.isInteger(p)||p<1||p>documentLimits.pages)||new Set(pages).size!==pages.length))return Promise.reject(problem('document_page_limit','Invalid OCR page selection.'));
 return externalExtraction(bytes,{ocr:true,python,signal,image:process.env.TAXES_OCR_CONTAINER_IMAGE,scriptName:'pdf_ocr.py',imageName:'taxes-ocr-worker',args:pages?['--pages='+pages.join(',')]:[]});
}
function externalExtraction(bytes,{ocr,python,signal,image,scriptName,imageName,args:extraArgs}){
 if(process.env.NODE_ENV==='production'&&!image)return Promise.reject(problem('document_worker_unavailable','Production Python extraction requires the isolated document container.'));
 if(image&&!new RegExp('^'+imageName+'(?:[:@][a-zA-Z0-9_.:-]+)?$').test(image))return Promise.reject(problem('document_worker_unavailable','Unreviewed PDF worker image.'));
 if(signal?.aborted)return Promise.reject(problem('lookup_cancelled','Document processing cancelled.'));
 return new Promise((resolve,reject)=>{
  const script=fileURLToPath(new URL('../../workers/'+scriptName,import.meta.url));
  const containerName='taxes-pdf-'+randomUUID();
  const args=image?['run','--name',containerName,'--rm','--network=none','--read-only','--memory=1g','--cpus=1','--pids-limit=64','--cap-drop=ALL','--security-opt=no-new-privileges','--tmpfs=/tmp:rw,noexec,nosuid,size=128m','-i',image,...extraArgs]:['-I',script,...extraArgs];
  const localConfig=Object.fromEntries(['TESSDATA_PREFIX','TAXES_TESSERACT','TAXES_PDFINFO','TAXES_PDFTOPPM'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  const child=spawn(image?'docker':python,args,{detached:true,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH||'/usr/bin:/bin',LANG:'C.UTF-8',OMP_THREAD_LIMIT:'1',...(image?{}:localConfig)}});
  let size=0,parts=[],settled=false;const done=async(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error){
   try{if(child.pid)process.kill(-child.pid,'SIGKILL');}catch{}
   if(image)await new Promise(finish=>{const cleanup=spawn('docker',['rm','-f',containerName],{stdio:'ignore'}),timeout=setTimeout(()=>{cleanup.kill('SIGKILL');finish();},20000);cleanup.once('error',()=>{clearTimeout(timeout);finish();});cleanup.once('close',()=>{clearTimeout(timeout);finish();});});
   reject(error);
  }else resolve(value);};
  const abort=()=>done(problem('lookup_cancelled','Document processing cancelled.'));
  const timer=setTimeout(()=>done(problem('document_worker_timeout','PDF worker exceeded its processing deadline.')),ocr?300000:120000);
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  child.on('error',()=>done(problem('document_worker_unavailable','Python PDF worker is unavailable.')));
  child.stderr.resume();child.stdin.on('error',()=>{});
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>32*1024*1024)return done(problem('document_worker_limit','PDF worker output exceeded its limit.'));parts.push(chunk);});
  child.on('close',code=>{if(settled)return;try{const parsed=JSON.parse(Buffer.concat(parts).toString());if(code!==0||parsed.error)throw problem(parsed.error||'document_worker_failed','Python PDF extraction failed.');if(!Array.isArray(parsed.items)||!parsed.items.length||parsed.totalPages>documentLimits.pages)throw problem('document_layout_changed','Python PDF extraction returned no usable bounded text.');done(null,parsed);}catch(e){done(e.code?e:problem('document_worker_failed','Invalid Python worker response.'));}});
  child.stdin.end(Buffer.from(bytes));
 });
}
