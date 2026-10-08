import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { serializeClientRecord, clientSectionNames } from '../lib/client/contract.mjs';
import { parseClientTaxHistory } from '../lib/client/bill.mjs';

const input = { scrap_order_id: 'contract-gap', address: '555 NE 15 ST UNIT 401', ownerName: 'JUDE PATRICK JACOB', county: 'Miami-Dade', transactionType: 'REFI' };
const match = { status: 'MATCHED', candidates: [] };
const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('source certificate aliases become client names without changing raw parser evidence or unknown status', async () => {
  // Exact published certificate text retained in the Miami reference-history parser regression.
  const sourceRow = 'Certificate #3390 Redeemed 05/06/2016 Face $1,926.30, Rate 0.25% Paid $2,028.87';
  const html = `<table class="bills"><tbody><tr><th class="description">2014 Annual Bill</th><td class="balance">No Balance Due</td><td class="status">Paid</td></tr><tr><td>${sourceRow}</td></tr></tbody></table>`;
  const parsed = parseClientTaxHistory(html).history[0].certificate;
  const original = structuredClone(parsed);
  const provenance = { 'AccountHistory[0].certificate': { source_id: 'tax_collector', method: 'county_history_html' } };
  const extraction = { match, sections: { AccountHistory: [{ billYear: '2014', billType: 'Annual', certificate: parsed }] }, provenance };
  const result = serializeClientRecord(input, extraction);
  const certificate = result.scrapTaxOrderRequest.AccountHistory[0].certificate;
  assert.equal(certificate.certificateNumber, '3390');
  assert.equal(certificate.interestRate, '0.25%');
  assert.equal(certificate.status, 'Redeemed');
  assert.equal(certificate.faceAmount, '$1,926.30');
  assert.equal(certificate.date, '05/06/2016');
  assert.equal(certificate.closed, true);
  assert.equal(certificate.note, sourceRow);
  assert.equal(Object.hasOwn(certificate, 'number'), false);
  assert.equal(Object.hasOwn(certificate, 'rate'), false);
  assert.deepEqual(parsed, original);
  const proof = result.ExtractionMetadata.provenance['AccountHistory[0].certificate'];
  assert.equal(proof.source_id, 'tax_collector');
  assert.equal(proof.method, 'county_history_html');
  assert.deepEqual(proof.client_normalization.raw_source_value, original);
  assert.deepEqual(proof.client_normalization.normalized_value, certificate);
  assert.deepEqual(provenance, { 'AccountHistory[0].certificate': { source_id: 'tax_collector', method: 'county_history_html' } });
  const unknown = parseClientTaxHistory(html.replace('Redeemed 05/06/2016', 'Status unavailable')).history[0].certificate;
  const incomplete = serializeClientRecord(input, { match, delinquency: { hasActiveDelinquency: null, totalPriorYearsDue: null, delinquentYears: [{ certificate: unknown }] } });
  assert.equal(incomplete.scrapTaxOrderRequest.DelinquencyInformation.delinquentYears[0].certificate.status, null);
  assert.equal(incomplete.scrapTaxOrderRequest.DelinquencyInformation.delinquentYears[0].certificate.closed, null);
  assert.equal(incomplete.scrapTaxOrderRequest.DelinquencyInformation.hasActiveDelinquency, null);
  assert.equal(incomplete.scrapTaxOrderRequest.DelinquencyInformation.totalPriorYearsDue, null);
});

test('collector payment dates normalize supported labels and ISO days, keeping printed schedule labels and provenance', async () => {
  const source = await read('./fixtures/phase-one/collectors-broward-browser-history-excerpt.html');
  for (const label of ['Jan 30, 2026', 'January 30, 2026', '2026-01-30', '1/30/2026']) {
    const rawHistory = parseClientTaxHistory(source.replace('01/30/2026', label)).history;
    const original = structuredClone(rawHistory);
    const result = serializeClientRecord(input, { match, sections: { AccountHistory: rawHistory, TaxInformation: { lastPaymentDate: label }, BillDetails: { paidDate: label }, PaymentDetails: { PaymentSchedule: [{ ifPaidBy: 'Nov 30, 2025', pleasePay: '$0.00' }] } } });
    const data = result.scrapTaxOrderRequest;
    assert.equal(data.AccountHistory[0].paidDate, '01/30/2026');
    assert.equal(data.TaxInformation.lastPaymentDate, '01/30/2026');
    assert.equal(data.BillDetails.paidDate, '01/30/2026');
    assert.equal(data.PaymentDetails.PaymentSchedule[0].ifPaidBy, 'Nov 30, 2025');
    assert.equal(result.ExtractionMetadata.provenance['AccountHistory[0].paidDate'].client_normalization.raw_source_value, label);
    assert.deepEqual(rawHistory, original);
  }
  assert.equal(serializeClientRecord(input, { match, sections: { BillDetails: { paidDate: 'Nov 25, 2025' } } }).scrapTaxOrderRequest.BillDetails.paidDate, '11/25/2025');
});

