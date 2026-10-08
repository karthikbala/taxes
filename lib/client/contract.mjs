import { floridaCounties } from '../live/florida-counties.mjs';
import { countyAdapters } from '../live/county-adapters.mjs';
import { parseMoneyCents, displayMoney } from './delinquency.mjs';

const countyKey = value => value.toLowerCase().replace(/county|florida/g, '').replace(/fl$/, '').replace(/[^a-z0-9]/g, '');
const counties = floridaCounties.filter(county => Object.hasOwn(countyAdapters, county.id));
const invalid = (message, code = 'invalid_input', http = 400) => Object.assign(new Error(message), { code, http });
const allowedInputKeys = new Set(['scrap_order_id', 'address', 'ownerName', 'county', 'transactionType', 'state', 'unit']);
function boundedString(input, key, maximum) {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x1f\x7f]/.test(value)) {
    throw invalid(`${key} must be a nonempty string of at most ${maximum} characters without control characters.`);
  }
  return value.trim();
}
export function validateClientInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Supply a JSON object.');
  if (Object.keys(input).some(key => !allowedInputKeys.has(key))) throw invalid('Only the documented client order fields are accepted; caller-supplied source URLs are prohibited.');
  const scrap_order_id = boundedString(input, 'scrap_order_id', 100);
  const address = boundedString(input, 'address', 300);
  const ownerName = boundedString(input, 'ownerName', 200);
  const countyInput = boundedString(input, 'county', 100);
  const county = counties.find(row => countyKey(row.id) === countyKey(countyInput) || countyKey(row.county_name) === countyKey(countyInput));
  if (!county) throw invalid('County must be one of the enabled Florida county adapters.', 'unsupported_county', 422);
  const transactionType = boundedString(input, 'transactionType', 10).toUpperCase();
  if (!['REFI', 'PURCHASE'].includes(transactionType)) throw invalid('transactionType must be REFI or PURCHASE.');
  if (input.state !== undefined && (typeof input.state !== 'string' || input.state.trim().toUpperCase() !== 'FL')) throw invalid('state must be FL.');
  return { scrap_order_id, address, ownerName, county: county.id, countyName: county.county_name, transactionType, state: 'FL', ...(input.unit !== undefined ? { unit: boundedString(input, 'unit', 60) } : {}) };
}

// Shapes are the client reference contract, never populated with reference values.
const shape = keys => Object.fromEntries(keys.split(' ').map(key => [key, null]));
const objectShapes = {
  PropertyInformation: { ...shape('ParcelNumber PropertyAddress MailingAddress PrimaryZone PrimaryLandUse BedsBathsHalf Floors LivingUnits LivingArea AdjustedArea LotSize YearBuilt'), Owners: [], ownerOccupied: null },
  AssessmentInformation: shape('Year LandValue BuildingValue ExtraFeatureValue MarketValue AssessedValue'),
  TaxInformation: shape('accountNumber type amountDue statusMessage lastPaymentDate lastPaymentAmount amountPaidYear note'),
  BillDetails: shape('taxYear folio municipality millCode propertyAddress mailingAddress paidBy receiptNumber paidDate paidAmount'),
  ParcelDetails: shape('millageRate'),
  TaxAmounts: shape('adValorem nonAdValorem totalDiscountable totalTax'),
  PaymentDetails: { ...shape('combinedTaxesAndAssessments discountNote'), PaymentSchedule: [] }
};
const listSections = new Set(['FullLegalDescription', 'AssessmentHistory', 'BenefitsInformation', 'SalesInformation', 'AccountHistory', 'AdValoremMillage', 'NonAdValorem']);
const mapSections = new Set(['TaxableValueInformation', 'LandBuildingExtraFeatures', 'AdValoremGroupTotals', 'Exemptions']);
const noteSections = ['BenefitsNote', 'NonAdValoremNote', 'ExemptionsNote'];
export const clientSectionNames = [...Object.keys(objectShapes), ...listSections, ...mapSections, ...noteSections, 'DelinquencyInformation'];
const clone = value => structuredClone(value);
const moneyKeys = /(?:Amount|Value|Price|Due|Paid|taxesLevied|adValorem|nonAdValorem|totalDiscountable|totalTax|combinedTaxesAndAssessments|pleasePay)$/i;
function externalValues(value, key = '') {
  if (Array.isArray(value)) return value.map(item => externalValues(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, externalValues(item, field)]));
  if (typeof value === 'number' && moneyKeys.test(key)) return displayMoney(parseMoneyCents(value));
  if (typeof value === 'number' && /^(Year|taxYear|billYear|amountPaidYear)$/.test(key)) return String(value);
  return value;
}
const statusObject = value => typeof value === 'string' ? { status: value } : value && typeof value === 'object' ? clone(value) : {};
const empty = value => value !== null && typeof value === 'object' && Object.keys(value).length === 0;
const isReported = status => /^(complete|verified|available|parsed|inspected|inspected_empty|empty|succeeded|extracted|present)$/i.test(status || '');
const unknownDelinquency = () => ({ hasActiveDelinquency: null, knownPriorYearsDue: '$0.00', totalPriorYearsDue: null, currentYearDue: null, delinquentYears: [], coverage: 'UNAVAILABLE', unavailableYears: [], note: 'Tax history was not inspected; no delinquency conclusion is available.' });

