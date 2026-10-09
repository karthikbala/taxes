import {renderNeighbors} from './neighbors-render.mjs';

export function initNeighbors(document) {
  const el = id => document.getElementById(id), button = el('neighbors-check'), result = el('neighbors-result'), status = el('neighbors-status');
  if (!button || !result || !status) return;
  let pending = false, requestVersion = 0, activeController = null;
  const enabled = () => {
    const supported = el('county')?.value === 'miami-dade-fl';
    button.disabled = pending || !supported;
    if (!pending) status.textContent = supported ? 'Check adjacent parcels and same-building units for owner-name matches.' : 'Neighbor checks are currently available for Miami-Dade County only.';
  };
  el('county')?.addEventListener('change', () => { requestVersion++; activeController?.abort(); result.replaceChildren(); enabled(); });
  // The county select is populated asynchronously by the existing lookup UI.
  const Observer = document.defaultView?.MutationObserver;
  if (Observer && el('county')) new Observer(enabled).observe(el('county'), {childList: true});
  enabled();
  button.addEventListener('click', async () => {
    if (pending || el('county')?.value !== 'miami-dade-fl') return;
    const order = {scrap_order_id: el('order').value, address: el('address').value, ownerName: el('owner').value, county: el('county').value, transactionType: el('transaction').value, state: 'FL'};
    if (!order.address.trim() || !order.ownerName.trim() || !el('key').value.trim()) { status.textContent = 'Enter the property address, owner name and API access key before checking neighbors.'; return; }
    pending = true; button.disabled = true; result.replaceChildren(); status.textContent = 'Retrieving subject parcel and checking county neighbor records…';
    const version = requestVersion, controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 135000); activeController = controller;
    try {
      const response = await fetch('/api/v2/property/neighbors', {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + el('key').value}, body: JSON.stringify(order), cache: 'no-store', signal: controller.signal});
      const data = await response.json();
      if (version !== requestVersion) return;
      if (data.NeighboringProperties) {
        const view = renderNeighbors(document, result, data);
        status.textContent = `${response.ok === false ? 'Neighbor check unavailable' : view.complete ? 'Neighbor results ready' : 'Neighbor results have limited coverage'}${data.ExtractionMetadata?.request_id ? ' · Request ID: ' + data.ExtractionMetadata.request_id : ''}`;
      } else status.textContent = data.error?.message || data.errorMessage || 'Neighbor results unavailable. No absence of owner matches is claimed.';
    } catch (error) {
      if (version !== requestVersion) return;
      status.textContent = error.name === 'AbortError' ? 'The neighbor check reached its deadline. Results are unavailable; no absence of owner matches is claimed.' : 'The neighbor API could not be reached. Results are unavailable; no absence of owner matches is claimed.';
    } finally { clearTimeout(timeout); pending = false; activeController = null; if (version !== requestVersion) enabled(); else button.disabled = el('county')?.value !== 'miami-dade-fl'; }
  });
}
