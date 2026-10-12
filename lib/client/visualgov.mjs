import {load} from 'cheerio';
import {printedDiscountable} from './collector-amounts.mjs';
import {parseMoneyCents, displayMoney} from './delinquency.mjs';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const norm = value => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
const prefix = 'ctl00_ContentPlaceHolder1_';
const fail = (code, message) => { throw Object.assign(new Error(message), {code}); };
const money = value => displayMoney(parseMoneyCents(clean(value)));
// Receipt dates are zero-padded while the same history date may not be.
// Compare calendar dates without changing either source's displayed value.
const dateKey = value => {
  const match = clean(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return clean(value);
  const [,month,day,year] = match.map(Number), date = new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month-1 && date.getUTCDate() === day ? `${year}-${month}-${day}` : clean(value);
};
const rateUnits = value => /^\d*\.\d{1,8}$/.test(value) ? BigInt(value.split('.')[0] || '0') * 100000000n + BigInt(value.split('.')[1].padEnd(8, '0')) : null;
const rateText = value => `${value / 100000000n}.${String(value % 100000000n).padStart(8, '0')}`;
const origin = (selector, source_label) => ({source_id:'tax_collector', method:'original_html_bill', selector, source_label});
const cssPath = element => {
  const parts = [];
  for (let e=element; e?.type === 'tag'; e=e.parent) {
    if (e.attribs?.id) { parts.unshift(`[id="${e.attribs.id}"]`); break; }
    const siblings = e.parent.children.filter(s=>s.type === 'tag' && s.name === e.name);
    parts.unshift(`${e.name}:nth-of-type(${siblings.indexOf(e)+1})`);
  }
  return parts.join(' > ');
};
const derived = (formula, inputs) => ({source_id:'tax_collector', method:'derived_decimal_calculation', formula, inputs});
const reconcile = (a,b) => a === null || b === null ? 'UNAVAILABLE' : (a > b ? a-b : b-a) <= 5n ? 'MATCHED' : 'DIFFERENT';

/** Original VisualGov HTML only. A public annual-history table cannot establish tax clearance. */
export function parseClientVisualGovBill(html, expectedId, expectedYear) {
  const $ = load(html), text = e => clean($(e).text()), provenance = {}, section_status = {}, notes = [];
  const allText = clean($.text());
  if (/just a moment|verify you are human|access denied|sorry, you have been blocked/i.test(allText)) fail('source_blocked','Collector returned an access challenge.');
  const label = (name, path, sourceLabel) => {
    const selector = `[id="${prefix}${name}"]`, nodes = $(selector), values = nodes.map((_,e)=>text(e)).get();
    if (new Set(values).size > 1) fail('ambiguous_collector_bill',`Conflicting printed ${sourceLabel} fields.`);
    if (nodes.length && path) provenance[path] = origin(selector, sourceLabel);
    return nodes.length ? values[0] : null;
  };
  const parcel = label('lblPropertyInfo','BillDetails.folio','Parcel / roll type')?.match(/^R\s+(.+)$/)?.[1];
  const bill = label('lblTaxBillNumber','BillDetails.taxYear','Tax bill number / roll / year')?.match(/^R\s+(\d+)\s+(\d{4})$/);
  if (!parcel || norm(parcel) !== norm(expectedId) || !bill || String(expectedYear) !== bill[2]) fail('collector_identity_mismatch','Original collector bill parcel or tax year differs from the requested parcel/year.');
  const BillDetails = {taxYear:bill[2], folio:parcel, municipality:null, millCode:label('lblDistCode','BillDetails.millCode','District'), propertyAddress:label('lblPropertyAddress','BillDetails.propertyAddress','Property address') || null, mailingAddress:label('lblAddressLine','BillDetails.mailingAddress','Mailing address line') || null, paidBy:null, receiptNumber:label('lblReceiptNumber','BillDetails.receiptNumber','Receipt number') || null, paidDate:label('lblLastPaymentDate','BillDetails.paidDate','Last payment') || null, paidAmount:money(label('lblAmountCollected','BillDetails.paidAmount','Amount collected'))};
  const currentBalance = money(label('lblUnpaidBalance','TaxInformation.amountDue','Unpaid balance'));
  const combined = money(label('lblCombinedTotal','TaxAmounts.totalTax','Combined taxes and assessments'));
  const ParcelDetails = {millageRate:null, millageRateUnit:'source_displayed_rate_fraction', assessedValue:money(label('lblGrossTaxValue','ParcelDetails.assessedValue','Assessed value')), exemptionValue:money(label('lblCoExemptValue','ParcelDetails.exemptionValue','Exempt value')), taxableValue:money(label('lblCoNetTaxValue','ParcelDetails.taxableValue','Taxable value'))};

  const table = (name, expectedHeader, section, parseRow) => {
    const selector = `[id="${prefix}${name}"]`, nodes = $(selector), rows = []; let total = null, malformed = false, inspected = false;
    nodes.each((_,e)=>{
      const trs = $(e).find('tr'), header = trs.first().children('th,td').map((_,c)=>text(c)).get();
      if (header.join('|') !== expectedHeader) { malformed = true; return; }
      inspected = true;
      trs.slice(1).each((_,tr)=>{
        const cells = $(tr).children('td,th').map((_,c)=>text(c)).get();
        const source = origin(cssPath(tr),cells[0] || section);
        if (/^TOTAL /i.test(cells[0] || '')) {
          const amount = money(cells.at(-1));
          if (total !== null && amount !== total) fail('ambiguous_collector_bill',`Conflicting ${section} totals.`);
          total = amount; provenance[`TaxAmounts.${section === 'AdValoremMillage' ? 'adValorem' : 'nonAdValorem'}`] = source; return;
        }
        if (!cells.some(Boolean)) return;
        const row = parseRow(cells);
        if (!row) { malformed = true; return; }
        const same = rows.find(r=>r.authority === row.authority);
        if (same) {
          if (JSON.stringify(same) !== JSON.stringify(row)) fail('ambiguous_collector_bill',`Conflicting authority ${row.authority}.`);
          return;
        }
        const index = rows.length; rows.push(row);
        for (const [key,value] of Object.entries(row)) if (value !== null) provenance[`${section}[${index}].${key}`] = source;
      });
    });
    section_status[section] = !inspected ? 'UNAVAILABLE' : malformed || total === null ? 'PARTIAL' : rows.length ? 'PRESENT' : 'INSPECTED_EMPTY';
    if (malformed) notes.push(`${section} contains an unrecognized or incomplete printed row.`);
    return {rows,total,inspected,malformed};
  };
  const ad = table('dgAdValorem','TAXING AUTHORITY|MILLAGE RATE|TAX AMOUNT','AdValoremMillage', c => c.length === 3 && c[0] && rateUnits(c[1]) !== null && money(c[2]) !== null ? {group:null, authority:c[0], assessedValue:null, exemptionValue:null, taxableValue:null, millage:c[1], millageUnit:'source_displayed_rate_fraction', taxesLevied:money(c[2])} : null);
  const non = table('dgNonAdValorem','TAXING AUTHORITY||TAX AMOUNT','NonAdValorem', c => c.length === 3 && c[0] && money(c[2]) !== null ? {authority:c[0],amount:money(c[2])} : null);
  const AdValoremMillage = ad.rows, NonAdValorem = non.rows, AdValoremGroupTotals = {};
  for (const [index] of ad.rows.entries()) provenance[`AdValoremMillage[${index}].millage`].source_label += '; original printed fractional tax rate';
  const adSum = ad.inspected && !ad.malformed ? ad.rows.reduce((s,r)=>s+parseMoneyCents(r.taxesLevied),0n) : null;
  const nonSum = non.inspected && !non.malformed ? non.rows.reduce((s,r)=>s+parseMoneyCents(r.amount),0n) : null;
  if (ad.rows.length && !ad.malformed) {
    ParcelDetails.millageRate = rateText(ad.rows.reduce((s,r)=>s+rateUnits(r.millage),0n));
    provenance['ParcelDetails.millageRate'] = derived('Sum of original printed fractional tax rates at eight decimal places',ad.rows.map((_,i)=>`AdValoremMillage[${i}].millage`));
    AdValoremGroupTotals.AllAuthorities = displayMoney(adSum);
    provenance['AdValoremGroupTotals.AllAuthorities'] = derived('Sum of all printed authority tax amounts; no authority group labels are printed',ad.rows.map((_,i)=>`AdValoremMillage[${i}].taxesLevied`));
  }
  const discountable = printedDiscountable($, $('body'));
  provenance['TaxAmounts.totalDiscountable'] = discountable.proof;
  const TaxAmounts = {adValorem:ad.total, nonAdValorem:non.total, totalDiscountable:discountable.value, totalTax:combined};
  const PaymentDetails = {combinedTaxesAndAssessments:combined, PaymentSchedule:[], discountNote:null, printedDiscount:money(label('lblDiscount','PaymentDetails.printedDiscount','Printed receipt discount')), currentBalance};
  if (provenance['TaxAmounts.totalTax']) provenance['PaymentDetails.combinedTaxesAndAssessments'] = {...provenance['TaxAmounts.totalTax']};
  if (provenance['TaxInformation.amountDue']) provenance['PaymentDetails.currentBalance'] = {...provenance['TaxInformation.amountDue']};
  if (combined !== null && BillDetails.paidAmount !== null) {
    PaymentDetails.discountNote = `Derived arithmetic: original combined taxes ${combined} minus receipt payment ${BillDetails.paidAmount} = ${displayMoney(parseMoneyCents(combined)-parseMoneyCents(BillDetails.paidAmount))}. This is not a current balance or a confirmed statutory discount; the printed unpaid balance is ${currentBalance ?? 'unavailable'}.`;
    provenance['PaymentDetails.discountNote'] = derived('Original combined tax total minus receipt payment',['TaxAmounts.totalTax','BillDetails.paidAmount']);
  }
  const exemption = label('lblExemption','Exemptions','Exemptions'), Exemptions = exemption ? {printed:exemption} : {};
  const ExemptionsNote = exemption === null ? 'Exemption area was not retrieved.' : exemption ? 'Original printed exemption details retained.' : 'Exemption area inspected; no exemption details printed. This does not establish absence of exemptions.';
  const NonAdValoremNote = !non.inspected ? 'Non-ad valorem table was not retrieved.' : non.rows.length ? 'Original non-ad valorem assessment rows retained.' : 'Original non-ad valorem table inspected; no assessment rows printed.';

  const annual = [], annualOrigins = new Map(), seenTables = new Set(); let historyMalformed = false;
  $('tr').each((_,tr)=>{
    const c = $(tr).children('td,th').map((_,e)=>text(e)).get();
    if (c.join('|') !== 'Parcel|Roll Type|Year|Original Gross Tax|Original Assessments|Date Paid|Amount Paid|Total Unpaid') return;
    const container = $(tr).closest('table')[0]; if (!container || seenTables.has(container)) return; seenTables.add(container);
    $(container).find('tr').each((rowIndex,row)=>{
      const cells = $(row).children('td,th').map((_,e)=>text(e)).get();
      if (cells.length !== 8 || cells[0] === 'Parcel') return;
      if (norm(cells[0]) !== norm(expectedId) || cells[1] !== 'R' || !/^(?:19|20)\d{2}$/.test(cells[2])) fail('collector_identity_mismatch','Collector history contains another parcel/roll or invalid year.');
      const amountDue = money(cells[7]), paidAmount = money(cells[6]), grossTax = money(cells[3]), assessments = money(cells[4]);
      if ([amountDue,paidAmount,grossTax,assessments].some(v=>v === null)) historyMalformed = true;
      const record = {billYear:cells[2],billType:'Annual',amountDue,status:amountDue === '$0.00' && cells[5] && cells[5] !== 'N/A' ? 'Paid' : amountDue !== null && parseMoneyCents(amountDue)>0n ? 'Due' : 'Unknown',paidAmount,paidDate:cells[5] && cells[5] !== 'N/A' ? cells[5] : null,receiptNumber:null,billId:null,grossTax,assessments,note:'Original annual row in the collector Tax Roll Property Summary; certificate/deed history coverage is not established.'};
      const same = annual.find(r=>r.billYear === record.billYear);
      if (same) { if (JSON.stringify(same) !== JSON.stringify(record)) fail('ambiguous_collector_bill','Conflicting annual history rows for one year.'); return; }
      annualOrigins.set(record.billYear,origin(cssPath(row),`Annual ${record.billYear}; source row ${rowIndex+1}`)); annual.push(record);
    });
  });
  annual.sort((a,b)=>Number(b.billYear)-Number(a.billYear));
  annual.forEach((record,index)=>{provenance[`AccountHistory[${index}]`] = annualOrigins.get(record.billYear);});
  const current = annual.find(r=>r.billYear === bill[2]) ?? null;
  if (current) {
    current.billId = bill[1]; current.receiptNumber = BillDetails.receiptNumber;
    if (current.amountDue !== null && currentBalance !== null && current.amountDue !== currentBalance) fail('ambiguous_collector_bill','Current annual history balance conflicts with the printed bill balance.');
    if (current.paidAmount !== null && BillDetails.paidAmount !== null && current.paidAmount !== BillDetails.paidAmount) fail('ambiguous_collector_bill','Current annual history payment conflicts with the printed receipt.');
    if (current.paidDate && BillDetails.paidDate && dateKey(current.paidDate) !== dateKey(BillDetails.paidDate)) fail('ambiguous_collector_bill','Current annual history payment date conflicts with the printed receipt.');
  }
  const paidLabel = $('div').filter((_,e)=>$(e).children().length === 0 && /^\*\*\s*PAID\s*\*\*$/.test(text(e))).first();
  const TaxInformation = {accountNumber:parcel,type:currentBalance === '$0.00' && paidLabel.length ? 'PAID' : currentBalance !== null && parseMoneyCents(currentBalance)>0n ? 'DUE' : 'UNKNOWN',amountDue:currentBalance,statusMessage:paidLabel.length ? text(paidLabel) : null,lastPaymentDate:BillDetails.paidDate,lastPaymentAmount:BillDetails.paidAmount,amountPaidYear:bill[2],note:'Payment status describes this verified annual bill; tax clearance and certificate/deed coverage are not established.'};
  for (const [key,billKey] of [['lastPaymentDate','paidDate'],['lastPaymentAmount','paidAmount'],['amountPaidYear','taxYear'],['accountNumber','folio']]) if (provenance[`BillDetails.${billKey}`]) provenance[`TaxInformation.${key}`] = {...provenance[`BillDetails.${billKey}`]};
  if (seenTables.size) provenance.AccountHistory = origin(cssPath([...seenTables][0]),'Tax Roll Property Summary: parcel / roll / annual year / gross tax / assessments / date paid / amount paid / total unpaid');
  if (paidLabel.length) provenance['TaxInformation.statusMessage'] = origin('div.HdHeaderBk','** PAID **');
  const validation = {parcel:'MATCHED',taxYear:'MATCHED',billNumber:bill[1],authorityRowCount:ad.rows.length,annualHistoryYearCount:annual.length,adValoremReconciliation:reconcile(adSum,parseMoneyCents(ad.total)),nonAdValoremReconciliation:reconcile(nonSum,parseMoneyCents(non.total)),combinedTotalReconciliation:reconcile(ad.total !== null && non.total !== null ? parseMoneyCents(ad.total)+parseMoneyCents(non.total) : null,parseMoneyCents(combined)),millageSourceUnits:'Original fractional tax rates, preserved at source precision; no conversion to mills',reconciliationTolerance:'$0.05',historyCoverage:'PARTIAL',derivedFields:Object.keys(provenance).filter(k=>provenance[k].method === 'derived_decimal_calculation')};
  const taxable = parseMoneyCents(ParcelDetails.taxableValue);
  validation.printedFractionalRateTaxChecks = ad.rows.map(r=>({authority:r.authority,reconciliation:taxable === null ? 'UNAVAILABLE' : reconcile((taxable*rateUnits(r.millage)+50000000n)/100000000n,parseMoneyCents(r.taxesLevied)),basis:'Printed parcel taxable value multiplied by printed fractional rate; comparison only, no per-authority taxable value inferred'}));
  const reconciled = ['adValoremReconciliation','nonAdValoremReconciliation','combinedTotalReconciliation'].every(k=>validation[k] === 'MATCHED');
  Object.assign(section_status,{BillDetails:'PRESENT',ParcelDetails:ParcelDetails.millageRate !== null ? 'PRESENT' : 'PARTIAL',AdValoremGroupTotals:ad.rows.length && !ad.malformed ? 'PRESENT' : 'UNAVAILABLE',TaxAmounts:reconciled ? 'PRESENT' : 'PARTIAL',PaymentDetails:combined !== null && currentBalance !== null && BillDetails.paidAmount !== null ? 'PRESENT' : 'PARTIAL',Exemptions:exemption === null ? 'UNAVAILABLE' : exemption ? 'PRESENT' : 'INSPECTED_EMPTY',AccountHistory:seenTables.size ? 'PARTIAL' : 'UNAVAILABLE',TaxInformation:currentBalance !== null ? 'PRESENT' : 'PARTIAL'});
  notes.push('Original HTML bill; no original PDF was exposed or manufactured.','Authority tables print authority, fractional rate and tax amount only; per-authority assessment/exemption/taxable values remain null.','Public annual history is a partial view. No complete published year scope or inspected certificate/deed sections establish negative delinquency clearance.');
  if (TaxAmounts.totalDiscountable === null) section_status.TaxAmounts = {status:'PARTIAL',note:'No readable explicitly labelled discountable subtotal was published in the retrieved original HTML bill.'};
  if (!current) notes.push('Requested annual bill year is absent from the captured history table.');
  if (historyMalformed) notes.push('At least one annual history row has an unavailable or invalid monetary field.');
  const history = {history:annual,latestAnnual:current,summary:{accountNumber:parcel,amountDue:currentBalance,statusMessage:TaxInformation.statusMessage,lastPaymentDate:BillDetails.paidDate,lastPaymentAmount:BillDetails.paidAmount},unavailableYears:annual.filter(r=>r.amountDue === null).map(r=>Number(r.billYear)),coverage:seenTables.size ? 'PARTIAL' : 'UNAVAILABLE',notes:[notes[2],...(historyMalformed ? ['Annual history includes unavailable monetary fields.'] : [])]};
  return {BillDetails,ParcelDetails,TaxAmounts,PaymentDetails,AdValoremMillage,AdValoremGroupTotals,NonAdValorem,NonAdValoremNote,Exemptions,ExemptionsNote,AccountHistory:annual,TaxInformation,section_status,provenance,validation,notes,history};
}
