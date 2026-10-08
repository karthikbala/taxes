const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const scopeLabels={PROPERTY_APPRAISER_ROLL_AUTHORITY_UNSPECIFIED:'Property appraiser roll; assessment authority not specified',VISIBLE_ACCOUNT_HISTORY_EVENTS_ONLY:'Events visible in the retrieved collector account history',NOT_IMPLEMENTED:'Independent source search not implemented'};
export const displayValue = value => (Object.hasOwn(scopeLabels,value)?scopeLabels[value]:null) ?? (value === 'source_displayed_rate_fraction' ? 'Fractional tax rate (as printed)' : value === null || value === undefined || value === '' ? 'Not published / unavailable' : String(value));
export const fieldLabel = key => String(key).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
const appendText = (document, parent, tag, value) => {
  const node = document.createElement(tag);
  node.textContent = value;
  parent.append(node);
  return node;
};

// Render each returned leaf without interpolating source content into HTML.
export function renderValue(document, parent, value) {
  if (Array.isArray(value)) {
    if (!value.length) { appendText(document, parent, 'p', 'No entries returned.'); return; }
    if (value.every(isObject)) {
      const wrapper = document.createElement('div');
      wrapper.className = 'scroll';
      const table = document.createElement('table');
      table.className = 'value-table';
      const keys = [...new Set(value.flatMap(row => Object.keys(row)))];
      if (!keys.length) { appendText(document, parent, 'p', 'No fields returned.'); return; }
      const head = document.createElement('thead'), header = document.createElement('tr');
      for (const key of keys) appendText(document, header, 'th', fieldLabel(key));
      head.append(header); table.append(head);
      const body = document.createElement('tbody');
      for (const row of value) {
        const tr = document.createElement('tr');
        for (const key of keys) { const td = document.createElement('td'); renderValue(document, td, row[key]); tr.append(td); }
        body.append(tr);
      }
      table.append(body); wrapper.append(table); parent.append(wrapper);
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
      appendText(document, list, 'dt', fieldLabel(key));
      const dd = document.createElement('dd'); renderValue(document, dd, item); list.append(dd);
    }
    parent.append(list);
  } else appendText(document, parent, 'span', displayValue(value));
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