export function serializeClientRecord(order, extraction = {}) {
  // Normalized orders are accepted from the engine; direct callers undergo the same validation.
  const input = validateClientInput(Object.fromEntries(Object.entries(order).filter(([key]) => key !== 'countyName')));
  const county = counties.find(row => row.id === input.county);
  const sections = extraction.sections || {};
  const states = {};
  const warnings = [];
  const record = {};
  for (const key of clientSectionNames) {
    const supplied = key === 'DelinquencyInformation' ? extraction.delinquency ?? sections[key] : sections[key];
    const state = statusObject(extraction.section_status?.[key]);
    if (supplied === undefined || supplied === null) {
      record[key] = key === 'DelinquencyInformation' ? unknownDelinquency() : objectShapes[key] ? clone(objectShapes[key]) : listSections.has(key) ? [] : null;
      state.status ||= 'unavailable';
      state.note ||= `${key} was not retrieved or was unavailable; no empty-source conclusion is claimed.`;
      warnings.push(state.note);
    } else {
      record[key] = objectShapes[key] && typeof supplied === 'object' && !Array.isArray(supplied) ? { ...clone(objectShapes[key]), ...clone(supplied) } : clone(supplied);
      if (key === 'PropertyInformation') record[key].ownerOccupied = typeof supplied.ownerOccupied === 'boolean' ? supplied.ownerOccupied : null;
      const reportedEmpty = (Array.isArray(supplied) && !supplied.length) || empty(supplied);
      state.status ||= reportedEmpty ? 'unverified_empty' : 'available';
      state.note ||= reportedEmpty ? isReported(state.status) ? `${key} was inspected and the source reported no entries.` : `${key} has no entries but source inspection was not established.` : null;
      if (!isReported(state.status)) warnings.push(state.note || `${key}: ${state.status}`);
    }
    states[key] = state;
  }
  // AccountHistory is the latest annual bill year; prior liabilities belong in DelinquencyInformation.
  const history = record.AccountHistory;
  if (Array.isArray(history) && history.length) {
    const annual = history.filter(row => /^(annual|real estate|annual real estate|real estate annual|annual property tax)$/i.test(String(row.billType || '')));
    const validYears = annual.map(row => Number(row.billYear)).filter(year => Number.isInteger(year) && year >= 1900 && year <= 2200);
    record.AccountHistory = validYears.length ? annual.filter(row => Number(row.billYear) === Math.max(...validYears)) : [];
    if (!validYears.length) {
      states.AccountHistory = { status: 'partial', note: 'No valid latest annual bill year could be established.' };
      warnings.push(states.AccountHistory.note);
    }
  }
  const errors = clone(extraction.errors || []);
  const match = extraction.match || { status: 'SEARCH_INCOMPLETE', candidates: [] };
  const matchStatus = match.status || 'SEARCH_INCOMPLETE';
  const matchErrors = { AMBIGUOUS: 'Multiple parcels found, owner not matched', NOT_FOUND: 'No matching parcel found', SEARCH_INCOMPLETE: 'Property search incomplete' };
  const errorMessage = errors.length ? errors.map(error => typeof error === 'string' ? error : error.message || error.code || 'Extraction error').join('; ') : matchErrors[matchStatus] || 'NA';
  if (['OWNER_MISMATCH', 'OWNER_UNAVAILABLE'].includes(matchStatus)) warnings.push(`Owner verification: ${matchStatus}.`);
  if (match.notes?.length) warnings.push(...match.notes);
  const status = extraction.status || (['AMBIGUOUS', 'NOT_FOUND', 'SEARCH_INCOMPLETE'].includes(matchStatus) ? 'error' : errors.length || warnings.length || record.DelinquencyInformation.hasActiveDelinquency === null ? 'partial' : 'succeeded');
  return {
    scrap_order_id: input.scrap_order_id, address: input.address, ownerName: input.ownerName,
    county: county.county_name, state: 'FL', errorMessage, status,
    scrapTaxOrderRequest: {
      orderId: input.scrap_order_id, status: 'new', transactionType: input.transactionType,
      address: input.address, county: county.county_name, state: 'FL', errorMessage,
      matchStatus, warnings: [...new Set(warnings)], ...externalValues(record),
      ...(match.candidates?.length ? { candidateFolios: clone(match.candidates) } : {})
    },
    ExtractionMetadata: {
      contractVersion: '2.0', request_id: extraction.request_id ?? null, collected_at: extraction.collected_at ?? null,
      duration_ms: extraction.duration_ms ?? null, county_id: input.county, status,
      match: clone(match), section_status: states, sources: clone(extraction.sources || []),
      errors, validation: clone(extraction.validation || {}), provenance: clone(extraction.provenance || {})
    }
  };
}
