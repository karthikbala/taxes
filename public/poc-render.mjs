const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const scopeLabels={PROPERTY_APPRAISER_ROLL_AUTHORITY_UNSPECIFIED:'Property appraiser roll; assessment authority not specified',VISIBLE_ACCOUNT_HISTORY_EVENTS_ONLY:'Events visible in the retrieved collector account history',NOT_IMPLEMENTED:'Independent source search not implemented'};
export const displayValue = value => (Object.hasOwn(scopeLabels,value)?scopeLabels[value]:null) ?? (value === 'source_displayed_rate_fraction' ? 'Fractional tax rate (as printed)' : value === null || value === undefined || value === '' ? 'Not published / unavailable' : String(value));
export const fieldLabel = key => String(key).replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, c=>c.toUpperCase()).replace(/\bid\b/gi, 'ID');
const appendText = (document, parent, tag, value) => {
  const node = document.createElement(tag);
  node.textContent = value;
  parent.append(node);
  return node;
};

const moneyFields=new Set(['ImprovementValue','TaxableValue','Exemptions','exemptions','school_exemptions','ExemptionValue','AgriculturalLandValue','ClassifiedValue','AppraisedValue','amount_due','balance_due','paid_amount','amount_paid','gross_tax','assessments','assessed_value','exemption_value','taxable_value','assessed_total','just_value','assessed_school','assessed_non_school','taxable_school','taxable_non_school','taxable_municipal','taxable_city','taxable_other','combined_taxes_and_assessments','ad_valorem','non_ad_valorem','land','building','extra_features','amountDue','paidAmount','amountPaid','taxesLevied','pleasePay','adValorem','nonAdValorem','totalDiscountable','totalTax','combinedTaxesAndAssessments','currentBalance','printedDiscount','assessedValue','exemptionValue','taxableValue','LandValue','BuildingValue','ExtraFeatureValue','MarketValue','AssessedValue']);
export function fieldDisplay(value,key){
 if(!moneyFields.has(key)||value===null||value===undefined||value==='')return displayValue(value);
 const text=String(value),match=text.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
 if(!match)return displayValue(value);
 return match[1]+'$'+match[2].replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+(match[3]||'').padEnd(2,'0');
}
// Render each returned leaf without interpolating source content into HTML.
export function renderValue(document, parent, value, field = '') {
  if (Array.isArray(value)) {
    if (!value.length) { appendText(document, parent, 'p', 'No entries returned.'); return; }
    if (value.every(row=>isObject(row)&&Object.values(row).every(item=>!isObject(item)&&!Array.isArray(item)))) {
      const wrapper = document.createElement('div');
      wrapper.className = 'scroll';
      const table = document.createElement('table');
      table.className = 'value-table';
      const keys = [...new Set(value.flatMap(row => Object.keys(row)))];
      if (!keys.length) { appendText(document, parent, 'p', 'No fields returned.'); return; }
      if(value.some(row=>keys.some(key=>row[key]===null||row[key]===undefined||row[key]==='')))appendText(document,table,'caption','— = not published or unavailable; no value is inferred.');
      const head = document.createElement('thead'), header = document.createElement('tr');
      for (const key of keys) appendText(document, header, 'th', fieldLabel(key));
      head.append(header); table.append(head);
      const body = document.createElement('tbody');
      for (const row of value) {
        const tr = document.createElement('tr');
        for (const key of keys) { const td = document.createElement('td'); if(row[key]===null||row[key]===undefined||row[key]===''){td.title='Not published / unavailable';appendText(document,td,'span','—');}else renderValue(document, td, row[key], key); tr.append(td); }
        body.append(tr);
      }
      table.append(body); wrapper.append(table); parent.append(wrapper);
    } else if (value.every(isObject)) {
      const list=document.createElement('div');list.className='record-list';
      value.forEach((row,index)=>{const card=document.createElement('article');card.className='record-card';appendText(document,card,'h4','Record '+(index+1));renderValue(document,card,row);list.append(card);});
      parent.append(list);
    } else {
      const list = document.createElement('ul');
      for (const item of value) { const li = document.createElement('li'); renderValue(document, li, item); list.append(li); }
      parent.append(list);
    }
  } else if (isObject(value)) {
    const entries = Object.entries(value);
    if (!entries.length) { appendText(document, parent, 'p', 'No entries returned.'); return; }
    const list = document.createElement('dl');
    list.className = 'value-fields';
    for (const [key, item] of entries) {
      const row=document.createElement('div');
      row.className='value-field'+(isObject(item)||Array.isArray(item)?' value-field-wide':'');
      appendText(document,row,'dt',fieldLabel(key));
      const dd=document.createElement('dd');
      if(/provenance|^validation$|^section_status$|^reconciliation$/.test(key)&&(isObject(item)||Array.isArray(item))){
       const details=document.createElement('details');appendText(document,details,'summary','Show '+fieldLabel(key).toLowerCase());renderValue(document,details,item,key);dd.append(details);
      }else renderValue(document,dd,item,key);
      row.append(dd);list.append(row);
    }
    parent.append(list);
  } else appendText(document, parent, 'span', fieldDisplay(value,field));
}

export function sectionComment(name, state = {}) {
  if (state.note) return state.note;
  const status = String(typeof state === 'string' ? state : state.status || '').toUpperCase();
  if (status === 'EMPTY') {
    if (name === 'LandBuildingExtraFeatures') return 'The source was inspected; no land, building or extra feature entries were published for the returned years.';
    return 'The source was inspected and reported no entries for this section.';
  }
  if (status === 'UNAVAILABLE') return 'This section was not retrieved or was unavailable. No empty-source conclusion is claimed.';
  if (status === 'UNVERIFIED_EMPTY') return 'No entries were returned, but source inspection was not established.';
  return null;
}

export function renderSections(document, parent, record, states = {}) {
  for (const [name, state] of Object.entries(states)) {
    const section = document.createElement('div');
    section.className = 'section';
    const status = typeof state === 'string' ? state : state?.status || 'UNAVAILABLE';
    appendText(document, section, 'h3', name + ' · ' + status);
    const comment = sectionComment(name, state || {});
    if (comment) appendText(document, section, 'p', comment);
    renderValue(document, section, record?.[name]);
    parent.append(section);
  }
}

export function resultBadge(data, ok = true) {
  const status = data.ExtractionMetadata?.status || data.status || 'error';
  const ready = ok && ['succeeded', 'success', 'partial'].includes(String(status).toLowerCase());
  return { label: ready ? 'Results ready' : status, className: 'status' + (ready ? '' : ' warn') };
}
export function resultRequestId(data, headerId) {
  return data.ExtractionMetadata?.request_id || data.request_id || headerId || null;
}

export function renderValidation(document, parent, validation) {
  const panel=document.createElement('details');panel.className='section';
  appendText(document,panel,'summary','Source validation and reconciliation');
  appendText(document,panel,'p','Checks compare the retrieved source values. DIFFERENT means a discrepancy; UNAVAILABLE means the comparison could not be completed. Original values remain unchanged.');
  renderValue(document,panel,validation);parent.append(panel);
}
