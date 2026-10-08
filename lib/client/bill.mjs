import {getDocumentProxy, extractTextItems} from 'unpdf';
import {load} from 'cheerio';
import {parseTaxBillPdf} from '../live/pdf-text.mjs';

const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const numeric = v => { const s = clean(v).replace(/[$,\s]/g, ''); return /^-?\d+(?:\.\d+)?$/.test(s) ? s : null; };
// Decimal arithmetic avoids floating-point reconciliation errors.
const scaled = (v, places = 2) => { const s = numeric(v); if (s === null) return null; const [whole, fraction = ''] = s.replace(/^-/, '').split('.'); if (fraction.length > places) throw new Error('Unexpected decimal precision'); return BigInt((s.startsWith('-') ? '-' : '') + whole + fraction.padEnd(places, '0')); };
const decimal = (n, places = 2) => { const sign = n < 0n ? '-' : ''; const s = (n < 0n ? -n : n).toString().padStart(places + 1, '0'); return sign + s.slice(0, -places) + '.' + s.slice(-places); };
const money = v => { const n = scaled(v); return n === null ? null : '$' + decimal(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
const origin = i => i ? {source_id:'receipt_pdf', method:'positioned_pdf_text', page:i.page, text:i.str, x:Number(i.x.toFixed(2)), y:Number(i.y.toFixed(2))} : null;
const derived = (formula, inputs) => ({source_id:'receipt_pdf', method:'derived_decimal_calculation', formula, inputs});
const row = (items, i, tolerance = 3.5) => items.filter(t => t.page === i.page && Math.abs(t.y - i.y) <= tolerance).sort((a,b) => a.x - b.x);
function error(code, message) { return Object.assign(new Error(message), {code}); }

export async function parseClientBillPdf(bytes, expectedId, expectedYear) {
  // Reuse the established issuer-specific identity, receipt and total extraction.
  const basic = await parseTaxBillPdf(bytes, expectedId, expectedYear);
  const pdf = await getDocumentProxy(bytes.slice(), {isEvalSupported:false});
  try {
    const data = await extractTextItems(pdf);
    const items = data.items.flatMap((page,i) => page.filter(t => clean(t.str)).map(t => ({...t, str:clean(t.str), page:i+1})));
    return parseClientBillLayout(items,basic,expectedId,expectedYear);
  } finally { await pdf.loadingTask.destroy(); }
}

// Pure positioned-text stage; fixtures retain native extraction items, never manufacture a PDF.
export function parseClientBillLayout(items,basic,expectedId,expectedYear){
    const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    const f = basic.fields;
    const printedYear=items.filter(i=>/^20\d{2}(?:\s+(?:PAID\s+)?REAL ESTATE|$)/i.test(i.str.trim())).sort((a,b)=>a.page-b.page||b.y-a.y)[0]?.str.match(/^20\d{2}/)?.[0];
    if(!expectedId||norm(f.parcel_id)!==norm(expectedId)||!items.some(i=>norm(i.str)===norm(expectedId))||Number(f.tax_year)!==Number(expectedYear)||Number(printedYear)!==Number(expectedYear))throw error('document_identity_mismatch','Positioned PDF identity/year differs from the request.');
    const provenance = {};
    const section_status = {};
    const notes = [...basic.notes, 'Blank exemption areas do not establish that the parcel has no exemptions. Occupancy is not inferred from this document.'];
    const BillDetails = {taxYear:String(f.tax_year), folio:f.parcel_id, municipality:null, millCode:null, propertyAddress:null, mailingAddress:null, paidBy:null, receiptNumber:f.receipt_number ?? null, paidDate:f.payment_date ?? null, paidAmount:money(f.amount_paid)};
    for (const [key, source] of [['taxYear','tax_year'],['folio','parcel_id'],['receiptNumber','receipt_number'],['paidDate','payment_date'],['paidAmount','amount_paid']]) if (basic.field_provenance[source]) provenance['BillDetails.'+key] = {...basic.field_provenance[source], source_id:'receipt_pdf', method:'positioned_pdf_text'};
    const headerValue = pattern => {
      const label = items.find(i => pattern.test(i.str));
      if (!label) return null;
      const same = row(items,label).filter(i => i.x > label.x + label.width + 2 && !/NUMBER|CODE|DISTRICT|ESCROW|YEAR|TYPE/i.test(i.str));
      if (same.length && label.str.endsWith(':')) return same[0];
      return items.filter(i => i.page === label.page && i.y < label.y && label.y-i.y < 25 && i.x+i.width >= label.x-10 && i.x < label.x+label.width+20 && !/NUMBER|CODE|DISTRICT|ESCROW|YEAR|TYPE/i.test(i.str)).sort((a,b) => label.y-a.y-(label.y-b.y))[0] ?? null;
    };
    for (const [key, pattern] of [['municipality',/^MUNICIPALITY$/i],['millCode',/^(?:MILL CODE|MILLAGE CODE|TAX DISTRICT)$/i]]) { const i=headerValue(pattern); if(i){BillDetails[key]=i.str; provenance['BillDetails.'+key]=origin(i);} }
    const paidBy = items.find(i => /^Paid By$/i.test(i.str));
    for(const label of items.filter(i=>/^Paid By$/i.test(i.str))){const value=row(items,label).find(i=>i.x>label.x+label.width-10&&!/^Receipt|^\$|^\d/.test(i.str));if(value){BillDetails.paidBy=value.str;provenance['BillDetails.paidBy']=origin(value);break;}}
    if(BillDetails.receiptNumber===null)for(const label of items.filter(i=>/^Receipt\s*#$/i.test(i.str))){const value=row(items,label).find(i=>i.x>label.x+label.width+2&&/^[A-Za-z0-9-]+$/.test(i.str)&&!/^Paid$/i.test(i.str));if(value){BillDetails.receiptNumber=value.str;provenance['BillDetails.receiptNumber']=origin(value);break;}}
    for(const [key,pattern] of [['mailingAddress',/^MAILING ADDRESS:$/i],['propertyAddress',/^PROPERTY ADDRESS:$/i]]){
      const label=items.find(i=>pattern.test(i.str));
      if(!label)continue;
      // An inline collector remittance address is not the taxpayer mailing address.
      if(row(items,label).some(i=>i.x>label.x+label.width+2))continue;
      const tableBoundary=items.find(i=>i.page===label.page&&i.y<label.y&&/^TAXING AUTHORITY$/i.test(i.str));
      const block=items.filter(i=>i.page===label.page&&i.y<label.y&&label.y-i.y<50&&(!tableBoundary||i.y>tableBoundary.y+8)&&i.x>=label.x-5&&i.x<label.x+260).sort((a,b)=>b.y-a.y||a.x-b.x);
      if(block.length){BillDetails[key]=block.map(i=>i.str.replace(/,+$/, '')).join(', ');provenance['BillDetails.'+key]={source_id:'receipt_pdf',method:'positioned_pdf_text',items:block.map(origin)};}
    }
    const authorityHeader=items.find(i=>/^TAXING AUTHORITY$/i.test(i.str));
    let AdValoremMillage=[];
    if(authorityHeader){
      const headers = [
        ['assessedValue',/^ASSESSED VALUE$/i], ['millage',/^(?:MILLAGE RATE|MILLAGE|MILL RATE)$/i], ['taxableValue',/^TAXABLE VALUE$/i], ['taxesLevied',/^TAXES LEVIED$/i], ['exemptionValue',/^(?:EXEMPTION(?: AMOUNT)?|EXEMPTIONS VALUE)$/i]
      ].map(([key,re])=>({key,item:items.find(i=>i.page===authorityHeader.page&&Math.abs(i.y-authorityHeader.y)<5&&re.test(i.str))})).filter(h=>h.item).map(h=>({...h,center:h.item.x+h.item.width/2})).sort((a,b)=>a.center-b.center);
      const stop=items.filter(i=>i.page===authorityHeader.page&&i.y<authorityHeader.y&&/^(?:TOTAL MILLAGE|NON-AD VALOREM(?: ASSESSMENTS| TAXES)?|Total Ad Valorem Taxes)$/i.test(i.str)).sort((a,b)=>b.y-a.y)[0];
      const table=items.filter(i=>i.page===authorityHeader.page&&i.y<authorityHeader.y-4&&i.y>(stop?.y??authorityHeader.y-220)+3);
      const cells=(r,key)=>{const index=headers.findIndex(h=>h.key===key);if(index<0)return null;const numericCells=r.filter(i=>numeric(i.str)!==null).sort((a,b)=>a.x-b.x);if(numericCells.length===headers.length)return numericCells[index];const left=index? (headers[index-1].center+headers[index].center)/2:headers[index].center-45;const right=index+1<headers.length?(headers[index].center+headers[index+1].center)/2:Infinity;return r.find(i=>numeric(i.str)!==null&&i.x+i.width/2>=left&&i.x+i.width/2<right)??null;};
      const millageHeader=headers.find(h=>h.key==='millage');
      if(millageHeader&&['assessedValue','millage','taxableValue','taxesLevied'].every(key=>headers.some(h=>h.key===key))){
        const candidates=table.filter(i=>numeric(i.str)!==null&&/^\d+\.\d{3,5}$/.test(i.str)&&cells([i],'millage')===i).sort((a,b)=>b.y-a.y);
        const nameLimit=Math.min(...headers.map(h=>h.center))-45;
        const names=table.filter(i=>i.x<nameLimit&&numeric(i.str)===null&&!/^\d{3}[-.]/.test(i.str));
        const groups=names.filter(i=>!candidates.some(c=>Math.abs(c.y-i.y)<4));
        if(groups.length)provenance.authority_table_headings={source_id:'receipt_pdf',method:'positioned_pdf_text',note:'Printed table headings without numeric tax cells; retained as context, not invented tax rows.',items:groups.map(origin)};
        for(const m of candidates){const r=row(table,m);const authority=names.filter(i=>Math.abs(i.y-m.y)<4).sort((a,b)=>Math.abs(a.y-m.y)-Math.abs(b.y-m.y))[0];const av=cells(r,'assessedValue'),tv=cells(r,'taxableValue'),tax=cells(r,'taxesLevied'),ex=cells(r,'exemptionValue');if(!authority||!av||!tv||!tax)throw error('document_layout_changed','A printed authority row is incomplete.');const group=groups.filter(i=>i.y>m.y&&authority.x>=i.x+2).sort((a,b)=>a.y-b.y)[0];
          const index=AdValoremMillage.length;AdValoremMillage.push({group:group?.str??null,authority:authority.str,assessedValue:money(av.str),exemptionValue:ex?money(ex.str):null,taxableValue:money(tv.str),millage:numeric(m.str),taxesLevied:money(tax.str)});
          for(const[key,i]of [['group',group],['authority',authority],['assessedValue',av],['exemptionValue',ex],['taxableValue',tv],['millage',m],['taxesLevied',tax]])if(i)provenance[`AdValoremMillage[${index}].${key}`]=origin(i);
        }
      }
    }
    const AdValoremGroupTotals={};
    for(const item of AdValoremMillage){if(item.group!==null)AdValoremGroupTotals[item.group]=(AdValoremGroupTotals[item.group]??0n)+scaled(item.taxesLevied);}
    for(const[key,value]of Object.entries(AdValoremGroupTotals)){AdValoremGroupTotals[key]=money(decimal(value));provenance['AdValoremGroupTotals.'+key]=derived('Sum of printed taxesLevied for this printed group',AdValoremMillage.map((r,i)=>r.group===key?`AdValoremMillage[${i}].taxesLevied`:null).filter(Boolean));}
    const taxSum=AdValoremMillage.length?AdValoremMillage.reduce((sum,r)=>sum+scaled(r.taxesLevied),0n):null;
    const millageSum=AdValoremMillage.length?AdValoremMillage.reduce((sum,r)=>sum+scaled(r.millage,5),0n):null;
    const combined=f.combined_taxes_and_assessments===undefined?null:scaled(f.combined_taxes_and_assessments);
    const nonHeader=items.find(i=>/^LEVYING AUTHORITY$/i.test(i.str));
    let NonAdValorem=[];
    if(nonHeader){const amountHeader=items.find(i=>i.page===nonHeader.page&&Math.abs(i.y-nonHeader.y)<5&&/^AMOUNT$/i.test(i.str));const stop=items.filter(i=>i.page===nonHeader.page&&i.y<nonHeader.y&&/combined|total non.ad|NON-AD VALOREM ASSESSMENTS/i.test(i.str)).sort((a,b)=>b.y-a.y)[0];const table=items.filter(i=>i.page===nonHeader.page&&i.y<nonHeader.y-4&&i.y>(stop?.y??nonHeader.y-65)+3);if(amountHeader){for(const a of table.filter(i=>numeric(i.str)!==null&&i.x>=amountHeader.x-25)){const r=row(table,a);const name=r.filter(i=>i.x<amountHeader.x-100&&numeric(i.str)===null&&!/^\d{3}[-.]|^@\s*\d/.test(i.str));if(name.length){const index=NonAdValorem.length;const rate=r.find(i=>/^@\s*\d+(?:\.\d+)?$/.test(i.str));NonAdValorem.push({authority:name.map(i=>i.str).join(' '),amount:money(a.str),...(rate?{rate:numeric(rate.str.replace(/^@\s*/,'')),footageUnits:null,unitLabel:name.map(i=>i.str).join(' ').match(/Sq Ft/i)?.[0]??null}:{})});provenance[`NonAdValorem[${index}]`]={source_id:'receipt_pdf',method:'positioned_pdf_text',items:r.map(origin)};}}}}
    const nonSum=NonAdValorem.length?NonAdValorem.reduce((sum,r)=>sum+scaled(r.amount),0n):nonHeader&&taxSum!==null&&combined===taxSum?0n:null;
    const TaxAmounts={adValorem:taxSum===null?null:money(decimal(taxSum)),nonAdValorem:nonSum===null?null:money(decimal(nonSum)),totalDiscountable:null,totalTax:combined===null?null:money(decimal(combined))};
    if(taxSum!==null)provenance['TaxAmounts.adValorem']=derived('Sum of printed authority taxesLevied',AdValoremMillage.map((_,i)=>`AdValoremMillage[${i}].taxesLevied`));
    if(nonSum!==null)provenance['TaxAmounts.nonAdValorem']=derived(NonAdValorem.length?'Sum of printed non-ad valorem amounts':'Inspected empty non-ad valorem table; combined total minus authority sum equals zero',NonAdValorem.length?NonAdValorem.map((_,i)=>`NonAdValorem[${i}].amount`):['TaxAmounts.totalTax','TaxAmounts.adValorem']);
    if(basic.field_provenance.combined_taxes_and_assessments){provenance['TaxAmounts.totalTax']={...basic.field_provenance.combined_taxes_and_assessments,source_id:'receipt_pdf',method:'positioned_pdf_text'};provenance['PaymentDetails.combinedTaxesAndAssessments']=provenance['TaxAmounts.totalTax'];}
    const ParcelDetails={millageRate:millageSum===null?null:decimal(millageSum,5)};
    if(millageSum!==null)provenance['ParcelDetails.millageRate']=derived('Sum of printed authority millage rates',AdValoremMillage.map((_,i)=>`AdValoremMillage[${i}].millage`));
    const PaymentSchedule=[];
    for(const date of items.filter(i=>/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}, 20\d{2}$/i.test(i.str))){if(!items.some(i=>i.page===date.page&&/^If (?:Paid|Postmarked) By$|^AMOUNT IF PAID BY/i.test(i.str)))continue;const candidates=items.filter(i=>i.page===date.page&&/^\$/.test(i.str)&&numeric(i.str)!==null&&((Math.abs(i.y-date.y)<3&&i.x>date.x+date.width)||(date.y-i.y>0&&date.y-i.y<15&&Math.abs(i.x-date.x)<100))).sort((a,b)=>Math.abs(a.y-date.y)-Math.abs(b.y-date.y)||Math.abs(a.x-date.x)-Math.abs(b.x-date.x));const amount=candidates[0];if(amount&&!PaymentSchedule.some(r=>r.ifPaidBy===date.str&&r.pleasePay===money(amount.str))){const index=PaymentSchedule.length;PaymentSchedule.push({ifPaidBy:date.str,pleasePay:money(amount.str)});provenance[`PaymentDetails.PaymentSchedule[${index}]`]={source_id:'receipt_pdf',method:'positioned_pdf_text',items:[origin(date),origin(amount)]};}}
    const PaymentDetails={combinedTaxesAndAssessments:TaxAmounts.totalTax,PaymentSchedule,discountNote:null};
    if(combined!==null&&f.amount_paid!==undefined){const difference=combined-scaled(f.amount_paid);PaymentDetails.discountNote=`Derived arithmetic: printed combined taxes ${money(decimal(combined))} minus printed payment ${money(f.amount_paid)} = ${money(decimal(difference))}. This difference does not establish a current balance or a statutory discount.`;provenance['PaymentDetails.discountNote']=derived('Printed combined tax total minus printed receipt payment',['TaxAmounts.totalTax','BillDetails.paidAmount']);}
    const Exemptions={};
    const exemptionLabel=items.find(i=>/^EXEMPTIONS:?$/i.test(i.str));
    const exemptionItems=exemptionLabel?items.filter(i=>i.page===exemptionLabel.page&&i.x>=exemptionLabel.x&&i.x<exemptionLabel.x+250&&i.y<exemptionLabel.y&&exemptionLabel.y-i.y<28):[];
    if(exemptionItems.length){Exemptions.printed=exemptionItems.map(i=>i.str).join(' ');provenance.Exemptions={source_id:'receipt_pdf',method:'positioned_pdf_text',items:exemptionItems.map(origin)};}
    const NonAdValoremNote=nonHeader?(NonAdValorem.length?'Printed non-ad valorem assessment rows.':'Inspected non-ad valorem table contains no printed assessment rows.'):'Non-ad valorem table was not recognized.';
    const ExemptionsNote=Exemptions.printed?'Printed exemption details retained.':exemptionLabel?'Exemption area inspected; no exemption details printed.':'Exemption details were not reported in the recognized layout.';
    section_status.BillDetails='PRESENT';section_status.AdValoremMillage=AdValoremMillage.length?'PRESENT':'UNAVAILABLE';section_status.AdValoremGroupTotals=Object.keys(AdValoremGroupTotals).length?'PRESENT':'UNAVAILABLE';section_status.ParcelDetails=millageSum===null?'UNAVAILABLE':'PRESENT';section_status.TaxAmounts=combined===null||nonSum===null||taxSum===null?'PARTIAL':'PRESENT';section_status.PaymentDetails=PaymentSchedule.length?'PRESENT':'PARTIAL';
    section_status.NonAdValorem=nonHeader?NonAdValorem.length?'PRESENT':'INSPECTED_EMPTY':'UNAVAILABLE';section_status.Exemptions=Exemptions.printed?'PRESENT':exemptionLabel?'INSPECTED_EMPTY':'UNAVAILABLE';
    if(!headersHaveExemptions(AdValoremMillage))notes.push('Authority exemption values are null where no exemption column is printed; no zero exemption values are inferred.');
    const validation={parcel:'MATCHED',taxYear:'MATCHED',authorityRowCount:AdValoremMillage.length,combinedTotalReconciliation:taxSum!==null&&nonSum!==null&&combined!==null?(taxSum+nonSum===combined?'MATCHED':'DIFFERENT'):'UNAVAILABLE',derivedFields:Object.keys(provenance).filter(k=>provenance[k].method==='derived_decimal_calculation')};
    const millageTotalLabel=items.find(i=>/^TOTAL MILLAGE$/i.test(i.str));
    const printedMillage=millageTotalLabel?row(items,millageTotalLabel).find(i=>i.x>millageTotalLabel.x+millageTotalLabel.width&&/^\d+\.\d{3,5}$/.test(i.str)):null;
    const adTotalLabel=millageTotalLabel?row(items,millageTotalLabel).find(i=>/^(?:TOTAL )?AD VALOREM TAXES$/i.test(i.str)):null;
    const printedAd=adTotalLabel?row(items,adTotalLabel).find(i=>i.x>adTotalLabel.x+adTotalLabel.width&&numeric(i.str)!==null):null;
    const nonTotalLabel=nonHeader?items.filter(i=>i.page===nonHeader.page&&i.y<nonHeader.y&&/^(?:TOTAL )?NON-AD VALOREM (?:ASSESSMENTS|TAXES)$/i.test(i.str)).sort((a,b)=>b.y-a.y)[0]:null;
    const printedNon=nonTotalLabel?row(items,nonTotalLabel).find(i=>i.x>nonTotalLabel.x+nonTotalLabel.width&&numeric(i.str)!==null):null;
    for(const[key,item]of [['printedAdValoremTotal',printedAd],['printedNonAdValoremTotal',printedNon],['printedMillageRate',printedMillage]])if(item){validation[key]=key==='printedMillageRate'?numeric(item.str):money(item.str);provenance['validation.'+key]=origin(item);}
    const printedChecks=[printedAd&&taxSum!==null?scaled(printedAd.str)===taxSum:null,printedNon&&nonSum!==null?scaled(printedNon.str)===nonSum:null,printedMillage&&millageSum!==null?scaled(printedMillage.str,5)===millageSum:null].filter(v=>v!==null);
    validation.printedTotalsReconciliation=printedChecks.length?printedChecks.every(Boolean)?'MATCHED':'DIFFERENT':'UNAVAILABLE';
    if(!AdValoremMillage.length)provenance.unrecognized_pdf_layout={source_id:'receipt_pdf',method:'positioned_pdf_text',reason:'Authority table layout was not recognized; source text positions retained for adapter debugging.',items:items.map(i=>({str:i.str,page:i.page,x:i.x,y:i.y,width:i.width,height:i.height}))};
    return {BillDetails,AdValoremMillage,AdValoremGroupTotals,NonAdValorem,NonAdValoremNote,Exemptions,ExemptionsNote,ParcelDetails,TaxAmounts,PaymentDetails,section_status,provenance,validation,notes};
}
function headersHaveExemptions(rows){return rows.some(r=>r.exemptionValue!==null);}

export function parseClientTaxHistory(html){
  const $=load(html);$('script,style').remove();const body=clean($.text());
  if(/just a moment|verify you are human|sorry, you have been blocked|access denied/i.test(body))throw error('source_blocked','Collector returned an access challenge.');
  const accountNumber=clean($('h1').first().text()).match(/Account\s*#\s*([A-Za-z0-9 ._/-]+)/i)?.[1]?.trim()??null;
  const history=[],unavailableYears=[];let malformed=false;
  const tables=$('table').filter((_,t)=>/Amount due/i.test($(t).find('thead').text())||$(t).hasClass('bills'));
  tables.find('tbody tr').each((_,tr)=>{
    const r=$(tr);if(r.hasClass('d-md-none')||r.find('td.mobile-actions').length)return;
    const description=r.find('th.description,th[scope="row"],td.description').first();const title=clean(description.text());const year=title.match(/\b((?:19|20)\d{2})\b/)?.[1];
    const raw=clean(r.text());
    if(!year){if(/certificate\s*#|tax deed application\s*#/i.test(raw)&&history.length){attachEvent(history.at(-1),raw);return;}if(raw&&!/no bills|no records/i.test(raw))malformed=true;return;}
    if(/Not Available|cannot be viewed/i.test(raw)){unavailableYears.push(Number(year));history.push({billYear:year,billType:'Unavailable',amountDue:null,status:'Not Available',paidAmount:null,paidDate:null,receiptNumber:null,billId:null,note:raw});return;}
    const status=clean(r.find('td.status .label').first().text())||clean(r.find('td.status').first().text()).replace(/\$[\d,.]+.*/,'').trim()||null;
    const value=money(r.find('td.status span[translate="no"]').first().text());
    const paid=/^Paid(?: in full)?$/i.test(status??'');const link=description.find('a[href]').first().attr('href')??null;
    const entry={billYear:year,billType:/Annual/i.test(title)?'Annual':clean(title.replace(/^\d{4}\s*/,'').replace(/\s*bill$/i,''))||null,amountDue:/^No Balance Due$/i.test(clean(r.find('td.balance').first().text()))?'$0.00':money(r.find('td.balance').first().text()),status,paidAmount:paid?value:null,paidDate:paid?clean(r.find('td.as-of time,td.as-of').first().text())||null:null,receiptNumber:paid?clean(r.find('td.message').text()).replace(/^Receipt\s*#?\s*/i,'')||null:null,billId:link?.match(/\/bills\/([^/#?]+)/)?.[1]??null,note:raw};
    const print=r.find('a[href*="/print"]').first().attr('href');if(print)entry.pdf_url=print;attachEvent(entry,raw);if(entry.amountDue===null||entry.status===null)malformed=true;history.push(entry);
  });
  const total=tables.find('tfoot tr').filter((_,tr)=>/Total amount due/i.test($(tr).text())).first().find('td.balance').text();
  const statusMessage=clean($('.bills .paid,.amount-due .paid,#amount-due-content .paid').first().text())||null;
  const last=$('.last-payment').first();const lastText=clean(last.text());
  const summary={accountNumber,amountDue:money(total),statusMessage,lastPaymentDate:clean(last.find('time').first().text())||lastText.match(/\b\d{1,2}\/\d{1,2}\/20\d{2}\b/)?.[0]||null,lastPaymentAmount:money(lastText.match(/\$[\d,]+(?:\.\d+)?/)?.[0])};
  const uniqueUnavailable=[...new Set(unavailableYears)].sort((a,b)=>a-b);
  const latestAnnual=selectLatestAnnualBill(history);
  // Public annual rows and today's aggregate balance do not prove complete historical certificate/deed coverage.
  const publishedHistoryCoverage=!history.length?'UNAVAILABLE':uniqueUnavailable.length||malformed||summary.amountDue===null?'PARTIAL':'COMPLETE';
  const coverage=history.length?'PARTIAL':'UNAVAILABLE';
  return {summary,history,unavailableYears:uniqueUnavailable,coverage,publishedHistoryCoverage,sourceScope:'PUBLIC_PUBLISHED_BILL_ROWS',notes:['Published public annual bill rows and the current account balance do not establish complete prior-year, certificate or tax-deed clearance. No authoritative full-history scope proof is configured.'],latestAnnual};
}
function attachEvent(entry,raw){
  const cert=raw.match(/Certificate\s*#\s*([A-Za-z0-9-]+)/i);if(cert){const status=raw.match(/Certificate\s*#\s*[A-Za-z0-9-]+\s+(Redeemed|Sold|Outstanding|Cancelled|Canceled)/i)?.[1]??null;entry.certificate={number:cert[1],status,date:raw.match(/(?:Redeemed|Sold|Cancelled|Canceled)\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1]??null,faceAmount:money(raw.match(/Face\s*(\$[\d,.]+)/i)?.[1]),rate:raw.match(/Rate\s*([\d.]+%)/i)?.[1]??null,closed:status===null?null:/^(Redeemed|Cancelled|Canceled)$/i.test(status),note:raw};}
  const deed=raw.match(/Tax Deed Application\s*#\s*([A-Za-z0-9-]+)/i);if(deed){const status=raw.match(/Tax Deed Application\s*#\s*[A-Za-z0-9-]+\s+(Sold|Cancelled|Canceled|Pending|Applied)/i)?.[1]??null;entry.taxDeed={applicationNumber:deed[1],status,date:raw.match(/(?:Sold|Cancelled|Canceled)\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1]??null,closed:status===null?null:/^(Sold|Cancelled|Canceled)$/i.test(status),note:raw};}
}

export function selectLatestAnnualBill(history){
  const annual=history.filter(r=>/^Annual$/i.test(r.billType??'')&&/^\d{4}$/.test(String(r.billYear))).sort((a,b)=>Number(b.billYear)-Number(a.billYear));
  const newest=annual[0]?.billYear;return annual.filter(r=>String(r.billYear)===String(newest)).length===1?annual[0]:null;
}
