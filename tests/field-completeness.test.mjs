import test from 'node:test';import assert from 'node:assert/strict';import {inspectFields} from '../scripts/field-completeness.mjs';
test('field inventory preserves zero, false and missing as different outcomes without changing source data',()=>{
 const record={property:{parcel_id:'P',owner:null,ownerOccupied:false},assessment:{year:2026,taxable_value:'0.00'},taxes:{payments:[],date:''},documents:[]},copy=JSON.stringify(record),r=inspectFields(record,'county');
 assert.equal(r.fields.find(f=>f.path==='property.owner').status,'UNAVAILABLE');assert.equal(r.fields.find(f=>f.path==='property.ownerOccupied').status,'PRESENT');
 assert.equal(r.fields.find(f=>f.path==='assessment.taxable_value').explicit_zero,true);assert.equal(r.fields.find(f=>f.path==='taxes.payments').status,'EMPTY_ARRAY');assert.equal(r.fields.find(f=>f.path==='taxes.date').status,'EMPTY_STRING');assert.equal(JSON.stringify(record),copy);
});
test('field inventory respects requested scope rather than filling annual roll or collector-only gaps',()=>{
 const r=inspectFields({property:{parcel_id:'P'},assessment:{year:2026},taxes:null,documents:[]},'state_roll');
 for(const name of ['taxes','documents'])assert.equal(r.fields.find(f=>f.path===name).status,'NOT_REQUESTED');
 assert.equal(inspectFields({property:{parcel_id:'P'},assessment:null,taxes:{balance:'0'},documents:[]},'collector').fields.find(f=>f.path==='assessment').status,'NOT_REQUESTED');
 assert.equal(inspectFields({scrapTaxOrderRequest:{PropertyInformation:{ParcelNumber:'P',OwnerName:null}}},'address').fields.find(f=>f.path.endsWith('OwnerName')).status,'UNAVAILABLE');
});
