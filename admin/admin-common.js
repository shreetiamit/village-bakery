const firebaseConfig = {
  apiKey: "AIzaSyDpzmw5NGHagj1fv4L2v74Wfj1E2_KmmdY",
  authDomain: "village-bakery-6885a.firebaseapp.com",
  projectId: "village-bakery-6885a",
  storageBucket: "village-bakery-6885a.firebasestorage.app",
  messagingSenderId: "735648711607",
  appId: "1:735648711607:web:423ff3ca56572d9e7d9e32"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null, profile = null, allOrders = [], allVendors = [], allMenu = [];
const now0 = new Date();
const TODAY = `${now0.getFullYear()}-${String(now0.getMonth() + 1).padStart(2, '0')}-${String(now0.getDate()).padStart(2, '0')}`;
const filterState = {
  production: { mode: 'today', from: TODAY, to: TODAY },
  packing: { mode: 'today', from: TODAY, to: TODAY },
  invoicing: { mode: 'thisweek', from: '', to: '' },
  orders: { mode: 'upcoming', from: '', to: '' }
};
let orderStatusFilter = 'all'; // 'all' | 'New' | 'Seen' | 'Done'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function show(id) {
  ['v-loading', 'v-auth', 'v-unauthorized', 'v-app'].forEach(v => document.getElementById(v).classList.toggle('hidden', v !== id));
}

function ordersFilterBarHtml() {
  const fs = filterState.orders;
  const modes = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'today', label: 'Today' },
    { key: 'thisweek', label: 'This Week' },
    { key: 'nextweek', label: 'Next Week' },
    { key: 'all', label: 'All Time' },
    { key: 'custom', label: 'Custom' }
  ];
  const fromVal = fs.mode === 'custom' ? fs.from : '';
  const toVal = fs.mode === 'custom' ? fs.to : '';
  const statuses = [
    { key: 'all', label: 'All' },
    { key: 'New', label: 'New' },
    { key: 'Seen', label: 'Seen' },
    { key: 'Done', label: 'Done' }
  ];
  return `<div class="filter-bar" id="filter-bar-orders">
      ${modes.map(m => `<button class="filter-btn${fs.mode === m.key ? ' active' : ''}" onclick="setOrdersDateFilter('${m.key}',this)">${m.label}</button>`).join('')}
      <div class="filter-sep"></div>
      <span id="custom-label-orders" style="display:${fs.mode === 'custom' ? 'flex' : 'none'};align-items:center;gap:10px">
        <input class="filter-date-input" type="date" id="filter-from-orders" value="${fromVal}" onchange="setOrdersCustomRange()">
        <span>to</span>
        <input class="filter-date-input" type="date" id="filter-to-orders" value="${toVal}" onchange="setOrdersCustomRange()">
      </span>
    </div>
    <div class="filter-bar" style="margin-top:-14px">
      ${statuses.map(s => `<button class="filter-btn status-pill${orderStatusFilter === s.key ? ' active' : ''}" onclick="setOrdersStatusFilter('${s.key}',this)">${s.label}</button>`).join('')}
    </div>`;
}

function setOrdersDateFilter(mode, btn) {
  filterState.orders.mode = mode;
  if (mode !== 'custom') {
    const r = getDateRange(mode);
    if (r) { filterState.orders.from = r.from; filterState.orders.to = r.to; }
  } else {
    const fromInput = document.getElementById('filter-from-orders');
    if (fromInput) filterState.orders.from = fromInput.value;
    const toInput = document.getElementById('filter-to-orders');
    if (toInput) filterState.orders.to = toInput.value;
  }
  document.querySelectorAll('#filter-bar-orders .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const cl = document.getElementById('custom-label-orders');
  if (cl) cl.style.display = mode === 'custom' ? 'flex' : 'none';
  renderOrders();
}
function setOrdersCustomRange() {
  const from = document.getElementById('filter-from-orders')?.value;
  const to = document.getElementById('filter-to-orders')?.value;
  if (from) filterState.orders.from = from;
  if (to) filterState.orders.to = to;
  renderOrders();
}
function setOrdersStatusFilter(status, btn) {
  orderStatusFilter = status;
  document.querySelectorAll('#panel-orders .status-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderOrders();
}

// ==================== INVOICING HELPER ====================
function escapeHtml(str) {
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function getDateRange(mode) {
  const now = new Date();
  const fmt = d => localDateStr(d);
  const todayStr = localDateStr(now);
  const dow = now.getDay();
  const diff = (dow + 6) % 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - diff);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const nmon = new Date(mon);
  nmon.setDate(mon.getDate() + 7);
  const nsun = new Date(nmon);
  nsun.setDate(nmon.getDate() + 6);
  const tmr = new Date(now);
  tmr.setDate(now.getDate() + 1);
  switch (mode) {
    case 'today': return { from: todayStr, to: todayStr };
    case 'tomorrow': return { from: fmt(tmr), to: fmt(tmr) };
    case 'thisweek': return { from: fmt(mon), to: fmt(sun) };
    case 'nextweek': return { from: fmt(nmon), to: fmt(nsun) };
    case 'upcoming': return { from: todayStr, to: '9999-12-31' };
    case 'all': return { from: '0000-01-01', to: '9999-12-31' };
    default: return null;
  }
}

function filterOrders(tab) {
  const fs = filterState[tab];
  const range = fs.mode === 'custom' ? { from: fs.from, to: fs.to } : getDateRange(fs.mode);
  if (!range) return allOrders;
  return allOrders.filter(o => o.delivery_date >= range.from && o.delivery_date <= range.to);
}

function fmtDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function filterBarHtml(tab) {
  const fs = filterState[tab];
  const modes = [
    { key: 'today', label: 'Today' },
    { key: 'tomorrow', label: 'Tomorrow' },
    { key: 'thisweek', label: 'This Week' },
    { key: 'nextweek', label: 'Next Week' },
    { key: 'custom', label: 'Custom' }
  ];
  const fromVal = fs.mode === 'custom' ? fs.from : '';
  const toVal = fs.mode === 'custom' ? fs.to : '';
  return `<div class="filter-bar" id="filter-bar-${tab}">
    ${modes.map(m => `<button class="filter-btn${fs.mode === m.key ? ' active' : ''}" onclick="setFilter('${tab}','${m.key}',this)">${m.label}</button>`).join('')}
    <div class="filter-sep"></div>
    <span id="custom-label-${tab}" style="display:${fs.mode === 'custom' ? 'flex' : 'none'};align-items:center;gap:10px">
      <input class="filter-date-input" type="date" id="filter-from-${tab}" value="${fromVal}" onchange="setCustomRange('${tab}')">
      <span>to</span>
      <input class="filter-date-input" type="date" id="filter-to-${tab}" value="${toVal}" onchange="setCustomRange('${tab}')">
    </span>
    </div>
    <div style="display:flex; justify-content:flex-end; margin-top:-20px; margin-bottom:28px">
      <button class="print-btn" onclick="printTab('${tab}')">Print Summary</button>
    </div>`;
}

function setFilter(tab, mode, btn) {
  filterState[tab].mode = mode;
  if (mode !== 'custom') {
    const r = getDateRange(mode);
    if (r) {
      filterState[tab].from = r.from;
      filterState[tab].to = r.to;
    }
  } else {
    const fromInput = document.getElementById(`filter-from-${tab}`);
    if (fromInput) filterState[tab].from = fromInput.value;
    const toInput = document.getElementById(`filter-to-${tab}`);
    if (toInput) filterState[tab].to = toInput.value;
  }
  document.querySelectorAll(`#filter-bar-${tab} .filter-btn`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const cl = document.getElementById('custom-label-' + tab);
  if (cl) cl.style.display = mode === 'custom' ? 'flex' : 'none';
  if (tab === 'production') renderProductionContent();
  if (tab === 'packing') renderPackingContent();
  if (tab === 'invoicing') renderInvoicingContent();
}

function setCustomRange(tab) {
  const from = document.getElementById('filter-from-' + tab)?.value;
  const to = document.getElementById('filter-to-' + tab)?.value;
  if (from) filterState[tab].from = from;
  if (to) filterState[tab].to = to;
  if (tab === 'production') renderProductionContent();
  if (tab === 'packing') renderPackingContent();
  if (tab === 'invoicing') renderInvoicingContent();
}

// ---------- Data loading functions ----------
async function loadOrders() {
  const snap = await db.collection('orders').orderBy('delivery_date').get();
  allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  allOrders.sort((a, b) => a.delivery_date !== b.delivery_date ? a.delivery_date.localeCompare(b.delivery_date) : (a.delivery_time || '').localeCompare(b.delivery_time || ''));
  const badgeOrders = document.getElementById('badge-orders');
  if (badgeOrders) badgeOrders.textContent = allOrders.length;
  const statNew = document.getElementById('stat-new');
  if (statNew) statNew.textContent = allOrders.filter(o => o.status === 'New').length;
  const statToday = document.getElementById('stat-today');
  if (statToday) statToday.textContent = allOrders.filter(o => o.delivery_date === TODAY).length;
  const statUnits = document.getElementById('stat-units');
  if (statUnits) statUnits.textContent = allOrders.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + i.quantity, 0), 0);
}

async function loadVendors() {
  const snap = await db.collection('profiles').get();
  allVendors = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => !v.is_admin).sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
  const pending = allVendors.filter(v => !v.approved).length;
  const badgeEl = document.getElementById('badge-vendors');
  if (badgeEl) {
    badgeEl.textContent = pending || allVendors.length;
    if (pending > 0) badgeEl.classList.add('alert'); else badgeEl.classList.remove('alert');
  }
}

async function loadMenu() {
  const snap = await db.collection('menu_items').orderBy('sort_order').get();
  allMenu = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const badgeMenu = document.getElementById('badge-menu');
  if (badgeMenu) badgeMenu.textContent = allMenu.filter(m => m.active).length;
}

// ---------- Create order globals ----------
let coQtys = {}, coWeeklyQtys = {}, coWeekOffset = 0, coOrderType = 'single';

