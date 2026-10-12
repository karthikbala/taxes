import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateClientInput, serializeClientRecord, clientSectionNames } from '../lib/client/contract.mjs';
import { floridaCounties } from '../lib/live/florida-counties.mjs';
import { countyAdapters } from '../lib/live/county-adapters.mjs';
const input = { scrap_order_id: 'order-100', address: '555 NE 15 ST UNIT 401', ownerName: 'JUDE PATRICK JACOB', county: 'Miami-Dade', transactionType: 'REFI' };
const extract = { match: { status: 'MATCHED', parcel_id: '01-3231-052-0010', candidates: [] }, request_id: 'test-request', collected_at: '2026-10-08T00:00:00Z', duration_ms: 12 };

test('enabled adapter registry supplies all twenty county aliases and canonical IDs', () => {
  assert.equal(Object.keys(countyAdapters).length, 20);
  for (const county of floridaCounties.filter(row => countyAdapters[row.id])) {
    for (const alias of [county.id, county.county_name, county.name, `${county.county_name} County, FL`, county.county_name.toUpperCase().replace(/[-.]/g, ' ')]) {
      const result = validateClientInput({ ...input, county: alias });
      assert.equal(result.county, county.id, alias);
      assert.equal(result.countyName, county.county_name);
    }
  }
});
test('required bounded order strings and transaction are validated without trusting arbitrary URLs', () => {
  assert.equal(validateClientInput({ ...input, transactionType: ' purchase ', state: 'fl', unit: '401' }).transactionType, 'PURCHASE');
  for (const key of ['scrap_order_id', 'address', 'ownerName', 'county', 'transactionType']) {
    for (const value of [undefined, '', ' ', 1, {}, 'bad\nvalue', 'x'.repeat(400)]) assert.throws(() => validateClientInput({ ...input, [key]: value }), { code: 'invalid_input' });
  }
  for (const extra of [{ sourceURL: 'https://example.com' }, { source_url: 'http://127.0.0.1' }, { include_pdf: true }, { state: 'CA' }, { transactionType: 'CASH' }, { unit: false }]) assert.throws(() => validateClientInput({ ...input, ...extra }));
  assert.throws(() => validateClientInput({ ...input, county: 'Alachua' }), { code: 'unsupported_county' });
  assert.throws(() => validateClientInput([]));
  assert.equal(validateClientInput({ ...input, scrap_order_id: '  abc  ', address: '  Main Street  ' }).address, 'Main Street');
});
test('reference sample keys remain canonical without filling missing sections from the sample', async () => {
  const sample = JSON.parse(await readFile(new URL('./fixtures/client/miami-client-sample.json', import.meta.url), 'utf8'));
  const record = serializeClientRecord(input, extract);
  for (const key of Object.keys(sample)) assert.ok(Object.hasOwn(record, key), key);
  for (const key of Object.keys(sample.scrapTaxOrderRequest)) assert.ok(Object.hasOwn(record.scrapTaxOrderRequest, key), key);
  assert.equal(record.scrapTaxOrderRequest.status, 'new');
  assert.equal(record.scrapTaxOrderRequest.transactionType, 'REFI');
  assert.equal(record.scrapTaxOrderRequest.PropertyInformation.ParcelNumber, null);
  assert.equal(record.scrapTaxOrderRequest.PropertyInformation.ownerOccupied, null);
  assert.deepEqual(record.scrapTaxOrderRequest.TaxAmounts, { adValorem: null, nonAdValorem: null, totalDiscountable: null, totalTax: null });
  assert.deepEqual(record.scrapTaxOrderRequest.AccountHistory, []);
  assert.equal(record.scrapTaxOrderRequest.DelinquencyInformation.hasActiveDelinquency, null);
  assert.equal(record.scrapTaxOrderRequest.DelinquencyInformation.knownPriorYearsDue, null);
  assert.equal(record.scrapTaxOrderRequest.DelinquencyInformation.coverage, 'UNAVAILABLE');
  assert.equal(record.status, 'partial');
  assert.equal(record.ExtractionMetadata.section_status.AccountHistory.status, 'unavailable');
  assert.match(record.ExtractionMetadata.section_status.AccountHistory.note, /not retrieved/);
  assert.equal(record.ExtractionMetadata.request_id, 'test-request');
  assert.equal(record.ExtractionMetadata.duration_ms, 12);
});
test('inspected empty sections differ from missing sections and unsupported occupancy is nullable', () => {
  const section_status = { NonAdValorem: { status: 'empty', note: 'Original bill reports no assessments.' }, Exemptions: 'inspected_empty' };
  const result = serializeClientRecord(validateClientInput(input), { ...extract, sections: { PropertyInformation: { Owners: ['OWNER'], MailingAddress: 'Other town', ownerOccupied: 'false' }, NonAdValorem: [], Exemptions: {} }, section_status });
  assert.equal(result.scrapTaxOrderRequest.PropertyInformation.ownerOccupied, null);
  assert.equal(result.scrapTaxOrderRequest.PropertyInformation.ParcelNumber, null);
  assert.equal(result.ExtractionMetadata.section_status.NonAdValorem.status, 'empty');
  assert.equal(result.ExtractionMetadata.section_status.NonAdValorem.note, 'Original bill reports no assessments.');
  assert.match(result.ExtractionMetadata.section_status.Exemptions.note, /inspected/);
  assert.equal(result.ExtractionMetadata.section_status.SalesInformation.status, 'unavailable');
  assert.equal(serializeClientRecord(input, { ...extract, sections: { PropertyInformation: { ownerOccupied: false } } }).scrapTaxOrderRequest.PropertyInformation.ownerOccupied, false);
});
test('serializer preserves source sentinels and emits numeric monetary values as display strings', () => {
  const sections = { AssessmentInformation: { Year: 2026, LandValue: 0, BuildingValue: null, ExtraFeatureValue: 'Not Available', AssessedValue: 100.25 }, TaxInformation: { amountDue: 0, lastPaymentAmount: 0.1 } };
  const result = serializeClientRecord(input, { ...extract, sections });
  const data = result.scrapTaxOrderRequest;
  assert.equal(data.AssessmentInformation.Year, '2026');
  assert.equal(data.AssessmentInformation.LandValue, '$0.00');
  assert.equal(data.AssessmentInformation.BuildingValue, null);
  assert.equal(data.AssessmentInformation.ExtraFeatureValue, 'Not Available');
  assert.equal(data.AssessmentInformation.AssessedValue, '$100.25');
  assert.equal(data.TaxInformation.lastPaymentAmount, '$0.10');
  assert.equal(sections.AssessmentInformation.LandValue, 0);
});
test('latest annual bill history excludes paid prior years and certificate views', () => {
  const history = [{ billYear: '2024', billType: 'Annual', status: 'Paid' }, { billYear: '2025', billType: 'Annual', status: 'Paid' }, { billYear: '2024', billType: 'Tax Certificate', status: 'Outstanding' }];
  const record = serializeClientRecord(input, { ...extract, sections: { AccountHistory: history } });
  assert.deepEqual(record.scrapTaxOrderRequest.AccountHistory, [history[1]]);
  assert.equal(history.length, 3);
});
test('failed and owner-mismatch resolution is explicit and keeps client request status new', () => {
  const ambiguous = serializeClientRecord(input, { match: { status: 'AMBIGUOUS', candidates: ['1', '2'] } });
  assert.equal(ambiguous.status, 'error');
  assert.equal(ambiguous.errorMessage, 'Multiple parcels found, owner not matched');
  assert.deepEqual(ambiguous.scrapTaxOrderRequest.candidateFolios, ['1', '2']);
  const owner = serializeClientRecord(input, { ...extract, match: { status: 'OWNER_MISMATCH', candidates: [] } });
  assert.equal(owner.scrapTaxOrderRequest.matchStatus, 'OWNER_MISMATCH');
  assert.ok(owner.scrapTaxOrderRequest.warnings.some(warning => warning.includes('OWNER_MISMATCH')));
  assert.equal(owner.scrapTaxOrderRequest.status, 'new');
});
test('all explicit sample sections can be serialized with complete metadata without mutation', async () => {
  // This fixture checks schema compatibility, not fresh county or collector correctness.
  const sample = JSON.parse(await readFile(new URL('./fixtures/client/miami-client-sample.json', import.meta.url), 'utf8'));
  const sections = Object.fromEntries(clientSectionNames.map(key => [key, sample.scrapTaxOrderRequest[key]]));
  const section_status = Object.fromEntries(clientSectionNames.map(key => [key, { status: 'complete' }]));
  const result = serializeClientRecord(input, { ...extract, sections, section_status, provenance: { BillDetails: { source_id: 'saved-schema-fixture' } }, validation: { identity: 'fixture-only' }, sources: [{ id: 'fixture', status: 'saved' }] });
  assert.equal(result.status, 'succeeded');
  for (const key of clientSectionNames) assert.deepEqual(result.scrapTaxOrderRequest[key], sections[key]);
  assert.equal(result.ExtractionMetadata.validation.identity, 'fixture-only');
  assert.equal(result.ExtractionMetadata.sources[0].status, 'saved');
});

test('source EXTRACTED/PRESENT states are positive and PARTIAL remains a gap', async () => {
  const sample = JSON.parse(await readFile(new URL('./fixtures/client/miami-client-sample.json', import.meta.url), 'utf8'));
  const sections = Object.fromEntries(clientSectionNames.map(key => [key, sample.scrapTaxOrderRequest[key]]));
  const states = Object.fromEntries(clientSectionNames.map((key, i) => [key, { status: i % 2 ? 'EXTRACTED' : 'PRESENT' }]));
  assert.equal(serializeClientRecord(input, { ...extract, sections, section_status: states }).status, 'succeeded');
  states.BillDetails.status = 'PARTIAL';
  assert.equal(serializeClientRecord(input, { ...extract, sections, section_status: states }).status, 'partial');
});

test('installment and supplemental entries cannot replace the latest annual client bill', () => {
  const history = [{ billYear: '2025', billType: 'Annual' }, { billYear: '2026', billType: 'Installment' }, { billYear: '2027', billType: 'Supplemental' }, { billYear: '2028' }];
  assert.deepEqual(serializeClientRecord(input, { ...extract, sections: { AccountHistory: history } }).scrapTaxOrderRequest.AccountHistory, [history[0]]);
});
