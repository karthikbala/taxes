import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { displayValue, fieldDisplay, renderSections, renderValidation, renderValue, resultBadge, resultRequestId, sectionComment } from '../public/poc-render.mjs';

// Small DOM harness verifies rendered content and node structure without a browser or network.
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.text = ''; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(node => node.textContent).join('\n'); }
  append(...nodes) { this.children.push(...nodes); }
  set innerHTML(_) { throw new Error('Source content must use textContent.'); }
}
const document = { createElement: tag => new Node(tag) };
const descendants = (node, tag) => [ ...(node.tag === tag ? [node] : []), ...node.children.flatMap(child => descendants(child, tag)) ];

// Source-value excerpt from saved miami-live-v21.json (2026-10-08).
const record = {
  PropertyInformation: { ParcelNumber: '01-3231-052-0010', PropertyAddress: '555 NE 15 ST 401, Miami, FL 33132-0000', Owners: ['JUDE PATRICK JACOB', 'NOAH ELIJAH JACOB'], ownerOccupied: null, LotSize: '0 Sq.Ft' },
  TaxInformation: { amountDue: '$0.00', statusMessage: 'Your account is paid in full. There is nothing due at this time.' },
  PaymentDetails: { combinedTaxesAndAssessments: '$3,132.45', PaymentSchedule: [{ ifPaidBy: 'Nov 30, 2025', pleasePay: '$0.00' }] },
  BenefitsInformation: [{ Benefit: 'Non-Homestead Cap', Type: 'Assessment Reduction', Values: { '2024': '$26,810', '2025': null, '2026': null } }],
  TaxableValueInformation: { '2024': { County: { ExemptionValue: '$0', TaxableValue: '$132,350' }, SchoolBoard: { ExemptionValue: '$0', TaxableValue: '$159,160' } } },
  AdValoremMillage: [{ authority: 'School Board Operating', millage: '5.49900', taxesLevied: '$845.30' }],
  NonAdValorem: [],
  LandBuildingExtraFeatures: { '2024': [], '2025': [], '2026': [] },
  Exemptions: {},
  AccountHistory: [{ billYear: '2025', paidAmount: '$3,007.15', receiptNumber: 'EEX-26-000928' }],
  DelinquencyInformation: { coverage: 'PARTIAL', hasActiveDelinquency: null, totalPriorYearsDue: null, unavailableYears: ['2003', '2005', '2006'], note: 'History is incomplete or inconclusive; no negative delinquency conclusion is available.' }
};
const states = Object.fromEntries(Object.keys(record).map(name => [name, { status: ['NonAdValorem', 'LandBuildingExtraFeatures', 'Exemptions'].includes(name) ? 'EMPTY' : ['AccountHistory', 'DelinquencyInformation'].includes(name) ? 'PARTIAL' : 'EXTRACTED' }]));

test('source values appear in every extracted section, including nested years, lists and tables', () => {
  const root = new Node('main'); renderSections(document, root, record, states);
  assert.equal(root.children.length, Object.keys(states).length);
  const expected = { PropertyInformation: ['01-3231-052-0010', 'NOAH ELIJAH JACOB', '0 Sq.Ft'], TaxInformation: ['$0.00', 'paid in full'], PaymentDetails: ['$3,132.45', 'Nov 30, 2025', '$0.00'], BenefitsInformation: ['Non-Homestead Cap', '2024', '$26,810', 'Not published / unavailable'], TaxableValueInformation: ['2024', 'School Board', '$159,160'], AdValoremMillage: ['School Board Operating', '5.49900', '$845.30'] };
  for (const [name, values] of Object.entries(expected)) {
    const section = root.children.find(node => node.children[0].textContent.startsWith(name + ' · '));
    for (const value of values) assert.ok(section.textContent.includes(value), `${name}: ${value} missing`);
  }
  assert.equal(descendants(root, 'table').length, 3); // Nested benefit values are stacked cards.
});

test('EMPTY comments reflect inspection, while nested empty years stay visible', () => {
  const root = new Node('main'); renderSections(document, root, record, states);
  for (const name of ['NonAdValorem', 'LandBuildingExtraFeatures', 'Exemptions']) {
    const section = root.children.find(node => node.children[0].textContent.startsWith(name + ' · '));
    assert.match(section.textContent, /source was inspected/);
  }
  const land = root.children.find(node => node.children[0].textContent.startsWith('LandBuildingExtraFeatures'));
  assert.match(land.textContent, /2024/); assert.match(land.textContent, /2025/); assert.match(land.textContent, /2026/);
  assert.equal(sectionComment('Exemptions', {status: 'EMPTY', note: 'Exemption area inspected; no exemption details printed.'}), 'Exemption area inspected; no exemption details printed.');
  assert.match(sectionComment('Exemptions', {status: 'UNAVAILABLE'}), /No empty-source conclusion/);
  assert.match(sectionComment('Exemptions', {status: 'UNVERIFIED_EMPTY'}), /inspection was not established/);
});

test('top ready label leaves historical partial coverage and JSON untouched', () => {
  const data = { status: 'partial', scrapTaxOrderRequest: record, ExtractionMetadata: { status: 'partial', section_status: states } };
  const before = JSON.stringify(data), root = new Node('main');
  assert.deepEqual(resultBadge(data), { label: 'Results ready', className: 'status' });
  assert.equal(resultBadge({status: 'succeeded'}).label, 'Results ready');
  assert.deepEqual(resultBadge({status: 'error'}), {label: 'error', className: 'status warn'});
  assert.equal(resultBadge(data, false).className, 'status warn');
  renderSections(document, root, record, states);
  assert.match(root.textContent, /AccountHistory · PARTIAL/);
  assert.match(root.textContent, /DelinquencyInformation · PARTIAL/);
  assert.match(root.textContent, /no negative delinquency conclusion/);
  assert.match(root.textContent, /2003/);
  assert.equal(JSON.stringify(data), before);
});