test('unsupported, incomplete and impossible payment dates remain unknown with exact raw evidence', () => {
  for (const raw of ['01/02/25', '30/01/2026', 'Jan 2026', 'February 30, 2026', '2026-02-29', '2025-13-01', 'tomorrow']) {
    const result = serializeClientRecord(input, { match, sections: { BillDetails: { paidDate: raw } } });
    assert.equal(result.scrapTaxOrderRequest.BillDetails.paidDate, null, raw);
    const proof = result.ExtractionMetadata.provenance['BillDetails.paidDate'].client_normalization;
    assert.equal(proof.raw_source_value, raw);
    assert.match(proof.note, /no date was inferred/);
    assert.ok(result.scrapTaxOrderRequest.warnings.includes(proof.note));
  }
  const leap = serializeClientRecord(input, { match, sections: { BillDetails: { paidDate: '2024-02-29' } } });
  assert.equal(leap.scrapTaxOrderRequest.BillDetails.paidDate, '02/29/2024');
});

test('missing-section companion notes match metadata without implying inspected emptiness', () => {
  const result = serializeClientRecord(input, { match });
  for (const section of clientSectionNames.filter(key => !key.endsWith('Note'))) {
    assert.equal(result.scrapTaxOrderRequest[`${section}Note`], result.ExtractionMetadata.section_status[section].note, section);
    assert.equal(result.ExtractionMetadata.section_status[section].status, 'unavailable');
  }
  assert.equal(result.scrapTaxOrderRequest.PropertyInformation.ownerOccupied, null);
  assert.equal(result.scrapTaxOrderRequest.DelinquencyInformation.hasActiveDelinquency, null);
});

function assertReferenceShape(reference, value, path = 'record') {
  if (Array.isArray(reference)) {
    assert.ok(Array.isArray(value), path);
    // Check every output row against every reference row's keys, rather than only row zero.
    for (const [index, row] of value.entries()) for (const referenceRow of reference) assertReferenceShape(referenceRow, row, `${path}[${index}]`);
  } else if (reference && typeof reference === 'object') {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value), path);
    for (const [key, child] of Object.entries(reference)) {
      assert.ok(Object.hasOwn(value, key), `${path}.${key}`);
      assertReferenceShape(child, value[key], `${path}.${key}`);
    }
  }
}

test('dated saved Miami output retains the complete reference key structure across all rows', async () => {
  // Historical fixtures prove shape compatibility only; this test makes no current-source claim.
  const reference = JSON.parse(await read('./fixtures/client/miami-client-sample.json'));
  const saved = JSON.parse(await read('../docs/evidence/values-logs/miami-live-v23.json'));
  const sections = Object.fromEntries(clientSectionNames.map(key => [key, saved.scrapTaxOrderRequest[key]]));
  const original = structuredClone(sections);
  const result = serializeClientRecord(input, { match, sections, provenance: saved.ExtractionMetadata.provenance, section_status: saved.ExtractionMetadata.section_status });
  assertReferenceShape(reference, result);
  assert.deepEqual(sections, original);
  assert.equal(result.scrapTaxOrderRequest.PropertyInformation.ownerOccupied, null);
  assert.equal(result.scrapTaxOrderRequest.DelinquencyInformation.hasActiveDelinquency, null);
  assert.ok(Object.hasOwn(result, 'status')); // Explicit additive envelope extensions.
  assert.ok(Object.hasOwn(result, 'ExtractionMetadata'));
});
