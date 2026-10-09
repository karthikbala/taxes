const absent = value => value === null || value === undefined || value === '';
const label = value => absent(value) ? 'Unavailable' : String(value);
const text = (document, parent, tag, value, className) => {
  const node = document.createElement(tag); node.textContent = String(value);
  if (className) node.className = className;
  parent.append(node); return node;
};

export function safeSourceUrl(value) {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}

export function ownerCategory(property) {
  if (property.matchesRequestedOwner === true) return 'requested';
  if (property.matchesSubjectOwner === true || ['SAME_OWNER_SET', 'SHARED_OWNER'].includes(property.ownership_relation)) return 'coowner';
  if (property.ownership_relation === 'OWNER_UNAVAILABLE' || !Array.isArray(property.owners) || !property.owners.length) return 'unknown';
  return 'different';
}

export function neighborPresentation(response = {}) {
  const result = response.NeighboringProperties || response;
  const properties = Array.isArray(result.properties) ? result.properties : [];
  const coverage = result.coverage || {};
  const complete = String(coverage.status).toUpperCase() === 'COMPLETE' && !coverage.cap_reached;
  const matching = properties.filter(p => ['requested', 'coowner'].includes(ownerCategory(p)));
  const unknownCount = properties.filter(p => ownerCategory(p) === 'unknown').length;
  const count = matching.length;
  const message = count
    ? `${count} returned parcel${count === 1 ? '' : 's'} share an owner name.`
    : complete && !unknownCount && result.hasMatchingOwnerNeighbors === false
      ? 'No owner-name matches found in the completed search scope.'
      : 'No owner-name matches confirmed in the returned results. Coverage is incomplete or unavailable; this is not proof of no matches.';
  return {
    result, properties, matching, complete, message,
    spatial: properties.filter(p => p.spatial_relation !== 'SAME_BUILDING'),
    units: properties.filter(p => p.spatial_relation === 'SAME_BUILDING'),
    unknownCount,
    coverageLabel: `${label(coverage.status)} coverage · ${label(coverage.candidate_count)} candidates · ${label(coverage.examined_count)} examined · ${properties.length} returned`,
  };
}

// Only genuine Polygon/MultiPolygon boundaries are plotted. A condo unit never
// receives an invented footprint, and a centroid never becomes a parcel outline.
export function geometryRings(geometry) {
  const shape = geometry?.type === 'Feature' ? geometry.geometry : geometry;
  const polygons = shape?.type === 'Polygon' ? [shape.coordinates] : shape?.type === 'MultiPolygon' ? shape.coordinates : [];
  if (!Array.isArray(polygons)) return [];
  const rings = [];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon)) continue;
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4 || ring.length > 50000) continue;
      if (ring.every(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))) rings.push(ring);
    }
  }
  return rings;
}

export function mapLayout(records) {
  const valid = records.map(record => ({record, rings: geometryRings(record.geometry)})).filter(item => item.rings.length);
  const points = valid.flatMap(item => item.rings.flat());
  if (!points.length) return [];
  const [minX, maxX, minY, maxY] = points.reduce((bounds, p) => [Math.min(bounds[0], p[0]), Math.max(bounds[1], p[0]), Math.min(bounds[2], p[1]), Math.max(bounds[3], p[1])], [Infinity, -Infinity, Infinity, -Infinity]);
  const scale = Math.min(900 / Math.max(maxX - minX, 1e-9), 500 / Math.max(maxY - minY, 1e-9));
  const xOffset = (1000 - (maxX - minX) * scale) / 2, yOffset = (600 - (maxY - minY) * scale) / 2;
  return valid.map(({record, rings}) => ({record, path: rings.map(ring => ring.map((p, i) => `${i ? 'L' : 'M'}${(xOffset + (p[0] - minX) * scale).toFixed(2)},${(600 - yOffset - (p[1] - minY) * scale).toFixed(2)}`).join(' ') + ' Z').join(' ')}));
}