function toggleCreateOrder() {
  const form = document.getElementById('create-order-form');
  if (!form) return;
  const opening = !form.classList.contains('open');
  form.classList.toggle('open');
  if (opening) buildCreateOrderForm();
}
function switchOrderType(type) {
  coOrderType = type;
  const otSingle = document.getElementById('ot-single');
  const otWeekly = document.getElementById('ot-weekly');
  if (otSingle) otSingle.classList.toggle('active', type === 'single');
  if (otWeekly) otWeekly.classList.toggle('active', type === 'weekly');
  const singleSec = document.getElementById('co-single-section');
  const weeklySec = document.getElementById('co-weekly-section');
  if (singleSec) singleSec.style.display = type === 'single' ? 'block' : 'none';
  if (weeklySec) weeklySec.style.display = type === 'weekly' ? 'block' : 'none';
  if (type === 'weekly') coRenderWeeklyGrid();
}

function buildCreateOrderForm() {
  coQtys = {};
  coWeeklyQtys = {};
  coWeekOffset = 0;
  coOrderType = 'single';
  switchOrderType('single');
  
  const sel = document.getElementById('co-vendor-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Select client...</option>';
  allVendors.filter(v => v.approved && v.active !== false).forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.business_name || (v.email || 'Unnamed');
    sel.appendChild(opt);
  });
  const mo = document.createElement('option');
  mo.value = '__manual__';
  mo.textContent = '─ Other / Type name ─';
  sel.appendChild(mo);
  
  document.getElementById('co-manual-field').style.display = 'none';
  document.getElementById('co-manual-name').value = '';
  const coDate = document.getElementById('co-date');
  if (coDate) coDate.value = TODAY;
  const coTime = document.getElementById('co-time');
  if (coTime) coTime.value = '08:00';
  document.getElementById('co-notes').value = '';
  document.getElementById('co-error').style.display = 'none';
  document.getElementById('co-weekly-error').style.display = 'none';
  
  const itemsGrid = document.getElementById('co-items-grid');
  if (!itemsGrid) return;
  
  // Group active items by category
  const activeItems = allMenu.filter(m => m.active);
  const grouped = {};
  activeItems.forEach(item => {
    const cat = item.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });
  const sortedCategories = Object.keys(grouped).sort();
  
  let html = '';
  for (const category of sortedCategories) {
    html += `<div style="margin-top: 20px;"><div style="font-weight: 700; letter-spacing: .1em; color: var(--accent); margin-bottom: 8px;">${category}</div>`;
    const sortedItems = grouped[category].sort((a, b) => a.name.localeCompare(b.name));
    for (const item of sortedItems) {
      html += `
        <div class="co-item-row">
          <div class="co-item-name">${item.name}</div>
          <div class="co-item-unit">${item.unit}</div>
          <div class="co-qty-ctrl">
            <button class="co-qty-btn" onclick="coChangeQty('${item.id}',-1)">−</button>
            <input class="co-qty-input" type="number" id="co-qty-${item.id}" value="" min="0" max="999" placeholder="0" oninput="coSetQty('${item.id}',this.value)">
            <button class="co-qty-btn" onclick="coChangeQty('${item.id}',1)">+</button>
          </div>
        </div>`;
    }
    html += `</div>`;
  }
  itemsGrid.innerHTML = html;
}

function onCoVendorChange() {
  const val = document.getElementById('co-vendor-select')?.value;
  const manualField = document.getElementById('co-manual-field');
  if (manualField) manualField.style.display = val === '__manual__' ? 'block' : 'none';
}
function coChangeQty(id, delta) {
  const el = document.getElementById('co-qty-' + id);
  if (!el) return;
  el.value = Math.max(0, (parseInt(el.value) || 0) + delta);
  coSetQty(id, el.value);
}
function coSetQty(id, val) {
  const qty = Math.max(0, parseInt(val) || 0);
  if (qty > 0) coQtys[id] = qty;
  else delete coQtys[id];
}
function coGetWeekDates(offset) {
  const now = new Date();
  const dow = now.getDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon + (offset * 7));
  mon.setHours(12, 0, 0, 0);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    dates.push({ dateStr: localDateStr(d), dayName: DAY_NAMES[d.getDay()], label: `${d.getMonth() + 1}/${d.getDate()}` });
  }
  return dates;
}
function coGetWeekLabel(offset) {
  const dates = coGetWeekDates(offset);
  const [, fm, fd] = dates[0].dateStr.split('-');
  const [, lm, ld] = dates[6].dateStr.split('-');
  return fm === lm ? `${MONTHS[parseInt(fm) - 1]} ${parseInt(fd)} – ${parseInt(ld)}` : `${MONTHS[parseInt(fm) - 1]} ${parseInt(fd)} – ${MONTHS[parseInt(lm) - 1]} ${parseInt(ld)}`;
}
function coChangeWeek(delta) {
  const next = coWeekOffset + delta;
  if (next < 0) return;
  coWeekOffset = next;
  coRenderWeeklyGrid();
}

function coRenderWeeklyGrid() {
  const dates = coGetWeekDates(coWeekOffset);
  const weekLabel = document.getElementById('co-week-label');
  if (weekLabel) weekLabel.textContent = coGetWeekLabel(coWeekOffset);
  const prevBtn = document.getElementById('co-week-prev');
  if (prevBtn) prevBtn.disabled = coWeekOffset <= 0;
  
  const headers = dates.map(d => `<th>${d.dayName}<br><span style="font-weight:400;font-size:11px;opacity:.7">${d.label}</span></th>`).join('');
  
  const activeItems = allMenu.filter(m => m.active);
  const grouped = {};
  activeItems.forEach(item => {
    const cat = item.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });
  const sortedCategories = Object.keys(grouped).sort();
  
  let rows = '';
  for (const category of sortedCategories) {
    rows += `<tr style="background: var(--bg);"><td colspan="${dates.length + 1}" style="font-weight: 700; letter-spacing: .1em; color: var(--accent); padding: 12px 0 6px;">${category}</td></tr>`;
    const sortedItems = grouped[category].sort((a, b) => a.name.localeCompare(b.name));
    for (const item of sortedItems) {
      const cells = dates.map(d => {
        const qty = coWeeklyQtys[d.dateStr]?.[item.id] || '';
        return `<td><input class="weekly-qty${qty > 0 ? ' has-val' : ''}" type="number" min="0" max="999" value="${qty || ''}" placeholder="—" oninput="coSetWeeklyQty('${d.dateStr}','${item.id}',this.value)"></td>`;
      }).join('');
      rows += `<tr><td class="item-col"><div class="weekly-item-name">${item.name}</div><div class="weekly-item-unit">per ${item.unit}</div></td>${cells}</tr>`;
    }
  }
  
  const gridDiv = document.getElementById('co-weekly-grid');
  if (gridDiv) {
    gridDiv.innerHTML = `<div class="weekly-table-container" style="overflow-x: auto; max-height: 70vh; overflow-y: auto;"><table class="weekly-table"><thead><tr><th class="item-col">Item</th>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  coUpdateWeeklyPreview();
}

function coSetWeeklyQty(dateStr, itemId, val) {
  const qty = Math.max(0, parseInt(val) || 0);
  if (!coWeeklyQtys[dateStr]) coWeeklyQtys[dateStr] = {};
  if (qty > 0) coWeeklyQtys[dateStr][itemId] = qty;
  else delete coWeeklyQtys[dateStr][itemId];
  const input = document.querySelector(`#co-weekly-grid input[oninput*="'${dateStr}','${itemId}'"]`);
  if (input) input.classList.toggle('has-val', qty > 0);
  coUpdateWeeklyPreview();
}
function coUpdateWeeklyPreview() {
  const el = document.getElementById('co-weekly-preview');
  if (!el) return;
  const allDates = Object.keys(coWeeklyQtys).filter(d => Object.keys(coWeeklyQtys[d] || {}).length > 0).sort();
  if (!allDates.length) {
    el.innerHTML = '';
    return;
  }
  const totalUnits = allDates.reduce((s, d) => s + Object.values(coWeeklyQtys[d]).reduce((ss, q) => ss + q, 0), 0);
  const rows = allDates.map(d => {
    const date = new Date(d + 'T12:00:00');
    const units = Object.values(coWeeklyQtys[d]).reduce((s, q) => s + q, 0);
    const ic = Object.keys(coWeeklyQtys[d]).length;
    return `<div class="weekly-preview-row"><span>${DAY_NAMES[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}</span><span>${ic} item${ic !== 1 ? 's' : ''} · ${units} unit${units !== 1 ? 's' : ''}</span></div>`;
  }).join('');
  el.innerHTML = `<div class="weekly-preview"><div style="font-size:var(--fs-sm);font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--text2);margin-bottom:10px">${allDates.length} Order${allDates.length !== 1 ? 's' : ''} · ${totalUnits} Total Units</div>${rows}</div>`;
}
function resolveVendor() {
  const vendorId = document.getElementById('co-vendor-select')?.value;
  const manualName = document.getElementById('co-manual-name')?.value.trim();
  if (!vendorId) return null;
  if (vendorId === '__manual__') {
    if (!manualName) return null;
    return { vendorId: 'phone-order', vendorName: manualName };
  }
  const v = allVendors.find(v => v.id === vendorId);
  return { vendorId, vendorName: v?.business_name || (v?.email || 'Unknown') };
}
async function submitCreateOrder() {
  const errEl = document.getElementById('co-error');
  if (errEl) errEl.style.display = 'none';
  const vendor = resolveVendor();
  if (!vendor) {
    if (errEl) {
      errEl.textContent = document.getElementById('co-vendor-select')?.value === '__manual__' ? 'Please enter the client name.' : 'Please select a client.';
      errEl.style.display = 'block';
    }
    return;
  }
  const date = document.getElementById('co-date')?.value;
  const time = document.getElementById('co-time')?.value;
  const notes = document.getElementById('co-notes')?.value.trim() || '';
  if (!date) { if (errEl) { errEl.textContent = 'Please set a delivery date.'; errEl.style.display = 'block'; } return; }
  if (!time) { if (errEl) { errEl.textContent = 'Please set a delivery time.'; errEl.style.display = 'block'; } return; }
  if (!Object.keys(coQtys).length) { if (errEl) { errEl.textContent = 'Please add at least one item.'; errEl.style.display = 'block'; } return; }
  const items = Object.entries(coQtys).map(([id, qty]) => {
    const m = allMenu.find(m => m.id === id);
    return { item_name: m.name, quantity: qty, unit: m.unit, price: m.price || 0 };
  });
  try {
    await db.collection('orders').add({
      vendor_id: vendor.vendorId,
      vendor_name: vendor.vendorName,
      delivery_date: date,
      delivery_time: time,
      notes,
      status: 'New',
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      items,
      created_by_admin: true
    });
    await loadOrders();
    renderOrders();
    const form = document.getElementById('create-order-form');
    if (form) form.classList.remove('open');
    coQtys = {};
  } catch (e) { if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; } }
}
async function submitCreateWeeklyOrders() {
  const errEl = document.getElementById('co-weekly-error');
  if (errEl) errEl.style.display = 'none';
  const vendor = resolveVendor();
  if (!vendor) {
    if (errEl) {
      errEl.textContent = document.getElementById('co-vendor-select')?.value === '__manual__' ? 'Please enter the client name.' : 'Please select a client.';
      errEl.style.display = 'block';
    }
    return;
  }
  const time = document.getElementById('co-weekly-time')?.value;
  const notes = document.getElementById('co-weekly-notes')?.value.trim() || '';
  if (!time) { if (errEl) { errEl.textContent = 'Please set a delivery time.'; errEl.style.display = 'block'; } return; }
  const daysWithItems = Object.keys(coWeeklyQtys).filter(d => Object.keys(coWeeklyQtys[d] || {}).length > 0).sort();
  if (!daysWithItems.length) { if (errEl) { errEl.textContent = 'Please enter quantities for at least one day.'; errEl.style.display = 'block'; } return; }
  try {
    let placed = 0;
    for (const date of daysWithItems) {
      const items = Object.entries(coWeeklyQtys[date]).filter(([, qty]) => qty > 0).map(([id, qty]) => {
        const m = allMenu.find(m => m.id === id);
        return { item_name: m.name, quantity: qty, unit: m.unit, price: m.price || 0 };
      });
      if (!items.length) continue;
      await db.collection('orders').add({
        vendor_id: vendor.vendorId,
        vendor_name: vendor.vendorName,
        delivery_date: date,
        delivery_time: time,
        notes,
        status: 'New',
        created_at: firebase.firestore.FieldValue.serverTimestamp(),
        items,
        created_by_admin: true
      });
      placed++;
    }
    await loadOrders();
    renderOrders();
    const form = document.getElementById('create-order-form');
    if (form) form.classList.remove('open');
    coWeeklyQtys = {};
  } catch (e) { if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; } }
}
// ---------- Repeat order ----------
function toggleRepeatOrder() {
  const form = document.getElementById('repeat-order-form');
  if (!form) return;
  const opening = !form.classList.contains('open');
  form.classList.toggle('open');
  if (opening) buildRepeatOrderForm();
}

