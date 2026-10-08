import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDelinquency, countyTimeZone, parseMoneyCents, displayMoney } from '../lib/client/delinquency.mjs';
// All amounts and lifecycle rows below are synthetic illustrations of classifier rules, not county proof.
const annual = (billYear, amountDue = '$0.00', status = 'Paid', extra = {}) => ({ billYear: String(billYear), billType: 'Annual', amountDue, status, ...extra });
const classify = (history, extra = {}) => classifyDelinquency({ history, coverage: 'COMPLETE', asOf: '2026-10-08', county: 'miami-dade-fl', ...extra });
test('decimal money operations are exact, reject unknown values, and never use float sums', () => {
  assert.equal(displayMoney(parseMoneyCents('$1,234.10') + parseMoneyCents('0.20')), '$1,234.30');
  assert.equal(displayMoney(parseMoneyCents('0.1')), '$0.10');
  assert.equal(displayMoney(parseMoneyCents('-12.34')), '-$12.34');
  for (const value of [null, '', 'Not Available', '12.345', {}, NaN]) assert.equal(parseMoneyCents(value), null);
});
test('complete inspected paid history permits a negative conclusion; missing years do not', () => {
  const history = [annual(2025), annual(2024), annual(2023)];
  assert.equal(classify(history).hasActiveDelinquency, false);
  const missing = classify(history, { unavailableYears: ['2011', '2012'] });
  assert.equal(missing.hasActiveDelinquency, null);
  assert.equal(missing.totalPriorYearsDue, null);
  assert.equal(missing.knownPriorYearsDue, '$0.00');
  assert.equal(missing.coverage, 'PARTIAL');
  assert.deepEqual(missing.unavailableYears, ['2011', '2012']);
  assert.equal(classify(history, { coverage: 'PARTIAL' }).hasActiveDelinquency, null);
  const rowMissing = classify([...history, annual(2012, null, 'Not Available')]);
  assert.equal(rowMissing.hasActiveDelinquency, null);
  assert.deepEqual(rowMissing.unavailableYears, ['2012']);
});
test('April 1 follows county local clock when original notice supports the default deadline', () => {
  const history = [annual(2025, '$10.00', 'Unpaid', { originalNoticeDate: '11/01/2025' })];
  const instant = '2026-04-01T04:30:00Z';
  const miami = classify(history, { asOf: instant });
  const santaRosa = classify(history, { asOf: instant, county: 'Santa Rosa' });
  assert.equal(miami.asOf, '2026-04-01');
  assert.equal(miami.hasActiveDelinquency, true);
  assert.equal(miami.delinquentYears[0].code, 'CURRENT_YEAR_DUE');
  assert.equal(miami.totalPriorYearsDue, '$0.00');
  assert.equal(miami.currentYearDue, '$10.00');
  assert.equal(santaRosa.asOf, '2026-03-31');
  assert.equal(santaRosa.hasActiveDelinquency, false);
  assert.equal(santaRosa.currentYearDue, '$10.00');
  assert.equal(countyTimeZone('santa-rosa-fl'), 'America/Chicago');
  assert.equal(countyTimeZone('Polk'), 'America/New_York');
});
test('late original notices extend the delinquency date to sixty days; source deadline controls when reported', () => {
  const history = [annual(2025, '$10', 'Unpaid', { originalNoticeDate: '2026-03-15' })];
  assert.equal(classify(history, { asOf: '2026-05-13' }).hasActiveDelinquency, false);
  assert.equal(classify(history, { asOf: '2026-05-14' }).hasActiveDelinquency, true);
  assert.equal(classify([annual(2025, '$10', 'Due', { deadline: '2026-06-01' })], { asOf: '2026-05-31' }).hasActiveDelinquency, false);
  assert.equal(classify([annual(2025, '$10', 'Due', { deadline: '2026-06-01' })], { asOf: '2026-06-01' }).hasActiveDelinquency, true);
  assert.equal(classify([annual(2025, '$10', 'Due', { deadline: 'bad' })]).hasActiveDelinquency, null);
});
test('unpaid or positive balance alone cannot establish timing; explicit delinquent status can', () => {
  for (const status of ['Unpaid', 'Due', '', 'Paid']) {
    const result = classify([annual(2025, '$10', status), annual(2024, '$20', status)]);
    assert.equal(result.hasActiveDelinquency, null, status);
    assert.equal(result.knownPriorYearsDue, '$20.00');
    assert.equal(result.currentYearDue, '$10.00');
    assert.equal(result.totalPriorYearsDue, null);
  }
  assert.equal(classify([annual(2025, '$10', 'Delinquent')]).hasActiveDelinquency, true);
});
test('active certificate/deed status is affirmative; absence of redemption is inconclusive', () => {
  for (const certificate of [{ certificateNumber: '1' }, { status: 'Not Redeemed', faceAmount: '$100' }]) {
    const result = classify([annual(2025), { billYear: '2024', billType: 'Certificate', amountDue: '$100', certificate }]);
    assert.equal(result.hasActiveDelinquency, null);
    assert.equal(result.delinquentYears.length, 0);
  }
  const active = classify([annual(2025), { billYear: '2024', billType: 'Certificate', certificate: { status: 'Outstanding', faceAmount: '$100' } }]);
  assert.equal(active.hasActiveDelinquency, true);
  assert.equal(active.delinquentYears[0].amountDue, null);
  assert.equal(active.totalPriorYearsDue, null);
  assert.equal(active.knownPriorYearsDue, '$0.00');
  const zero = classify([annual(2025), { billYear: '2024', billType: 'Certificate', amountDue: '$0', certificate: { status: 'Outstanding' } }]);
  assert.equal(zero.hasActiveDelinquency, true);
  assert.ok(zero.notes.some(note => note.includes('contradictory zero')));
});
test('closed certificate events are preserved in input history without counted liability', () => {
  for (const status of ['Redeemed', 'Cancelled', 'Expired']) {
    const event = { billYear: '2024', billType: 'Certificate', amountDue: '$100', certificate: { status, faceAmount: '$100' } };
    assert.equal(classify([annual(2025), event]).hasActiveDelinquency, false, status);
    assert.equal(event.certificate.status, status);
  }
});
test('closed deed proceeding cannot close independently active underlying certificate', () => {
  const row = { billYear: '2024', billType: 'Certificate', amountDue: '$20', certificate: { status: 'Outstanding' }, taxDeed: { status: 'Sold', faceAmount: '$50' } };
  const result = classify([annual(2025), row]);
  assert.equal(result.hasActiveDelinquency, true);
  assert.equal(result.delinquentYears[0].code, 'OPEN_CERTIFICATE');
  assert.equal(result.knownPriorYearsDue, '$20.00');
});
test('annual, certificate and deed views do not triple count one year; quote takes precedence over face amount', () => {
  const history = [annual(2025, '$0'), annual(2024, '$10', 'Delinquent'), { billYear: '2024', billType: 'Certificate', amountDue: '$12', certificate: { status: 'Outstanding', faceAmount: '$99' } }, { billYear: '2024', billType: 'Tax Deed', amountDue: '$14', taxDeed: { status: 'Pending', redemptionAmount: '$15.20', faceAmount: '$101' } }];
  const result = classify(history);
  assert.equal(result.delinquentYears.length, 1);
  assert.equal(result.delinquentYears[0].code, 'TAX_DEED_PENDING');
  assert.equal(result.totalPriorYearsDue, '$15.20');
  assert.equal(result.currentYearDue, '$0.00');
});
test('separate prior and latest-year totals retain exact decimal values and incomplete-history caveat', () => {
  const history = [annual(2025, '$0.20', 'Delinquent'), annual(2024, '$0.10', 'Delinquent'), annual(2023, '$0.20', 'Delinquent')];
  const result = classify(history);
  assert.equal(result.totalPriorYearsDue, '$0.30');
  assert.equal(result.currentYearDue, '$0.20');
  assert.equal(result.delinquentYears.length, 3);
  const partial = classify(history, { unavailableYears: ['2011'] });
  assert.equal(partial.hasActiveDelinquency, true);
  assert.equal(partial.knownPriorYearsDue, '$0.30');
  assert.equal(partial.totalPriorYearsDue, null);
});
test('unknown amounts, year, or invalid asOf cannot produce a clean negative result', () => {
  assert.equal(classify([annual(2025, null)]).hasActiveDelinquency, null);
  assert.equal(classify([{ billYear: 'unknown', amountDue: '$0' }]).hasActiveDelinquency, null);
  assert.equal(classify([annual(2025, '-1')]).currentYearDue, null);
  for (const asOf of ['bad', '2026-02-30']) assert.throws(() => classify([], { asOf }));
});

