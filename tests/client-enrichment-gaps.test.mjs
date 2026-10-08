import test from 'node:test';
import assert from 'node:assert/strict';
import {billExemptions} from '../lib/client/engine.mjs';
function sample(taxable='$153,718',year='2025'){
 return {sections:{BillDetails:{taxYear:year},AdValoremMillage:[{group:'Miami-Dade County',taxableValue:taxable,exemptionValue:null}]},validation:{},provenance:{}};
}
const assessment={sections:{TaxableValueInformation:{2025:{County:{TaxableValue:'$153,718',ExemptionValue:'$0'}}}}};
test('same-year authority enrichment is supplied only after taxable identity matches',()=>{const bill=sample();billExemptions(bill,assessment);assert.equal(bill.sections.AdValoremMillage[0].exemptionValue,'$0');assert.equal(bill.validation.taxable_value_0,'matched');assert.equal(bill.provenance['AdValoremMillage[0].exemptionValue'].validation,'same_year_authority_taxable_value_matched');});
test('mismatch, missing year, missing amount and unknown authority cannot fill a bill exemption',()=>{
 for(const b of [sample('$164,478'),sample('$153,718','2026'),sample(null),{...sample(),sections:{...sample().sections,AdValoremMillage:[{group:'Unrecognized authority',taxableValue:'$153,718',exemptionValue:null}]}}]){
  billExemptions(b,assessment);assert.equal(b.sections.AdValoremMillage[0].exemptionValue,null);assert.ok(['different','unavailable'].includes(b.validation.taxable_value_0));assert.equal(b.provenance['AdValoremMillage[0].exemptionValue'],undefined);
 }
});
test('printed exemption remains authoritative even when appraiser values differ',()=>{const b=sample('$164,478');b.sections.AdValoremMillage[0].exemptionValue='$25,000';billExemptions(b,assessment);assert.equal(b.sections.AdValoremMillage[0].exemptionValue,'$25,000');assert.equal(b.validation.taxable_value_0,'different');});
