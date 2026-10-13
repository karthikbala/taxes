import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {readFile} from 'node:fs/promises';
import {parseInWorker} from '../lib/reliability/pdf-pool.mjs';
import {pythonExtraction} from '../lib/reliability/pdf-extract.mjs';
import {documentLimits} from '../lib/reliability/transport.mjs';
test('document worker validates PDF signature and raises the configured page bound',async()=>{
 await assert.rejects(()=>parseInWorker('tax',new TextEncoder().encode('not a pdf'),'123',2025),e=>e.code==='document_not_pdf');
 const pdf=await PDFDocument.create();for(let i=0;i<51;i++)pdf.addPage();await assert.rejects(async()=>parseInWorker('tax',new Uint8Array(await pdf.save()),'123',2025),e=>e.code==='document_page_limit');
});
test('scanned-only fixture is explicit OCR-required when optional extraction is disabled',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage();const bytes=new Uint8Array(await pdf.save());await assert.rejects(()=>parseInWorker('tax',bytes,'123',2025),e=>e.code==='document_needs_ocr');
});
test('worker cancellation and byte limits do not return partial extracted values',async()=>{
 const ctl=new AbortController();ctl.abort();await assert.rejects(()=>parseInWorker('tax',new Uint8Array([37,80,68,70,45]),'123',2025,{signal:ctl.signal}),e=>e.code==='lookup_cancelled');
 await assert.rejects(()=>parseInWorker('tax',new Uint8Array(documentLimits.bytes+1),'123',2025),e=>e.code==='source_too_large');
});
test('PyMuPDF activation is license-gated independently of feature enablement',async()=>{
 const old=process.env.TAXES_PYMUPDF_LICENSE_APPROVED;delete process.env.TAXES_PYMUPDF_LICENSE_APPROVED;
 try{await assert.rejects(()=>pythonExtraction(new Uint8Array([37,80,68,70,45])),e=>e.code==='pdf_license_pending');}finally{if(old===undefined)delete process.env.TAXES_PYMUPDF_LICENSE_APPROVED;else process.env.TAXES_PYMUPDF_LICENSE_APPROVED=old;}
});
test('source-derived redemption retains worker engine metadata and original amount',async()=>{
 const bytes=new Uint8Array(await readFile(new URL('./fixtures/client/miami-512-redemption-source.pdf',import.meta.url)));
 const parsed=await parseInWorker('tax',bytes,'01-3231-067-0130',2025);assert.equal(parsed.fields.amount_due,'4085.87');assert.equal(parsed.extraction.engine,'unpdf');assert.equal(parsed.extraction.method,'embedded_text');assert(parsed.extraction.pages[0].height>0);
});
