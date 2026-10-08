import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {enrichMiami} from '../lib/client/miami.mjs';

const source = JSON.parse(readFileSync(new URL('./fixtures/client/miami-property-source.json', import.meta.url)));
const enrich = raw => enrichMiami(raw, '0132310520010');

test('saved Miami source blanks do not establish certified, preliminary or working status', () => {
  const result = enrich(source);
  assert.deepEqual(result.AssessmentHistory.map(row => [row.Year, row.Status]), [['2026', null], ['2025', null], ['2024', null]]);
  for (const row of result.AssessmentHistory) assert.equal(row.SourceScope, 'PROPERTY_APPRAISER_ROLL_AUTHORITY_UNSPECIFIED');
  assert.equal(result.AssessmentInformation.Status, null);
  assert.equal(result.AssessmentInformation.SourceScope, 'PROPERTY_APPRAISER_ROLL_AUTHORITY_UNSPECIFIED');
  assert.equal(result.PropertyInformation.ownerOccupied, null);
  assert.match(result.notes.join(' '), /source year does not establish certification/);
});

test('status provenance retains same-year source messages and an explicit unknown reason', () => {
  const result = enrich(source);
  for (const [index, row] of source.Assessment.AssessmentInfos.entries()) {
    const proof = result.provenance[`AssessmentHistory.${index}.Status`];
    assert.equal(proof.source_year, String(row.Year));
    assert.equal(proof.missing_reason, 'NO_EXPLICIT_SAME_YEAR_ROLL_STATUS');
    assert.deepEqual(proof.source_messages.map(message => message.source_value), [row.Message, ...source.Assessment.Messages.filter(message => message.Year === row.Year).map(message => message.Message)]);
    assert.equal(result.provenance[`AssessmentHistory.${index}.SourceScope`].authority_scope, null);
  }
  assert.deepEqual(result.provenance['AssessmentInformation.Status'], result.provenance['AssessmentHistory.0.Status']);
});

test('missing assessment messages remain unknown and existing assessment values are preserved', () => {
  const raw = structuredClone(source);
  delete raw.Assessment.Messages;
  const result = enrich(raw);
  for (const [index, row] of raw.Assessment.AssessmentInfos.entries()) {
    assert.equal(result.AssessmentHistory[index].Status, null);
    assert.equal(result.provenance[`AssessmentHistory.${index}.AssessedValue`].source_value, row.AssessedValue);
    assert.equal(result.provenance[`AssessmentHistory.${index}.MarketValue`].source_value, row.TotalValue);
  }
  assert.deepEqual(raw.Assessment.AssessmentInfos, source.Assessment.AssessmentInfos);
});
