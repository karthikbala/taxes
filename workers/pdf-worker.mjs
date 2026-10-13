import {parentPort,workerData} from 'node:worker_threads';
import {parseTaxBillPdf,parsePalmNoticePdf} from '../lib/live/pdf-text.mjs';
import {parseClientBillPdf} from '../lib/client/bill.mjs';
import {extractPdf,extractionContext} from '../lib/reliability/pdf-extract.mjs';
const {kind,bytes,expectedId,expectedYear,forcedExtraction}=workerData;
const parse=()=>kind==='client'?parseClientBillPdf(bytes,expectedId,expectedYear):kind==='notice'?parsePalmNoticePdf(bytes,expectedId,expectedYear):parseTaxBillPdf(bytes,expectedId,expectedYear);
try{
 let extraction;
 const result=await extractionContext.run(forcedExtraction?{forced:forcedExtraction}:{},async()=>{extraction=await extractPdf(bytes);return parse();});
 result.extraction={engine:extraction.engine,engine_version:extraction.engine_version,method:extraction.method,pages:extraction.pages};
 parentPort.postMessage({result});
}catch(e){
 const fallback=!forcedExtraction&&['document_needs_ocr','document_layout_changed','InvalidPDFException','FormatError'].includes(e.code||e.name)&&process.env.TAXES_PYMUPDF_ENABLED==='1';
 parentPort.postMessage(fallback?{fallback:{ocr:e.code==='document_needs_ocr'}}:{error:{code:e.code||e.name||'document_parse_error',message:e.message}});
}
