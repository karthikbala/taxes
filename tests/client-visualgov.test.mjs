import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import {parseClientVisualGovBill} from '../lib/client/visualgov.mjs';
import {classifyDelinquency} from '../lib/client/delinquency.mjs';

// Authoritative Bradford original HTML captured on 2026-10-06. This is historical fixture proof.
const html = await readFile(new URL('./fixtures/client/bradford-collector-bill-2026-10-06.html',import.meta.url),'utf8');
const search = JSON.parse(await readFile(new URL('./fixtures/client/bradford-collector-search-2026-10-06.json',import.meta.url),'utf8')).FLTax.ResultsList;
const parse = value => parseClientVisualGovBill(value,search.PROPERTYNO,search.TAXYEAR);
const mutate = fn => {const $=load(html);fn($);return $.html();};
const id = name => `[id="ctl00_ContentPlaceHolder1_${name}"]`;
const summary = $ => $('tr').filter((_,e)=>$(e).children().map((_,c)=>$(c).text().trim()).get().join('|') === 'Parcel|Roll Type|Year|Original Gross Tax|Original Assessments|Date Paid|Amount Paid|Total Unpaid').last().closest('table');

test('historical Bradford HTML retains every authority, source fractional precision, receipt and original gross totals',()=>{
  const r=parse(html);
  // Independent transcription of all five original source rows; these are fractional rates, not mills.
  assert.deepEqual(r.AdValoremMillage.map(v=>[v.authority,v.millage,v.taxesLevied]),[
    ['SCHOOL-RLE','.00311800','$31,375.16'],['COUNTY','.01000000','$100,625.93'],['STARKE','.00438790','$44,153.65'],['SUWAN RIV WATER','.00028120','$2,829.60'],['SCHOOL-DISC','.00224800','$22,620.71']
  ]);
  assert.equal(r.validation.authorityRowCount,5);
  assert.equal(r.ParcelDetails.millageRate,'0.02003510');
  assert.equal(r.ParcelDetails.millageRateUnit,'source_displayed_rate_fraction');
  assert.ok(r.AdValoremMillage.every(v=>v.millageUnit === 'source_displayed_rate_fraction' && v.assessedValue === null && v.exemptionValue === null && v.taxableValue === null));
  assert.deepEqual(r.TaxAmounts,{adValorem:'$201,605.05',nonAdValorem:'$0.00',totalDiscountable:null,totalTax:'$201,605.05'});
  assert.equal(r.ParcelDetails.assessedValue,'$10,062,593.00');
  assert.equal(r.ParcelDetails.exemptionValue,'$0.00');
  assert.equal(r.ParcelDetails.taxableValue,'$10,062,593.00');
  assert.deepEqual(r.AdValoremGroupTotals,{AllAuthorities:'$201,605.05'});
  assert.equal(r.BillDetails.taxYear,'2025');assert.equal(r.BillDetails.folio,'04708-0-00200');
  assert.equal(r.BillDetails.receiptNumber,'45176');assert.equal(r.BillDetails.paidDate,'11/18/2025');assert.equal(r.BillDetails.paidAmount,'$193,540.85');
  assert.equal(r.BillDetails.propertyAddress,'14500 S HWY 301 STARKE 32091');
  assert.equal(r.BillDetails.millCode,'5');assert.equal(r.BillDetails.municipality,null);assert.equal(r.BillDetails.paidBy,null);
  assert.equal(r.TaxInformation.type,'PAID');assert.equal(r.TaxInformation.amountDue,'$0.00');
  assert.equal(r.PaymentDetails.currentBalance,'$0.00');assert.equal(r.PaymentDetails.printedDiscount,'$0.00');
  assert.match(r.PaymentDetails.discountNote,/\$8,064\.20/);assert.deepEqual(r.PaymentDetails.PaymentSchedule,[]);
  assert.deepEqual(r.NonAdValorem,[]);assert.equal(r.section_status.NonAdValorem,'INSPECTED_EMPTY');
  assert.deepEqual(r.Exemptions,{});assert.equal(r.section_status.Exemptions,'INSPECTED_EMPTY');assert.match(r.ExemptionsNote,/does not establish absence/);
  for(const key of ['adValoremReconciliation','nonAdValoremReconciliation','combinedTotalReconciliation'])assert.equal(r.validation[key],'MATCHED');
  assert.equal(r.validation.printedFractionalRateTaxChecks.length,5);assert.ok(r.validation.printedFractionalRateTaxChecks.every(v=>v.reconciliation === 'MATCHED'));
  assert.equal(r.provenance['BillDetails.paidAmount'].source_id,'tax_collector');assert.equal(r.provenance['BillDetails.paidAmount'].method,'original_html_bill');
  const $=load(html);assert.match($(r.provenance['AdValoremMillage[0].millage'].selector).text(),/SCHOOL-RLE/);
  assert.match($(r.provenance['AccountHistory[0]'].selector).text(),/2025/);
  assert.match(r.provenance['AdValoremMillage[0].millage'].source_label,/fractional/);
  assert.equal(r.provenance['AdValoremGroupTotals.AllAuthorities'].method,'derived_decimal_calculation');
  assert.ok(r.notes.some(n=>/no original PDF/i.test(n)));
});

