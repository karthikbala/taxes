import {countyAdapters} from '../live/county-adapters.mjs';
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

// Explicit adapter destinations; directory links never widen this allowlist.
const parcelHosts={
 'palm-beach-fl':['pbcpao.gov','pbctax.publicaccessnow.com'],
 'hillsborough-fl':['gis.hcpafl.org'], 'lee-fl':['gissvr.leepa.org','www.leepa.org'],
 'sarasota-fl':['www.sc-pa.com'], 'pasco-fl':['search.pascopa.com'],
 'volusia-fl':['vcpa.vcgov.org'], 'santa-rosa-fl':['parcelview.srcpa.gov'],
 'highlands-fl':['www.hcpao.org'], 'polk-fl':['gis.polk-county.net'],
 'charlotte-fl':['www.ccappraiser.com'], 'martin-fl':['www.pamartinfl.gov'],
 'hernando-fl':['services2.arcgis.com'], 'pinellas-fl':['www.pcpao.gov'],
 'desoto-fl':['www.desotopa.com','www.desotocountytaxcollector.com'],
 'union-fl':['union.floridapa.com','unioncountytc.com'],
 'columbia-fl':['columbia.floridapa.com','search.ccpafl.com'],
 'suwannee-fl':['www.suwanneepa.com']
};
for(const [county,adapter]of Object.entries(countyAdapters)){
 const collector=adapter.collector==='taxsys'?['county-taxes.net','config.grantstreet.com','0lwzo52ls2-dsn.algolia.net',adapter.client+'.county-taxes.com']:adapter.collector==='phenix'?[adapter.client+'.floridatax.us']:[];
 const old=sourceProfiles[county]||{};
 sourceProfiles[county]={account:adapter.collector_key||'Exact native parcel and independently resolved collector account',completion:['Exact parcel detail','Complete bounded collector history','Original document identity and year'],documents:['annual_tax_bill'],scope:'Published records only; annual, certificate and deed completeness require independent evidence.',...old,hosts:[...new Set([...(old.hosts||[]),...(parcelHosts[county]||[]),...collector])]};
}
