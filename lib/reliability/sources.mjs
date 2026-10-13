export const sourceProfiles = {
 'miami-dade-fl':{hosts:['apps.miamidadepa.gov','county-taxes.net','miamidade.county-taxes.com','config.grantstreet.com','0lwzo52ls2-dsn.algolia.net','miamidade.realtdm.com'],account:'13-digit folio; retain displayed form',completion:['#bill-history-content table.bills tbody tr.regular','table.bills tfoot'],documents:['annual_tax_bill','certificate_redemption'],scope:'Published annual rows and exact-folio Clerk query; retention and missing years remain explicit.'},
 'osceola-fl':{hosts:['search.property-appraiser.org','county-taxes.net','osceola.county-taxes.com','config.grantstreet.com','0lwzo52ls2-dsn.algolia.net','officialrecords.osceolaclerk.org'],account:'Authoritative R-prefixed collector account joined to appraiser parcel',completion:['Native appraiser query response','Annual bill rows','Report pagination and exact-account query'],documents:['annual_tax_bill'],scope:'Collector certificate report 1520, deed report 1825 and independent Clerk query remain separate.'},
 'bradford-fl':{hosts:['www.bradfordappraiser.com','bradfordappraiser.com','www.bradfordtaxcollector.com','bradfordtaxcollector.com','www.pamartinfl.gov','union.floridapa.com'],account:'Exact native parcel including lettered suffixes; Martin/Union are mailing-reference checks only',completion:['Exact property detail','TaxBill or PriorBill identity forms'],documents:['annual_tax_bill','certificate_notice'],scope:'Published annual/prior-bill rows; no exhaustive certificate/deed clearance.'}
};
export const recoveryOrder=['official_direct','local_browser','managed_browser','operator_access'];
export function approvedSource(county,value){
 let u;try{u=new URL(value);}catch{throw Object.assign(new Error('Invalid source URL.'),{code:'source_url_rejected'});}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!sourceProfiles[county]?.hosts.includes(u.hostname))throw Object.assign(new Error('Source destination is outside the reviewed county profile.'),{code:'source_url_rejected'});
 return u;
}
