import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseClientBillPdf,parseClientBillLayout,parseClientTaxHistory,selectLatestAnnualBill} from '../lib/client/bill.mjs';
const fixture = async (name, folder='client') => new Uint8Array(await readFile(new URL(`./fixtures/${folder}/${name}`,import.meta.url)));
const miamiId='01-3231-052-0010';

test('dated Miami annual reference retains all 14 positioned authority rows and reconciles independently',async()=>{
  const result=await parseClientBillPdf(await fixture('miami-annual-reference.pdf'),miamiId,2025);
  // These authority names/amounts are printed in the supplied PDF, independent of extraction order.
  const expected=[['School Board Operating','5.49900','$845.30'],['School Board Debt Service','0.13400','$20.60'],['Voted School Operating','1.00000','$153.72'],['Florida Inland Navigation District','0.02700','$4.15'],['South Florida Water Management District','0.09480','$14.57'],['Okeechobee Basin','0.10260','$15.77'],['Everglades Construction Project','0.03270','$5.03'],['Childrens Trust Authority','0.46380','$71.29'],['County Wide Operating','4.57400','$703.11'],['County Wide Debt Service','0.41710','$64.12'],['Library District','0.28120','$43.23'],['Miami Operating','7.10800','$1,092.63'],['Miami Debt Service','0.25360','$38.98'],['Miami Miscellaneous','0.39000','$59.95']];
  assert.deepEqual(result.AdValoremMillage.map(r=>[r.authority,r.millage,r.taxesLevied]),expected);
  assert.ok(result.AdValoremMillage.every(r=>r.assessedValue==='$153,718.00'&&r.taxableValue==='$153,718.00'&&r.exemptionValue===null));
  assert.deepEqual(result.AdValoremGroupTotals,{'Miami-Dade School Board':'$1,019.62','State and Other':'$110.81','Miami-Dade County':'$810.46','Municipal Governing Board':'$1,191.56'});
  assert.equal(result.TaxAmounts.adValorem,'$3,132.45');assert.equal(result.TaxAmounts.totalTax,'$3,132.45');assert.equal(result.TaxAmounts.nonAdValorem,'$0.00');assert.equal(result.TaxAmounts.totalDiscountable,null);
  assert.equal(result.ParcelDetails.millageRate,'20.37780');assert.equal(result.validation.combinedTotalReconciliation,'MATCHED');
  assert.equal(result.BillDetails.municipality,'MIAMI');assert.equal(result.BillDetails.millCode,'0101');assert.equal(result.BillDetails.paidBy,'SHELLPOINT MORTGAGE SERVICES');assert.equal(result.BillDetails.receiptNumber,'EEX-26-000928');assert.equal(result.BillDetails.paidDate,'11/25/2025');assert.equal(result.BillDetails.paidAmount,'$3,007.15');
  assert.equal(result.BillDetails.propertyAddress,'555 NE 15 ST 401, Miami, 33132-0000');
  assert.deepEqual(result.PaymentDetails.PaymentSchedule,[{ifPaidBy:'Nov 30, 2025',pleasePay:'$0.00'}]);
  assert.deepEqual(result.NonAdValorem,[]);assert.deepEqual(result.Exemptions,{});assert.equal(result.section_status.Exemptions,'INSPECTED_EMPTY');assert.match(result.ExemptionsNote,/no exemption details printed/i);
  assert.ok(!('ownerOccupied' in result.BillDetails));assert.equal(result.provenance['AdValoremMillage[13].taxesLevied'].text,'59.95');assert.equal(result.provenance['TaxAmounts.adValorem'].method,'derived_decimal_calculation');assert.equal(result.provenance['BillDetails.paidAmount'].method,'positioned_pdf_text');
  assert.match(result.PaymentDetails.discountNote,/\$125.30/);
});

test('wrong parcel/year and non-PDF sources reject before rich extraction',async()=>{
  const bytes=await fixture('miami-annual-reference.pdf');
  await assert.rejects(()=>parseClientBillPdf(bytes,'WRONG',2025),{code:'document_identity_mismatch'});
  await assert.rejects(()=>parseClientBillPdf(bytes,miamiId,2024),{code:'document_identity_mismatch'});
  await assert.rejects(()=>parseClientBillPdf(new TextEncoder().encode('<html>blocked</html>'),miamiId,2025),{code:'document_not_pdf'});
});