function buildRepeatOrderForm() {
  const sel = document.getElementById('ro-vendor-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Select client...</option>';

  // Only list vendors that actually have order history
  const vendorIds = [...new Set(allOrders.map(o => o.vendor_id))];
  const vendorsWithOrders = vendorIds.map(id => {
    const v = allVendors.find(v => v.id === id);
    const name = v ? (v.business_name || v.email) : (allOrders.find(o => o.vendor_id === id)?.vendor_name || 'Unknown');
    return { id, name };
  }).sort((a, b) => a.name.localeCompare(b.name));

  vendorsWithOrders.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.name;
    sel.appendChild(opt);
  });

  document.getElementById('ro-past-orders').innerHTML = '<div class="empty-state" style="padding:24px 0">Select a client to see their past orders.</div>';
  const errEl = document.getElementById('ro-error');
  if (errEl) errEl.style.display = 'none';
}

function onRoVendorChange() {
  const vendorId = document.getElementById('ro-vendor-select')?.value;
  const container = document.getElementById('ro-past-orders');
  if (!container) return;
  if (!vendorId) {
    container.innerHTML = '<div class="empty-state" style="padding:24px 0">Select a client to see their past orders.</div>';
    return;
  }
  // Most recent 10 orders for this client, regardless of past/future
  const pastOrders = allOrders
    .filter(o => o.vendor_id === vendorId)
    .sort((a, b) => b.delivery_date.localeCompare(a.delivery_date))
    .slice(0, 10);

  if (!pastOrders.length) {
    container.innerHTML = '<div class="empty-state" style="padding:24px 0">No past orders for this client.</div>';
    return;
  }

  container.innerHTML = pastOrders.map(o => {
    const items = o.items || [];
    const units = items.reduce((s, i) => s + i.quantity, 0);
    const itemsText = items.map(i => `${i.item_name} × ${i.quantity}`).join(', ');
    const d = new Date(o.delivery_date + 'T12:00:00');
    const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return `<div class="ro-order-row" id="ro-row-${o.id}">
        <div class="ro-order-info">
          <div class="ro-order-date">${label}</div>
          <div class="ro-order-items">${escapeHtml(itemsText) || 'No items'} &middot; ${units} units</div>
        </div>
        <button class="btn-invoice" onclick="expandRepeatRow('${o.id}')">Repeat&hellip;</button>
      </div>
      <div class="ro-repeat-panel hidden" id="ro-panel-${o.id}">
        <div class="co-date-row">
          <div class="field"><label>New Delivery Date</label><input class="admin-form-input" type="date" id="ro-date-${o.id}" value="${suggestNextDate(o.delivery_date)}"></div>
          <div class="field"><label>Delivery Time</label><input class="admin-form-input" type="time" id="ro-time-${o.id}" value="${o.delivery_time || '08:00'}"></div>
        </div>
        <div class="form-actions">
          <button class="btn-action" onclick="confirmRepeatOrder('${o.id}')">Place Order</button>
          <button class="btn-action-cancel" onclick="collapseRepeatRow('${o.id}')">Cancel</button>
        </div>
      </div>`;
  }).join('');
}

function suggestNextDate(pastDateStr) {
  // Suggests the next occurrence of the same weekday, on/after today
  const past = new Date(pastDateStr + 'T12:00:00');
  const dow = past.getDay();
  const candidate = new Date();
  candidate.setHours(12, 0, 0, 0);
  while (candidate.getDay() !== dow) candidate.setDate(candidate.getDate() + 1);
  return localDateStr(candidate);
}

function expandRepeatRow(orderId) {
  document.querySelectorAll('.ro-repeat-panel').forEach(p => p.classList.add('hidden'));
  const panel = document.getElementById('ro-panel-' + orderId);
  if (panel) panel.classList.remove('hidden');
}
function collapseRepeatRow(orderId) {
  const panel = document.getElementById('ro-panel-' + orderId);
  if (panel) panel.classList.add('hidden');
}

async function confirmRepeatOrder(orderId) {
  const errEl = document.getElementById('ro-error');
  if (errEl) errEl.style.display = 'none';
  const source = allOrders.find(o => o.id === orderId);
  if (!source) return;
  const date = document.getElementById('ro-date-' + orderId)?.value;
  const time = document.getElementById('ro-time-' + orderId)?.value;
  if (!date || !time) {
    if (errEl) { errEl.textContent = 'Please set a delivery date and time.'; errEl.style.display = 'block'; }
    return;
  }
  try {
    await db.collection('orders').add({
      vendor_id: source.vendor_id,
      vendor_name: source.vendor_name,
      delivery_date: date,
      delivery_time: time,
      notes: source.notes || '',
      status: 'New',
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      items: source.items || [],
      created_by_admin: true
    });
    await loadOrders();
    renderOrders();
    const form = document.getElementById('repeat-order-form');
    if (form) form.classList.remove('open');
  } catch (e) {
    if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
  }
}
// ---------- Vendors / Clients functions ----------
function toggleAddClient() {
  const form = document.getElementById('add-client-form');
  if (!form) return;
  form.classList.toggle('open');
  if (!form.classList.contains('open')) {
    const acName = document.getElementById('ac-name');
    if (acName) acName.value = '';
    const acEmail = document.getElementById('ac-email');
    if (acEmail) acEmail.value = '';
    const acPhone = document.getElementById('ac-phone');
    if (acPhone) acPhone.value = '';
    const acError = document.getElementById('ac-error');
    if (acError) acError.style.display = 'none';
  }
}
async function submitAddClient() {
  const name = document.getElementById('ac-name')?.value.trim();
  const email = document.getElementById('ac-email')?.value.trim() || '';
  const phone = document.getElementById('ac-phone')?.value.trim() || '';
  const errEl = document.getElementById('ac-error');
  if (errEl) errEl.style.display = 'none';
  if (!name) { if (errEl) { errEl.textContent = 'Business name is required.'; errEl.style.display = 'block'; } return; }
  try {
    const docRef = await db.collection('profiles').add({
      business_name: name,
      email: email,
      phone: phone,
      approved: true,
      active: true,
      is_admin: false,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      created_by_admin: true
    });
    allVendors.unshift({ id: docRef.id, business_name: name, email: email, phone: phone, approved: true, active: true, created_by_admin: true });
    renderVendors();
    const form = document.getElementById('add-client-form');
    if (form) form.classList.remove('open');
    const acName = document.getElementById('ac-name');
    if (acName) acName.value = '';
    const acEmail = document.getElementById('ac-email');
    if (acEmail) acEmail.value = '';
    const acPhone = document.getElementById('ac-phone');
    if (acPhone) acPhone.value = '';
  } catch (e) { if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; } }
}
async function approveVendor(id) {
  await db.collection('profiles').doc(id).update({ approved: true });
  const v = allVendors.find(v => v.id === id);
  if (v) v.approved = true;
  const pending = allVendors.filter(v => !v.approved).length;
  const badgeEl = document.getElementById('badge-vendors');
  if (badgeEl) {
    badgeEl.textContent = pending || allVendors.length;
    if (pending > 0) badgeEl.classList.add('alert'); else badgeEl.classList.remove('alert');
  }
  renderVendors();
}
async function toggleActive(id, active) {
  await db.collection('profiles').doc(id).update({ active });
  const v = allVendors.find(v => v.id === id);
  if (v) v.active = active;
  renderVendors();
}
async function editVendorName(id) {
  const v = allVendors.find(v => v.id === id);
  if (!v) return;
  const name = prompt('Business name:', v.business_name || '');
  if (name === null) return;
  await db.collection('profiles').doc(id).update({ business_name: name.trim() });
  v.business_name = name.trim();
  renderVendors();
}

