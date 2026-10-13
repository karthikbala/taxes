import {load} from 'cheerio';
import {parseMoneyCents,displayMoney} from './delinquency.mjs';
const prefix='ctl00_ContentPlaceHolder1_',norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
/** Original certificate notice, distinct from an original annual bill/receipt. */
export function parseVisualGovDelinquency(html,expectedId,expectedYear){
 const $=load(html),clean=v=>String(v??'').replace(/\s+/g,' ').trim(),provenance={};
 const label=(name,path)=>{const selector=`[id="${prefix}${name}"]`,nodes=$(selector),values=nodes.map((_,n)=>clean($(n).text())).get();if(new Set(values).size>1)fail('ambiguous_collector_bill','Conflicting certificate notice fields.');if(path&&nodes.length)provenance[path]={source_id:'tax_collector',method:'original_html_certificate_notice',selector,source_label:name};return values[0]||null;};
 const parcel=label('lblPropertyInfo','BillDetails.folio')?.match(/^R\s+(.+)$/)?.[1],bill=label('lblTaxBillInfo','BillDetails.taxYear')?.match(/^R\s+(\d+)\s+(\d{4})$/);
 if(!parcel||norm(parcel)!==norm(expectedId)||!bill||Number(bill[2])!==Number(expectedYear))fail('collector_identity_mismatch','Certificate notice parcel or bill year differs.');
 const status=label('lblCertificateStatus','BillDetails.certificate.statusRaw');
 if(status&&!/\bCERTIFICATE SOLD\b/.test(status))fail('collector_layout_changed','Unsupported certificate notice status.');
 const amount=(name,path)=>displayMoney(parseMoneyCents(label(name,path)));
 const balance=amount('lblTotalCertBalance','TaxInformation.amountDue');if(balance===null)fail('collector_balance_missing','Certificate current collectible balance is missing.');
 const certificate={number:label('lblCertificateNumber','BillDetails.certificate.number'),status:status&&parseMoneyCents(balance)>0n?'ACTIVE':'UNKNOWN',statusRaw:status,date:label('lblSaleDate','BillDetails.certificate.date'),holder:label('lblBidderID','BillDetails.certificate.holder'),interestRate:label('lblBidRate','BillDetails.certificate.interestRate'),faceAmount:amount('lblCertificateOriginalAmount','BillDetails.certificate.faceAmount'),interestAmount:amount('lblInterestAmount','BillDetails.certificate.interestAmount'),fees:amount('lblFee','BillDetails.certificate.fees'),amountDue:balance};
 if(!/^\d+$/.test(certificate.number||''))fail('collector_identity_missing','Certificate number is missing.');
 const table=$(`[id="${prefix}dgDelinquentHistory"]`),rows=[],identities=new Set();let total=null;
 const header=table.find('tr').first().children('td,th').map((_,n)=>clean($(n).text())).get();
 if(header.join('|')!=='Year|Roll|Bill #|Outstanding Tax|Accrued Penalties|Total Due|Reference')fail('collector_layout_changed','Delinquent history header is missing.');
 table.find('tr').slice(1).each((_,tr)=>{
  const c=$(tr).children('td,th').map((_,n)=>clean($(n).text())).get();
  if(c.length!==7)fail('collector_layout_changed','Incomplete delinquent history row.');
  if(c[3]==='Total Due'){const n=parseMoneyCents(c[5]);if(n===null||total!==null)fail('ambiguous_collector_bill','Invalid delinquent history total.');total=n;return;}
  if(!/^20\d{2}$/.test(c[0])||c[1]!=='R'||!/^\d+-[A-Z]+$/.test(c[2]))fail('collector_identity_mismatch','Invalid delinquent year, roll or bill identity.');
  const form=$(tr).find('form.GoToPriorBill'),value=name=>form.find(`input[name="${name}"]`).attr('value');
  if(form.attr('action')!=='/Property/TaxBill'||value('TaxYear')!==c[0]||value('RollType')!=='R'||value('TaxBillNo')!==c[2].split('-')[0])fail('collector_identity_mismatch','Delinquent bill link disagrees with its row.');
  const principal=parseMoneyCents(c[3]),penalties=parseMoneyCents(c[4]),due=parseMoneyCents(c[5]);
  if([principal,penalties,due].some(n=>n===null||n<0n)||principal+penalties!==due)fail('source_values_disagree','Delinquent row amounts do not reconcile.');
  const key=c[0]+':'+c[2];if(identities.has(key))fail('ambiguous_collector_bill','Duplicate delinquent liability row.');identities.add(key);
  provenance[`AccountHistory[${rows.length}]`]={source_id:'tax_collector',method:'original_html_certificate_notice',selector:`[id="${prefix}dgDelinquentHistory"] tr:nth-of-type(${rows.length+2})`,source_label:`Delinquent history ${c[0]} / ${c[2]}`};
  rows.push({billYear:c[0],billType:'Annual',billId:c[2].split('-')[0],status:'Delinquent',amountDue:displayMoney(due),outstandingTax:displayMoney(principal),accruedPenalties:displayMoney(penalties),reference:c[6],paidAmount:null,paidDate:null,...(c[0]===bill[2]&&c[2].split('-')[0]===bill[1]?{certificate:{...certificate}}:{})});
 });
 if(!rows.length||total===null||rows.reduce((s,r)=>s+parseMoneyCents(r.amountDue),0n)!==total)fail('source_values_disagree','Delinquent history does not reconcile to its published total.');
 provenance.AccountHistory={source_id:'tax_collector',method:'original_html_certificate_notice',selector:`[id="${prefix}dgDelinquentHistory"]`,source_label:'Published delinquent tax history; not complete clearance'};
 const current=rows.find(r=>r.billYear===bill[2]&&r.billId===bill[1]);if(!current||current.amountDue!==balance)fail('source_values_disagree','Selected certificate balance disagrees with delinquent history.');
 const parts=[certificate.faceAmount,certificate.interestAmount,certificate.fees].map(parseMoneyCents);if(parts.every(n=>n!==null)&&parts.reduce((a,b)=>a+b,0n)!==parseMoneyCents(balance))fail('source_values_disagree','Certificate components disagree with its unpaid balance.');
 const BillDetails={taxYear:bill[2],folio:parcel,propertyAddress:label('lblPropertyAddress','BillDetails.propertyAddress'),mailingAddress:['lblAddressLine1','lblAddressLine2','lblAddressLine345'].map(n=>label(n)).filter(Boolean).join('; ')||null,paidDate:null,paidAmount:null,receiptNumber:null,documentType:'certificate_notice',certificate};
 const TaxInformation={accountNumber:parcel,type:'DELINQUENT',amountDue:balance,statusMessage:status,lastPaymentDate:null,lastPaymentAmount:null,amountPaidYear:null,note:'Selected certificate balance; published delinquent-history total is separate.'};
 const notes=[...(status?[]:['The county leaves the certificate status label blank; certificate status remains UNKNOWN. The published unpaid balance and reconciled delinquent history are retained.']),'Original HTML certificate notice, not an annual tax bill or payment receipt.','Certificate sale date is not a property-tax payment date. Certificate face amount is not the current collectible balance.','Published delinquent history does not establish complete historical or independent certificate/deed coverage.'];
 const history={history:rows,latestAnnual:current,summary:TaxInformation,coverage:'PARTIAL',unavailableYears:[],notes,reportedDelinquentTotal:displayMoney(total)};
 const annualAbsent='Annual tax totals, authority breakdowns and millage rates are not printed on this certificate notice.';
 const paymentAbsent='Payment receipts, Amount Collected and payment dates are not printed on this certificate notice. The certificate sale date is not a payment date.';
 for(const path of ['BillDetails.paidDate','BillDetails.paidAmount','BillDetails.receiptNumber','TaxInformation.lastPaymentDate','TaxInformation.lastPaymentAmount','TaxInformation.amountPaidYear'])provenance[path]={source_id:'tax_collector',method:'inspected_html_certificate_notice',reason:paymentAbsent,document_type:'certificate_notice'};
 for(const path of ['ParcelDetails.millageRate','ParcelDetails.millageRateUnit','ParcelDetails.totalMillageRate','ParcelDetails.totalMillageRateUnit'])provenance[path]={source_id:'tax_collector',method:'inspected_html_certificate_notice',reason:annualAbsent,document_type:'certificate_notice'};
 return {BillDetails,ParcelDetails:{millageRate:null,millageRateUnit:null,totalMillageRate:null,totalMillageRateUnit:null,taxableValue:amount('lblTaxableValue','ParcelDetails.taxableValue')},TaxAmounts:{adValorem:null,nonAdValorem:null,totalDiscountable:null,totalTax:null},PaymentDetails:{combinedTaxesAndAssessments:null,currentBalance:balance,PaymentSchedule:[],discountNote:null},AdValoremMillage:[],AdValoremGroupTotals:{},NonAdValorem:[],AccountHistory:rows,TaxInformation,section_status:{BillDetails:'PRESENT',TaxInformation:'PRESENT',AccountHistory:'PARTIAL',TaxAmounts:{status:'UNAVAILABLE',note:annualAbsent},ParcelDetails:{status:'PARTIAL',note:annualAbsent},PaymentDetails:{status:'PARTIAL',note:paymentAbsent},AdValoremMillage:{status:'UNAVAILABLE',note:annualAbsent},NonAdValorem:{status:'UNAVAILABLE',note:annualAbsent}},provenance,validation:{parcel:'MATCHED',taxYear:'MATCHED',billNumber:bill[1],documentType:'certificate_notice',delinquentRowCount:rows.length,delinquentTotalReconciliation:'MATCHED'},notes,history};
}
