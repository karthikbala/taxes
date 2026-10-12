// Pure classification of source-reported history. No network access or inferred redemption prices.
export function parseMoneyCents(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (negative ? -1n : 1n);
}
export function displayMoney(cents) {
  if (cents === null || cents === undefined) return null;
  const negative = cents < 0n, absolute = negative ? -cents : cents;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${whole}.${(absolute % 100n).toString().padStart(2, '0')}`;
}
export function countyTimeZone(county) {
  return /santa[^a-z]*rosa/i.test(String(county || '')) ? 'America/Chicago' : 'America/New_York';
}
function localDay(asOf, timeZone) {
  if (typeof asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asOf)) return validDay(asOf);
  const date = asOf instanceof Date ? asOf : new Date(asOf ?? Date.now());
  if (!Number.isFinite(date.getTime())) throw new TypeError('asOf must be a valid date or timestamp.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function validDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '')) || /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value || ''))?.map((v, i, all) => i === 0 ? v : i === 1 ? all[3] : i === 2 ? all[1].padStart(2, '0') : all[2].padStart(2, '0'));
  if (!match) return null;
  const day = `${match[1]}-${match[2]}-${match[3]}`, date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null;
}
function addDays(day, count) {
  const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
const closed = value => /\b(redeemed|cancelled|canceled|expired|closed|paid|settled|completed|sold)\b/i.test(String(value || '')) && !/\b(not|un)\s*(redeemed|paid|sold|closed)\b/i.test(String(value || ''));
const closedCertificate = value => /\b(redeemed|cancelled|canceled|expired|closed)\b/i.test(String(value || '')) && !/\bnot\s*(redeemed|closed)\b/i.test(String(value || ''));
const openCertificate = value => /\b(outstanding|active|open|unredeemed)\b/i.test(String(value || '')) && !closedCertificate(value);
const openDeed = value => /\b(pending|applied|application pending|active|open|scheduled)\b/i.test(String(value || '')) && !closed(value);
const yearOf = row => /^\d{4}$/.test(String(row.billYear ?? row.year ?? '')) ? Number(row.billYear ?? row.year) : null;
const billType = row => row.billType ?? row.bill_type ?? null;
const isAnnual = (row, profile) => /^(annual|real estate|annual real estate|real estate annual|annual property tax)$/i.test(String(billType(row) ?? profile?.defaultBillType ?? profile?.historyBillType ?? ''));
function quote(row, event) {
  // faceAmount/faceValue/originalAmount describe the certificate, not today's collectible amount.
  const values = [event?.redemptionAmount, event?.redemptionQuote, event?.amountDue, event?.balanceDue, row.amountDue, row.balance_due];
  for (const value of values) { const cents = parseMoneyCents(value); if (cents !== null) return cents; }
  return null;
}
function eventFrom(row, kind) {
  const nested = row[kind];
  if (nested && typeof nested === 'object') return nested;
  if (kind === 'certificate' && /certificate/i.test(String(billType(row)))) return { ...row, status: row.status };
  if (kind === 'taxDeed' && /tax.?deed/i.test(String(billType(row)))) return { ...row, status: row.status };
  return null;
}
function dueDeadline(row, year, fallback) {
  const explicit = row.delinquencyDate ?? row.delinquentOn ?? row.deadline ?? fallback;
  const reportedDeadline = typeof explicit === 'object' ? explicit?.[year] ?? explicit?.date : explicit;
  const sourceDate = validDay(reportedDeadline);
  if (reportedDeadline && !sourceDate) return null;
  if (sourceDate) return sourceDate;
  const originalNotice = row.originalNoticeDate ?? row.originalTaxNoticeDate ?? row.noticeDate;
  const notice = validDay(originalNotice);
  if (originalNotice && !notice) return null;
  const april = `${year + 1}-04-01`;
  return notice ? [april, addDays(notice, 60)].sort().at(-1) : april;
}

export function classifyDelinquency({ history = [], unavailableYears = [], coverage = 'UNAVAILABLE', asOf, county, timeZone, deadline, countyProfile } = {}) {
  if (!Array.isArray(history) || !Array.isArray(unavailableYears)) throw new TypeError('history and unavailableYears must be arrays.');
  const zone = timeZone || countyTimeZone(county), day = localDay(asOf, zone);
  if (!day) throw new TypeError('asOf must be a valid date.');
  const annualRow = row => isAnnual(row, countyProfile);
  const annualYears = history.filter(annualRow).map(yearOf).filter(year => year !== null);
  const currentBillYear = annualYears.length ? Math.max(...annualYears) : Number(day.slice(0, 4)) - 1;
  const unavailable = [...new Set([...unavailableYears.map(String), ...history.filter(row => /not available|unavailable/i.test(String(row.status || ''))).map(row => String(row.billYear ?? row.year ?? 'unknown'))])];
  const unknown = [];
  if (coverage !== 'COMPLETE') unknown.push(`History coverage is ${coverage}; unseen prior liabilities cannot be ruled out.`);
  if (unavailable.length) unknown.push(`Unavailable years: ${unavailable.join(', ')}.`);
  const liabilities = new Map();
  let currentUnknown = false;
  for (const row of history) {
    const year = yearOf(row);
    if (year === null) { unknown.push('A history row has no valid tax year.'); continue; }
    if (/not available|unavailable/i.test(String(row.status || ''))) continue;
    const certificate = eventFrom(row, 'certificate'), deed = eventFrom(row, 'taxDeed');
    if (!annualRow(row) && billType(row) === null && !certificate && !deed) { unknown.push(`Tax year ${year} has no source bill type or county-profile annual declaration.`); continue; }
    const annualAmount = parseMoneyCents(row.amountDue ?? row.balance_due);
    let code = null, amount = annualAmount, rank = 1;
    // An affirmative active event is required; absence of a redemption outcome alone is insufficient.
    if (deed && openDeed(deed.status)) { code = 'TAX_DEED_PENDING'; amount = quote(row, deed); rank = 3; }
    else if (certificate && (openCertificate(certificate.status) || /^issued$/i.test(String(certificate.status || '')) && quote(row, certificate) > 0n)) { code = 'OPEN_CERTIFICATE'; amount = quote(row, certificate); rank = 2; }
    else if (!annualRow(row) && (certificate ? closedCertificate(certificate.status) : deed ? closed(deed.status) : closed(row.status))) continue;
    else if (!annualRow(row) || certificate && !closedCertificate(certificate.status) || deed && !closed(deed.status)) {
      unknown.push(`Tax year ${year} has an event with no affirmative active or closed status.`);
      if (!annualRow(row)) continue;
    }
    if (code === null) {
      if (annualAmount === null || annualAmount < 0n) { unknown.push(`Tax year ${year} has no usable nonnegative balance.`); if (year === currentBillYear) currentUnknown = true; continue; }
      if (annualAmount === 0n) continue;
      const supportedStatus = /\bdelinquent\b/i.test(String(row.status || '')) && !/\bnot\s+delinquent\b|\bnon[- ]?delinquent\b/i.test(String(row.status||'')) && !closed(row.status);
      const explicitDate = row.delinquencyDate ?? row.delinquentOn ?? row.deadline ?? deadline ?? row.originalNoticeDate ?? row.originalTaxNoticeDate ?? row.noticeDate;
      if (!supportedStatus && !explicitDate) unknown.push(`Tax year ${year} has a positive balance but no source delinquent status, original notice date or deadline.`);
      const cutoff = dueDeadline(row, year, deadline);
      if (!cutoff) unknown.push(`Tax year ${year} has an invalid source deadline or notice date.`);
      if (supportedStatus || explicitDate && cutoff && day >= cutoff) code = year < currentBillYear ? 'PRIOR_YEAR_DUE' : 'CURRENT_YEAR_DUE';
    }
    if (amount !== null && amount < 0n) { unknown.push(`Tax year ${year} has a negative event balance.`); amount = null; }
    if (code && amount === null) unknown.push(`Tax year ${year} has an active event but no current collectible/redemption quote.`);
    if (code && amount === 0n) unknown.push(`Tax year ${year} has an active event but a contradictory zero quote; lifecycle status was not inferred closed.`);
    if (code || amount !== null && amount > 0n || year === currentBillYear) {
      // Annual, certificate and deed entries for the same year's tax are representations of one liability.
      const key = row.liabilityId ? `${year}:${row.liabilityId}` : `${year}:annual-tax`;
      const existing = liabilities.get(key);
      const item = { row, year, amount, code, rank };
      if (!existing || rank > existing.rank || rank === existing.rank && amount !== null && (existing.amount === null || amount > existing.amount)) liabilities.set(key, item);
    }
  }
  let prior = 0n, current = 0n, priorUnknownAmount = false;
  const delinquentYears = [];
  for (const item of liabilities.values()) {
    if (item.year === currentBillYear) {
      if (item.amount === null) currentUnknown = true; else current += item.amount;
    }
    if (item.year < currentBillYear) {
      if (item.amount === null) priorUnknownAmount = true; else prior += item.amount;
    }
    if (!item.code) continue;
    delinquentYears.push({
      billYear: String(item.year), billType: billType(item.row), amountDue: displayMoney(item.amount),
      status: item.row.status ?? null, code: item.code,
      ...(item.row.certificate ? { certificate: structuredClone(item.row.certificate) } : {}),
      ...(item.row.taxDeed ? { taxDeed: structuredClone(item.row.taxDeed) } : {}),
      note: item.row.note ?? null
    });
  }
  delinquentYears.sort((a, b) => Number(b.billYear) - Number(a.billYear));
  if (priorUnknownAmount) unknown.push('An active prior-year event has no current redemption/collectible quote; certificate face values were not summed.');
  const hasActiveDelinquency = delinquentYears.length ? true : unknown.length ? null : false;
  const effectiveCoverage = coverage === 'COMPLETE' && unknown.length ? 'PARTIAL' : coverage;
  const currentPresent = annualYears.includes(currentBillYear) || [...liabilities.values()].some(item => item.year === currentBillYear);
  return {
    hasActiveDelinquency, knownPriorYearsDue: displayMoney(prior),
    totalPriorYearsDue: unknown.length || priorUnknownAmount ? null : displayMoney(prior),
    currentYearDue: currentUnknown || !currentPresent ? null : displayMoney(current),
    delinquentYears, coverage: effectiveCoverage,
    unavailableYears: unavailable, currentBillYear: String(currentBillYear), asOf: day, timeZone: zone,
    note: hasActiveDelinquency === true ? 'Active delinquency is supported by the inspected history.' : hasActiveDelinquency === false ? 'No active delinquency found in complete inspected history.' : 'History is incomplete or inconclusive; no negative delinquency conclusion is available.',
    notes: [...new Set(unknown)]
  };
}
