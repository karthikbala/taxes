// Safe structured events: never log request bodies, source URLs, headers or values.
const tokens = value => String(value ?? '').replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 100);
export function createLookupLogger(requestId, sink = event => console.log(JSON.stringify(event))) {
  return (event, fields = {}) => {
    const row = {event: tokens(event), request_id: tokens(requestId), timestamp: new Date().toISOString()};
    for (const key of ['county','stage','source_id','source_role','status','error_code','match_status']) {
      if (fields[key] !== undefined) row[key] = tokens(fields[key]);
    }
    for (const key of ['duration_ms','attempt','http_status','source_count','error_count','section_count','tax_line_count']) {
      if (Number.isFinite(fields[key])) row[key] = fields[key];
    }
    for (const key of ['section_status','validation']) {
      if (fields[key] && typeof fields[key] === 'object') row[key] = Object.fromEntries(Object.entries(fields[key]).slice(0,100).map(([k,v])=>[tokens(k),tokens(typeof v === 'object' ? v?.status : v)]));
    }
    try { sink(row); } catch { /* Diagnostics must not alter lookup delivery. */ }
  };
}
export function lookupLogSummary(result) {
  const meta = result.ExtractionMetadata || {}, record = result.scrapTaxOrderRequest || {};
  return {county:meta.county_id,status:meta.status,duration_ms:meta.duration_ms,match_status:record.matchStatus,source_count:meta.sources?.length||0,error_count:meta.errors?.length||0,section_count:Object.keys(meta.section_status||{}).length,tax_line_count:record.AdValoremMillage?.length||0,section_status:meta.section_status,validation:meta.validation};
}