test('all 14 verified annual years retained; duplicate 2025 removed; zero payments history does not establish clearance',()=>{
  const r=parse(html);
  assert.deepEqual(r.history.history.map(v=>v.billYear),['2025','2024','2023','2022','2021','2020','2019','2018','2017','2016','2015','2014','2013','2012']);
  assert.equal(r.validation.annualHistoryYearCount,14);assert.ok(r.AccountHistory.every(v=>v.billType === 'Annual'));
  assert.equal(r.AccountHistory.find(v=>v.billYear === '2012').paidAmount,'$187,733.82');
  assert.equal(r.history.latestAnnual.billId,'1209500');assert.equal(r.history.latestAnnual.receiptNumber,'45176');
  assert.equal(r.history.coverage,'PARTIAL');assert.equal(r.section_status.AccountHistory,'PARTIAL');assert.deepEqual(r.history.unavailableYears,[]);
  const clearance=classifyDelinquency({...r.history,asOf:'2026-10-08',county:'bradford-fl'});
  assert.equal(clearance.hasActiveDelinquency,null);assert.equal(clearance.totalPriorYearsDue,null);
  assert.equal(clearance.knownPriorYearsDue,'$0.00');assert.equal(clearance.currentYearDue,'$0.00');
});

test('expected annual year comes from verified search and printed header, independent of first summary row',()=>{
  const r=parse(mutate($=>{const table=summary($);const last=table.find('tr').filter((_,tr)=>$(tr).children('td').eq(2).text().trim() === '2012').first();table.prepend(last);}));
  assert.equal(r.history.latestAnnual.billYear,'2025');assert.equal(r.AccountHistory[0].billYear,'2025');
  assert.match(r.provenance['AccountHistory[0]'].source_label,/2025/);
});

test('wrong parcel/year, mismatched annual identity, challenges and conflicting duplicates reject',()=>{
  assert.throws(()=>parseClientVisualGovBill(html,'WRONG',2025),{code:'collector_identity_mismatch'});
  assert.throws(()=>parseClientVisualGovBill(html,search.PROPERTYNO,2024),{code:'collector_identity_mismatch'});
  assert.throws(()=>parse('<html>Access denied</html>'),{code:'source_blocked'});
  assert.throws(()=>parse(mutate($=>summary($).find('tr').filter((_,tr)=>$(tr).children('td').eq(2).text().trim() === '2024').first().children('td').eq(0).text('OTHER-PARCEL'))),{code:'collector_identity_mismatch'});
  assert.throws(()=>parse(mutate($=>summary($).find('tr').filter((_,tr)=>$(tr).children('td').eq(2).text().trim() === '2025').last().children('td').eq(6).text('$1.00'))),{code:'ambiguous_collector_bill'});
  assert.throws(()=>parse(mutate($=>{const tr=$(id('dgAdValorem')).find('tr').eq(1).clone();tr.children('td').eq(2).text('$1.00');$(id('dgAdValorem')).append(tr);})),{code:'ambiguous_collector_bill'});
  assert.throws(()=>parse(mutate($=>$(id('lblAmountCollected')).text('$1.00'))),{code:'ambiguous_collector_bill'});
});

test('missing tables/fields retain available bill data and explicit partial/unavailable outcomes',()=>{
  const missing=parse(mutate($=>{$(id('dgAdValorem')).remove();$(id('dgNonAdValorem')).remove();$(id('lblExemption')).remove();summary($).remove();$(id('lblUnpaidBalance')).remove();}));
  assert.equal(missing.section_status.AdValoremMillage,'UNAVAILABLE');assert.equal(missing.section_status.NonAdValorem,'UNAVAILABLE');
  assert.equal(missing.section_status.Exemptions,'UNAVAILABLE');assert.equal(missing.section_status.TaxAmounts,'PARTIAL');
  assert.equal(missing.history.coverage,'UNAVAILABLE');assert.equal(missing.section_status.AccountHistory,'UNAVAILABLE');
  assert.equal(missing.TaxInformation.amountDue,null);assert.equal(missing.section_status.TaxInformation,'PARTIAL');assert.equal(missing.TaxInformation.type,'UNKNOWN');
  assert.equal(missing.TaxAmounts.totalTax,'$201,605.05');assert.equal(missing.BillDetails.paidAmount,'$193,540.85');
  const malformed=parse(mutate($=>$(id('dgAdValorem')).find('tr').eq(1).children('td').eq(1).text('NOT A RATE')));
  assert.equal(malformed.section_status.AdValoremMillage,'PARTIAL');assert.equal(malformed.validation.adValoremReconciliation,'UNAVAILABLE');
  assert.equal(malformed.section_status.TaxAmounts,'PARTIAL');assert.equal(malformed.AdValoremMillage.length,4);
});

test('gross totals reconcile at a five-cent tolerance and larger source discrepancies remain partial',()=>{
  const near=parse(mutate($=>$(id('lblCombinedTotal')).text('$201,605.09')));
  assert.equal(near.validation.combinedTotalReconciliation,'MATCHED');
  const different=parse(mutate($=>$(id('lblCombinedTotal')).text('$201,605.11')));
  assert.equal(different.validation.combinedTotalReconciliation,'DIFFERENT');assert.equal(different.section_status.TaxAmounts,'PARTIAL');
});