test('nulls and legitimate numeric or boolean zeros are preserved; source HTML remains text', () => {
  assert.equal(displayValue(null), 'Not published / unavailable');
  assert.equal(displayValue(0), '0'); assert.equal(displayValue(false), 'false');
  const root = new Node('main'), sourceText = '<img src=x onerror=alert(1)>';
  renderValue(document, root, { sourceText, amount: 0, occupied: false });
  assert.ok(root.textContent.includes(sourceText));
  assert.equal(descendants(root, 'img').length, 0);
  assert.match(root.textContent, /0/); assert.match(root.textContent, /false/);
});

test('request IDs prefer metadata and fall back to response header', () => {
  assert.equal(resultRequestId({ ExtractionMetadata: {request_id: 'ec1f4f5e-578b-4b0c-ba5e-8761c50b3a5d'} }, 'header'), 'ec1f4f5e-578b-4b0c-ba5e-8761c50b3a5d');
  assert.equal(resultRequestId({}, 'header-id'), 'header-id');
  assert.equal(resultRequestId({}), null);
});

test('HTML source and generated route export stay identical and load the module renderer', () => {
  const html = readFileSync(new URL('../public/poc.html', import.meta.url), 'utf8');
  const generated = readFileSync(new URL('../lib/poc-page.ts', import.meta.url), 'utf8');
  assert.equal(JSON.parse(generated.replace(/^export const pocHtml = /, '').replace(/;\s*$/, '')), html);
  assert.match(html, /<script type="module" src="\/poc.js"><\/script>/);
  assert.match(html, /id="request-id"/);
});

test('validation panel displays discrepancy and unavailable checks without HTML injection',()=>{
 const root=new Node('main');renderValidation(document,root,{parcel_join:'matched',authorityTaxReconciliation:'DIFFERENT',printedTotalsReconciliation:'UNAVAILABLE',untrusted:'<script>alert(1)</script>'});
 assert.match(root.textContent,/Source validation and reconciliation/);assert.match(root.textContent,/DIFFERENT/);assert.match(root.textContent,/UNAVAILABLE/);assert.match(root.textContent,/Original values remain unchanged/);assert.equal(descendants(root,'script').length,0);
});

test('nested bill documents use stacked records and preserve source values without table nesting',()=>{
 const data=JSON.parse(readFileSync(new URL('../docs/evidence/tax-document-accuracy-2026-10-12/baker-staging-ui.json',import.meta.url),'utf8'));
 const before=JSON.stringify(data),root=new Node('main');renderValue(document,root,data.documents);
 assert.equal(root.children[0].className,'record-list');assert.equal(root.children[0].children[0].className,'record-card');
 assert.match(root.textContent,/817241/);assert.match(root.textContent,/12\/10\/2025/);assert.match(root.textContent,/\$2,083\.94/);assert.match(root.textContent,/\$2,021\.42/);
 for(const table of descendants(root,'table'))assert.equal(descendants(table,'table').length,1);
 assert(descendants(root,'details').length>0);assert.equal(JSON.stringify(data),before);
});
test('scalar rows have separate containers so nested values cannot stretch unrelated labels',()=>{
 const root=new Node('main');renderValue(document,root,{paidBy:null,tax_details:{BillDetails:{receiptNumber:'817241'},rows:[{authority:'County',taxesLevied:'2083.94'}]},paidDate:'12/10/2025'});
 const list=root.children[0];assert.equal(list.className,'value-fields');assert.equal(list.children.length,3);
 assert(list.children.every(row=>row.tag==='div'&&row.children[0].tag==='dt'&&row.children[1].tag==='dd'));assert.equal(list.children[1].className,'value-field value-field-wide');
 assert.match(root.textContent,/Not published \/ unavailable/);assert.match(root.textContent,/12\/10\/2025/);
});

test('money presentation groups exact decimal strings without rounding rates, IDs, nulls or booleans',()=>{
 assert.equal(fieldDisplay('2083.94','combined_taxes_and_assessments'),'$2,083.94');
 assert.equal(fieldDisplay('0','balance_due'),'$0.00');
 assert.equal(fieldDisplay('9007199254740993.01','paid_amount'),'$9,007,199,254,740,993.01');
 assert.equal(fieldDisplay('0.01849000','millage'),'0.01849000');
 assert.equal(fieldDisplay('00123','parcel_id'),'00123');
 assert.equal(fieldDisplay(false,'ownerOccupied'),'false');assert.equal(fieldDisplay(null,'amount_paid'),'Not published / unavailable');
});

test('table missing values use a compact explained dash while a genuine zero stays monetary zero',()=>{
 const value=[{year:2025,paid_amount:'0.00',receipt_number:null},{year:2024,paid_amount:null,receipt_number:'0012'}],before=JSON.stringify(value),root=new Node('main');renderValue(document,root,value);
 assert.match(root.textContent,/— = not published or unavailable/);assert.match(root.textContent,/\$0\.00/);assert.match(root.textContent,/0012/);assert.equal(JSON.stringify(value),before);
});

test('county exemption amounts display as currency without changing IDs or source blanks',()=>{const root=new Node('main');renderValue(document,root,{exemptions:'49249',school_exemptions:'0',parcel_id:'0000123',ExemptionValue:null});assert.match(root.textContent,/\$49,249\.00/);assert.match(root.textContent,/\$0\.00/);assert.match(root.textContent,/0000123/);assert.match(root.textContent,/Not published \/ unavailable/);});
