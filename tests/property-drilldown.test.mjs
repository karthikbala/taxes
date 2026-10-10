import test from 'node:test';import assert from 'node:assert/strict';
import {selectedPropertyOrder,selectedParcelCheck} from '../public/property-drilldown.mjs';
const property={folio:'0132310520940',address:'555 NE 15 ST',unit:'12-B',spatial_relation:'SAME_BUILDING',owners:['GASTON GIRARD'],matching_owner_names:['GASTON GIRARD']};
const neighbors={NeighboringProperties:{properties:[property]}};
const sourceOrder={scrap_order_id:'client-order',address:'555 NE 15 ST UNIT T-15',ownerName:'GASTON GIRARD',county:'miami-dade-fl',transactionType:'REFI',state:'FL',neighborOptions:{sameBuilding:true}};

test('selected matching unit preserves original order context and sends authoritative unit and owner',()=>{
 const order=selectedPropertyOrder(neighbors,property,sourceOrder);
 assert.deepEqual(order,{scrap_order_id:'client-order',address:'555 NE 15 ST UNIT 12-B',ownerName:'GASTON GIRARD',county:'miami-dade-fl',transactionType:'REFI',state:'FL'});
 assert.equal('neighborOptions' in order,false);assert.equal('folio' in order,false);
});
test('co-owner matches select the candidate owner evidence rather than the edited subject owner',()=>{
 const coowner={...property,matching_owner_names:['NOAH ELIJAH JACOB'],owners:['NOAH ELIJAH JACOB','OTHER PERSON']};
 assert.equal(selectedPropertyOrder({NeighboringProperties:{properties:[coowner]}},coowner,{...sourceOrder,ownerName:'UNRELATED EDIT'}).ownerName,'NOAH ELIJAH JACOB');
});
test('missing unit, owner, address or membership cannot start an ambiguous or invented lookup',()=>{
 for(const changed of [{...property,folio:'0132310529999'},{...property,unit:null},{...property,address:null},{...property,owners:[],matching_owner_names:[]}])assert.throws(()=>selectedPropertyOrder(neighbors,changed,sourceOrder),e=>e.code==='selected_property_unavailable');
});
test('identity check independently verifies selected folio against property and resolution fields',()=>{
 const valid={scrapTaxOrderRequest:{PropertyInformation:{ParcelNumber:'01-3231-052-0940'}},ExtractionMetadata:{match:{parcel_id:'0132310520940'}}};
 assert.equal(selectedParcelCheck(valid,property.folio).verified,true);
 for(const invalid of [{...valid,ExtractionMetadata:{match:{parcel_id:'0132310520010'}}},{...valid,scrapTaxOrderRequest:{PropertyInformation:{ParcelNumber:'0132310520010'}}},{scrapTaxOrderRequest:{PropertyInformation:{ParcelNumber:property.folio}}},{scrapTaxOrderRequest:{PropertyInformation:{ParcelNumber:null}}},{ExtractionMetadata:{match:{parcel_id:'bad-id'}}}])assert.equal(selectedParcelCheck(invalid,property.folio).verified,false);
});
