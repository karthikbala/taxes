import {extractPdf} from '../reliability/pdf-extract.mjs';
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export async function parseReceiptLayout(bytes,expectedId,expectedYear){
 const data=await extractPdf(bytes),items=data.items;
 if(!items.some(i=>/^OFFICIAL RECEIPT OF REAL ESTATE TAX PAYMENT$/i.test(i.str.trim())))fail('document_layout_changed','Official payment receipt heading is missing.');
 const parcel=items.find(i=>norm(i.str)===norm(expectedId));
 if(!parcel)fail('document_identity_mismatch','Receipt parcel differs from the request.');
 const labels=['Tax Year','Date of Payment','Amount of Tax','Status'];
 const headers=labels.map(label=>items.filter(i=>i.str.trim().toLowerCase()===label.toLowerCase()));
 if(headers.some(h=>h.length!==1))fail('document_layout_changed','Receipt payment table is absent or ambiguous.');
 const h=headers.map(h=>h[0]);
 if(h.some(i=>i.page!==h[0].page||Math.abs(i.y-h[0].y)>5)||h.some((i,n)=>n&&i.x<=h[n-1].x))fail('document_layout_changed','Receipt table columns do not align.');
 const patterns=[/^20\d{2}$/, /^\d{2}\/\d{2}\/20\d{2}$/, /^\$[\d,]+\.\d{2}$/, /^PAID$/i];
 const values=h.map((header,n)=>items.filter(i=>i.page===header.page&&i.y<header.y-5&&header.y-i.y<60&&i.x>=header.x-15&&i.x<(h[n+1]?.x??Infinity)-15&&patterns[n].test(i.str.trim())));
 if(values.some(v=>v.length!==1))fail('document_layout_changed','Receipt payment row is absent or ambiguous.');
 const row=values.map(v=>v[0]);
 if(Math.max(...row.map(i=>i.y))>=Math.min(...row.map(i=>i.y+i.height)))fail('document_layout_changed','Receipt payment cells do not belong to the same row.');
 if(Number(row[0].str)!==Number(expectedYear))fail('document_identity_mismatch','Receipt year differs from the request.');
 const fields={parcel_id:parcel.str,tax_year:Number(row[0].str),payment_date:row[1].str,amount_paid:row[2].str.replace(/[$,]/g,''),status:'PAID'};
 const origin=i=>({page:i.page,text:i.str,x:i.x,y:i.y,...(i.confidence!=null?{ocr_confidence:i.confidence}:{}),method:i.extraction_method||'embedded_text'});
 return {format:'PDF',doc_type:'payment_receipt',method:'Positioned receipt text extraction',page_count:data.totalPages,fields,field_provenance:{parcel_id:origin(parcel),tax_year:origin(row[0]),payment_date:origin(row[1]),amount_paid:origin(row[2]),status:origin(row[3])},source_id:'receipt_pdf'};
}