test('existing issuer variants preserve printed zero and issuer-specific exemption column order',async()=>{
  const pasco=await parseClientBillPdf(await fixture('pasco-taxsys-print.pdf','phase-one'),'2626170000002000090',2025);
  assert.equal(pasco.AdValoremMillage.length,19);assert.equal(pasco.TaxAmounts.adValorem,'$121,368.67');assert.equal(pasco.BillDetails.paidAmount,'$121,368.67');assert.equal(pasco.AdValoremMillage[0].exemptionValue,'$0.00');assert.equal(pasco.ParcelDetails.millageRate,'16.81690');
  const santa=await parseClientBillPdf(await fixture('santa-rosa-taxsys-print.pdf','phase-one'),'091N280000027000000',2025);
  assert.equal(santa.AdValoremMillage.length,5);assert.equal(santa.AdValoremMillage[0].exemptionValue,'$7,956,648.00');assert.equal(santa.AdValoremMillage[0].taxableValue,'$0.00');assert.equal(santa.AdValoremMillage.at(-1).group,null);assert.equal(santa.TaxAmounts.totalTax,'$0.00');assert.equal(santa.BillDetails.paidAmount,null);assert.equal(santa.NonAdValorem[0].amount,'$0.00');
});

// Dated reference transcription of user-supplied miami-tax-history-reference.pdf.
// HTML classes and REFERENCE bill URLs below are synthetic parser scaffolding, not captured live HTML.
const annualPayments=[['2025','3007.15','11/25/2025','EEX-26-000928'],['2024','2770.06','11/27/2024','EEX-25-001124'],['2023','2760.19','05/23/2024','FPPU06-24-005743'],['2022','2249.64','12/18/2022','INT-23-214873'],['2021','2116.09','01/19/2022','INT-22-240160'],['2020','2041.87','03/11/2021','INT-21-256413'],['2019','1985.01','12/19/2019','ECHECK-20-133896'],['2018','1948.50','12/25/2018','ECHECK-19-128733'],['2017','2365.70','02/02/2018','0208-18-003424'],['2016','2046.32','03/28/2017','ECHECK-17-157544'],['2015','1907.59','05/06/2016','0232-16-001831'],['2014','2028.87','05/06/2016','0232-16-001831']];
const paidRow=([y,amount,date,receipt])=>`<tr class="regular"><th class="description"><a href="/bills/REFERENCE-${y}">${y} Annual Bill</a></th><td class="balance">$0.00</td><td class="status"><span class="label">Paid</span><span translate="no">$${amount}</span></td><td class="as-of"><time>${date}</time></td><td class="message">Receipt #${receipt}</td><td><a href="/bills/REFERENCE-${y}/print">Print (PDF)</a></td></tr>`;
const referenceHistory=`<h1>Real Estate Account #01-3231-052-0010</h1><div id="amount-due-content"><div class="bills"><div class="paid">Your account is paid in full. There is nothing due at this time.</div><div class="last-payment">Your most recent payment was made on <time>11/25/2025</time> for $3,007.15.</div></div></div><table class="bills"><thead><tr><th>Bill</th><th>Amount due</th><th>Status</th></tr></thead><tbody>${annualPayments.map(paidRow).join('')}<tr class="certificate"><td colspan="5">Certificate #3390 Redeemed 05/06/2016 Face $1,926.30, Rate 0.25% Paid $2,028.87</td></tr><tr class="regular"><th class="description">2013 Annual Bill</th><td class="balance">No Balance Due</td><td class="status"><span class="label">Tax Deed</span></td><td class="message">(see 2012)</td></tr><tr class="tax-deed"><td>Tax Deed Application #150825 Sold 04/19/2016</td></tr>${[2012,2011].map(y=>`<tr class="unavailable"><th class="description">${y} Not Available</th><td>This account cannot be viewed on the public site. Please call the Tax Collector's office for more information.</td></tr>`).join('')}</tbody><tfoot><tr><th>Total amount due</th><td class="balance">$0.00</td></tr></tfoot></table>`;