const spatialLabels = {ABUTTING: 'Shares a parcel boundary', SHARED_BOUNDARY: 'Shares a parcel boundary', CORNER_TOUCH: 'Touches a parcel corner', SAME_BUILDING: 'Same condominium building'};
const ownerLabels = {requested: 'Requested owner name matches', coowner: 'A subject co-owner name matches', different: 'No owner-name match', unknown: 'Owner unavailable'};

function sourceLinks(document, parent, property) {
  const provenance = Array.isArray(property.provenance) ? property.provenance : property.provenance ? [property.provenance] : [];
  const urls = [...new Set(provenance.flatMap(p => typeof p === 'string' ? [p] : [p?.url, p?.source_url, ...(p?.source_urls || [])]).map(safeSourceUrl).filter(Boolean))];
  for (const url of urls) {
    const a = text(document, parent, 'a', 'County source'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  }
}

export function renderNeighbors(document, parent, response, options = {}) {
  parent.replaceChildren();
  const view = neighborPresentation(response), {result} = view;
  text(document, parent, 'h2', result.options?.sameBuilding===true?'Neighbouring parcels and same-building units':'Boundary-sharing parcels and owners');
  const boundaryOnly = result.options?.sameBuilding === false;
  text(document, parent, 'p', `${view.spatial.length} boundary-sharing parcel${view.spatial.length===1?'':'s'} returned · ${view.spatial.filter(p=>['requested','coowner'].includes(ownerCategory(p))).length} parcel owner-name matches`, 'neighbors-summary');
  if(!boundaryOnly)text(document,parent,'p',`${view.units.length} same-building unit records returned · ${view.units.filter(p=>['requested','coowner'].includes(ownerCategory(p))).length} unit owner-name matches`,'neighbors-summary');
  text(document, parent, 'p', view.matching.length ? 'Matching registered names are highlighted below.' : 'No matching owner names in the returned records. Search notes are available below.', 'neighbors-note');
  const warningMessages=[];
  const addWarning=value=>{const message=typeof value==='string'?value:value?.message||value?.code||JSON.stringify(value);if(message&&!warningMessages.includes(message))warningMessages.push(message);};
  if(!view.complete)addWarning(view.message);
  addWarning('A matching owner name is a source-record comparison, not verification of legal identity. Spatial relationships apply only to retrieved county parcel geometry.');
  for(const error of response.ExtractionMetadata?.errors||[])addWarning(error);
  if(result.coverage?.unclassified_geometry_count)addWarning(`${result.coverage.unclassified_geometry_count} nearby GIS shapes could not be classified. They are excluded from confirmed boundary-sharing results, so the search does not establish that no additional neighbours exist.`);
  if(view.unknownCount)addWarning(`${view.unknownCount} returned parcels have unavailable owner information.`);
  if(result.coverage?.cap_reached&&!result.warnings?.some(w=>String(w).includes('cap reached')))addWarning('The candidate limit was reached. Additional parcels or owner matches may exist.');
  for(const warning of result.warnings||[])addWarning(warning);
  if (result.subject) {
    const panel = document.createElement('div'); panel.className = 'neighbors-subject'; parent.append(panel);
    text(document, panel, 'h3', 'Subject parcel');
    text(document, panel, 'p', `${label(result.subject.address)} · Folio ${label(result.subject.folio)}${result.subject.unit ? ' · Unit ' + result.subject.unit : ''}`);
    text(document, panel, 'p', 'Recorded owners: ' + (result.subject.owners?.length ? result.subject.owners.map(o => typeof o === 'string' ? o : o.name || o.ownerName || label(o)).join('; ') : 'Unavailable'));
    if(result.subject.geometry_anchor_kind==='PUBLISHED_PARENT')text(document,panel,'p','Map anchor: county-published condo parent '+label(result.subject.geometry_anchor_folio)+'. The outline represents the condo site, not the individual apartment unit.','neighbors-note');
    if (result.subject.matchesRequestedOwner === false) addWarning('The requested owner name does not match the retrieved subject owner names.');
    sourceLinks(document, panel, result.subject);
  }

  const filter = document.createElement('label'); filter.className = 'neighbors-filter';
  const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = Boolean(options.matchesOnly); filter.append(checkbox);
  text(document, filter, 'span', 'Show only owner-name matches'); parent.append(filter);
  const surface = document.createElement('div'); parent.append(surface);
  const mapSurface=document.createElement('div');mapSurface.className='neighbors-map-area';
  const detail = document.createElement('div'); detail.className = 'neighbors-selection'; detail.setAttribute('aria-live', 'polite');
  const redraw = () => {
    surface.replaceChildren(); mapSurface.replaceChildren(); detail.replaceChildren();
    const spatial = checkbox.checked ? view.spatial.filter(p => ['requested', 'coowner'].includes(ownerCategory(p))) : view.spatial;
    const units = checkbox.checked ? view.units.filter(p => ['requested', 'coowner'].includes(ownerCategory(p))) : view.units;
    const cards = new Map(), paths = new Map();
    const select = property => {
      for (const [item, card] of cards) { card.classList.toggle('is-selected', item === property); card.setAttribute('aria-pressed', String(item === property)); }
      for (const [item, path] of paths) { path.classList.toggle('is-selected', item === property); path.setAttribute('aria-pressed', String(item === property)); }
      detail.replaceChildren(); text(document, detail, 'strong', `${label(property.address)} · Folio ${label(property.folio)}`);
      text(document, detail, 'p', property === result.subject ? 'Subject parcel selected' : `${spatialLabels[property.spatial_relation] || label(property.spatial_relation)} · ${ownerLabels[ownerCategory(property)]}`);
    };
    const map = document.createElement('div'); map.className = 'neighbors-map'; mapSurface.append(map);
    const records = [...(result.subject?.geometry ? [result.subject] : []), ...spatial];
    const layout = mapLayout(records);
    if (layout.length) {
      const controls = document.createElement('div'); controls.className = 'neighbors-map-controls'; map.append(controls);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 1000 600'); svg.setAttribute('aria-label', 'County parcel outlines. Select a parcel for details.'); svg.setAttribute('role', 'group'); map.append(svg);
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g'); svg.append(group);
      let zoom = 1, dx = 0, dy = 0, drag = null;
      const transform = () => group.setAttribute('transform', `translate(${dx} ${dy}) translate(500 300) scale(${zoom}) translate(-500 -300)`);
      const zoomBy = factor => { zoom = Math.min(8, Math.max(1, zoom * factor)); if (zoom === 1) { dx = 0; dy = 0; } transform(); };
      for (const [name, action] of [['Zoom in', () => zoomBy(1.4)], ['Zoom out', () => zoomBy(1 / 1.4)], ['Reset map', () => { zoom = 1; dx = 0; dy = 0; transform(); }]]) {
        const button = text(document, controls, 'button', name); button.type = 'button'; button.addEventListener('click', action);
      }
      svg.addEventListener('wheel', event => { event.preventDefault(); zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15); }, {passive: false});
      svg.addEventListener('pointerdown', event => { if (event.button !== 0) return; drag = {x: event.clientX, y: event.clientY, dx, dy}; svg.setPointerCapture?.(event.pointerId); });
      svg.addEventListener('pointermove', event => { if (!drag || zoom === 1) return; const rect = svg.getBoundingClientRect(); dx = drag.dx + (event.clientX - drag.x) * 1000 / rect.width; dy = drag.dy + (event.clientY - drag.y) * 600 / rect.height; transform(); });
      svg.addEventListener('pointerup', () => { drag = null; }); svg.addEventListener('pointercancel', () => { drag = null; });
      for (const {record, path: d} of layout) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); path.setAttribute('fill-rule', 'evenodd');
        path.setAttribute('class', 'neighbors-parcel neighbors-' + (record === result.subject ? 'subject' : ownerCategory(record)));
        path.setAttribute('tabindex', '0'); path.setAttribute('role', 'button'); path.setAttribute('aria-pressed', 'false');
        path.setAttribute('aria-label', `${record === result.subject ? 'Subject parcel' : ownerLabels[ownerCategory(record)]}: ${label(record.address)}, folio ${label(record.folio)}`);
        path.addEventListener('click', () => select(record)); path.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); select(record); } });
        paths.set(record, path); group.append(path);
      }
      text(document, map, 'p', 'County parcel outlines · not a survey · use zoom controls or wheel; drag when zoomed. No base map or unit footprints are inferred.', 'neighbors-note');
    } else text(document, map, 'p', 'Parcel geometry was unavailable. No parcel outlines can be displayed.', 'neighbors-warning');
    const legend = document.createElement('ul'); legend.className = 'neighbors-legend'; map.append(legend);
    for (const [category, name] of [['subject', result.subject?.geometry_anchor_kind==='PUBLISHED_PARENT'?'Subject condo-site boundary':'Subject parcel'], ['requested', 'Requested owner name matches'], ['coowner', 'Subject co-owner name matches'], ['different', 'No owner-name match'], ['unknown', 'Owner unavailable']]) text(document, legend, 'li', name, 'neighbors-' + category);
    surface.append(detail);
    const renderList = (title, properties, note) => {
      text(document, surface, 'h3', `${title} (${properties.length})`); if (note) text(document, surface, 'p', note, 'neighbors-note');
      if (!properties.length) { text(document, surface, 'p', checkbox.checked ? 'No confirmed owner-name matches in this returned group.' : 'No entries returned in this group. See coverage above.'); return; }
      const list = document.createElement('div'); list.className = 'neighbors-list'; surface.append(list);
      for (const property of properties) {
        const card = document.createElement('article'); card.className = 'neighbors-card neighbors-' + ownerCategory(property); list.append(card);
        const button = text(document, card, 'button', `${label(property.address)}${property.unit ? ' · Unit ' + property.unit : ''}`); button.type = 'button'; button.setAttribute('aria-pressed', 'false'); button.addEventListener('click', () => select(property)); cards.set(property, button);
        text(document, card, 'p', `Folio ${label(property.folio)} · ${spatialLabels[property.spatial_relation] || label(property.spatial_relation)}`);
        text(document, card, 'p', ownerLabels[ownerCategory(property)]);
        text(document, card, 'p', 'Recorded owners: ' + (property.owners?.length ? property.owners.map(o => typeof o === 'string' ? o : o.name || o.ownerName || label(o)).join('; ') : 'Unavailable'));
        if (property.matching_owner_names?.length) text(document, card, 'p', 'Matching names: ' + property.matching_owner_names.join('; '));
        sourceLinks(document, card, property);
      }
    };
    renderList('Adjacent parcels', spatial);
    if(!boundaryOnly)renderList('Same-building condominium units', units, 'These are separate unit records. Shared building or parent parcel geometry does not establish individual unit locations.');
    const notMapped = spatial.filter(p => !geometryRings(p.geometry).length).length;
    if(notMapped)addWarning(`${notMapped} adjacent parcel records have no retrievable outline and are listed only.`);
  };
  checkbox.addEventListener('change', redraw); redraw();
  const notes=document.createElement('details');notes.className='neighbors-notes';text(document,notes,'summary','Search notes and limitations');parent.append(notes);
  text(document,notes,'p',view.coverageLabel);
  for(const warning of warningMessages)text(document,notes,'p',warning,'neighbors-note');
  const sources = response.ExtractionMetadata?.sources || [];
  if (sources.length || result.coverage) {
    const panel = document.createElement('details'); panel.className = 'neighbors-sources'; text(document, panel, 'summary', 'Search sources and coverage'); parent.append(panel);
    for (const [key, value] of Object.entries(result.coverage || {})) {
      if (value && typeof value === 'object') {
        text(document, panel, 'h4', key.replaceAll('_', ' '));
        for (const [field, detail] of Object.entries(value)) text(document, panel, 'p', `${field.replaceAll('_', ' ')}: ${typeof detail === 'object' && detail !== null ? JSON.stringify(detail) : label(detail)}`);
      }
    }
    for (const source of sources) {
      const p = text(document, panel, 'p', `${label(source.id || source.name)} · ${label(source.status)}`), url = safeSourceUrl(source.url);
      if (url) { const a = text(document, p, 'a', 'Open county source'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      if (source.note) text(document, panel, 'p', source.note);
    }
  }
  const mapParent=options.mapParent||parent;if(options.mapParent)mapParent.replaceChildren();mapParent.append(mapSurface);
  return view;
}
