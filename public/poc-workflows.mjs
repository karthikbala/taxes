// POC admission is narrower than the API directory. Each mode below has a
// fresh production source/document check on 2026-10-13.
// Miami-Dade and Osceola use explicitly enabled managed-browser recovery.
// Established address workflows stay visible with explicit source limits.
// Only fresh source -> document -> API acceptance earns sample_verified.
export const verifiedPocModes = Object.freeze({
  'allegheny-pa': ['county'],
  'baker-fl': ['collector'],
  'bradford-fl': ['address', 'county'],
  'columbia-fl': ['county'],
  'desoto-fl': ['county'],
  'highlands-fl': ['county'],
  'miami-dade-fl': ['address'],
  'osceola-fl': ['address'],
  'palm-beach-fl': ['county'],
  'suwannee-fl': ['county'],
  'union-fl': ['county']
});
export const phasePocCounties=Object.freeze(['palm-beach-fl','miami-dade-fl','hillsborough-fl','lee-fl','sarasota-fl','pasco-fl','volusia-fl','santa-rosa-fl','highlands-fl','polk-fl','charlotte-fl','martin-fl','hernando-fl','osceola-fl','pinellas-fl','desoto-fl','bradford-fl','union-fl','columbia-fl','suwannee-fl']);
const admittedPocModes=Object.freeze({...verifiedPocModes,...Object.fromEntries(phasePocCounties.map(id=>[id,[...(verifiedPocModes[id]||[]).filter(mode=>mode==='address'),'county']]))});
export function catalogWorkflows(parcelCatalog, clientCatalog) {
  const clients = new Map(clientCatalog.counties.map(c => [c.id, c]));
  return parcelCatalog.counties.map(county => {
    const client = clients.get(county.id);
    return { ...county, client, lookup_modes: [
      ...(client?.address_lookup_enabled ? ['address'] : []),
      ...county.modes.filter(mode => ['county','collector','state_roll'].includes(mode))
    ] };
  });
}
export function pocWorkflows(parcelCatalog, clientCatalog) {
  return catalogWorkflows(parcelCatalog, clientCatalog).flatMap(county => {
    const admitted = (admittedPocModes[county.id] || []).filter(mode=>county.lookup_modes.includes(mode));
    const modes = admitted;
    return modes.length ? [{ ...county, lookup_modes: modes, poc_verification: verifiedPocModes[county.id]?'sample_verified':'available_with_limits' }] : [];
  });
}
export const workflowLabels = {
  address: 'Address and owner · detailed client record',
  county: 'Parcel ID · county assessment and collector',
  collector: 'Parcel ID · county collector and original bill only',
  state_roll: 'Parcel ID · annual Florida assessment roll only'
};
export function workflowSample(profile, mode) {
  return profile.samples?.[mode] || profile.sample;
}
export function automaticPocMode(profile, fields = {}) {
  const modes = (admittedPocModes[profile?.id] || []).filter(mode=>profile?.lookup_modes?.includes(mode));
  if (!modes.length) throw new Error('Select an available county.');
  if (!fields.parcel?.trim() && modes.includes('address')) return 'address';
  const mode = modes.find(mode => mode === 'county') || modes.find(mode => mode === 'collector');
  if (!mode) throw new Error('Parcel lookup is unavailable for this county. Clear the parcel ID to search by address and owner.');
  return mode;
}
export function automaticPocRequest(profile, fields) {
  const mode = automaticPocMode(profile, fields);
  if (mode === 'address' && (!fields.address?.trim() || !fields.owner?.trim())) throw new Error('Enter the property address and owner name, or provide a parcel ID.');
  if (mode !== 'address' && !fields.parcel?.trim()) throw new Error('Enter a parcel ID to search '+profile.name+'. Address-and-owner search is not yet available for this county.');
  return pocRequest(profile, mode, { ...fields, parcel: fields.parcel?.trim() });
}
export function pocRequest(profile, mode, fields) {
  if (!profile?.lookup_modes.includes(mode) || !(admittedPocModes[profile.id]?.includes(mode) || mode==='address'&&profile.client?.address_lookup_enabled)) throw new Error('This lookup mode is unavailable for the selected county.');
  if(mode==='county'&&phasePocCounties.includes(profile.id))return {endpoint:'/api/v3/property/jobs',body:{county:profile.id,parcel_id:fields.parcel,...(profile.id==='palm-beach-fl'&&fields.account?.trim()?{collector_account_id:fields.account.trim()}:{})}};
  return catalogRequest(profile, mode, fields);
}
export function catalogRequest(profile, mode, fields) {
  if (!profile?.lookup_modes.includes(mode)) throw new Error('This lookup mode is unavailable for the selected county.');
  if (mode === 'address') return { endpoint: '/api/v2/property/lookup', body: {
    scrap_order_id: fields.order, address: fields.address, ownerName: fields.owner,
    county: profile.id, transactionType: fields.transaction, state: profile.state
  } };
  return { endpoint: '/api/v1/property/lookup', body: {
    county: profile.id, parcel_id: fields.parcel, source_mode: mode,
    include_pdf: ['county','collector'].includes(mode) && fields.includePdf === true,
    ...(mode === 'county' && profile.id === 'palm-beach-fl' && fields.account?.trim() ? { collector_account_id: fields.account.trim() } : {})
  } };
}
export function supportsNeighbors(profile, mode) {
  return profile?.id === 'miami-dade-fl' && mode === 'address';
}
