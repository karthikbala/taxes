// Shared decision rule. County adapters supply independently verified records;
// address-role priority never resolves two different matching parcels.
export function selectDetectedAddress(candidates,{complete=true,addressType='auto',notes=[]}={}) {
 const base={requested_address_type:addressType,candidates,notes};
 if(!complete)return {...base,status:'SEARCH_INCOMPLETE',notes:[...notes,'County owner/address coverage is incomplete; no parcel selected.']};
 const matches=candidates.filter(c=>c.owner_matches_requested&&c.verified_address_match&&
  (addressType==='auto'||c.address_match_type===addressType));
 const ids=[...new Set(matches.map(c=>c.parcel_id))];
 if(ids.length!==1)return {...base,status:ids.length?'AMBIGUOUS':'NOT_FOUND',notes:[...notes,ids.length?'The supplied owner and address identify multiple parcels. Confirm the intended parcel.':'No unique county parcel matches the supplied owner and address.']};
 const types=[...new Set(matches.filter(c=>c.parcel_id===ids[0]).map(c=>c.address_match_type))];
 return {...base,status:'MATCHED',parcel_id:ids[0],input_address_type:types.includes('site')?'site':'mailing',matched_address_types:types,match_method:'county_verified_owner_and_detected_address'};
}

// Use published delivery lines, retaining apartment/unit and mail-stop details.
// Attention/addressee lines are not delivery addresses. City/state/ZIP fields
// are supplied separately by each native adapter rather than guessed here.
export function mailingDeliveryLines(lines) {
 const clean=lines.filter(v=>typeof v==='string').map(v=>v.trim().replace(/\s+/g,' ')).filter(Boolean);
 const out=[];
 for(let i=0;i<clean.length;i++) {
  let line=clean[i];
  if(!/^(?:\d|P\.?\s*O\.?\s*BOX\b|POST OFFICE BOX\b)/i.test(line))continue;
  if(clean[i+1]&&/^(?:UNIT|APT|APARTMENT|SUITE|STE|#)\s*/i.test(clean[i+1]))line+=' '+clean[i+1];
  out.push(line.replace(/^P\.?\s*O\.?\s*BOX\b/i,'PO BOX').replace(/^POST OFFICE BOX\b/i,'PO BOX'));
 }
 return out;
}

// Some native postal/situs strings print a trailing unit without UNIT/APT.
// Compare the complete normalized sequence; never remove or ignore that unit.
export function deliveryAddressMatches(wanted,candidate,match) {
 if(match(wanted,candidate))return true;
 if(wanted.conflict||candidate.conflict||!!wanted.unit===!!candidate.unit)return false;
 return [wanted.street,wanted.unit].filter(Boolean).join(' ')===
  [candidate.street,candidate.unit].filter(Boolean).join(' ');
}
