// Reuse the public API catalogues; never promote parcel evidence into rich
// address-contract acceptance or silently substitute annual-roll records.
export function pocWorkflows(parcelCatalog, clientCatalog) {
  const clients = new Map(clientCatalog.counties.map(c => [c.id, c]));
  return parcelCatalog.counties.map(county => {
    const client = clients.get(county.id);
    const modes = [
      ...(client?.address_lookup_enabled ? ['address'] : []),
      ...(county.modes.includes('county') ? ['county'] : []),
      ...(county.modes.includes('collector') ? ['collector'] : []),
      ...(county.modes.includes('state_roll') ? ['state_roll'] : [])
    ];
    return { ...county, client, lookup_modes: modes };
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
  if (!profile?.lookup_modes.includes(mode)) throw new Error('This lookup mode is unavailable for the selected county.');
  if (mode === 'address') return { endpoint: '/api/v2/property/lookup', body: {
    scrap_order_id: fields.order, address: fields.address, ownerName: fields.owner,
    county: profile.id, transactionType: fields.transaction, state: profile.state,
    ...(profile.id==='bradford-fl'&&fields.addressType==='mailing'?{addressType:'mailing'}:{})
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
