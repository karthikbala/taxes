import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {extractPdf,tesseractExtraction,extractionContext} from '../lib/reliability/pdf-extract.mjs';
import {parseReceiptLayout} from '../lib/live/receipt-layout.mjs';
import {parseInWorker} from '../lib/reliability/pdf-pool.mjs';
import {pdfRuntime} from '../lib/reliability/pdf-context.mjs';

test('OCR TSV geometry, confidence, bounds and exact financial characters',()=>{
 const r=spawnSync(process.env.TAXES_PYTHON||'python3',['-I',new URL('./ocr-worker.test.py',import.meta.url).pathname],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});

test('OCR is opt-in, validates input and requires production containment',async()=>{
 const original={...process.env};
 try{
  delete process.env.TAXES_OCR_ENABLED;
  await assert.rejects(tesseractExtraction(new Uint8Array()),e=>e.code==='document_ocr_disabled');
  process.env.TAXES_OCR_ENABLED='1';
  await assert.rejects(tesseractExtraction(new TextEncoder().encode('html')),e=>e.code==='document_not_pdf');
  const bytes=new TextEncoder().encode('%PDF-');
  await assert.rejects(tesseractExtraction(bytes,{pages:[1,1]}),e=>e.code==='document_page_limit');
  await assert.rejects(tesseractExtraction(bytes,{pages:[0]}),e=>e.code==='document_page_limit');
  process.env.NODE_ENV='production';delete process.env.TAXES_OCR_CONTAINER_IMAGE;
  await assert.rejects(tesseractExtraction(bytes),e=>e.code==='document_worker_unavailable');
  process.env.TAXES_OCR_CONTAINER_IMAGE='unreviewed-image';
  await assert.rejects(tesseractExtraction(bytes),e=>e.code==='document_worker_unavailable');
 }finally{for(const k of Object.keys(process.env))if(!(k in original))delete process.env[k];Object.assign(process.env,original);}
});

test('source-derived scanned receipt validates parcel, year, payment row and status',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/client/allegheny-ocr-receipt-items.json',import.meta.url),'utf8'));
 const bytes=new Uint8Array(await readFile(new URL('./fixtures/receipt.pdf',import.meta.url)));
 const parse=(id='0002B00051000000',year=2026,forced=fixture)=>extractionContext.run({forced},()=>parseReceiptLayout(bytes,id,year));
 const result=await parse();assert.equal(result.fields.amount_paid,'957532.39');assert.equal(result.fields.payment_date,'03/27/2026');assert.equal(result.fields.status,'PAID');assert(result.field_provenance.amount_paid.ocr_confidence>0);
 await assert.rejects(parse('0002B00051999999'),e=>e.code==='document_identity_mismatch');
 await assert.rejects(parse('0002B00051000000',2025),e=>e.code==='document_identity_mismatch');
 await assert.rejects(parse(undefined,undefined,{...fixture,items:fixture.items.filter(i=>i.str!=='PAID')}),e=>e.code==='document_layout_changed');
 await assert.rejects(parse(undefined,undefined,{...fixture,items:[...fixture.items,fixture.items.find(i=>i.str==='03/27/2026')]}),e=>e.code==='document_layout_changed');
 await assert.rejects(parse(undefined,undefined,{...fixture,items:fixture.items.map(i=>i.str==='PAID'?{...i,y:i.y+20}:i)}),e=>e.code==='document_layout_changed');
});

test('hybrid fallback OCRs only textless pages, saves evidence before review, preserves identity guards',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'taxes-ocr-test-')),original={...process.env};
 const source=new Uint8Array(await readFile(new URL('./fixtures/client/miami-annual-reference.pdf',import.meta.url)));
 const embedded=await extractPdf(source),pdf=await PDFDocument.load(source);pdf.addPage([612,792]);const mixed=new Uint8Array(await pdf.save());
 try{
  const fake=join(dir,'python'),marker=join(dir,'calls.json');
  const output={items:[{str:'Scanned appendix',x:40,y:700,width:100,height:14,page:2,confidence:91}],pages:[{page:2,width:612,height:792}],totalPages:2,engine:'tesseract',engine_version:'test transport',method:'ocr',ocr_pages:[2],review_required:true};
  await writeFile(fake,`#!/usr/bin/python3\nimport sys,json\nfrom pathlib import Path\nsys.stdin.buffer.read()\nPath(${JSON.stringify(marker)}).write_text(json.dumps(sys.argv))\nprint(${JSON.stringify(JSON.stringify(output))})\n`,{mode:0o700});
  process.env.TAXES_OCR_ENABLED='1';process.env.TAXES_PYTHON=fake;delete process.env.TAXES_OCR_CONTAINER_IMAGE;process.env.NODE_ENV='test';
  const artifacts=[];
  const runtime={onDerived:async v=>{await new Promise(r=>setTimeout(r,5));artifacts.push(v);}};
  await assert.rejects(pdfRuntime.run(runtime,()=>parseInWorker('tax',mixed,'01-3231-052-0010',2025)),e=>e.code==='document_ocr_review_required');
  const args=JSON.parse(await readFile(marker,'utf8'));assert(args.includes('--pages=2'));
  assert.equal(artifacts.length,1);assert.equal(artifacts[0].review_required,true);assert.deepEqual(artifacts[0].embedded_pages,[1]);
  assert.deepEqual(artifacts[0].items.filter(i=>i.page===1).sort((a,b)=>a.x-b.x||a.y-b.y),embedded.items.sort((a,b)=>a.x-b.x||a.y-b.y));
  await assert.rejects(pdfRuntime.run(runtime,()=>parseInWorker('tax',mixed,'01-3231-052-9999',2025)),e=>e.code==='document_identity_mismatch');
  const regular=await parseInWorker('tax',source,'01-3231-052-0010',2025);assert.equal(regular.extraction.engine,'unpdf');assert.equal(regular.fields.amount_paid,'3007.15');
  assert.equal(artifacts.length,2); // Embedded-only control did not dispatch OCR.
 }finally{for(const k of Object.keys(process.env))if(!(k in original))delete process.env[k];Object.assign(process.env,original);await rm(dir,{recursive:true,force:true});}
});