// ---------- Menu functions ----------
async function updatePrice(id, price) {
  const p = parseFloat(price) || 0;
  await db.collection('menu_items').doc(id).update({ price: p });
  const m = allMenu.find(m => m.id === id);
  if (m) m.price = p;
}
async function toggleItem(id, active) {
  await db.collection('menu_items').doc(id).update({ active });
  const m = allMenu.find(m => m.id === id);
  if (m) m.active = active;
  renderMenu();
}
async function deleteItem(id) {
  if (!confirm('Delete this item?')) return;
  await db.collection('menu_items').doc(id).delete();
  allMenu = allMenu.filter(m => m.id !== id);
  renderMenu();
}
async function addItem() {
  const name = document.getElementById('new-name')?.value.trim();
  const unit = document.getElementById('new-unit')?.value;
  const price = parseFloat(document.getElementById('new-price')?.value) || 0;
  const category = document.getElementById('new-category')?.value || 'Uncategorized';
  if (!name) return;
  const sortOrder = Math.max(0, ...allMenu.map(m => m.sort_order || 0)) + 1;
  const docRef = await db.collection('menu_items').add({
    name, unit, price, category,
    sort_order: sortOrder,
    active: true
  });
  allMenu.push({
    id: docRef.id,
    name, unit, price, category,
    sort_order: sortOrder,
    active: true
  });
  renderMenu();
}

// ---------- Invoice printing ----------
function openInvoice(orderId) {
  const order = allOrders.find(o => o.id === orderId);
  if (!order) return;
  const w = window.open('', '_blank');
  w.document.write(generateInvoiceHtml(order));
  w.document.close();
  setTimeout(() => w.print(), 600);
}
function generateInvoiceHtml(order) {
  const items = order.items || [];
  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = items.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
  const issued = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const d = new Date((order.delivery_date || '') + 'T12:00:00');
  const deliveryStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const rows = items.map(i => {
    const sub = (i.price || 0) * i.quantity;
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #e8e4de;font-size:14px">${i.item_name}</td><td style="padding:10px 0;border-bottom:1px solid #e8e4de;text-align:center;font-size:14px">${i.quantity}</td><td style="padding:10px 0;border-bottom:1px solid #e8e4de;text-align:center;font-size:13px;color:#6b6860">${i.unit}</td><td style="padding:10px 0;border-bottom:1px solid #e8e4de;text-align:right;font-size:14px">${i.price ? '$' + Number(i.price).toFixed(2) : '&mdash;'}</td><td style="padding:10px 0;border-bottom:1px solid #e8e4de;text-align:right;font-size:14px;font-weight:500">${sub > 0 ? '$' + sub.toFixed(2) : '&mdash;'}</td></tr>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice &mdash; ${order.id.slice(0, 8).toUpperCase()}</title><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'DM Sans',sans-serif;background:white;color:#1a1916;padding:56px;max-width:760px;margin:0 auto;}@media print{body{padding:32px;}.no-print{display:none!important;}}.no-print{text-align:center;margin-bottom:32px;padding-bottom:32px;border-bottom:1px solid #e8e4de;}.print-btn{background:#1a1916;color:white;border:none;padding:10px 24px;font-family:'DM Sans',sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;}.wordmark{font-family:'Cormorant Garamond',serif;font-size:13px;font-weight:600;letter-spacing:.25em;text-transform:uppercase;}.invoice-label{font-family:'Cormorant Garamond',serif;font-size:42px;font-weight:600;}</style></head><body><div class="no-print"><button class="print-btn" onclick="window.print()">Download / Print PDF</button></div><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:48px"><div><div class="wordmark">Village Bakery + Provisions</div><div style="font-size:12px;color:#6b6860;margin-top:8px;line-height:2">212 Thompson Lane, Nashville, TN 37211<br>orders@villagebakeryandprovisions.com<br>(615) 498-5385</div></div><div style="text-align:right"><div class="invoice-label">Invoice</div><div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6b6860;margin-top:6px">#${order.id.slice(0, 8).toUpperCase()}</div><div style="font-size:12px;color:#6b6860;margin-top:4px">Issued ${issued}</div></div></div><div style="display:flex;justify-content:space-between;margin-bottom:40px;padding-bottom:24px;border-bottom:2px solid #1a1916"><div><div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6b6860;margin-bottom:8px">Bill To</div><div style="font-size:16px;font-weight:500">${order.vendor_name}</div></div><div style="text-align:right"><div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6b6860;margin-bottom:8px">Delivery</div><div style="font-size:14px;font-weight:500">${deliveryStr}</div><div style="font-size:13px;color:#6b6860;margin-top:3px">at ${(order.delivery_time || '').slice(0, 5)}</div></div></div>${order.notes ? `<div style="font-size:13px;color:#6b6860;margin-bottom:24px;font-style:italic">${order.notes}</div>` : ''}<table style="width:100%;border-collapse:collapse"><thead><tr style="border-bottom:2px solid #1a1916"><th style="padding:8px 0;text-align:left;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6b6860;font-weight:500">Item</th><th style="padding:8px 0;text-align:center;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6b6860;font-weight:500">Qty</th><th style="padding:8px 0;text-align:center;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6b6860;font-weight:500">Unit</th><th style="padding:8px 0;text-align:right;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6b6860;font-weight:500">Price</th><th style="padding:8px 0;text-align:right;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6b6860;font-weight:500">Subtotal</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3" style="padding:14px 0;font-size:11px;letter-spacing:.15em;text-transform:uppercase;font-weight:500">Total</th><td style="padding:14px 0;text-align:right;font-size:13px;color:#6b6860">${totalUnits} units</th><td style="padding:14px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600">${totalPrice > 0 ? '$' + totalPrice.toFixed(2) : '&mdash;'}</th></tr></tfoot></table><div style="margin-top:48px;padding-top:20px;border-top:1px solid #e8e4de;font-size:12px;color:#6b6860;text-align:center;line-height:2">Thank you for your business.<br>Village Bakery + Provisions &nbsp;&middot;&nbsp; orders@villagebakeryandprovisions.com &nbsp;&middot;&nbsp; (615) 498-5385</div></body></html>`;
}

// ---------- Order status update ----------
async function updateStatus(orderId, sel) {
  const status = sel.value;
  sel.className = 'status-select ' + status.toLowerCase();
  await db.collection('orders').doc(orderId).update({ status });
  const o = allOrders.find(o => o.id === orderId);
  if (o) o.status = status;
  const statNew = document.getElementById('stat-new');
  if (statNew) statNew.textContent = allOrders.filter(o => o.status === 'New').length;
}
async function deleteOrderAdmin(orderId) {
  if (!confirm('Delete this order? This cannot be undone.')) return;
  try {
    await db.collection('orders').doc(orderId).delete();
    allOrders = allOrders.filter(o => o.id !== orderId);
    renderOrders();
    const badgeOrders = document.getElementById('badge-orders');
    if (badgeOrders) badgeOrders.textContent = allOrders.length;
    const statNew = document.getElementById('stat-new');
    if (statNew) statNew.textContent = allOrders.filter(o => o.status === 'New').length;
    const statToday = document.getElementById('stat-today');
    if (statToday) statToday.textContent = allOrders.filter(o => o.delivery_date === TODAY).length;
    const statUnits = document.getElementById('stat-units');
    if (statUnits) statUnits.textContent = allOrders.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + i.quantity, 0), 0);
  } catch (e) { alert('Could not delete order: ' + e.message); }
}
function exportCSV() {
  if (!allOrders.length) { alert('No orders to export.'); return; }
  const rows = [['Order ID', 'Client', 'Delivery Date', 'Delivery Time', 'Status', 'Item', 'Quantity', 'Unit', 'Price', 'Notes', 'Order Placed', 'Source']];
  allOrders.forEach(order => {
    const items = order.items || [];
    const created = order.created_at ? new Date(order.created_at.seconds * 1000).toLocaleDateString('en-US') : '';
    const source = order.created_by_admin ? 'Phone/Admin' : 'Portal';
    if (!items.length) {
      rows.push([order.id.slice(0, 8).toUpperCase(), order.vendor_name, order.delivery_date, (order.delivery_time || '').slice(0, 5), order.status || 'New', '', '', '', '', order.notes || '', created, source]);
    } else {
      items.forEach((item, idx) => {
        rows.push([
          idx === 0 ? order.id.slice(0, 8).toUpperCase() : '',
          idx === 0 ? order.vendor_name : '',
          idx === 0 ? order.delivery_date : '',
          idx === 0 ? (order.delivery_time || '').slice(0, 5) : '',
          idx === 0 ? (order.status || 'New') : '',
          item.item_name,
          item.quantity,
          item.unit,
          item.price ? '$' + Number(item.price).toFixed(2) : '',
          idx === 0 ? (order.notes || '') : '',
          idx === 0 ? created : '',
          idx === 0 ? source : ''
        ]);
      });
    }
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `village-bakery-orders-${localDateStr(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Pricing overrides ----------
let vendorPricingCache = {};
async function togglePricing(vendorId) {
  const panel = document.getElementById('pricing-panel-' + vendorId);
  const btn = document.getElementById('pricing-btn-' + vendorId);
  if (!panel) return;
  const isOpen = panel.style.display === 'block';
  document.querySelectorAll('.pricing-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.btn-pricing').forEach(b => b.classList.remove('active'));
  if (!isOpen) {
    panel.style.display = 'block';
    if (btn) btn.classList.add('active');
    if (!vendorPricingCache[vendorId]) await loadVendorPricingForAdmin(vendorId);
    renderPricingRows(vendorId);
  }
}
async function loadVendorPricingForAdmin(vendorId) {
  const snap = await db.collection('vendor_pricing').where('vendor_id', '==', vendorId).get();
  vendorPricingCache[vendorId] = {};
  snap.docs.forEach(d => {
    const data = d.data();
    vendorPricingCache[vendorId][data.menu_item_id] = Number(data.price);
  });
}
function renderPricingRows(vendorId) {
  const el = document.getElementById('pricing-rows-' + vendorId);
  if (!el) return;
  const prices = vendorPricingCache[vendorId] || {};
  const active = allMenu.filter(m => m.active);
  el.innerHTML = active.map(item => {
    const custom = prices[item.id];
    const defaultP = item.price || 0;
    return `<div class="pricing-row"><div class="pricing-item-name">${item.name}</div><div class="pricing-default">Default: $${defaultP.toFixed(2)}</div><div class="pricing-override"><span>$</span><input class="price-override-input" type="number" step="0.01" min="0" id="vp-${vendorId}-${item.id}" value="${custom !== undefined ? custom.toFixed(2) : ''}" placeholder="${defaultP.toFixed(2)}"></div></div>`;
  }).join('');
}
async function savePricing(vendorId) {
  const active = allMenu.filter(m => m.active);
  const batch = db.batch();
  active.forEach(item => {
    const input = document.getElementById(`vp-${vendorId}-${item.id}`);
    if (!input) return;
    const val = input.value.trim();
    const docRef = db.collection('vendor_pricing').doc(`${vendorId}_${item.id}`);
    if (val !== '' && !isNaN(parseFloat(val))) {
      batch.set(docRef, { vendor_id: vendorId, menu_item_id: item.id, price: parseFloat(val) });
    } else {
      batch.delete(docRef);
    }
  });
  await batch.commit();
  vendorPricingCache[vendorId] = {};
  active.forEach(item => {
    const input = document.getElementById(`vp-${vendorId}-${item.id}`);
    if (!input) return;
    const val = input.value.trim();
    if (val !== '' && !isNaN(parseFloat(val))) vendorPricingCache[vendorId][item.id] = parseFloat(val);
  });
  const btn = document.querySelector(`#pricing-panel-${vendorId} .btn-save-prices`);
  if (btn) { btn.textContent = 'Saved'; setTimeout(() => btn.textContent = 'Save Prices', 1800); }
}
async function clearPricing(vendorId) {
  if (!confirm('Remove all custom prices for this client?')) return;
  const snap = await db.collection('vendor_pricing').where('vendor_id', '==', vendorId).get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  vendorPricingCache[vendorId] = {};
  renderPricingRows(vendorId);
}

// ---------- Render functions ----------
function renderOrders() {
  const el = document.getElementById('orders-list');
  if (!el) return;

  let orders = filterOrders('orders');
  if (orderStatusFilter !== 'all') orders = orders.filter(o => (o.status || 'New') === orderStatusFilter);

  const filterBarEl = document.getElementById('orders-filter-bar');
  if (filterBarEl) filterBarEl.innerHTML = ordersFilterBarHtml();

  if (!orders.length) {
    el.innerHTML = '<div class="empty-state">No orders match this filter.</div>';
    return;
  }

  const byDate = {};
  orders.forEach(o => {
    if (!o.delivery_date) return;
    if (!byDate[o.delivery_date]) byDate[o.delivery_date] = [];
    byDate[o.delivery_date].push(o);
  });
  const sortedDates = Object.keys(byDate).sort();

  let html = '';
  for (const date of sortedDates) {
    const dayOrders = byDate[date];
    const d = new Date(date + 'T12:00:00');
    const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const units = dayOrders.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + i.quantity, 0), 0);

    html += `<div class="date-group">
      <div class="date-header">
        <div class="date-header-label">${date === TODAY ? 'Today — ' : ''}${label}</div>
        <div class="date-header-stats">${dayOrders.length} order${dayOrders.length !== 1 ? 's' : ''} &middot; ${units} units</div>
      </div>`;

    // sort within a day by time
    dayOrders.sort((a, b) => (a.delivery_time || '').localeCompare(b.delivery_time || ''));

    for (const order of dayOrders) {
      const items = order.items || [];
      const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
      const statusClass = (order.status || 'New').toLowerCase();
      const itemsHtml = items.length
        ? items.map(i => `<div class="oc-item"><span>${escapeHtml(i.item_name)}</span><span class="oc-item-qty">${i.quantity} ${i.unit === 'each' ? 'each' : (i.quantity !== 1 ? i.unit + 's' : i.unit)}</span></div>`).join('')
        : '<div class="oc-item" style="color:var(--text3)">No items</div>';

      html += `<div class="order-card">
        <div class="oc-header">
          <div class="oc-header-left">
            <span class="oc-vendor">${escapeHtml(order.vendor_name || 'Unknown Vendor')}</span>
            ${order.created_by_admin ? '<span class="oc-tag">Phone</span>' : ''}
          </div>
          <div class="oc-header-right">
            <span class="oc-time">${(order.delivery_time || '').slice(0,5) || '--:--'}</span>
            <select class="status-select ${statusClass}" onchange="updateStatus('${order.id}',this)">
              <option value="New" ${order.status === 'New' ? 'selected' : ''}>New</option>
              <option value="Seen" ${order.status === 'Seen' ? 'selected' : ''}>Seen</option>
              <option value="Done" ${order.status === 'Done' ? 'selected' : ''}>Done</option>
            </select>
          </div>
        </div>
        <div class="oc-items">${itemsHtml}</div>
        ${order.notes ? `<div class="oc-notes">${escapeHtml(order.notes)}</div>` : ''}
        <div class="oc-footer">
          <span class="oc-total">${totalUnits} total units</span>
          <div class="oc-actions">
            <button class="btn-invoice" onclick="openInvoice('${order.id}')">Invoice</button>
            <button class="btn-invoice" style="color:var(--err);border-color:var(--err)" onclick="deleteOrderAdmin('${order.id}')">Delete</button>
          </div>
        </div>
      </div>`;
    }
    html += `</div>`;
  }
  el.innerHTML = html;
}

