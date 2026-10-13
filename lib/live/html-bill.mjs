import {LookupError} from './engine.mjs';
import {parseClientVisualGovBill} from '../client/visualgov.mjs';

const amount = value => value == null ? null : String(value).replace(/[$,]/g, '');
/** Parse the original HTML response; never generate a PDF or infer a missing amount. */
export function parseHtmlTaxBill(html, expectedId, expectedYear, expectedBill) {
 const parsed = parseClientVisualGovBill(html, expectedId, expectedYear);
 if(String(parsed.validation.billNumber)!==String(expectedBill))throw new LookupError('collector_identity_mismatch','Original HTML bill number differs from the resolved bill.');
 const fields = {
  parcel_id: parsed.BillDetails.folio,
  tax_year: Number(parsed.BillDetails.taxYear),
  bill_number: String(expectedBill),
  combined_taxes_and_assessments: amount(parsed.TaxAmounts.totalTax),
  ad_valorem: amount(parsed.TaxAmounts.adValorem),
  non_ad_valorem: amount(parsed.TaxAmounts.nonAdValorem),
  amount_paid: amount(parsed.BillDetails.paidAmount),
  payment_date: parsed.BillDetails.paidDate,
  receipt_number: parsed.BillDetails.receiptNumber,
  balance_due: amount(parsed.PaymentDetails.currentBalance),
  assessed_value: amount(parsed.ParcelDetails.assessedValue),
  exemption_value: amount(parsed.ParcelDetails.exemptionValue),
  taxable_value: amount(parsed.ParcelDetails.taxableValue)
 };
 const paths={parcel_id:'BillDetails.folio',tax_year:'BillDetails.taxYear',bill_number:'BillDetails.taxYear',combined_taxes_and_assessments:'TaxAmounts.totalTax',ad_valorem:'TaxAmounts.adValorem',non_ad_valorem:'TaxAmounts.nonAdValorem',amount_paid:'BillDetails.paidAmount',payment_date:'BillDetails.paidDate',receipt_number:'BillDetails.receiptNumber',balance_due:'PaymentDetails.currentBalance',assessed_value:'ParcelDetails.assessedValue',exemption_value:'ParcelDetails.exemptionValue',taxable_value:'ParcelDetails.taxableValue'};
 return {
  format:'HTML',doc_type:parsed.BillDetails.documentType||'annual_tax_bill',method:'Original HTML bill DOM extraction',source_id:'tax_collector',fields,
  tax_details:{BillDetails:parsed.BillDetails,ParcelDetails:parsed.ParcelDetails,TaxAmounts:parsed.TaxAmounts,PaymentDetails:parsed.PaymentDetails,AdValoremMillage:parsed.AdValoremMillage,NonAdValorem:parsed.NonAdValorem,Exemptions:parsed.Exemptions},
  section_status:parsed.section_status,validation:parsed.validation,
  field_provenance:Object.fromEntries(Object.entries(paths).filter(([key,path])=>fields[key]!==null&&parsed.provenance[path]).map(([key,path])=>[key,parsed.provenance[path]])),
  tax_details_provenance:parsed.provenance,
  notes:['This is the original collector HTML bill. No source PDF was published or generated.',...parsed.notes]
 };
}
