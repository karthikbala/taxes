// POC admission is narrower than the API directory. Each mode below has a
// fresh production source/document check on 2026-10-13 with paid access off.
// Re-admit blocked counties only after source -> document -> API acceptance.
export const verifiedPocModes = Object.freeze({
  'allegheny-pa': ['county'],
  'baker-fl': ['collector'],
  'bradford-fl': ['address', 'county'],
  'columbia-fl': ['county'],
  'desoto-fl': ['county'],
  'highlands-fl': ['county'],
  'palm-beach-fl': ['county'],
  'suwannee-fl': ['county'],
  'union-fl': ['county']
});
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
    const modes = (verifiedPocModes[county.id] || []).filter(mode =>
      county.lookup_modes.includes(mode));
    return modes.length ? [{ ...county, lookup_modes: modes }] : [];
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
export function pocRequest(profile, mode, fields) {
  if (!verifiedPocModes[profile?.id]?.includes(mode) || !profile?.lookup_modes.includes(mode)) throw new Error('This lookup mode is unavailable for the selected county.');
  return catalogRequest(profile, mode, fields);
}
export function catalogRequest(profile, mode, fields) {
  if (!profile?.lookup_modes.includes(mode)) throw new Error('This lookup mode is unavailable for the selected county.');
  if (mode === 'address') return { endpoint: '/api/v2/property/lookup', body: {
    scrap_order_id: fields.order, address: fields.address, ownerName: fields.owner,
    county: profile.id, transactionType: fields.transaction, state: profile.state,
    ...(profile.id==='bradford-fl'?{addressType:['site','mailing'].includes(fields.addressType)?fields.addressType:'auto'}:{})
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