test('reference-transcribed TaxSys history retains closed events, all annual payments and unavailable years',()=>{
  const r=parseClientTaxHistory(referenceHistory);assert.equal(r.summary.accountNumber,miamiId);assert.equal(r.summary.amountDue,'$0.00');assert.equal(r.summary.lastPaymentDate,'11/25/2025');assert.equal(r.summary.lastPaymentAmount,'$3,007.15');assert.equal(r.history.length,15);assert.deepEqual(r.unavailableYears,[2011,2012]);assert.equal(r.coverage,'PARTIAL');
  const cert=r.history.find(r=>r.billYear==='2014').certificate;assert.equal(cert.number,'3390');assert.equal(cert.closed,true);assert.equal(cert.status,'Redeemed');assert.equal(cert.date,'05/06/2016');assert.equal(cert.faceAmount,'$1,926.30');assert.equal(cert.rate,'0.25%');
  const old=r.history.find(r=>r.billYear==='2013');assert.equal(old.amountDue,'$0.00');assert.equal(old.taxDeed.applicationNumber,'150825');assert.equal(old.taxDeed.status,'Sold');assert.equal(old.taxDeed.closed,true);assert.equal(old.taxDeed.date,'04/19/2016');assert.match(old.note,/see 2012/);
  assert.equal(r.latestAnnual.billYear,'2025');assert.equal(r.latestAnnual.paidAmount,'$3,007.15');assert.equal(r.latestAnnual.receiptNumber,'EEX-26-000928');assert.equal(r.latestAnnual.billId,'REFERENCE-2025');
  assert.equal(r.history.find(r=>r.billYear==='2012').amountDue,null);
});

test('latest annual selection ignores first row/newer installments and refuses ambiguous annual IDs',()=>{
  const annual={billYear:'2025',billType:'Annual',billId:'annual'};const older={billYear:'2024',billType:'Annual',billId:'older'};const installment={billYear:'2026',billType:'First installment',billId:'installment'};
  assert.equal(selectLatestAnnualBill([installment,older,annual]),annual);assert.equal(selectLatestAnnualBill([installment]),null);assert.equal(selectLatestAnnualBill([annual,{...annual,billId:'other'}]),null);
});

test('captured TaxSys HTML excerpt parses a real layout without promoting absent identity to truth',async()=>{
  const html=await readFile(new URL('./fixtures/phase-one/collectors-broward-browser-history-excerpt.html',import.meta.url),'utf8');const r=parseClientTaxHistory(html);assert.equal(r.summary.accountNumber,null);assert.equal(r.summary.amountDue,'$0.00');assert.equal(r.latestAnnual.paidAmount,'$572.00');assert.equal(r.latestAnnual.paidDate,'01/30/2026');assert.equal(r.history.length,1);
});

test('missing rows/balances and access challenges cannot claim complete history',()=>{
  assert.equal(parseClientTaxHistory('<div>No history loaded</div>').coverage,'UNAVAILABLE');
  assert.equal(parseClientTaxHistory(referenceHistory.replace('<tfoot>','<tfoot hidden>').replace('<td class="balance">$0.00</td></tr></tfoot>','<td class="balance"></td></tr></tfoot>')).coverage,'PARTIAL');
  assert.throws(()=>parseClientTaxHistory('<html>Verify you are human</html>'),{code:'source_blocked'});
});


