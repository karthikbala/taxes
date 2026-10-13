// Explicit operator override for staging only. Never inferred from a missing ledger.
export function stagingLedgerBypass(env) {
 return env?.TAXES_DEPLOYMENT_ENV === 'staging' && env?.INVISIA_BROWSER_LEDGER_BYPASS === '1';
}

// A separately explicit production operator decision; never inferred from
// provider balance, a staging flag, or a missing ledger.
export function operatorLedgerBypass(env) {
 return env?.TAXES_DEPLOYMENT_ENV==='production'&&env?.INVISIA_BROWSER_OPERATOR_OVERRIDE==='1'&&operatorCounties(env).length>0;
}
function operatorCounties(env){return String(env?.INVISIA_BROWSER_OPERATOR_COUNTIES||'').split(',').map(v=>v.trim()).filter(v=>/^[a-z-]+-(?:fl|pa)$/.test(v));}
export function operatorBrowserAllowed(env,county){return operatorLedgerBypass(env)&&operatorCounties(env).includes(county);}
export function browserLedgerBypass(env){return stagingLedgerBypass(env)||operatorLedgerBypass(env);}
