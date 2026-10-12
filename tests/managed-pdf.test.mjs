import test from 'node:test';
import assert from 'node:assert/strict';
import {readManagedPdf,pdfChunkSize} from '../lib/live/managed-pdf.mjs';
const bytes=Buffer.alloc(1521372,37);bytes.write('%PDF-1.6');
const sha256=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
const args={sourceUrl:'https://county-taxes.net/iframe-taxsys/verified-account',size:bytes.length,sha256};
function transfer({truncateFirst=false,corrupt=false}={}){let calls=0;return {calls:()=>calls,execute:async({code})=>{calls++;const match=code.match(/offset:(\d+),count:(\d+)/);assert(match);const offset=Number(match[1]),count=Number(match[2]);assert(count<=pdfChunkSize);const data=Buffer.from(bytes.subarray(offset,offset+count));if(corrupt)data[0]^=1;const stdout='INVISIA_PDF='+data.toString('base64');assert(stdout.length+1<256*1024);return {success:true,exitCode:0,stdout,truncated:truncateFirst&&calls===1};}};}
test('1.5 MB original PDF is hash-verified in eight bounded transfers',async()=>{const t=transfer();assert.deepEqual(Buffer.from(await readManagedPdf(args,t.execute),'base64'),bytes);assert.equal(t.calls(),8);});
test('a smaller provider output ceiling reduces the chunk size once without losing bytes',async()=>{const t=transfer({truncateFirst:true});assert.deepEqual(Buffer.from(await readManagedPdf(args,t.execute),'base64'),bytes);assert.equal(t.calls(),17);});
test('corrupted, short and unsuccessful output cannot satisfy the document',async()=>{const t=transfer({corrupt:true});await assert.rejects(readManagedPdf(args,t.execute),e=>e.code==='managed_document_incomplete');for(const response of [{success:true,exitCode:0,stdout:'INVISIA_PDF=AA=='},{success:false,exitCode:1}])await assert.rejects(readManagedPdf(args,async()=>response),e=>e.code==='managed_document_incomplete');});
test('canceled transfers never dispatch another provider request',async()=>{let calls=0;const ctl=new AbortController();ctl.abort();await assert.rejects(readManagedPdf({...args,signal:ctl.signal},async()=>{calls++;}),e=>e.code==='lookup_cancelled');assert.equal(calls,0);});