function renderVendors() {
  const el = document.getElementById('vendors-list');
  if (!el) return;
  const pending = allVendors.filter(v => !v.approved);
  const active = allVendors.filter(v => v.approved && v.active !== false);
  const inactive = allVendors.filter(v => v.approved && v.active === false);
  const pendingHtml = pending.length ? `<div class="vendors-section"><div class="section-heading" style="color:#7a6000">Pending Approval &mdash; ${pending.length}</div>${pending.map(v => `<div class="vendor-row"><div><div class="vendor-name">${v.business_name || 'No name'}</div><div class="vendor-email">${v.email}</div><div class="vendor-date">Signed up ${v.created_at ? new Date(v.created_at.seconds * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}</div></div><div class="vendor-actions"><button class="btn-approve" onclick="approveVendor('${v.id}')">Approve</button></div></div>`).join('')}</div>` : '';
  const activeHtml = `<div class="vendors-section"><div class="section-heading">Active Clients &mdash; ${active.length}</div>${active.length ? active.map(v => `<div class="vendor-row"><div style="flex:1"><div style="display:flex;align-items:center;gap:10px"><div class="vendor-name">${v.business_name || 'No name'}</div>${v.created_by_admin ? '<span style="font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);border:1px solid var(--border);padding:2px 7px">Phone</span>' : ''}<button onclick="editVendorName('${v.id}')" style="background:none;border:none;font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);cursor:pointer;padding:0;text-decoration:underline;text-underline-offset:2px">Edit</button></div>${v.email ? `<div class="vendor-email">${v.email}</div>` : ''}${v.phone ? `<div class="vendor-phone">${v.phone}</div>` : ''}</div><div class="vendor-actions"><button class="btn-pricing" id="pricing-btn-${v.id}" onclick="togglePricing('${v.id}')">Pricing</button><button class="btn-deactivate" onclick="toggleActive('${v.id}',false)">Deactivate</button></div></div><div class="pricing-panel" id="pricing-panel-${v.id}"><div class="pricing-panel-header"><span class="pricing-panel-title">Custom Prices — ${v.business_name || v.email || 'Client'}</span><span class="pricing-panel-note">Leave blank to use default</span></div><div id="pricing-rows-${v.id}"><div style="font-size:var(--fs-base);color:var(--text3);padding:10px 0">Loading...</div></div><div class="pricing-actions"><button class="btn-save-prices" onclick="savePricing('${v.id}')">Save Prices</button><button class="btn-clear-prices" onclick="clearPricing('${v.id}')">Clear All Custom</button></div></div>`).join('') : '<div class="empty-state" style="padding:24px 0;text-align:left">No active clients yet.</div>'}</div>`;
  const inactiveHtml = inactive.length ? `<div class="vendors-section"><div class="section-heading">Inactive &mdash; ${inactive.length}</div>${inactive.map(v => `<div class="vendor-row inactive"><div><div class="vendor-name">${v.business_name || 'No name'}</div>${v.email ? `<div class="vendor-email">${v.email}</div>` : ''}</div><button class="btn-activate" onclick="toggleActive('${v.id}',true)">Reactivate</button></div>`).join('')}</div>` : '';
  el.innerHTML = pendingHtml + activeHtml + inactiveHtml;
}

function renderMenu() {
  const el = document.getElementById('menu-card');
  if (!el) return;
  const active = allMenu.filter(m => m.active);
  const inactive = allMenu.filter(m => !m.active);
  const badgeMenu = document.getElementById('badge-menu');
  if (badgeMenu) badgeMenu.textContent = active.length;
  
  el.innerHTML = `
    <div class="section-label">Active Items &mdash; ${active.length}</div>
    <div style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 2fr; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 12px;">
      <div>Item Name</div>
      <div>Unit</div>
      <div>Price</div>
      <div>Category</div>
      <div>Actions</div>
    </div>
    ${active.map(item => `
      <div class="menu-row" style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 2fr; gap: 8px; align-items: center;">
        <div class="menu-item-name">${item.name}</div>
        <div class="menu-item-unit">${item.unit}</div>
        <div class="price-field">
          <span class="price-symbol">$</span>
          <input class="price-input" type="number" step="0.01" min="0" value="${Number(item.price || 0).toFixed(2)}" onblur="updatePrice('${item.id}',this.value)" onkeydown="if(event.key==='Enter')this.blur()">
        </div>
        <div>
          <select class="category-select" data-id="${item.id}" onchange="updateCategory('${item.id}', this.value)" style="padding: 5px; font-size: 12px;">
            <option value="Uncategorized" ${(item.category || 'Uncategorized') === 'Uncategorized' ? 'selected' : ''}>Uncategorized</option>
            <option value="Breads" ${item.category === 'Breads' ? 'selected' : ''}>Breads</option>
            <option value="Pastries" ${item.category === 'Pastries' ? 'selected' : ''}>Pastries</option>
            <option value="Cookies" ${item.category === 'Cookies' ? 'selected' : ''}>Cookies</option>
            <option value="Savory" ${item.category === 'Savory' ? 'selected' : ''}>Savory</option>
            <option value="Other" ${item.category === 'Other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
        <div class="menu-actions">
          <button class="btn-hide" onclick="toggleItem('${item.id}',false)">Hide</button>
          <button class="btn-delete" onclick="deleteItem('${item.id}')">Delete</button>
        </div>
      </div>
    `).join('')}
    ${inactive.length ? `<div class="section-label" style="margin-top:12px">Hidden &mdash; ${inactive.length}</div>
    <div style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 2fr; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 12px;">
      <div>Item Name</div><div>Unit</div><div>Price</div><div>Category</div><div>Actions</div>
    </div>
    ${inactive.map(item => `
      <div class="menu-row inactive" style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 2fr; gap: 8px; align-items: center;">
        <div class="menu-item-name">${item.name}</div>
        <div class="menu-item-unit">${item.unit}</div>
        <div class="price-field">
          <span class="price-symbol">$</span>
          <input class="price-input" type="number" step="0.01" min="0" value="${Number(item.price || 0).toFixed(2)}" onblur="updatePrice('${item.id}',this.value)" onkeydown="if(event.key==='Enter')this.blur()">
        </div>
        <div>
          <select class="category-select" data-id="${item.id}" onchange="updateCategory('${item.id}', this.value)" style="padding: 5px; font-size: 12px;">
            <option value="Uncategorized" ${(item.category || 'Uncategorized') === 'Uncategorized' ? 'selected' : ''}>Uncategorized</option>
            <option value="Breads" ${item.category === 'Breads' ? 'selected' : ''}>Breads</option>
            <option value="Pastries" ${item.category === 'Pastries' ? 'selected' : ''}>Pastries</option>
            <option value="Cookies" ${item.category === 'Cookies' ? 'selected' : ''}>Cookies</option>
            <option value="Savory" ${item.category === 'Savory' ? 'selected' : ''}>Savory</option>
            <option value="Other" ${item.category === 'Other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
        <div class="menu-actions">
          <button class="btn-show" onclick="toggleItem('${item.id}',true)">Show</button>
          <button class="btn-delete" onclick="deleteItem('${item.id}')">Delete</button>
        </div>
      </div>
    `).join('')}` : ''}
    <div class="add-form">
      <div class="add-form-title">Add New Item</div>
      <div class="add-form-row">
        <input class="add-input" id="new-name" type="text" placeholder="Item name">
        <select class="add-select" id="new-unit">
          <option value="each">each</option><option value="loaf">loaf</option><option value="tray">tray</option>
          <option value="8-pack">8-pack</option><option value="dozen">dozen</option><option value="box">box</option>
        </select>
        <input class="add-input" id="new-price" type="number" step="0.01" min="0" placeholder="Price $" style="max-width:110px">
        <select class="add-select" id="new-category">
          <option value="Uncategorized">Uncategorized</option>
          <option value="Breads">Breads</option>
          <option value="Pastries">Pastries</option>
          <option value="Cookies">Cookies</option>
          <option value="Savory">Savory</option>
          <option value="Other">Other</option>
        </select>
        <button class="btn-add" onclick="addItem()">Add</button>
      </div>
    </div>
  `;
}

function renderProduction() {
  const el = document.getElementById('production-content');
  if (!el) return;
  el.innerHTML = filterBarHtml('production') + '<div id="prod-body"></div>';
  renderProductionContent();
}
function renderProductionContent() {
  const orders = filterOrders('production');
  const el = document.getElementById('prod-body');
  if (!el) return;
  if (!orders.length) { el.innerHTML = '<div class="empty-state">No orders for this period.</div>'; return; }

  // Group by date
  const byDate = {};
  orders.forEach(o => {
    if (!byDate[o.delivery_date]) byDate[o.delivery_date] = [];
    byDate[o.delivery_date].push(o);
  });

  // Overall stats
  const tI = new Set(orders.flatMap(o => (o.items || []).map(i => i.item_name))).size;
  const tU = orders.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + i.quantity, 0), 0);
  let html = `<div class="prod-summary">
    <div class="prod-stat"><div class="prod-stat-val">${Object.keys(byDate).length}</div><div class="prod-stat-lbl">Days</div></div>
    <div class="prod-stat"><div class="prod-stat-val">${orders.length}</div><div class="prod-stat-lbl">Orders</div></div>
    <div class="prod-stat"><div class="prod-stat-val">${tI}</div><div class="prod-stat-lbl">Products</div></div>
    <div class="prod-stat"><div class="prod-stat-val">${tU}</div><div class="prod-stat-lbl">Total Units</div></div>
  </div>`;

  // For each date
  Object.keys(byDate).sort().forEach(date => {
    const dO = byDate[date];
    const dU = dO.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + i.quantity, 0), 0);

    // Aggregate items: item_name -> {qty, unit, vendors, category}
    const itemMap = {};
    dO.forEach(o => {
      (o.items || []).forEach(i => {
        if (!itemMap[i.item_name]) {
          // find category from menuItems (or use 'Uncategorized')
          const menuItem = allMenu.find(m => m.name === i.item_name);
          const category = menuItem?.category || 'Uncategorized';
          itemMap[i.item_name] = { qty: 0, unit: i.unit, vendors: [], category };
        }
        itemMap[i.item_name].qty += i.quantity;
        if (!itemMap[i.item_name].vendors.includes(o.vendor_name))
          itemMap[i.item_name].vendors.push(o.vendor_name);
      });
    });

    // Group by category
    const categoryGroups = {};
    for (const [name, data] of Object.entries(itemMap)) {
      const cat = data.category;
      if (!categoryGroups[cat]) categoryGroups[cat] = [];
      categoryGroups[cat].push({ name, ...data });
    }
    // Sort categories alphabetically (or custom order)
    const sortedCategories = Object.keys(categoryGroups).sort();

    html += `<div class="prod-date-block">
      <div class="prod-date-heading">
        <span>${date === TODAY ? 'Today — ' : ''}${fmtDate(date)}</span>
        <span class="prod-date-sub">${dO.length} order${dO.length !== 1 ? 's' : ''} · ${dU} units</span>
      </div>`;

    // Render each category
    for (const category of sortedCategories) {
      const items = categoryGroups[category];
      // sort items by quantity descending within category
      items.sort((a, b) => b.qty - a.qty);
      html += `<div style="margin-top: 16px;"><div style="font-weight: 700; letter-spacing: .1em; color: var(--accent); margin-bottom: 8px;">${category}</div>`;
      items.forEach(data => {
        html += `<div class="prod-item-row">
          <div>
            <div class="prod-item-name">${data.name}</div>
            <div class="prod-item-vendors">${data.vendors.join(', ')}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <span class="prod-item-qty">${data.qty}</span>
            <span class="prod-item-unit">${data.unit === 'each' ? 'each' : (data.qty !== 1 ? data.unit + 's' : data.unit)}</span>
          </div>
        </div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  });
  el.innerHTML = html;
}

function renderPacking() {
  const el = document.getElementById('packing-content');
  if (!el) return;
  el.innerHTML = filterBarHtml('packing') + '<div id="pack-body"></div>';
  renderPackingContent();
}
function renderPackingContent() {
  const orders = filterOrders('packing');
  const el = document.getElementById('pack-body');
  if (!el) return;
  
  if (!orders.length) {
    el.innerHTML = '<div class="empty-state">No orders for this period.</div>';
    return;
  }

  // Group by delivery date
  const byDate = {};
  orders.forEach(o => {
    if (!byDate[o.delivery_date]) byDate[o.delivery_date] = [];
    byDate[o.delivery_date].push(o);
  });

  // Total stats (same as production)
  const totalDays = Object.keys(byDate).length;
  const totalOrders = orders.length;
  const uniqueItems = new Set(orders.flatMap(o => (o.items || []).map(i => i.item_name))).size;
  const totalUnits = orders.reduce((sum, o) => sum + (o.items || []).reduce((s, i) => s + i.quantity, 0), 0);

  let html = `<div class="prod-summary">
    <div class="prod-stat"><div class="prod-stat-val">${totalDays}</div><div class="prod-stat-lbl">Days</div></div>
    <div class="prod-stat"><div class="prod-stat-val">${totalOrders}</div><div class="prod-stat-lbl">Orders</div></div>
    <div class="prod-stat"><div class="prod-stat-val">${uniqueItems}</div><div class="prod-stat-lbl">Products</div></div>
    <div class="prod-stat"><div class="prod-stat-val">${totalUnits}</div><div class="prod-stat-lbl">Total Units</div></div>
  </div>`;

  // Iterate dates in order
  Object.keys(byDate).sort().forEach(date => {
    const dayOrders = byDate[date];
    const dayUnits = dayOrders.reduce((sum, o) => sum + (o.items || []).reduce((s, i) => s + i.quantity, 0), 0);
    
    // Aggregate items across all vendors for this date
    const itemMap = {};
    dayOrders.forEach(order => {
      (order.items || []).forEach(item => {
        if (!itemMap[item.item_name]) {
          itemMap[item.item_name] = { qty: 0, unit: item.unit, vendors: [] };
        }
        itemMap[item.item_name].qty += item.quantity;
        if (!itemMap[item.item_name].vendors.includes(order.vendor_name)) {
          itemMap[item.item_name].vendors.push(order.vendor_name);
        }
      });
    });

    const sortedItems = Object.entries(itemMap).sort((a, b) => b[1].qty - a[1].qty);
    
    html += `<div class="prod-date-block">
      <div class="prod-date-heading">
        <span>${date === TODAY ? 'Today — ' : ''}${fmtDate(date)}</span>
        <span class="prod-date-sub">${dayOrders.length} order${dayOrders.length !== 1 ? 's' : ''} · ${dayUnits} units</span>
      </div>`;
    
    sortedItems.forEach(([name, data]) => {
      html += `<div class="prod-item-row">
        <div>
          <div class="prod-item-name">${name}</div>
          <div class="prod-item-vendors">${data.vendors.join(', ')}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <span class="prod-item-qty">${data.qty}</span>
          <span class="prod-item-unit">${data.unit === 'each' ? 'each' : (data.qty !== 1 ? data.unit + 's' : data.unit)}</span>
        </div>
      </div>`;
    });
    
    html += `</div>`;
  });

  el.innerHTML = html;
}

function renderInvoicing() {
  const el = document.getElementById('invoicing-content');
  if (!el) return;
  el.innerHTML = filterBarHtml('invoicing') + '<div id="invoicing-body"></div>';
  renderInvoicingContent();
}
function renderInvoicingContent() {
  const fs = filterState.invoicing;
  const range = fs.mode === 'custom' ? { from: fs.from, to: fs.to } : getDateRange(fs.mode);
  if (!range) {
    const body = document.getElementById('invoicing-body');
    if (body) body.innerHTML = '<div class="empty-state">Invalid date range</div>';
    return;
  }
  const filtered = allOrders.filter(o => o.delivery_date >= range.from && o.delivery_date <= range.to);
  if (!filtered.length) {
    const body = document.getElementById('invoicing-body');
    if (body) body.innerHTML = '<div class="empty-state">No orders in this period.</div>';
    return;
  }

  // Group orders by client
  const clientMap = new Map();
  filtered.forEach(order => {
    const name = order.vendor_name;
    if (!clientMap.has(name)) clientMap.set(name, new Map());
    const itemMap = clientMap.get(name);
    (order.items || []).forEach(item => {
      const qty = item.quantity || 0;
      if (qty > 0) itemMap.set(item.item_name, (itemMap.get(item.item_name) || 0) + qty);
    });
  });

  const totalClients = clientMap.size;
  const totalOrders = filtered.length;
  const totalUnits = Array.from(clientMap.values()).reduce((sum, map) => sum + Array.from(map.values()).reduce((a, b) => a + b, 0), 0);

  // Stats bar using production classes
  let html = `<div class="prod-summary">
    <div class="prod-stat"><div class="prod-stat-val">${totalClients}</div><div class="prod-stat-lbl">Clients</div></div>
    <div class="prod-stat"><div class="prod-stat-val">${totalOrders}</div><div class="prod-stat-lbl">Orders</div></div>
    <div class="prod-stat"><div class="prod-stat-val">${totalUnits}</div><div class="prod-stat-lbl">Total Units</div></div>
  </div>`;

  // Client cards using production date-block style
  for (const [clientName, itemsMap] of clientMap.entries()) {
    const sortedItems = Array.from(itemsMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const totalClientUnits = sortedItems.reduce((s, i) => s + i[1], 0);
    
    html += `<div class="prod-date-block">
      <div class="prod-date-heading">
        <span>${escapeHtml(clientName)}</span>
        <span class="prod-date-sub">${sortedItems.length} item(s) · ${totalClientUnits} units</span>
      </div>
      <table class="invoice-items-table" style="width:100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="text-align:left; padding: 12px 20px; border-bottom: 2px solid var(--accent);">Item</th>
            <th style="text-align:right; padding: 12px 20px; border-bottom: 2px solid var(--accent);">Total Qty</th>
          </tr>
        </thead>
        <tbody>
          ${sortedItems.map(([itemName, qty]) => `
            <tr>
              <td style="padding: 12px 20px; border-bottom: 1px solid var(--border);">${escapeHtml(itemName)}</td>
              <td style="padding: 12px 20px; text-align: right; font-weight: 600; border-bottom: 1px solid var(--border);">${qty}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
  }

  const bodyDiv = document.getElementById('invoicing-body');
  if (bodyDiv) bodyDiv.innerHTML = html;
}

// ---------- Print function ----------
function printTab(tab) {
  const printStyles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif;
      color: #000;
      background: white;
      padding: 0;
      margin: 0;
      font-size: 16px;
    }
    @media print {
      body { margin: 0; padding: 0; }
      .no-print { display: none !important; }
      @page { margin: 10mm; }
    }
    .no-print { text-align: center; margin-bottom: 14px; }
    .print-btn { background: #000; color: white; border: none; padding: 12px 28px; font-size: 14px; font-weight: 700; cursor: pointer; }
    .header-section { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 3px solid #000; }
    .brand-label { font-size: 13px; font-weight: 700; letter-spacing: .2em; }
    .title { font-size: 30px; font-weight: 800; text-transform: uppercase; letter-spacing: .02em; }
    .range { font-size: 14px; font-weight: 600; color: #333; text-align: right; }

    /* ── Date group ── */
    .date-group { margin-bottom: 34px; page-break-inside: avoid; }
    .date-header { display: flex; justify-content: space-between; align-items: baseline; padding: 10px 0; border-bottom: 4px solid #000; margin-bottom: 14px; }
    .date-header-left { font-size: 24px; font-weight: 800; text-transform: uppercase; }
    .date-header-right { font-size: 15px; font-weight: 700; color: #333; }

    /* ── Category headers (Production) ── */
    .category-header { font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; margin: 18px 0 8px; border-bottom: 2px solid #000; padding-bottom: 4px; }

    /* ── Item rows (Production) ── */
    .item-row { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 2px solid #ccc; }
    .item-checkbox { width: 26px; height: 26px; border: 3px solid #000; flex-shrink: 0; }
    .item-name { font-size: 20px; font-weight: 700; }
    .item-vendors { font-size: 14px; color: #444; font-weight: 500; margin-top: 2px; }
    .item-qty-block { text-align: right; flex-shrink: 0; }
    .item-qty { font-size: 34px; font-weight: 800; }
    .item-unit { font-size: 14px; font-weight: 700; text-transform: uppercase; color: #333; margin-left: 4px; }

    /* ── Client cards (Packing) ── */
    .client-card { border: 3px solid #000; margin-bottom: 20px; page-break-inside: avoid; }
    .client-header { background: #eee; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #000; }
    .client-name { font-size: 22px; font-weight: 800; }
    .client-meta { font-size: 15px; font-weight: 700; color: #333; }
    .client-items { width: 100%; border-collapse: collapse; }
    .client-items td { padding: 12px 16px; font-size: 18px; font-weight: 600; border-bottom: 2px solid #ddd; }
    .client-items tr:last-child td { border-bottom: none; }
    .client-items td:first-child { display: flex; align-items: center; gap: 14px; }
    .client-items td:last-child { text-align: right; font-weight: 800; font-size: 20px; white-space: nowrap; }
    .pack-checkbox { width: 22px; height: 22px; border: 3px solid #000; flex-shrink: 0; display: inline-block; }

    /* ── Invoicing (kept normal size, unaffected) ── */
    .invoice-client-card { margin-bottom: 16px; border: 1px solid #ccc; page-break-inside: avoid; }
    .invoice-client-header { background: #f5efdf; padding: 6px 10px; border-bottom: 1px solid #ccc; }
    .invoice-client-name { font-size: 13px; font-weight: 700; }
    .invoice-client-stats { font-size: 9px; color: #6b6860; }
    .invoice-items-table { width: 100%; border-collapse: collapse; }
    .invoice-items-table th { text-align: left; padding: 4px 10px; font-size: 9px; background: #f5f5f5; }
    .invoice-items-table td { padding: 4px 10px; font-size: 10px; border-bottom: 1px solid #f0ece6; }
    .invoice-items-table td:last-child { text-align: right; font-weight: 600; }
  `;

  if (tab === 'invoicing') {
    const fs = filterState.invoicing;
    const range = fs.mode === 'custom' ? { from: fs.from, to: fs.to } : getDateRange(fs.mode);
    if (!range) return;
    const filtered = allOrders.filter(o => o.delivery_date >= range.from && o.delivery_date <= range.to);
    if (!filtered.length) { alert('No orders in this period.'); return; }
    const clientMap = new Map();
    filtered.forEach(order => {
      const name = order.vendor_name;
      if (!clientMap.has(name)) clientMap.set(name, new Map());
      const itemMap = clientMap.get(name);
      (order.items || []).forEach(item => {
        const qty = item.quantity || 0;
        if (qty > 0) itemMap.set(item.item_name, (itemMap.get(item.item_name) || 0) + qty);
      });
    });
    let bodyHtml = '';
    for (const [clientName, itemsMap] of clientMap.entries()) {
      const sortedItems = Array.from(itemsMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      bodyHtml += `<div class="invoice-client-card">
        <div class="invoice-client-header">
          <div class="invoice-client-name">${escapeHtml(clientName)}</div>
          <div class="invoice-client-stats">${sortedItems.length} item(s) · ${sortedItems.reduce((s,i)=>s+i[1],0)} units</div>
        </div>
        <table class="invoice-items-table">
          <thead><tr><th>Item</th><th style="text-align:right">Total Qty</th></tr></thead>
          <tbody>${sortedItems.map(([itemName, qty]) => `<tr><td>${escapeHtml(itemName)}</td><td style="text-align:right">${qty}</td></tr>`).join('')}</tbody>
        </table>
      </div>`;
    }
    const rangeLabel = range.from === range.to ? fmtDate(range.from) : fmtDate(range.from) + ' – ' + fmtDate(range.to);
    const totalUnits = filtered.reduce((sum, o) => sum + (o.items || []).reduce((s, i) => s + i.quantity, 0), 0);
    const totalOrders = filtered.length;
    const totalClients = clientMap.size;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoicing Summary</title><style>${printStyles}</style></head><body>
      <div class="no-print"><button class="print-btn" onclick="window.print()">Print / Save PDF</button></div>
      <div class="header-section">
        <div><div style="font-size:9px;letter-spacing:.2em;">VILLAGE BAKERY + PROVISIONS</div><div class="title">Invoicing Summary</div></div>
        <div class="range"><div>${rangeLabel}</div><div>Printed ${new Date().toLocaleDateString()}</div></div>
      </div>
      <div style="display:flex; gap: 16px; margin-bottom: 20px; flex-wrap:wrap;">
        <div><strong>${totalClients}</strong> Clients</div>
        <div><strong>${totalOrders}</strong> Orders</div>
        <div><strong>${totalUnits}</strong> Total Units</div>
      </div>
      ${bodyHtml}
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
    return;
  }

  // Production or packing print
  const orders = filterOrders(tab);
  const fs = filterState[tab];
  const range = fs.mode === 'custom' ? { from: fs.from, to: fs.to } : getDateRange(fs.mode);
  const title = tab === 'production' ? 'Production List' : 'Packing + Delivery';
  const rangeLabel = range.from === range.to ? fmtDate(range.from) : fmtDate(range.from) + ' – ' + fmtDate(range.to);
  const byDate = {};
  orders.forEach(o => { if (!byDate[o.delivery_date]) byDate[o.delivery_date] = []; byDate[o.delivery_date].push(o); });
  let body = '';
  if (!orders.length) {
    body = '<p>No orders for this period.</p>';
  } else if (tab === 'production') {
    // Production – categorized items (works)
    const sortedDates = Object.keys(byDate).sort();
    for (const date of sortedDates) {
      const dayOrders = byDate[date];
      const dayUnits = dayOrders.reduce((sum, o) => sum + (o.items || []).reduce((s, i) => s + i.quantity, 0), 0);
      body += `<div class="date-group">
        <div class="date-header">
          <div class="date-header-left">${fmtDate(date)}</div>
          <div class="date-header-right">${dayOrders.length} order${dayOrders.length !== 1 ? 's' : ''} · ${dayUnits} units</div>
        </div>`;
      const itemMap = {};
      dayOrders.forEach(order => {
        (order.items || []).forEach(item => {
          if (!itemMap[item.item_name]) {
            const menuItem = allMenu.find(m => m.name === item.item_name);
            const category = menuItem?.category || 'Uncategorized';
            itemMap[item.item_name] = { qty: 0, unit: item.unit, vendors: [], category };
          }
          itemMap[item.item_name].qty += item.quantity;
          if (!itemMap[item.item_name].vendors.includes(order.vendor_name))
            itemMap[item.item_name].vendors.push(order.vendor_name);
        });
      });
      const categoryGroups = {};
      for (const [name, data] of Object.entries(itemMap)) {
        const cat = data.category;
        if (!categoryGroups[cat]) categoryGroups[cat] = [];
        categoryGroups[cat].push({ name, ...data });
      }
      const sortedCats = Object.keys(categoryGroups).sort();
      for (const cat of sortedCats) {
        body += `<div class="category-header">${cat}</div>`;
        for (const data of categoryGroups[cat]) {
          body += `<div class="item-row">
            <div class="item-checkbox"></div>
            <div style="flex:1">
              <div class="item-name">${data.name}</div>
              <div class="item-vendors">${data.vendors.join(', ')}</div>
            </div>
            <div class="item-qty-block">
              <span class="item-qty">${data.qty}</span><span class="item-unit">${data.unit === 'each' ? 'each' : (data.qty !== 1 ? data.unit + 's' : data.unit)}</span>
            </div>
          </div>`;
        }
      }
      body += `</div>`;
    }
  } else {
    // Packing – clean, simple layout
    const sortedDates = Object.keys(byDate).sort();
    for (const date of sortedDates) {
      const dayOrders = byDate[date];
      body += `<div class="date-group">
        <div class="date-header">
          <div class="date-header-left">${fmtDate(date)}</div>
          <div class="date-header-right">${dayOrders.length} order${dayOrders.length !== 1 ? 's' : ''}</div>
        </div>`;
      // Group by vendor
      const vendorMap = {};
      dayOrders.forEach(order => {
        const vendor = order.vendor_name;
        if (!vendorMap[vendor]) {
          vendorMap[vendor] = { items: [], time: order.delivery_time, notes: order.notes, total: 0 };
        }
        (order.items || []).forEach(item => {
          const existing = vendorMap[vendor].items.find(i => i.name === item.item_name);
          if (existing) existing.qty += item.quantity;
          else vendorMap[vendor].items.push({ name: item.item_name, qty: item.quantity, unit: item.unit });
          vendorMap[vendor].total += item.quantity;
        });
      });
      const sortedVendors = Object.keys(vendorMap).sort((a,b) => (vendorMap[a].time||'').localeCompare(vendorMap[b].time||''));
      for (const vendor of sortedVendors) {
        const data = vendorMap[vendor];
        body += `<div class="client-card">
          <div class="client-header">
            <span class="client-name">${escapeHtml(vendor)}</span>
            <div class="client-meta">${data.time ? `Deliver by ${data.time.slice(0,5)}` : ''} &nbsp;·&nbsp; ${data.total} unit${data.total !== 1 ? 's' : ''}</div>
          </div>
          <table class="client-items">
            ${data.items.map(item => `<tr><td><span class="pack-checkbox"></span>${escapeHtml(item.name)}</td><td>${item.qty} ${item.unit === 'each' ? 'each' : (item.qty !== 1 ? item.unit + 's' : item.unit)}</td></tr>`).join('')}
          </table>
          ${data.notes ? `<div style="padding: 12px 16px; font-size: 15px; font-weight:600; font-style: italic; border-top: 2px dashed #000;">Note: ${escapeHtml(data.notes)}</div>` : ''}
        </div>`;
      }
      body += `</div>`;
    }
  }

  // ── FIX: for packing, allow page breaks inside .date-group since a full
  //    day of many vendor cards far exceeds one page. Without this override,
  //    the browser tries to honour page-break-inside:avoid on an oversized
  //    block and pushes it entirely to page 2, leaving page 1 blank.
  const tabSpecificStyles = tab === 'packing'
    ? '\n.date-group { page-break-inside: auto !important; }'
    : '';

  const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>${printStyles}${tabSpecificStyles}</style></head><body>
    <div class="no-print"><button class="print-btn" onclick="window.print()">Print / Save PDF</button></div>
    <div class="header-section">
      <div><div style="font-size:9px;letter-spacing:.2em;">VILLAGE BAKERY + PROVISIONS</div><div class="title">${title}</div></div>
      <div class="range"><div>${rangeLabel}</div><div>Printed ${new Date().toLocaleDateString()}</div></div>
    </div>
    ${body}
  </body></html>`;
  const w = window.open('', '_blank');
w.document.write(fullHtml);
w.document.close();

w.addEventListener('load', () => {
  // Small delay ensures layout is fully computed (especially for complex tables)
  setTimeout(() => {
    w.print();
  }, 200);
});
}

// ---------- Category update function ----------
async function updateCategory(itemId, category) {
  try {
    await db.collection('menu_items').doc(itemId).update({ category });
    const item = allMenu.find(m => m.id === itemId);
    if (item) item.category = category;
    console.log(`Category updated for ${itemId} to ${category}`);
  } catch (e) {
    console.error("Error updating category:", e);
    alert("Failed to update category: " + e.message);
  }
}
window.updateCategory = updateCategory;

// ---------- Auth and data initialization ----------
async function initAuthAndData() {
  auth.onAuthStateChanged(async (user) => {
    if (!user) { show('v-auth'); return; }
    currentUser = user;
    try {
      const snap = await db.collection('profiles').doc(user.uid).get();
      profile = snap.exists ? { id: snap.id, ...snap.data() } : null;
      if (!profile?.is_admin) { show('v-unauthorized'); return; }
      await Promise.all([loadOrders(), loadVendors(), loadMenu()]);
      renderCurrentPage();
      show('v-app');
    } catch (e) { console.error(e); show('v-auth'); }
  });
}

function renderCurrentPage() {
  const path = window.location.pathname;
  if (path.includes('clients.html')) renderVendors();
  else if (path.includes('menu.html')) renderMenu();
  else if (path.includes('production.html')) renderProduction();
  else if (path.includes('packing.html')) renderPacking();
  else if (path.includes('invoicing.html')) renderInvoicing();
  else renderOrders();
}

window.handleLogin = async function() {
  const email = document.getElementById('admin-email').value.trim();
  const pass = document.getElementById('admin-pass').value;
  const errEl = document.getElementById('auth-error');
  if (errEl) errEl.style.display = 'none';
  try {
    const { user } = await auth.signInWithEmailAndPassword(email, pass);
    currentUser = user;
    const snap = await db.collection('profiles').doc(user.uid).get();
    profile = snap.exists ? { id: snap.id, ...snap.data() } : null;
    if (!profile?.is_admin) { show('v-unauthorized'); return; }
    await Promise.all([loadOrders(), loadVendors(), loadMenu()]);
    renderCurrentPage();
    show('v-app');
  } catch (e) { if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; } }
};
window.handleLogout = async function() { await auth.signOut(); show('v-auth'); };

// ---------- DOMContentLoaded ----------
document.addEventListener('DOMContentLoaded', () => {
  const currentFile = window.location.pathname.split('/').pop();
  let activeTab = 'orders';
  if (currentFile === 'clients.html') activeTab = 'vendors';
  else if (currentFile === 'menu.html') activeTab = 'menu';
  else if (currentFile === 'production.html') activeTab = 'production';
  else if (currentFile === 'packing.html') activeTab = 'packing';
  else if (currentFile === 'invoicing.html') activeTab = 'invoicing';
  document.querySelectorAll('.tab').forEach(btn => {
    const btnTab = btn.getAttribute('data-tab');
    if (btnTab === activeTab) btn.classList.add('active');
    else btn.classList.remove('active');
  });
  initAuthAndData();
});