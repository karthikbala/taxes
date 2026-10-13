import {LookupError} from './engine.mjs';

// A base64 line stays below 256 KiB, including its marker and newline.
// This 1.5 MB source takes eight transfers instead of roughly ninety.
export const pdfChunkSize = 196596;
export const pdfChunkCode = (sourceUrl, offset, count) => `await (async()=>{
const f=page.frames().find(f=>f.url()===${JSON.stringify(sourceUrl)})||(page.url()===${JSON.stringify(sourceUrl)}?page:null);
if(!f)throw new Error('DOCUMENT_FRAME_MISSING');
const part=await f.evaluate(({offset,count})=>{const bytes=window.__invisiaPdfBytes;if(!(bytes instanceof Uint8Array)||offset+count>bytes.length)throw new Error('DOCUMENT_BYTES_MISSING');const b=bytes.subarray(offset,offset+count);let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);},{offset:${offset},count:${count}});
console.log('INVISIA_PDF='+part);})();`;

export async function readManagedPdf({sourceUrl,size,sha256,signal,deadline=Infinity},execute){
 if(!Number.isInteger(size)||size<5||size>26214400||!/^[a-f0-9]{64}$/.test(sha256||''))throw new LookupError('managed_document_incomplete','Managed document size or source hash is missing.');
 const parts=[];let chunkSize=pdfChunkSize;
 const checkCancelled=()=>{if(signal?.aborted||Date.now()>=deadline)throw new LookupError('lookup_cancelled','Managed document transfer was canceled.');};
 for(let offset=0;offset<size;){
  checkCancelled();
  const count=Math.min(chunkSize,size-offset);
  const chunk=await execute({code:pdfChunkCode(sourceUrl,offset,count),language:'node'});
  checkCancelled();
  if(!chunk.success||chunk.killed||chunk.exitCode!==0)throw new LookupError('managed_document_incomplete','Managed document capture was incomplete.');
  const line=String(chunk.stdout||'').split('\n').filter(l=>l.startsWith('INVISIA_PDF=')).at(-1);
  // Some provider responses clip stdout without setting truncated. Repeat only
  // this read-only byte range, once at the smaller size, in the same session.
  const shortened=line&&line.length-'INVISIA_PDF='.length<4*Math.ceil(count/3);
  if((chunk.truncated||shortened)&&chunkSize===pdfChunkSize){chunkSize=98298;continue;}
  if(chunk.truncated||!line)throw new LookupError('managed_document_incomplete','Managed document capture was incomplete.');
  const base64=line.slice('INVISIA_PDF='.length);
  if(!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)||base64.length!==4*Math.ceil(count/3)||atob(base64).length!==count)throw new LookupError('managed_document_incomplete','Managed document chunk size differs after transfer.');
  parts.push(base64);offset+=count;
 }
 const base64=parts.join(''),bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
 checkCancelled();
 if(bytes.length!==size||new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-'||hash!==sha256)throw new LookupError('managed_document_incomplete','Managed document size, format or source hash differs after transfer.');
 return base64;
}
