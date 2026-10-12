import {load} from 'cheerio';
import {parseMoneyCents, displayMoney} from './delinquency.mjs';

const clean = value => String(value ?? '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
const norm = value => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
const fail = (code, message) => { throw Object.assign(new Error(message), {code}); };

// Read only an explicitly labelled subtotal. Payment/discount savings and total
// tax are deliberately different fields. Duplicate desktop/mobile values agree.
export function printedDiscountable($, scope, sourceId = 'tax_collector') {
  const matches = [];
  scope.find('*').filter((_, e) => $(e).children().length === 0 && /^(?:TOTAL\s+)?DISCOUNTABLE(?:\s+(?:TAX(?:ES)?|AMOUNT))?(?:\s+TOTAL)?\s*:?$/i.test(clean($(e).text()))).each((_, e) => {
    const label = $(e), cell = label.is('td,th') ? label : label.closest('td,th');
    const valueNode = cell.length ? cell.next('td,th') : label.siblings('.value');
    if (valueNode.length !== 1) return;
    const raw = clean(valueNode.text()), value = displayMoney(parseMoneyCents(raw));
    if (value !== null) matches.push({value, proof: {source_id:sourceId, method:'labelled_collector_html', source_label:clean(label.text()), source_value:raw, selector:cell.length ? 'tr > td, tr > th' : '.label + .value'}});
  });
  if (new Set(matches.map(m => m.value)).size > 1) fail('source_values_disagree', 'Conflicting printed discountable subtotals.');
  return matches[0] ?? {value:null, proof:{source_id:sourceId, method:'inspected_collector_html', status:'UNAVAILABLE', reason:'No readable explicitly labelled discountable subtotal in the verified bill.'}};
}

export function parseTaxsysBillAmounts(html, expectedId, expectedYear) {
  const $ = load(html); $('script,style').remove();
  if (/just a moment|verify you are human|access denied|sorry, you have been blocked/i.test(clean($.text()))) fail('source_blocked', 'Collector bill returned an access challenge.');
  const account = clean($('h1').first().text()).match(/Account\s*#\s*([A-Za-z0-9 ._/-]+)/i)?.[1];
  const heading = clean($('#bill').text());
  if (!account || norm(account) !== norm(expectedId) || !new RegExp('^' + expectedYear + '\\s+Annual\\s+bill$', 'i').test(heading)) fail('collector_identity_mismatch', 'Collector HTML bill account, year or annual bill type differs from the requested bill.');
  const blocks = $('.bill-details').filter((_, e) => clean($(e).find('.header').text()) === `${expectedYear} Tax Amounts`);
  if (!blocks.length) fail('document_layout_changed', 'The verified bill has no year-labelled tax amount block.');
  const result = printedDiscountable($, blocks, 'collector_bill_html');
  result.proof.source_year = String(expectedYear);
  result.proof.account_number = account;
  return result;
}
