import {LookupError} from './engine.mjs';

const clean = value => String(value ?? '').trim();
const cents = value => { const s = clean(value).replace(/[$,]/g, ''); return /^\d+\.\d{2}$/.test(s) ? BigInt(s.replace('.', '')) : null; };
const amount = value => clean(value).replace(/[$,]/g, '');
const proof = item => ({source_id:'receipt_pdf',method:'positioned_pdf_text',page:item.page,text:item.str,x:item.x,y:item.y});

export function parseRedemption(items) {
  const heading = items.find(i => /^Delinquent Tax Certificate(?: Redemption)?$/i.test(clean(i.str)));
  if (!heading || !items.some(i => /Redemption/i.test(i.str))) return null;
  const page = items.filter(i => i.page === heading.page);
  const label = page.find(i => /^Amount Due$/i.test(clean(i.str)));
  const due = label && page.filter(i => i.y < label.y && label.y-i.y < 30 && Math.abs(i.x-label.x) < 50 && cents(i.str) !== null).sort((a,b) => b.y-a.y)[0];
  const certificate = page.find(i => /^Cert\s*#\s*\d+$/i.test(clean(i.str)));
  const face = page.find(i => /^Face:\s*\$[\d,]+\.\d{2}$/i.test(clean(i.str)));
  const rate = page.find(i => /^Rate:\s*[\d.]+%$/i.test(clean(i.str)));
  const issuedLabel = page.find(i => /^Certificate Issued:$/i.test(clean(i.str)));
  const datePattern = /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}, 20\d{2}$/i;
  const issued = issuedLabel && page.find(i => i.y < issuedLabel.y && issuedLabel.y-i.y < 20 && Math.abs(i.x-issuedLabel.x) < 40 && datePattern.test(clean(i.str)));
  const received = page.find(i => /^If Received By$/i.test(clean(i.str)));
  const cutoff = received && page.find(i => Math.abs(i.y-received.y) < 3 && i.x > received.x+received.width && datePattern.test(clean(i.str)));
  const pay = cutoff && page.find(i => i.y < cutoff.y && cutoff.y-i.y < 20 && Math.abs(i.x-cutoff.x) < 30 && cents(i.str) !== null);
  const table = page.find(i => /^BILL DETAILS$/i.test(clean(i.str)));
  const labels = ['Tax Due','Auction Listing Fee','Advertisement Fee','Tax Coll. Comm.','Delinquency Interest','Cert. Redemption Fee','Certificate Interest'];
  const charges = labels.map(name => {
    const item = table && page.find(i => clean(i.str) === name && i.y < table.y && (!label || i.y > label.y));
    const value = item && page.find(i => Math.abs(i.y-item.y) < 3 && i.x > item.x+item.width && cents(i.str) !== null);
    return item && value ? {description:name,amount:amount(value.str),proof:{label:proof(item),value:proof(value)}} : null;
  });
  if (!due || !certificate || !face || !rate || !issued || !cutoff || !pay || charges.some(c => !c)) throw new LookupError('document_layout_changed','Certificate redemption identity, charges or payment quote is incomplete.');
  if (cents(due.str) !== cents(pay.str) || charges.reduce((sum,c) => sum+cents(c.amount),0n) !== cents(due.str)) throw new LookupError('document_values_disagree','Printed redemption charges and payable quote do not reconcile.');
  return {
    amount_due:amount(due.str),if_received_by:clean(cutoff.str),certificate_number:clean(certificate.str).match(/\d+/)[0],certificate_issued:clean(issued.str),certificate_face:amount(face.str.replace(/^Face:\s*/i,'')),certificate_rate:clean(rate.str).replace(/^Rate:\s*/i,''),charges,
    provenance:{amount_due:proof(due),if_received_by:proof(cutoff),certificate_number:proof(certificate),certificate_issued:proof(issued),certificate_face:proof(face),certificate_rate:proof(rate),document_type:proof(heading)}
  };
}