const osceolaLayout=async()=>JSON.parse(await readFile(new URL('./fixtures/client/osceola-pdf-layout-reference.json',import.meta.url),'utf8'));
test('native Osceola source items parse MILL RATE and reconcile every printed authority and fire assessment',async()=>{
  const f=await osceolaLayout();const r=parseClientBillLayout(f.items,f.basic,f.expectedId,f.expectedYear);
  const expected=[['OSCEOLA CO','6.7000','$91,433.56'],['SAVE OSC MAN','0.2500','$3,411.70'],['EMER MED SRV','1.0682','$14,577.51'],['SCH STATE LW','3.0580','$41,731.91'],['CAPITAL OUTLAY','1.5000','$20,470.20'],['DISCRETIONARY','0.7480','$10,207.81'],['SFWMD EVERG','0.0327','$446.25'],['SO FL WATER','0.0948','$1,293.72'],['SFWMD OKEE','0.1026','$1,400.16'],['LIBRARY DIST','0.3000','$4,094.04'],['SAVE OSC DBT','0.0000','$0.00']];
  assert.deepEqual(r.AdValoremMillage.map(x=>[x.authority,x.millage,x.taxesLevied]),expected);
  assert.ok(r.AdValoremMillage.every(x=>x.assessedValue==='$13,646,800.00'&&x.exemptionValue==='$0.00'&&x.taxableValue==='$13,646,800.00'));
  assert.deepEqual(r.NonAdValorem,[{authority:'Fire Rescue Commercial Sq Ft',amount:'$96,322.79',rate:'0.4289',footageUnits:null,unitLabel:'Sq Ft'}]);
  assert.equal(r.TaxAmounts.adValorem,'$189,066.86');assert.equal(r.TaxAmounts.nonAdValorem,'$96,322.79');assert.equal(r.TaxAmounts.totalTax,'$285,389.65');assert.equal(r.TaxAmounts.totalDiscountable,null);assert.equal(r.ParcelDetails.millageRate,'13.85430');
  assert.equal(r.validation.authorityRowCount,11);assert.equal(r.validation.combinedTotalReconciliation,'MATCHED');assert.equal(r.validation.printedTotalsReconciliation,'MATCHED');assert.equal(r.validation.printedAdValoremTotal,'$189,066.86');assert.equal(r.validation.printedNonAdValoremTotal,'$96,322.79');assert.equal(r.validation.printedMillageRate,'13.8543');
  assert.equal(r.provenance.authority_table_headings.items[0].text,'SCH LOCAL BD');assert.equal(r.provenance.unrecognized_pdf_layout,undefined);
  assert.equal(r.BillDetails.mailingAddress,null);assert.equal(r.BillDetails.propertyAddress,null);assert.equal(r.BillDetails.receiptNumber,'121702900');assert.equal(r.BillDetails.paidBy,'WALMART INC (PT)');assert.equal(r.BillDetails.paidAmount,'$273,974.06');
  assert.deepEqual(r.PaymentDetails.PaymentSchedule,[{ifPaidBy:'Nov 30, 2025',pleasePay:'$0.00'}]);
  assert.equal(f.reference.original_annual_bill.sha256,'472dea39f0d24ef16030c2b56cce97645c6f9c585981e680d6d9af1c5e605523');
});

test('native-item stage rejects wrong identities/years, and missing required header retains diagnostic fallback',async()=>{
  const f=await osceolaLayout();
  assert.throws(()=>parseClientBillLayout(f.items,f.basic,'OTHER',f.expectedYear),{code:'document_identity_mismatch'});
  assert.throws(()=>parseClientBillLayout(f.items,f.basic,f.expectedId,2024),{code:'document_identity_mismatch'});
  const wrongNative=f.items.map(i=>i.str==='2025'?{...i,str:'2024'}:i);assert.throws(()=>parseClientBillLayout(wrongNative,f.basic,f.expectedId,f.expectedYear),{code:'document_identity_mismatch'});
  const wrongParcel=f.items.map(i=>i.str==='R022528-285000010010'?{...i,str:'R022528-285000010011'}:i);assert.throws(()=>parseClientBillLayout(wrongParcel,f.basic,f.expectedId,f.expectedYear),{code:'document_identity_mismatch'});
  const missing=f.items.filter(i=>i.str!=='TAXABLE VALUE');const r=parseClientBillLayout(missing,f.basic,f.expectedId,f.expectedYear);assert.equal(r.validation.authorityRowCount,0);assert.equal(r.TaxAmounts.adValorem,null);assert.equal(r.section_status.AdValoremMillage,'UNAVAILABLE');assert.equal(r.validation.combinedTotalReconciliation,'UNAVAILABLE');assert.equal(r.provenance.unrecognized_pdf_layout.items.length,missing.length);
  const missingCell=f.items.filter(i=>!(i.str==='13,646,800'&&Math.abs(i.y-583.66)<1&&i.x>480));assert.throws(()=>parseClientBillLayout(missingCell,f.basic,f.expectedId,f.expectedYear),{code:'document_layout_changed'});
});

test('complete paid public rows cannot imply authoritative historical clearance',async()=>{
  const html=await readFile(new URL('./fixtures/phase-one/collectors-broward-browser-history-excerpt.html',import.meta.url),'utf8');const r=parseClientTaxHistory(html);
  assert.equal(r.publishedHistoryCoverage,'COMPLETE');assert.equal(r.coverage,'PARTIAL');assert.equal(r.sourceScope,'PUBLIC_PUBLISHED_BILL_ROWS');assert.match(r.notes.join(' '),/certificate or tax-deed clearance/);assert.equal(r.summary.amountDue,'$0.00');assert.equal(r.history[0].status,'Paid');assert.equal(r.history[0].paidAmount,'$572.00');
});
