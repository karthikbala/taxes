import {LookupError} from '../live/engine.mjs';

// Native contract verified against PropertySearch/main.ca4dd149bc5b80db.js.
export const miamiEndpoint = 'https://apps.miamidadepa.gov/PApublicServiceProxy/PaServicesProxy.ashx';
const sourceId = 'miami_assessment';
const parcel = value => String(value ?? '').replace(/[^0-9]/g, '');
const text = value => value === null || value === undefined ? null : String(value).trim();
const tokens = value => String(value ?? '').normalize('NFKC').toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
export const normalizeMiamiOwner = value => tokens(value).replace(/[^A-Z0-9 &'/-]/g, '').replace(/\s+/g, ' ').trim();
export function ownerMatchesMiami(requested, owners) {
  const expected = normalizeMiamiOwner(requested);
  const multiset = name => normalizeMiamiOwner(name).split(/\s+/).filter(Boolean).sort().join(' ');
  return !!expected && owners.some(owner => multiset(owner) === multiset(expected));
}
export function normalizeMiamiAddress(address, explicitUnit) {
  let value = tokens(String(address ?? '').split(',')[0]);
  // Boundaries support user notation NE15ST and UNIT401, without changing unit identifiers.
  value = value.replace(/([A-Z])(?=\d)/g, '$1 ').replace(/(\d)(?=[A-Z])/g, '$1 ');
  const unitMatch = value.match(/(?:\b(?:UNIT|APT|APARTMENT|SUITE|STE)\s*:?\s*|#\s*)([A-Z0-9 -]+)$/);
  let embeddedUnit = unitMatch ? unitMatch[1].replace(/\s+/g, '') : '';
  if (unitMatch) value = value.slice(0, unitMatch.index).trim();
  const unit = explicitUnit === undefined || explicitUnit === null || explicitUnit === '' ? embeddedUnit : tokens(explicitUnit).replace(/^(UNIT|APT|SUITE|STE)\s*:?\s*/, '').replace(/\s+/g, '');
  value = value.replace(/\bNORTHEAST\b/g,'NE').replace(/\bNORTHWEST\b/g,'NW').replace(/\bSOUTHEAST\b/g,'SE').replace(/\bSOUTHWEST\b/g,'SW').replace(/\bNORTH\b/g,'N').replace(/\bSOUTH\b/g,'S').replace(/\bEAST\b/g,'E').replace(/\bWEST\b/g,'W');
  value = value.replace(/\b(\d+) (ST|ND|RD|TH)\b(?=\s+(?:ST|STREET|AVE|AVENUE|RD|ROAD|TER|TERRACE|CT|COURT|PL|PLACE|DR|DRIVE)\b)/g, '$1')
    .replace(/\bSTREET\b/g, 'ST').replace(/\bAVENUE\b/g, 'AVE').replace(/\bROAD\b/g, 'RD').replace(/\bDRIVE\b/g, 'DR').replace(/\bTERRACE\b/g, 'TER').replace(/\bCOURT\b/g, 'CT').replace(/\bPLACE\b/g, 'PL');
  return {street: value, unit, conflict: !!embeddedUnit && !!unit && embeddedUnit !== unit};
}
const json = value => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { throw new LookupError('layout_changed', 'Miami source did not return valid JSON.'); }
};
export function matchMiamiCandidates(input, data) {
  const wanted = normalizeMiamiAddress(input.address, input.unit);
  const rows = data?.MinimumPropertyInfos;
  const result = {status: 'SEARCH_INCOMPLETE', candidates: [], notes: []};
  if (wanted.conflict) return {...result, notes: ['Address unit conflicts with the supplied unit.']};
  if (!Array.isArray(rows) || data.Completed !== true || !Number.isInteger(data.Total) || data.Total < 0 || data.Total !== rows.length || (data.Count !== undefined && data.Count !== rows.length) || data.HasMore === true || data.HasNextPage === true) {
    return {...result, notes: ['Native address candidate coverage is incomplete or unverified; no parcel selected.']};
  }
  const referenceRow = row => /^RO\b|REFERENCE/i.test(String(row.Status||'')) || [row.Owner1,row.Owner2,row.Owner3].some(value=>/^REFERENCE ONLY$/i.test(String(value||'').trim()));
  if(!wanted.unit&&rows.some(row=>normalizeMiamiAddress(row.SiteAddress,row.SiteUnit).street===wanted.street&&(referenceRow(row)||String(row.SiteUnit||'').trim()&&/CONDO/i.test(String(row.SubdivisionDescription||'')))))return {...result,notes:['A unit is required for the published condominium address; the reference parent is not a property match.']};
  const matching = rows.filter(row => {
    const candidate = normalizeMiamiAddress(row.SiteAddress, row.SiteUnit);
    return !referenceRow(row) && !candidate.conflict && candidate.street === wanted.street && candidate.unit === wanted.unit;
  });
  const candidates = matching.map(row => ({parcel_id: parcel(row.Strap), address: row.SiteAddress, unit: text(row.SiteUnit), owners: [row.Owner1, row.Owner2, row.Owner3].filter(v => text(v)), source_id: 'miami_address_search'}));
  if (candidates.some(row => !/^\d{13}$/.test(row.parcel_id))) return {...result, candidates, notes: ['An exact address candidate has no valid folio identity.']};
  const ids = [...new Set(candidates.map(row => row.parcel_id))];
  if (!ids.length) return {status: 'NOT_FOUND', candidates, notes: ['No exact street and unit candidate in the complete native search response.']};
  if (ids.length !== 1) {
    const ownerIds = [...new Set(candidates.filter(row => ownerMatchesMiami(input.ownerName, row.owners)).map(row => row.parcel_id))];
    if (ownerIds.length === 1) return {status: 'MATCHED', parcel_id: ownerIds[0], candidates, notes: ['Multiple exact street/unit parcels narrowed to one by native structured owner fields.']};
    return {status: 'AMBIGUOUS', candidates, notes: ['Multiple exact street/unit parcels remain; structured owner fields did not narrow to exactly one owner match.']};
  }
  return {status: 'MATCHED', parcel_id: ids[0], candidates, notes: []};
}
export async function resolveMiami(input, get) {
  const wanted = normalizeMiamiAddress(input.address, input.unit);
  if (wanted.conflict) return {status: 'SEARCH_INCOMPLETE', candidates: [], notes: ['Address unit conflicts with the supplied unit.']};
  const query = new URLSearchParams({Operation: 'GetAddress', clientAppName: 'PropertySearch', myUnit: wanted.unit, from: '1', myAddress: wanted.street, to: '200'});
  let search = json(await get(miamiEndpoint + '?' + query, 'miami_address_search'));
  const searchNotes=[];
  // The native unit filter rejects published alphanumeric units such as T-15.
  // Retry the same fresh county street index, then independently filter the exact
  // requested unit only after bounded complete pagination. Source attempts remain
  // separate; no saved response or inferred unit is used.
  if(wanted.unit&&search?.Completed===false&&search?.Total===0&&Array.isArray(search.MinimumPropertyInfos)&&search.MinimumPropertyInfos.length===0){
    const allUnitQuery=new URLSearchParams({...Object.fromEntries(query),myUnit:''});
    search=json(await get(miamiEndpoint+'?'+allUnitQuery,'miami_address_search_all_units_fallback'));
    searchNotes.push('Native unit-filtered search did not complete; a fresh all-unit street index was requested with complete pagination and exact-unit confirmation required.');
    search=await completeMiamiAddressPages(search,allUnitQuery,get,'miami_address_search_all_units_fallback');
  }else search=await completeMiamiAddressPages(search,query,get,'miami_address_search');
  const match = matchMiamiCandidates(input, search);
  match.notes.push(...searchNotes);
  if (match.status !== 'MATCHED') return match;
  const raw = json(await get(miamiEndpoint + '?' + new URLSearchParams({Operation: 'GetPropertySearchByFolio', clientAppName: 'PropertySearch', folioNumber: match.parcel_id}), sourceId));
  if (raw.Completed !== true) return {...match, status: 'SEARCH_INCOMPLETE', parcel_id: undefined, notes: ['County property detail response is incomplete.']};
  assertMiamiIdentity(raw, match.parcel_id);
  const exactAddress = (raw.SiteAddress || []).some(row => {
    const street = [row.StreetNumber, row.HouseNumberSuffix, row.StreetPrefix, row.StreetName, row.StreetSuffix, row.StreetSuffixDirection].filter(v => v !== null && v !== undefined && String(v).trim()).join(' ');
    const candidate = normalizeMiamiAddress(street, row.Unit);
    return candidate.street === wanted.street && candidate.unit === wanted.unit;
  });
  if (!exactAddress) throw new LookupError('identity_mismatch', 'Miami property detail street or unit differs from the requested address.');
  const owners = (raw.OwnerInfos || []).map(row => text(row.Name)).filter(Boolean);
  const status = !owners.length ? 'OWNER_UNAVAILABLE' : ownerMatchesMiami(input.ownerName, owners) ? 'MATCHED' : 'OWNER_MISMATCH';
  return {...match, status, raw, source_id: sourceId, notes: [...match.notes,...(status === 'MATCHED' ? [] : [status === 'OWNER_MISMATCH' ? 'Exact street/unit resolves uniquely; county ownership differs from the requested owner. Extraction may continue with the mismatch exposed.' : 'Exact street/unit resolves uniquely; county owner names are unavailable.'])]};
}
async function completeMiamiAddressPages(first,query,get,id){
 const rows=first?.MinimumPropertyInfos;
 if(first?.Completed!==true||!Array.isArray(rows)||!Number.isInteger(first.Total)||first.Total<0||rows.length>200||(first.Count!==undefined&&first.Count!==rows.length))return first;
 const all=[...rows],seen=new Set(rows.map(row=>parcel(row.Strap)));
 if(seen.size!==rows.length||[...seen].some(value=>!/^\d{13}$/.test(value)))return {...first,Completed:false};
 if(first.Total===rows.length)return first;
 if(rows.length!==200||first.Total<rows.length||first.Total>2000)return {...first,Completed:false};
 let last=first;
 for(let from=201;from<=2000&&all.length<first.Total;from+=200){
  const nextQuery=new URLSearchParams(query);nextQuery.set('from',String(from));nextQuery.set('to',String(from+199));
  last=json(await get(miamiEndpoint+'?'+nextQuery,id));const page=last?.MinimumPropertyInfos;
  if(last?.Completed!==true||last.Total!==first.Total||!Array.isArray(page)||page.length>200||page.length===0||(last.Count!==undefined&&last.Count!==page.length))return {...first,Completed:false,MinimumPropertyInfos:all};
  for(const row of page){const value=parcel(row.Strap);if(!/^\d{13}$/.test(value)||seen.has(value))return {...first,Completed:false,MinimumPropertyInfos:all};seen.add(value);all.push(row);}
  if(all.length>first.Total||(all.length<first.Total&&page.length<200))return {...first,Completed:false,MinimumPropertyInfos:all};
 }
 return {...first,Completed:all.length===first.Total,MinimumPropertyInfos:all,...(first.Count!==undefined?{Count:all.length}:{}),HasMore:last.HasMore,HasNextPage:last.HasNextPage};
}
function assertMiamiIdentity(raw, expected) {
  if (!/^\d{13}$/.test(parcel(expected)) || parcel(raw?.PropertyInfo?.FolioNumber) !== parcel(expected)) throw new LookupError('identity_mismatch', 'Miami source folio does not match the resolved parcel.');
}
const displayMoney = value => {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return raw;
  const [integer, fraction] = raw.split('.');
  return '$' + integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction : '');
};
const sourceMoney = value => Number(value) === -1 ? null : displayMoney(value);
const sourceNumber = value => Number(value) === -1 ? null : value ?? null;
const displayNumber = value => value === null || value === undefined ? null : String(value);
const area = value => value === null || value === undefined ? null : Number(value) === -1 ? null : String(value) + ' Sq.Ft';
const join = (values, separator = ' ') => values.map(text).filter(Boolean).join(separator) || null;
const date = value => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value || '') ? value.split('/').map((v, i) => i < 2 ? v.padStart(2, '0') : v).join('/') : text(value);

export function enrichMiami(raw, parcelId) {
  assertMiamiIdentity(raw, parcelId);
  const p = raw.PropertyInfo;
  const section_status = {}, provenance = {}, notes = [];
  const mark = (section, paths, value, required = true) => {
    const exists = paths.every(path => path.split('.').reduce((v, k) => v?.[k], raw) !== undefined && path.split('.').reduce((v, k) => v?.[k], raw) !== null);
    const empty = value === null || value === '' || (Array.isArray(value) && !value.length) || (value && typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length);
    section_status[section] = {status: exists ? empty ? 'EMPTY' : 'EXTRACTED' : 'UNAVAILABLE', source_id: sourceId, source_paths: paths};
    provenance[section] = {source_id: sourceId, source_paths: paths};
    if (!exists && required) notes.push(`${section}: source section missing or null; no values inferred.`);
    return value;
  };
  const bind = (outputPath, sourcePath, value, formatter = v => v ?? null) => {
    const output = formatter(value);
    provenance[outputPath] = {source_id: sourceId, source_path: sourcePath, source_value: value === undefined ? null : value, ...(Number(value) === -1 && output === null ? {missing_reason: 'SOURCE_UNAVAILABLE_SENTINEL'} : {})};
    return output;
  };
  const f = (output, key, formatter) => bind(`PropertyInformation.${output}`, `PropertyInfo.${key}`, p[key], formatter);
  const sites = Array.isArray(raw.SiteAddress) ? raw.SiteAddress : [];
  const owners = Array.isArray(raw.OwnerInfos) ? raw.OwnerInfos.map(row => text(row.Name)).filter(Boolean) : [];
  const m = raw.MailingAddress;
  const mailing = m ? join([join([m.Address1, m.Address2, m.Address3], ', '), m.City, join([m.State, m.ZipCode])], ', ') : null;
  const assessmentRows = Array.isArray(raw.Assessment?.AssessmentInfos) ? raw.Assessment.AssessmentInfos : [];
  const assessment = assessmentRows.map((row, index) => {
    const record = {};
    for (const [output, source] of [['Year','Year'], ['LandValue','LandValue'], ['BuildingValue','BuildingOnlyValue'], ['ExtraFeatureValue','ExtraFeatureValue'], ['MarketValue','TotalValue'], ['AssessedValue','AssessedValue']]) record[output] = bind(`AssessmentHistory.${index}.${output}`, `Assessment.AssessmentInfos.${index}.${source}`, row[source], output === 'Year' ? displayNumber : sourceMoney);
    // Only direct labels attached to this assessment year establish roll status.
    // Calendar age, a populated value and blank messages establish no certification.
    const messages = [{source_path: `Assessment.AssessmentInfos.${index}.Message`, source_value: row.Message ?? null},
      ...(raw.Assessment?.Messages || []).flatMap((message, messageIndex) => String(message.Year) === String(row.Year)
        ? [{source_path: `Assessment.Messages.${messageIndex}.Message`, source_value: message.Message ?? null}] : [])];
    const labels = messages.map(message => text(message.source_value)?.match(/^(certified|preliminary|working)(?:\s+(?:assessment|tax))?(?:\s+roll)?[.]?$/i)?.[1]?.toUpperCase()).filter(Boolean);
    const statuses = [...new Set(labels)];
    record.Status = statuses.length === 1 ? statuses[0] : null;
    record.SourceScope = 'PROPERTY_APPRAISER_ROLL_AUTHORITY_UNSPECIFIED';
    provenance[`AssessmentHistory.${index}.Status`] = {source_id: sourceId, source_year: String(row.Year), source_messages: messages,
      ...(record.Status === null ? {missing_reason: statuses.length > 1 ? 'CONFLICTING_SAME_YEAR_STATUS_LABELS' : 'NO_EXPLICIT_SAME_YEAR_ROLL_STATUS'} : {method: 'explicit_same_year_roll_status_label'})};
    provenance[`AssessmentHistory.${index}.SourceScope`] = {source_id: sourceId, source_year: String(row.Year), source_path: `Assessment.AssessmentInfos.${index}`, method: 'source_section_scope', authority_scope: null,
      note: 'Property Appraiser assessment roll values; this section does not identify an individual taxing authority.'};
    return record;
  });
  // Source row years are authoritative; never manufacture missing years from today's date.
  const years = [...new Set([...assessmentRows.map(row => row.Year), ...(raw.Taxable?.TaxableInfos || []).map(row => row.Year)])].filter(year => /^\d{4}$/.test(String(year))).sort((a,b) => Number(b)-Number(a));
  const latest = assessment.reduce((best, row) => !best || Number(row.Year) > Number(best.Year) ? row : best, null);
  if (assessment.some(row => row.Status === null)) notes.push('Assessment roll status is unknown for years without an explicit same-year source label; source year does not establish certification. Assessment authority scope is unspecified.');
  const benefits = [];
  for (const [index, row] of (raw.Benefit?.BenefitInfos || []).entries()) {
    let group = benefits.find(item => item.Benefit === row.Description && item.Type === row.Type);
    if (!group) { group = {Benefit: text(row.Description), Type: text(row.Type), Values: Object.fromEntries(years.map(year => [year, null]))}; benefits.push(group); }
    if (Object.hasOwn(group.Values, row.TaxYear) && group.Values[row.TaxYear] !== null) notes.push(`BenefitsInformation: repeated benefit/year ${row.Description} ${row.TaxYear}; retained source rows in provenance.`);
    group.Values[row.TaxYear] = bind(`BenefitsInformation.${benefits.indexOf(group)}.Values.${row.TaxYear}`, `Benefit.BenefitInfos.${index}.Value`, row.Value, sourceMoney);
  }
  provenance['BenefitsInformation.source_rows'] = {source_id: sourceId, source_path: 'Benefit.BenefitInfos', source_value: raw.Benefit?.BenefitInfos ?? null};
  const taxable = {};
  for (const [index, row] of (raw.Taxable?.TaxableInfos || []).entries()) {
    taxable[row.Year] = {};
    for (const [name, key] of [['County','County'], ['SchoolBoard','School'], ['City','City'], ['Regional','Regional']]) taxable[row.Year][name] = Object.fromEntries(['ExemptionValue','TaxableValue'].map(field => [field, bind(`TaxableValueInformation.${row.Year}.${name}.${field}`, `Taxable.TaxableInfos.${index}.${key}${field}`, row[key+field], sourceMoney)]));
  }
  const components = Object.fromEntries(years.map(year => [year, []]));
  for (const [group, collection, kind] of [['Land','Landlines','Land'], ['Building','BuildingInfos','Building'], ['ExtraFeature','ExtraFeatureInfos','ExtraFeature']]) {
    for (const [index, row] of (raw[group]?.[collection] || []).entries()) {
      const year = String(row.RollYear);
      components[year] ||= [];
      const record = {ComponentType: kind};
      for (const [key, value] of Object.entries(row)) record[key] = bind(`LandBuildingExtraFeatures.${year}.${components[year].length}.${key}`, `${group}.${collection}.${index}.${key}`, value, /(?:Value|Price|CostNew)$/.test(key) ? sourceMoney : ['GrossArea','HeatedArea','PercentageGood','PercentCondition'].includes(key) ? sourceNumber : v => v ?? null);
      components[year].push(record);
    }
  }
  const legal = typeof raw.LegalDescription?.Description === 'string' ? raw.LegalDescription.Description.split('|').map(line => line.trim()).filter(Boolean) : [];
  const saleOrder = (raw.SalesInfos || []).map((row, sourceIndex) => ({row, sourceIndex})).sort((a,b) => {
    const key = value => { const parts = String(value ?? '').split('/').map(Number); return parts.length === 3 && parts.every(Number.isFinite) ? parts[2]*10000+parts[0]*100+parts[1] : 0; };
    return key(b.row.DateOfSale) - key(a.row.DateOfSale);
  });
  const sales = saleOrder.map(({row, sourceIndex}, index) => ({Date: bind(`SalesInformation.${index}.Date`, `SalesInfos.${sourceIndex}.DateOfSale`, row.DateOfSale, date), Price: bind(`SalesInformation.${index}.Price`, `SalesInfos.${sourceIndex}.SalePrice`, row.SalePrice, displayMoney), ORBookPage: bind(`SalesInformation.${index}.ORBookPage`, `SalesInfos.${sourceIndex}`, {OfficialRecordBook: row.OfficialRecordBook ?? null, OfficialRecordPage: row.OfficialRecordPage ?? null}, () => join([row.OfficialRecordBook,row.OfficialRecordPage], '-')), QualificationDescription: bind(`SalesInformation.${index}.QualificationDescription`, `SalesInfos.${sourceIndex}.QualificationDescription`, row.QualificationDescription, text)}));
  const property = {
    ParcelNumber: bind('PropertyInformation.ParcelNumber', 'PropertyInfo.FolioNumber', p.FolioNumber), PropertyAddress: join(sites.map(row => row.Address), '; '), Owners: owners, MailingAddress: mailing,
    ownerOccupied: null, PrimaryZone: join([p.PrimaryZone,p.PrimaryZoneDescription]), PrimaryLandUse: join([p.DORCode,p.DORDescription]),
    BedsBathsHalf: [p.BedroomCount,p.BathroomCount,p.HalfBathroomCount].every(value => value !== null && value !== undefined) ? [p.BedroomCount,p.BathroomCount,p.HalfBathroomCount].join(' / ') : null,
    Floors: f('Floors','FloorCount',displayNumber), LivingUnits: f('LivingUnits','UnitCount',displayNumber), LivingArea: f('LivingArea','BuildingActualArea',area), AdjustedArea: f('AdjustedArea','BuildingEffectiveArea',area), LotSize: f('LotSize','LotSize',area), YearBuilt: f('YearBuilt','YearBuilt',displayNumber)
  };
  for (const [field, path, value] of [['Owners','OwnerInfos',raw.OwnerInfos], ['PropertyAddress','SiteAddress',raw.SiteAddress], ['MailingAddress','MailingAddress',m], ['PrimaryZone','PropertyInfo.PrimaryZone',p.PrimaryZone], ['PrimaryLandUse','PropertyInfo.DORCode',p.DORCode]]) provenance['PropertyInformation.'+field] = {source_id: sourceId, source_path: path, source_value: value ?? null};
  notes.push('ownerOccupied is unavailable: the county response does not explicitly establish occupancy. Mailing address or exemptions alone are not proof.');
  const result = {
    PropertyInformation: mark('PropertyInformation', ['PropertyInfo','OwnerInfos','SiteAddress','MailingAddress'], property),
    AssessmentInformation: mark('AssessmentInformation', ['Assessment.AssessmentInfos'], latest), AssessmentHistory: mark('AssessmentHistory', ['Assessment.AssessmentInfos'], assessment),
    BenefitsInformation: mark('BenefitsInformation', ['Benefit.BenefitInfos'], benefits),
    BenefitsNote: mark('BenefitsNote', ['Benefit'], raw.Benefit ? 'Not all benefits are applicable to all Taxable Values (i.e. County, School Board, City, Regional).' : null),
    TaxableValueInformation: mark('TaxableValueInformation', ['Taxable.TaxableInfos'], taxable), FullLegalDescription: mark('FullLegalDescription', ['LegalDescription.Description'], legal), SalesInformation: mark('SalesInformation', ['SalesInfos'], sales),
    LandBuildingExtraFeatures: mark('LandBuildingExtraFeatures', ['Land.Landlines','Building.BuildingInfos','ExtraFeature.ExtraFeatureInfos'], components), section_status, provenance, notes
  };
  if (Object.values(components).every(rows => !rows.length) && ['Land.Landlines','Building.BuildingInfos','ExtraFeature.ExtraFeatureInfos'].every(path => Array.isArray(path.split('.').reduce((v,k) => v?.[k],raw)))) section_status.LandBuildingExtraFeatures.status = 'EMPTY';
  provenance.BenefitsNote = {source_id: 'miami_property_ui', source_url: 'https://apps.miamidadepa.gov/PropertySearch/main.ca4dd149bc5b80db.js', source_text: result.BenefitsNote};
  for (const group of ['Assessment','Benefit','Taxable','Land','Building','ExtraFeature']) {
    provenance[`${group}.Messages`] = {source_id: sourceId, source_path: `${group}.Messages`, source_value: raw[group]?.Messages ?? null};
    for (const message of raw[group]?.Messages || []) if (message.Message) notes.push(`${group}${message.Year ? ' '+message.Year : ''}: ${message.Message}`);
  }
  provenance.FullLegalDescription.source_value = raw.LegalDescription ?? null;
  provenance.SalesInformation.source_value = raw.SalesInfos ?? null;
  provenance.PropertyInformation.source_value = raw.PropertyInfo;
  provenance.AssessmentHistory.source_value = raw.Assessment ?? null;
  provenance.TaxableValueInformation.source_value = raw.Taxable ?? null;
  provenance['PropertyInformation.ownerOccupied'] = {source_id: sourceId, status: 'UNAVAILABLE', source_value: null, reason: 'No explicit source occupancy field'};
  for (const [field, paths] of [['BedsBathsHalf',['BedroomCount','BathroomCount','HalfBathroomCount']], ['PrimaryZone',['PrimaryZone','PrimaryZoneDescription']], ['PrimaryLandUse',['DORCode','DORDescription']]]) provenance['PropertyInformation.'+field] = {source_id: sourceId, source_paths: paths.map(key => 'PropertyInfo.'+key), source_value: Object.fromEntries(paths.map(key => [key,p[key] ?? null]))};
  if (latest) { const index = assessment.indexOf(latest); for (const field of Object.keys(latest)) provenance['AssessmentInformation.'+field] = {...provenance[`AssessmentHistory.${index}.${field}`]}; }
  return result;
}
