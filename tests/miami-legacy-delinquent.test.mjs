import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {parseClientTaxHistory} from '../lib/client/bill.mjs';import {classifyDelinquency} from '../lib/client/delinquency.mjs';import {parseTaxsysHistory,parseTaxsysIdentity} from '../lib/live/taxsys.mjs';import {captureCode} from '../lib/live/managed-browser.mjs';
const html=await readFile(new URL('./fixtures/client/miami-legacy-mwc-delinquent-20261013.html',import.meta.url),'utf8');
test('client Miami property returns both open certificates without treating online subtotal as full balance',()=>{
 assert.equal(parseTaxsysIdentity(html,'0101020301070').parcel_id,'01-0102-030-1070');
 const history=parseClientTaxHistory(html),d=classifyDelinquency({...history,asOf:'2026-10-13',county:'miami-dade-fl'}),native=parseTaxsysHistory(html,html);
 assert.equal(history.summary.amountDue,null);assert.equal(history.summary.amountPayableOnline,'$418,684.53');assert.equal(native.summary.balance_due,null);assert.equal(native.summary.payable_online_amount,'418684.53');
 assert.equal(d.hasActiveDelinquency,true);assert.equal(d.knownTotalDue,'$418,684.53');assert.equal(d.currentYearDue,'$210,961.44');assert.equal(d.knownPriorYearsDue,'$207,723.09');assert.equal(d.totalPriorYearsDue,null);
 assert.deepEqual(d.delinquentYears.map(y=>y.certificate.number),['7','5']);assert(d.unavailableYears.includes('2005'));assert.equal(d.delinquentYears.length,2);
 assert.throws(()=>parseTaxsysIdentity(html,'0101020301071'));
 assert.throws(()=>parseTaxsysHistory(html.replace('Some Amounts Not Payable Online','No total scope marker'),html),e=>e.code==='collector_balance_missing');
});
test('managed capture supports atomic loaded history without requiring an absent account-history footer',()=>{
 const code=captureCode('https://county-taxes.net/fl-miamidade/property-tax/EXAMPLE',false);
 assert.match(code,/#bill-history-content table\.bills tbody tr\.regular/);assert.match(code,/#bill-history table\.bills tfoot/);
});
