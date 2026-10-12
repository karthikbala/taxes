// Explicit operator override for staging only. Never inferred from a missing ledger.
export function stagingLedgerBypass(env) {
 return env?.TAXES_DEPLOYMENT_ENV === 'staging' && env?.INVISIA_BROWSER_LEDGER_BYPASS === '1';
}
