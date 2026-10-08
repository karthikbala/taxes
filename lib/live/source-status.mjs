// Retain the failed direct attempt, but identify a separately verified recovery.
export function markCollectorRecovered(sources) {
  if (!sources.some(s => s.id === 'tax_collector_browser' && s.status === 'verified')) return;
  for (const source of sources) {
    if (source.id !== 'collector_identity' || source.status !== 'failed' || source.error_code !== 'source_blocked') continue;
    source.attempt_status = 'failed';
    source.status = 'recovered';
    source.recovery_source_id = 'tax_collector_browser';
    source.note = 'Direct access blocked — recovered through browser';
  }
}
