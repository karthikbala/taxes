import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {load} from 'cheerio';
import {parseClientVisualGovBill} from '../lib/client/visualgov.mjs';
import {parseTaxsysBillAmounts} from '../lib/client/collector-amounts.mjs';
import {renderSections} from '../public/poc-render.mjs';
const read=name=>readFileSync(new URL('./fixtures/client/discountable-public-2026-10-12/'+name,import.meta.url),'utf8');
class TextNode {
 constructor(){this.children=[];this.text='';}
 set textContent(v){this.text=String(v);this.children=[];}
 get textContent(){return this.text+this.children.map(n=>n.textContent).join('\n');}
 append(...nodes){this.children.push(...nodes);}
}
const rendered=amounts=>{const dom=new TextNode();renderSections({createElement:()=>new TextNode()},dom,{TaxAmounts:amounts},{TaxAmounts:{status:'PARTIAL'}});return dom.textContent;};
for(const [bill,parcel,total] of [['502000','01250-0-00401','$515.83'],['350000','00893-0-00200','$1,738.27'],['1308000','05079-0-01314','$635.37']]){
 test(`fresh public Bradford bill ${bill} retains total while explicitly missing subtotal stays null`,()=>{
  const p=parseClientVisualGovBill(read(`bradford-${bill}.html`),parcel,2025);
  assert.equal(p.TaxAmounts.totalTax,total);assert.equal(p.TaxAmounts.totalDiscountable,null);
  assert.equal(p.provenance['TaxAmounts.totalDiscountable'].status,'UNAVAILABLE');
  assert.match(rendered(p.TaxAmounts),new RegExp(total.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 });
}
for(const [file,id,value] of [['miami-512.html','01-3231-067-0130','$3,477.20'],['osceola-3250.html','R022528-285000010010','$285,389.65']]){
 test(`fresh ${file} published subtotal is extracted and rendered`,()=>{
  const p=parseTaxsysBillAmounts(read(file),id,2025);assert.equal(p.value,value);
  assert.equal(p.proof.source_label,'Total Discountable:');assert.equal(p.proof.account_number,id);assert.equal(p.proof.source_year,'2025');
  assert.ok(rendered({totalDiscountable:p.value}).includes(value));
  assert.throws(()=>parseTaxsysBillAmounts(read(file),id,2024),{code:'collector_identity_mismatch'});
  assert.throws(()=>parseTaxsysBillAmounts(read(file),'999999',2025),{code:'collector_identity_mismatch'});
 });
}
test('Bradford padding-only date differences reconcile and original dates remain intact',()=>{
 const p=parseClientVisualGovBill(read('bradford-502000.html'),'01250-0-00401',2025);
 assert.equal(p.BillDetails.paidDate,'01/10/2026');assert.equal(p.AccountHistory.find(r=>r.billYear==='2025').paidDate,'1/10/2026');
});
for(const date of ['01/11/2026','02/30/2026'])test(`Bradford genuinely different or invalid receipt date ${date} still fails`,()=>{
 const $=load(read('bradford-502000.html'));$('[id="ctl00_ContentPlaceHolder1_lblLastPaymentDate"]').text(date);
 assert.throws(()=>parseClientVisualGovBill($.html(),'01250-0-00401',2025),{code:'ambiguous_collector_bill'});
});
test('Bradford real-source layout extracts explicit positive and zero subtotal when supplied; conflicting values fail',()=>{
 // Explicit mutations verify the layout's labelled-field path, not a claim that these amounts were published.
 const $=load(read('bradford-1308000.html'));
 $('body').append('<table><tr><td>Total Discountable:</td><td>$100.00</td></tr></table>');
 assert.equal(parseClientVisualGovBill($.html(),'05079-0-01314',2025).TaxAmounts.totalDiscountable,'$100.00');
 $('body > table:last-child td:last-child').text('$0.00');
 assert.equal(parseClientVisualGovBill($.html(),'05079-0-01314',2025).TaxAmounts.totalDiscountable,'$0.00');
 $('body').append('<table><tr><td>Total Discountable:</td><td>$1.00</td></tr></table>');
 assert.throws(()=>parseClientVisualGovBill($.html(),'05079-0-01314',2025),{code:'source_values_disagree'});
});