test('certificate Sold describes issuance and cannot establish a closed underlying liability', () => {
  const result = classify([annual(2025), { billYear: '2024', billType: 'Certificate', amountDue: '$20', certificate: { status: 'Sold' }, taxDeed: { status: 'Sold' } }]);
  assert.equal(result.hasActiveDelinquency, null);
  assert.equal(result.totalPriorYearsDue, null);
});

test('latest annual year ignores installment, supplemental and unknown bill types', () => {
  const result = classify([annual(2025), { billYear: '2026', billType: 'Installment', status: 'Paid', amountDue: '$0' }, { billYear: '2027', billType: 'Supplemental', status: 'Paid', amountDue: '$0' }, { billYear: '2028', status: 'Paid', amountDue: '$0' }]);
  assert.equal(result.currentBillYear, '2025');
  assert.equal(result.hasActiveDelinquency, null);
  const declared = classify([{ billYear: '2025', status: 'Paid', amountDue: '$0' }], { countyProfile: { defaultBillType: 'Annual' } });
  assert.equal(declared.hasActiveDelinquency, false);
  assert.equal(declared.currentBillYear, '2025');
});

test('missing current redemption quote downgrades classification coverage after collecting event evidence', () => {
  const result = classify([annual(2025), { billYear: '2024', billType: 'Certificate', certificate: { status: 'Outstanding', faceAmount: '$100' } }]);
  assert.equal(result.hasActiveDelinquency, true);
  assert.equal(result.coverage, 'PARTIAL');
  assert.equal(result.totalPriorYearsDue, null);
  assert.ok(result.notes.some(note => note.includes('no current')));
});
test('certificate sold is not certificate redeemed; a negative delinquent label is not active evidence',()=>{const sold=classifyDelinquency({history:[{billYear:'2025',billType:'Annual',amountDue:'$0.00',status:'No Balance Due',certificate:{status:'Sold',faceAmount:'$1,000.00'}}],coverage:'COMPLETE',asOf:'2026-10-08'});assert.equal(sold.hasActiveDelinquency,null);assert.equal(sold.totalPriorYearsDue,null);const pending=classifyDelinquency({history:[{billYear:'2025',billType:'Annual',amountDue:'$100.00',status:'Not delinquent'}],coverage:'COMPLETE',asOf:'2026-10-08'});assert.equal(pending.hasActiveDelinquency,null);assert.deepEqual(pending.delinquentYears,[]);});
