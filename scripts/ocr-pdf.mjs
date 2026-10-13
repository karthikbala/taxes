import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {extractPdf,tesseractExtraction} from '../lib/reliability/pdf-extract.mjs';
import {documentLimits} from '../lib/reliability/transport.mjs';
export async function saveOcrEvidence(input,output){
 const source=resolve(input),dir=resolve(output),info=await stat(source);
 if(!info.isFile()||info.size>documentLimits.bytes)throw Object.assign(new Error('Input must be a PDF file no larger than 25 MiB.'),{code:'source_too_large'});
 const bytes=new Uint8Array(await readFile(source));let extraction;
 try{extraction=await extractPdf(bytes);}catch(e){
  if(e.code!=='document_needs_ocr')throw e;
  const ocr=await tesseractExtraction(bytes,{pages:e.missingPages});
  extraction={...ocr,items:[...e.partialExtraction.items,...ocr.items].sort((a,b)=>a.page-b.page||b.y-a.y||a.x-b.x),pages:e.partialExtraction.pages,embedded_engine:'unpdf',embedded_pages:e.partialExtraction.pages.filter(p=>!e.missingPages.includes(p.page)).map(p=>p.page)};
 }
 await mkdir(dir,{recursive:true,mode:0o700});
 const artifact={source_file:basename(source),source_sha256:createHash('sha256').update(bytes).digest('hex'),created_at:new Date().toISOString(),derived:true,review_required:extraction.method==='ocr',...extraction};
 await writeFile(resolve(dir,'extraction.json'),JSON.stringify(artifact,null,2),{mode:0o600});
 await writeFile(resolve(dir,'text.txt'),artifact.items.map(i=>`[Page ${i.page}] ${i.str}`).join('\n'),{mode:0o600});
 return {output:dir,engine:artifact.engine,method:artifact.method,pages:artifact.totalPages,review_required:artifact.review_required,quality:artifact.quality};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 if(process.argv.length!==4){console.error('Usage: TAXES_OCR_ENABLED=1 node scripts/ocr-pdf.mjs input.pdf output-directory');process.exitCode=1;}
 else try{console.log(JSON.stringify(await saveOcrEvidence(process.argv[2],process.argv[3])));}catch(e){console.error(JSON.stringify({error:e.code||'ocr_failed',message:e.message}));process.exitCode=1;}
}
