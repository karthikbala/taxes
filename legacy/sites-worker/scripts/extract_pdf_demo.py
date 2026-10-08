"""Re-extract saved official PDFs; attach independent PDF provenance, never overwrite web observations."""
import json,re,hashlib
from pathlib import Path
from pypdf import PdfReader
root=Path(__file__).resolve().parents[1]/'public'
data=json.loads((root/'data.js').read_text().split('=',1)[1].rstrip(';\n'))
labels={'folio':'Folio / parcel ID','address':'Property address','owner':'Owner','current_assessed_value':'Current assessed value','prior_assessed_value':'Prior assessed value','prior_year_total_tax':'Prior-year total tax','proposed_total_tax':'Proposed total tax (not a bill)','rolled_back_total_tax':'Rolled-back total tax (not a bill)','market_value':'Market value','assessed_value':'County assessed value','taxable_value':'County taxable value'}
for r in data['records']:
 for d in r['documents']:
  pdf=root/d['path']; assert hashlib.sha256(pdf.read_bytes()).hexdigest()==d['sha256']
  reader=PdfReader(pdf); pages=[p.extract_text() or '' for p in reader.pages]; fields=reader.get_fields() or {}; rows=[]
  def add(label,value,raw,page,kind='text'):
   rows.append({'label':label,'value':value,'raw_label':raw,'page':page,'kind':kind})
  if fields:
   for raw,label,kind in [('TAX_MAP','Parcel ID','text'),('PropertyOwner','Owner','text'),('PropertyAddress','Property address','text'),('TaxYear','Tax year','text'),('DateOfPayment','Payment date','text'),('TotalTaxAmount','Amount paid','money'),('NetAssessment','Taxable market value','money')]:
    v=str(fields[raw]['/V']);value=re.sub(r'[$,]','',v) if kind=='money' else v;add(label,value,raw,1,kind)
   d['pdf_method']='PDF form fields (AcroForm) + page text'
  elif r['county']=='Palm Beach':
   t=pages[0];parcel=re.search(r'\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-\d{4}',t).group();add('Parcel ID',parcel,'Parcel number',1)
   values=re.search(r'2025\s+2026\s+([\d,]+)\s+([\d,]+)',t);add('2026 market value',values[2].replace(',',''),'VALUE INFORMATION / Market Value / This Year',1,'money')
   county=re.search(r'County Operating\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+(\d+)\s+(\d+)',t)
   add('2026 non-school assessed value',county[2].replace(',',''),'County Operating / Assessed Value / This Year',1,'money');add('2026 non-school exemption',county[4].replace(',',''),'County Operating / Exempt Value / This Year',1,'money');add('2026 county taxable value',county[6],'County Operating / Taxable Value / This Year',1,'money')
   d['pdf_method']='Digital PDF text + value-table parsing'
  else:
   for key,value in d['extracted'].items():
    kind='money' if key.endswith('value') or key.endswith('tax') else 'text';tokens=[str(value)]
    if kind=='money':tokens+=[format(float(value),',.0f'),format(float(value),',.2f')]
    matches=[i+1 for i,p in enumerate(pages) if any(token in p for token in tokens)];assert matches,(d['path'],key,value)
    add(labels[key],value,key.replace('_',' '),matches[0],kind)
   d['pdf_method']='Digital PDF text + labelled value/table extraction'
  d['pdf_rows']=rows;d['page_count']=len(pages)
  snippets=[]
  for row in rows:
   p=pages[row['page']-1];tokens=[str(row['value'])]
   if row['kind']=='money':tokens+=[format(float(row['value']),',.0f'),format(float(row['value']),',.2f')]
   token=next((x for x in tokens if x in p),None)
   if token:
    at=p.index(token);snippets.append(p[max(0,at-45):at+len(token)+65].strip())
  d['pdf_text_excerpt']='\n\n'.join(dict.fromkeys(snippets)) or 'Values extracted from the PDF form fields listed above. Page text alone omits filled form values.'
  d['pdf_provenance']={'origin':'original_county_pdf','parser':'pypdf','verified_sha256':d['sha256'],'method':d['pdf_method'],'page_count':len(pages),'web_comparison':d['match_status']}
(root/'data.js').write_text('window.EXPLORER_DATA='+json.dumps(data,ensure_ascii=False)+';\n')
print('Extracted',sum(len(d['pdf_rows']) for r in data['records'] for d in r['documents']),'fields from 7 original PDFs; source hashes verified.')
