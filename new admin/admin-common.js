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
  invoicing: { mode: 'thisweek', from: '', to: '' }
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function show(id) {
  ['v-loading', 'v-auth', 'v-unauthorized', 'v-app'].forEach(v => document.getElementById(v).classList.toggle('hidden', v !== id));
}

// ==================== INVOICING HELPER (same as original) ====================
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

// ---------- Data loading functions (unchanged) ----------
async function loadOrders() {
  const snap = await db.collection('orders').orderBy('delivery_date').get();
  allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  allOrders.sort((a, b) => a.delivery_date !== b.delivery_date ? a.delivery_date.localeCompare(b.delivery_date) : (a.delivery_time || '').localeCompare(b.delivery_time || ''));
  document.getElementById('badge-orders').textContent = allOrders.length;
  document.getElementById('stat-new').textContent = allOrders.filter(o => o.status === 'New').length;
  document.getElementById('stat-today').textContent = allOrders.filter(o => o.delivery_date === TODAY).length;
  document.getElementById('stat-units').textContent = allOrders.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + i.quantity, 0), 0);
}

async function loadVendors() {
  const snap = await db.collection('profiles').get();
  allVendors = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => !v.is_admin).sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
  const pending = allVendors.filter(v => !v.approved).length;
  const badgeEl = document.getElementById('badge-vendors');
  badgeEl.textContent = pending || allVendors.length;
  if (pending > 0) badgeEl.classList.add('alert'); else badgeEl.classList.remove('alert');
}

async function loadMenu() {
  const snap = await db.collection('menu_items').orderBy('sort_order').get();
  allMenu = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  document.getElementById('badge-menu').textContent = allMenu.filter(m => m.active).length;
}

// ---------- Create order globals (unchanged) ----------
let coQtys = {}, coWeeklyQtys = {}, coWeekOffset = 0, coOrderType = 'single';

function toggleCreateOrder() {
  const form = document.getElementById('create-order-form');
  const opening = !form.classList.contains('open');
  form.classList.toggle('open');
  if (opening) buildCreateOrderForm();
}
function switchOrderType(type) {
  coOrderType = type;
  document.getElementById('ot-single').classList.toggle('active', type === 'single');
  document.getElementById('ot-weekly').classList.toggle('active', type === 'weekly');
  document.getElementById('co-single-section').style.display = type === 'single' ? 'block' : 'none';
  document.getElementById('co-weekly-section').style.display = type === 'weekly' ? 'block' : 'none';
  if (type === 'weekly') coRenderWeeklyGrid();
}
function buildCreateOrderForm() {
  coQtys = {};
  coWeeklyQtys = {};
  coWeekOffset = 0;
  coOrderType = 'single';
  switchOrderType('single');
  const sel = document.getElementById('co-vendor-select');
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
  document.getElementById('co-date').value = TODAY;
  document.getElementById('co-time').value = '08:00';
  document.getElementById('co-notes').value = '';
  document.getElementById('co-error').style.display = 'none';
  document.getElementById('co-weekly-error').style.display = 'none';
  document.getElementById('co-items-grid').innerHTML = allMenu.filter(m => m.active).map(item => `
    <div class="co-item-row">
      <div class="co-item-name">${item.name}</div>
      <div class="co-item-unit">${item.unit}</div>
      <div class="co-qty-ctrl">
        <button class="co-qty-btn" onclick="coChangeQty('${item.id}',-1)">−</button>
        <input class="co-qty-input" type="number" id="co-qty-${item.id}" value="" min="0" max="999" placeholder="0" oninput="coSetQty('${item.id}',this.value)">
        <button class="co-qty-btn" onclick="coChangeQty('${item.id}',1)">+</button>
      </div>
    </div>`).join('');
}
function onCoVendorChange() {
  const val = document.getElementById('co-vendor-select').value;
  document.getElementById('co-manual-field').style.display = val === '__manual__' ? 'block' : 'none';
}
function coChangeQty(id, delta) {
  const el = document.getElementById('co-qty-' + id);
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
  document.getElementById('co-week-label').textContent = coGetWeekLabel(coWeekOffset);
  document.getElementById('co-week-prev').disabled = coWeekOffset <= 0;
  const headers = dates.map(d => `<th>${d.dayName}<br><span style="font-weight:400;font-size:11px;opacity:.7">${d.label}</span></th>`).join('');
  const rows = allMenu.filter(m => m.active).map(item => {
    const cells = dates.map(d => {
      const qty = coWeeklyQtys[d.dateStr]?.[item.id] || '';
      return `<td><input class="weekly-qty${qty > 0 ? ' has-val' : ''}" type="number" min="0" max="999" value="${qty || ''}" placeholder="—" oninput="coSetWeeklyQty('${d.dateStr}','${item.id}',this.value)"></td>`;
    }).join('');
    return `<tr><td class="item-col"><div class="weekly-item-name">${item.name}</div><div class="weekly-item-unit">per ${item.unit}</div></td>${cells}</tr>`;
  }).join('');
  document.getElementById('co-weekly-grid').innerHTML = `<table class="weekly-table"><thead><tr><th class="item-col">Item</th>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
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
  const vendorId = document.getElementById('co-vendor-select').value;
  const manualName = document.getElementById('co-manual-name').value.trim();
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
  errEl.style.display = 'none';
  const vendor = resolveVendor();
  if (!vendor) {
    errEl.textContent = document.getElementById('co-vendor-select').value === '__manual__' ? 'Please enter the client name.' : 'Please select a client.';
    errEl.style.display = 'block';
    return;
  }
  const date = document.getElementById('co-date').value;
  const time = document.getElementById('co-time').value;
  const notes = document.getElementById('co-notes').value.trim();
  if (!date) { errEl.textContent = 'Please set a delivery date.'; errEl.style.display = 'block'; return; }
  if (!time) { errEl.textContent = 'Please set a delivery time.'; errEl.style.display = 'block'; return; }
  if (!Object.keys(coQtys).length) { errEl.textContent = 'Please add at least one item.'; errEl.style.display = 'block'; return; }
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
    document.getElementById('create-order-form').classList.remove('open');
    coQtys = {};
  } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
}
async function submitCreateWeeklyOrders() {
  const errEl = document.getElementById('co-weekly-error');
  errEl.style.display = 'none';
  const vendor = resolveVendor();
  if (!vendor) {
    errEl.textContent = document.getElementById('co-vendor-select').value === '__manual__' ? 'Please enter the client name.' : 'Please select a client.';
    errEl.style.display = 'block';
    return;
  }
  const time = document.getElementById('co-weekly-time').value;
  const notes = document.getElementById('co-weekly-notes').value.trim();
  if (!time) { errEl.textContent = 'Please set a delivery time.'; errEl.style.display = 'block'; return; }
  const daysWithItems = Object.keys(coWeeklyQtys).filter(d => Object.keys(coWeeklyQtys[d] || {}).length > 0).sort();
  if (!daysWithItems.length) { errEl.textContent = 'Please enter quantities for at least one day.'; errEl.style.display = 'block'; return; }
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
    document.getElementById('create-order-form').classList.remove('open');
    coWeeklyQtys = {};
  } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
}

// ---------- Vendors / Clients functions (unchanged) ----------
function toggleAddClient() {
  const form = document.getElementById('add-client-form');
  form.classList.toggle('open');
  if (!form.classList.contains('open')) {
    document.getElementById('ac-name').value = '';
    document.getElementById('ac-email').value = '';
    document.getElementById('ac-phone').value = '';
    document.getElementById('ac-error').style.display = 'none';
  }
}
async function submitAddClient() {
  const name = document.getElementById('ac-name').value.trim();
  const email = document.getElementById('ac-email').value.trim();
  const phone = document.getElementById('ac-phone').value.trim();
  const errEl = document.getElementById('ac-error');
  errEl.style.display = 'none';
  if (!name) { errEl.textContent = 'Business name is required.'; errEl.style.display = 'block'; return; }
  try {
    const docRef = await db.collection('profiles').add({
      business_name: name,
      email: email || '',
      phone: phone || '',
      approved: true,
      active: true,
      is_admin: false,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      created_by_admin: true
    });
    allVendors.unshift({ id: docRef.id, business_name: name, email: email || '', phone: phone || '', approved: true, active: true, created_by_admin: true });
    renderVendors();
    document.getElementById('add-client-form').classList.remove('open');
    document.getElementById('ac-name').value = '';
    document.getElementById('ac-email').value = '';
    document.getElementById('ac-phone').value = '';
  } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
}
async function approveVendor(id) {
  await db.collection('profiles').doc(id).update({ approved: true });
  const v = allVendors.find(v => v.id === id);
  if (v) v.approved = true;
  const pending = allVendors.filter(v => !v.approved).length;
  const badgeEl = document.getElementById('badge-vendors');
  badgeEl.textContent = pending || allVendors.length;
  if (pending > 0) badgeEl.classList.add('alert'); else badgeEl.classList.remove('alert');
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

// ---------- Menu functions (unchanged) ----------
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
  const name = document.getElementById('new-name').value.trim();
  const unit = document.getElementById('new-unit').value;
  const price = parseFloat(document.getElementById('new-price').value) || 0;
  if (!name) return;
  const sortOrder = Math.max(0, ...allMenu.map(m => m.sort_order || 0)) + 1;
  const docRef = await db.collection('menu_items').add({ name, unit, price, sort_order: sortOrder, active: true });
  allMenu.push({ id: docRef.id, name, unit, price, sort_order: sortOrder, active: true });
  renderMenu();
}

// ---------- Invoice printing (unchanged) ----------
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
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice &mdash; ${order.id.slice(0, 8).toUpperCase()}</title><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'DM Sans',sans-serif;background:white;color:#1a1916;padding:56px;max-width:760px;margin:0 auto;}@media print{body{padding:32px;}.no-print{display:none!important;}}.no-print{text-align:center;margin-bottom:32px;padding-bottom:32px;border-bottom:1px solid #e8e4de;}.print-btn{background:#1a1916;color:white;border:none;padding:10px 24px;font-family:'DM Sans',sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;}.wordmark{font-family:'Cormorant Garamond',serif;font-size:13px;font-weight:600;letter-spacing:.25em;text-transform:uppercase;}.invoice-label{font-family:'Cormorant Garamond',serif;font-size:42px;font-weight:600;}</style></head><body><div class="no-print"><button class="print-btn" onclick="window.print()">Download / Print PDF</button></div><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:48px"><div><div class="wordmark">Village Bakery + Provisions</div><div style="font-size:12px;color:#6b6860;margin-top:8px;line-height:2">212 Thompson Lane, Nashville, TN 37211<br>orders@villagebakeryandprovisions.com<br>(615) 498-5385</div></div><div style="text-align:right"><div class="invoice-label">Invoice</div><div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6b6860;margin-top:6px">#${order.id.slice(0, 8).toUpperCase()}</div><div style="font-size:12px;color:#6b6860;margin-top:4px">Issued ${issued}</div></div></div><div style="display:flex;justify-content:space-between;margin-bottom:40px;padding-bottom:24px;border-bottom:2px solid #1a1916"><div><div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6b6860;margin-bottom:8px">Bill To</div><div style="font-size:16px;font-weight:500">${order.vendor_name}</div></div><div style="text-align:right"><div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6b6860;margin-bottom:8px">Delivery</div><div style="font-size:14px;font-weight:500">${deliveryStr}</div><div style="font-size:13px;color:#6b6860;margin-top:3px">at ${(order.delivery_time || '').slice(0, 5)}</div></div></div>${order.notes ? `<div style="font-size:13px;color:#6b6860;margin-bottom:24px;font-style:italic">${order.notes}</div>` : ''}<table style="width:100%;border-collapse:collapse"><thead><tr style="border-bottom:2px solid #1a1916"><th style="padding:8px 0;text-align:left;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6b6860;font-weight:500">Item</th><th style="padding:8px 0;text-align:center;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6b6860;font-weight:500">Qty</th><th style="padding:8px 0;text-align:center;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6b6860;font-weight:500">Unit</th><th style="padding:8px 0;text-align:right;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6b6860;font-weight:500">Price</th><th style="padding:8px 0;text-align:right;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6b6860;font-weight:500">Subtotal</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3" style="padding:14px 0;font-size:11px;letter-spacing:.15em;text-transform:uppercase;font-weight:500">Total</td><td style="padding:14px 0;text-align:right;font-size:13px;color:#6b6860">${totalUnits} units</td><td style="padding:14px 0;text-align:right;font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600">${totalPrice > 0 ? '$' + totalPrice.toFixed(2) : '&mdash;'}</td></tr></tfoot></table><div style="margin-top:48px;padding-top:20px;border-top:1px solid #e8e4de;font-size:12px;color:#6b6860;text-align:center;line-height:2">Thank you for your business.<br>Village Bakery + Provisions &nbsp;&middot;&nbsp; orders@villagebakeryandprovisions.com &nbsp;&middot;&nbsp; (615) 498-5385</div></body></html>`;
}

// ---------- Order status update ----------
async function updateStatus(orderId, sel) {
  const status = sel.value;
  sel.className = 'status-select ' + status.toLowerCase();
  await db.collection('orders').doc(orderId).update({ status });
  const o = allOrders.find(o => o.id === orderId);
  if (o) o.status = status;
  document.getElementById('stat-new').textContent = allOrders.filter(o => o.status === 'New').length;
}
async function deleteOrderAdmin(orderId) {
  if (!confirm('Delete this order? This cannot be undone.')) return;
  try {
    await db.collection('orders').doc(orderId).delete();
    allOrders = allOrders.filter(o => o.id !== orderId);
    renderOrders();
    document.getElementById('badge-orders').textContent = allOrders.length;
    document.getElementById('stat-new').textContent = allOrders.filter(o => o.status === 'New').length;
    document.getElementById('stat-today').textContent = allOrders.filter(o => o.delivery_date === TODAY).length;
    document.getElementById('stat-units').textContent = allOrders.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + i.quantity, 0), 0);
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

// ---------- Pricing overrides (unchanged) ----------
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
    btn.classList.add('active');
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

// ---------- Render functions (Orders, Vendors, Menu, Production, Packing, Invoicing) ----------
function renderOrders() {
  const el = document.getElementById('orders-list');
  if (!allOrders.length) { el.innerHTML = '<div class="empty-state">No orders yet.</div>'; return; }
  const byDate = {};
  allOrders.forEach(o => { if (!byDate[o.delivery_date]) byDate[o.delivery_date] = []; byDate[o.delivery_date].push(o); });
  el.innerHTML = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, orders]) => {
    const d = new Date(date + 'T12:00:00');
    const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const units = orders.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + i.quantity, 0), 0);
    return `<div class="date-group">
      <div class="date-header">
        <div class="date-header-label">${date === TODAY ? 'Today — ' : ''}${label}</div>
        <div class="date-header-stats">${orders.length} order${orders.length !== 1 ? 's' : ''}&ensp;&middot;&ensp;${units} units</div>
      </div>
      ${orders.map(order => {
        const oI = order.items || [];
        const total = oI.reduce((s, i) => s + i.quantity, 0);
        const items = oI.map(i => `${i.item_name} &times; ${i.quantity}`).join(', ');
        const st = (order.status || 'new').toLowerCase();
        return `<div class="order-row">
          <div style="flex:1">
            <div class="order-vendor">${order.vendor_name}${order.created_by_admin ? '<span style="font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);margin-left:10px;border:1px solid var(--border);padding:2px 7px">Phone</span>' : ''}</div>
            <div class="order-items-text">${items}</div>
            ${order.notes ? `<div class="order-notes-text">${order.notes}</div>` : ''}
          </div>
          <div class="order-row-right">
            <div class="order-time">${(order.delivery_time || '').slice(0, 5)}</div>
            <div class="order-units">${total} units</div>
            <select class="status-select ${st}" onchange="updateStatus('${order.id}',this)">
              <option value="New" ${order.status === 'New' ? 'selected' : ''}>New</option>
              <option value="Seen" ${order.status === 'Seen' ? 'selected' : ''}>Seen</option>
              <option value="Done" ${order.status === 'Done' ? 'selected' : ''}>Done</option>
            </select>
            <button class="btn-invoice" onclick="openInvoice('${order.id}')">Invoice</button>
            <button class="btn-invoice" style="color:var(--err);border-color:var(--err)" onclick="deleteOrderAdmin('${order.id}')">Delete</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

function renderVendors() {
  const el = document.getElementById('vendors-list');
  const pending = allVendors.filter(v => !v.approved);
  const active = allVendors.filter(v => v.approved && v.active !== false);
  const inactive = allVendors.filter(v => v.approved && v.active === false);
  const pendingHtml = pending.length ? `<div class="vendors-section"><div class="section-heading" style="color:#7a6000">Pending Approval &mdash; ${pending.length}</div>${pending.map(v => `<div class="vendor-row"><div><div class="vendor-name">${v.business_name || 'No name'}</div><div class="vendor-email">${v.email}</div><div class="vendor-date">Signed up ${v.created_at ? new Date(v.created_at.seconds * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}</div></div><div class="vendor-actions"><button class="btn-approve" onclick="approveVendor('${v.id}')">Approve</button></div></div>`).join('')}</div>` : '';
  const activeHtml = `<div class="vendors-section"><div class="section-heading">Active Clients &mdash; ${active.length}</div>${active.length ? active.map(v => `<div class="vendor-row"><div style="flex:1"><div style="display:flex;align-items:center;gap:10px"><div class="vendor-name">${v.business_name || 'No name'}</div>${v.created_by_admin ? '<span style="font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);border:1px solid var(--border);padding:2px 7px">Phone</span>' : ''}<button onclick="editVendorName('${v.id}')" style="background:none;border:none;font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);cursor:pointer;padding:0;text-decoration:underline;text-underline-offset:2px">Edit</button></div>${v.email ? `<div class="vendor-email">${v.email}</div>` : ''}${v.phone ? `<div class="vendor-phone">${v.phone}</div>` : ''}</div><div class="vendor-actions"><button class="btn-pricing" id="pricing-btn-${v.id}" onclick="togglePricing('${v.id}')">Pricing</button><button class="btn-deactivate" onclick="toggleActive('${v.id}',false)">Deactivate</button></div></div><div class="pricing-panel" id="pricing-panel-${v.id}"><div class="pricing-panel-header"><span class="pricing-panel-title">Custom Prices — ${v.business_name || v.email || 'Client'}</span><span class="pricing-panel-note">Leave blank to use default</span></div><div id="pricing-rows-${v.id}"><div style="font-size:var(--fs-base);color:var(--text3);padding:10px 0">Loading...</div></div><div class="pricing-actions"><button class="btn-save-prices" onclick="savePricing('${v.id}')">Save Prices</button><button class="btn-clear-prices" onclick="clearPricing('${v.id}')">Clear All Custom</button></div></div>`).join('') : '<div class="empty-state" style="padding:24px 0;text-align:left">No active clients yet.</div>'}</div>`;
  const inactiveHtml = inactive.length ? `<div class="vendors-section"><div class="section-heading">Inactive &mdash; ${inactive.length}</div>${inactive.map(v => `<div class="vendor-row inactive"><div><div class="vendor-name">${v.business_name || 'No name'}</div>${v.email ? `<div class="vendor-email">${v.email}</div>` : ''}</div><button class="btn-activate" onclick="toggleActive('${v.id}',true)">Reactivate</button></div>`).join('')}</div>` : '';
  el.innerHTML = pendingHtml + activeHtml + inactiveHtml;
}

function renderMenu() {
  const active = allMenu.filter(m => m.active);
  const inactive = allMenu.filter(m => !m.active);
  document.getElementById('badge-menu').textContent = active.length;
  document.getElementById('menu-card').innerHTML = `
    <div class="section-label">Active Items &mdash; ${active.length}</div>
    ${active.map(item => `<div class="menu-row"><div class="menu-item-name">${item.name}</div><div class="menu-item-unit">${item.unit}</div><div class="price-field"><span class="price-symbol">$</span><input class="price-input" type="number" step="0.01" min="0" value="${Number(item.price || 0).toFixed(2)}" onblur="updatePrice('${item.id}',this.value)" onkeydown="if(event.key==='Enter')this.blur()"></div><div class="menu-actions"><button class="btn-hide" onclick="toggleItem('${item.id}',false)">Hide</button><button class="btn-delete" onclick="deleteItem('${item.id}')">Delete</button></div></div>`).join('')}
    ${inactive.length ? `<div class="section-label" style="margin-top:12px">Hidden &mdash; ${inactive.length}</div>${inactive.map(item => `<div class="menu-row inactive"><div class="menu-item-name">${item.name}</div><div class="menu-item-unit">${item.unit}</div><div class="price-field"><span class="price-symbol">$</span><input class="price-input" type="number" step="0.01" min="0" value="${Number(item.price || 0).toFixed(2)}" onblur="updatePrice('${item.id}',this.value)" onkeydown="if(event.key==='Enter')this.blur()"></div><div class="menu-actions"><button class="btn-show" onclick="toggleItem('${item.id}',true)">Show</button><button class="btn-delete" onclick="deleteItem('${item.id}')">Delete</button></div></div>`).join('')}` : ''}
    <div class="add-form"><div class="add-form-title">Add New Item</div><div class="add-form-row"><input class="add-input" id="new-name" type="text" placeholder="Item name"><select class="add-select" id="new-unit"><option value="each">each</option><option value="loaf">loaf</option><option value="tray">tray</option><option value="8-pack">8-pack</option><option value="dozen">dozen</option><option value="box">box</option></select><input class="add-input" id="new-price" type="number" step="0.01" min="0" placeholder="Price $" style="max-width:110px"><button class="btn-add" onclick="addItem()">Add</button></div></div>`;
}

function renderProduction() {
  const el = document.getElementById('production-content');
  el.innerHTML = filterBarHtml('production') + '<div id="prod-body"></div>';
  renderProductionContent();
}
function renderProductionContent() {
  const orders = filterOrders('production');
  const el = document.getElementById('prod-body');
  if (!el) return;
  if (!orders.length) { el.innerHTML = '<div class="empty-state">No orders for this period.</div>'; return; }
  const byDate = {};
  orders.forEach(o => { if (!byDate[o.delivery_date]) byDate[o.delivery_date] = []; byDate[o.delivery_date].push(o); });
  const tI = new Set(orders.flatMap(o => (o.items || []).map(i => i.item_name))).size;
  const tU = orders.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + i.quantity, 0), 0);
  let html = `<div class="prod-summary"><div class="prod-stat"><div class="prod-stat-val">${Object.keys(byDate).length}</div><div class="prod-stat-lbl">Days</div></div><div class="prod-stat"><div class="prod-stat-val">${orders.length}</div><div class="prod-stat-lbl">Orders</div></div><div class="prod-stat"><div class="prod-stat-val">${tI}</div><div class="prod-stat-lbl">Products</div></div><div class="prod-stat"><div class="prod-stat-val">${tU}</div><div class="prod-stat-lbl">Total Units</div></div></div>`;
  Object.keys(byDate).sort().forEach(date => {
    const dO = byDate[date];
    const dU = dO.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + i.quantity, 0), 0);
    const iM = {};
    dO.forEach(o => {
      (o.items || []).forEach(i => {
        if (!iM[i.item_name]) iM[i.item_name] = { qty: 0, unit: i.unit, vendors: [] };
        iM[i.item_name].qty += i.quantity;
        if (!iM[i.item_name].vendors.includes(o.vendor_name)) iM[i.item_name].vendors.push(o.vendor_name);
      });
    });
    html += `<div class="prod-date-block"><div class="prod-date-heading"><span>${date === TODAY ? 'Today &mdash; ' : ''}${fmtDate(date)}</span><span class="prod-date-sub">${dO.length} order${dO.length !== 1 ? 's' : ''} &middot; ${dU} units</span></div>${Object.entries(iM).sort((a, b) => b[1].qty - a[1].qty).map(([name, data]) => `<div class="prod-item-row"><div><div class="prod-item-name">${name}</div><div class="prod-item-vendors">${data.vendors.join(', ')}</div></div><div style="text-align:right;flex-shrink:0"><span class="prod-item-qty">${data.qty}</span><span class="prod-item-unit">${data.unit === 'each' ? 'each' : (data.qty !== 1 ? data.unit + 's' : data.unit)}</span></div></div>`).join('')}</div>`;
  });
  el.innerHTML = html;
}

function renderPacking() {
  const el = document.getElementById('packing-content');
  el.innerHTML = filterBarHtml('packing') + '<div id="pack-body"></div>';
  renderPackingContent();
}
function renderPackingContent() {
  const orders = filterOrders('packing');
  const el = document.getElementById('pack-body');
  if (!el) return;
  if (!orders.length) { el.innerHTML = '<div class="empty-state">No orders for this period.</div>'; return; }
  const byDate = {};
  orders.forEach(o => { if (!byDate[o.delivery_date]) byDate[o.delivery_date] = []; byDate[o.delivery_date].push(o); });
  let html = '';
  Object.keys(byDate).sort().forEach(date => {
    const dO = byDate[date];
    const dU = dO.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + i.quantity, 0), 0);
    const bV = {};
    dO.forEach(o => {
      if (!bV[o.vendor_name]) bV[o.vendor_name] = { items: [], time: o.delivery_time, notes: o.notes, total: 0 };
      (o.items || []).forEach(i => {
        const ex = bV[o.vendor_name].items.find(x => x.item_name === i.item_name);
        if (ex) ex.quantity += i.quantity;
        else bV[o.vendor_name].items.push({ ...i });
        bV[o.vendor_name].total += i.quantity;
      });
    });
    html += `<div class="pack-date-block"><div class="pack-date-heading"><span>${date === TODAY ? 'Today &mdash; ' : ''}${fmtDate(date)}</span><span class="prod-date-sub">${Object.keys(bV).length} client${Object.keys(bV).length !== 1 ? 's' : ''} &middot; ${dU} units</span></div>${Object.entries(bV).sort((a, b) => (a[1].time || '').localeCompare(b[1].time || '')).map(([vendor, data]) => `<div class="pack-vendor-card"><div class="pack-vendor-header"><span class="pack-vendor-name">${vendor}</span><div style="display:flex;align-items:center;gap:16px">${data.time ? `<span class="pack-vendor-time">Delivery: ${data.time.slice(0, 5)}</span>` : ''}<span class="pack-vendor-total">${data.total} unit${data.total !== 1 ? 's' : ''}</span></div></div>${data.items.map(i => `<div class="pack-item-row"><span class="pack-item-name">${i.item_name}</span><span class="pack-item-qty">${i.quantity} ${i.unit === 'each' ? 'each' : (i.quantity !== 1 ? i.unit + 's' : i.unit)}</span></div>`).join('')}${data.notes ? `<div class="pack-notes">Note: ${data.notes}</div>` : ''}</div>`).join('')}</div>`;
  });
  el.innerHTML = html;
}

function renderInvoicing() {
  const el = document.getElementById('invoicing-content');
  el.innerHTML = filterBarHtml('invoicing') + '<div id="invoicing-body"></div>';
  renderInvoicingContent();
}
function renderInvoicingContent() {
  const fs = filterState.invoicing;
  const range = fs.mode === 'custom' ? { from: fs.from, to: fs.to } : getDateRange(fs.mode);
  if (!range) {
    document.getElementById('invoicing-body').innerHTML = '<div class="empty-state">Invalid date range</div>';
    return;
  }
  const filtered = allOrders.filter(o => o.delivery_date >= range.from && o.delivery_date <= range.to);
  if (!filtered.length) {
    document.getElementById('invoicing-body').innerHTML = '<div class="empty-state">No orders in this period.</div>';
    return;
  }
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
  const totalUnits = Array.from(clientMap.values()).reduce((sum, map) => sum + Array.from(map.values()).reduce((a, b) => a + b, 0), 0);
  let html = `<div class="invoice-stats-mini">
    <div class="invoice-stat-badge"><div class="invoice-stat-number">${clientMap.size}</div><div class="invoice-stat-label">Clients</div></div>
    <div class="invoice-stat-badge"><div class="invoice-stat-number">${filtered.length}</div><div class="invoice-stat-label">Orders</div></div>
    <div class="invoice-stat-badge"><div class="invoice-stat-number">${totalUnits}</div><div class="invoice-stat-label">Total Units</div></div>
  </div>`;
  for (const [clientName, itemsMap] of clientMap.entries()) {
    const sortedItems = Array.from(itemsMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const totalClientUnits = sortedItems.reduce((s, i) => s + i[1], 0);
    html += `<div class="invoice-client-card">
      <div class="invoice-client-header">
        <div class="invoice-client-name">${escapeHtml(clientName)}</div>
        <div class="invoice-client-stats">${sortedItems.length} item(s) · ${totalClientUnits} units</div>
      </div>
      <table class="invoice-items-table">
        <thead><tr><th>Item</th><th style="text-align:right">Total Qty</th></tr></thead>
        <tbody>${sortedItems.map(([itemName, qty]) => `<tr><td>${escapeHtml(itemName)}</td><td style="text-align:right;font-weight:600">${qty}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  }
  document.getElementById('invoicing-body').innerHTML = html;
}

// ---------- Print function (handles all tabs) ----------
function printTab(tab) {
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
      bodyHtml += `<div style="border:1px solid #e2d5c0;margin-bottom:20px;page-break-inside:avoid;">
        <div style="background:#f5efdf;padding:12px 18px;"><div style="font-size:16px;font-weight:700;">${escapeHtml(clientName)}</div></div>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr><th style="text-align:left;padding:10px 18px;">Item</th><th style="text-align:right;padding:10px 18px;">Total Qty</th></tr></thead>
          <tbody>${sortedItems.map(([itemName, qty]) => `<tr><td style="padding:8px 18px;border-bottom:1px solid #e2d5c0;">${escapeHtml(itemName)}</td><td style="padding:8px 18px;text-align:right;font-weight:600;">${qty}</td></tr>`).join('')}</tbody>
        </table>
      </div>`;
    }
    const rangeLabel = range.from === range.to ? fmtDate(range.from) : fmtDate(range.from) + ' – ' + fmtDate(range.to);
    const totalUnits = filtered.reduce((sum, o) => sum + (o.items || []).reduce((s, i) => s + i.quantity, 0), 0);
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoicing Summary</title><style>
      body{font-family:'DM Sans',sans-serif;padding:40px;max-width:1000px;margin:0 auto;color:#2C1A0E;}
      h2{font-family:'Cormorant Garamond';border-bottom:2px solid #C4852A;padding-bottom:6px;}
      @media print{.no-print{display:none;}}
    </style></head><body>
    <div class="no-print" style="margin-bottom:20px;"><button onclick="window.print()" style="padding:8px 20px;">Print / Save PDF</button></div>
    <div style="margin-bottom:24px;">
      <div style="font-size:12px;letter-spacing:.2em;">VILLAGE BAKERY + PROVISIONS</div>
      <h2>Invoicing Summary – ${rangeLabel}</h2>
      <div>${filtered.length} orders · ${clientMap.size} clients · ${totalUnits} total units</div>
    </div>
    ${bodyHtml}
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
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
    body = '<p style="color:#6b6860;font-size:14px">No orders for this period.</p>';
  } else if (tab === 'production') {
    Object.keys(byDate).sort().forEach(date => {
      const dO = byDate[date];
      const dU = dO.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + i.quantity, 0), 0);
      const iM = {};
      dO.forEach(o => {
        (o.items || []).forEach(i => {
          if (!iM[i.item_name]) iM[i.item_name] = { qty: 0, unit: i.unit, vendors: [] };
          iM[i.item_name].qty += i.quantity;
          if (!iM[i.item_name].vendors.includes(o.vendor_name)) iM[i.item_name].vendors.push(o.vendor_name);
        });
      });
      body += `<div style="margin-bottom:32px;page-break-inside:avoid"><div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:2px solid #1a1916"><span style="font-size:13px;font-weight:600;text-transform:uppercase">${fmtDate(date)}</span><span style="font-size:10px;color:#6b6860">${dO.length} order${dO.length !== 1 ? 's' : ''} &middot; ${dU} units</span></div><table style="width:100%;border-collapse:collapse"><thead><tr><th style="padding:8px 0;text-align:left;font-size:10px;color:#6b6860;border-bottom:1px solid #dedad4">Item</th><th style="padding:8px 0;text-align:left;font-size:10px;color:#6b6860;border-bottom:1px solid #dedad4">Clients</th><th style="padding:8px 0;text-align:right;font-size:10px;color:#6b6860;border-bottom:1px solid #dedad4">Qty</th></tr></thead><tbody>${Object.entries(iM).sort((a, b) => b[1].qty - a[1].qty).map(([name, data]) => `<tr style="border-bottom:1px solid #f0ece6"><td style="padding:10px 0;font-size:14px">${name}</td><td style="padding:10px 0;font-size:12px;color:#6b6860">${data.vendors.join(', ')}</td><td style="padding:10px 0;text-align:right;font-size:22px;font-weight:700">${data.qty} <span style="font-size:10px;font-weight:400;color:#6b6860">${data.unit === 'each' ? 'each' : (data.qty !== 1 ? data.unit + 's' : data.unit)}</span></td></tr>`).join('')}</tbody></table></div>`;
    });
  } else {
    Object.keys(byDate).sort().forEach(date => {
      const dO = byDate[date];
      const bV = {};
      dO.forEach(o => {
        if (!bV[o.vendor_name]) bV[o.vendor_name] = { items: [], time: o.delivery_time, notes: o.notes, total: 0 };
        (o.items || []).forEach(i => {
          const ex = bV[o.vendor_name].items.find(x => x.item_name === i.item_name);
          if (ex) ex.quantity += i.quantity;
          else bV[o.vendor_name].items.push({ ...i });
          bV[o.vendor_name].total += i.quantity;
        });
      });
      const sV = Object.entries(bV).sort((a, b) => (a[1].time || '').localeCompare(b[1].time || ''));
      body += `<div style="margin-bottom:32px"><div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:2px solid #1a1916;margin-bottom:16px"><span style="font-size:13px;font-weight:600">${fmtDate(date)}</span><span style="font-size:10px;color:#6b6860">${sV.length} client${sV.length !== 1 ? 's' : ''}</span></div>${sV.map(([vendor, data]) => `<div style="border:1px solid #dedad4;margin-bottom:10px;page-break-inside:avoid"><div style="background:#f8f6f2;padding:10px 14px;display:flex;justify-content:space-between;border-bottom:1px solid #dedad4"><span style="font-size:14px;font-weight:600">${vendor}</span><div>${data.time ? `<span style="font-size:11px;color:#6b6860">Delivery ${data.time.slice(0, 5)}</span>&ensp;` : ''}<span style="font-size:10px;color:#6b6860">${data.total} unit${data.total !== 1 ? 's' : ''}</span></div></div><table style="width:100%;border-collapse:collapse">${data.items.map(i => `<tr style="border-bottom:1px solid #f0ece6"><td style="padding:8px 14px;font-size:13px">${i.item_name}</td><td style="padding:8px 14px;font-size:13px;font-weight:600;text-align:right">${i.quantity} ${i.unit === 'each' ? 'each' : (i.quantity !== 1 ? i.unit + 's' : i.unit)}</td></tr>`).join('')}</table>${data.notes ? `<div style="padding:7px 14px;font-size:11px;color:#6b6860;font-style:italic;border-top:1px dashed #dedad4">Note: ${data.notes}</div>` : ''}</div>`).join('')}</div>`;
    });
  }
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1916;padding:44px;max-width:800px;margin:0 auto;}@media print{body{padding:20px;}.no-print{display:none!important;}}.no-print{text-align:center;margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #dedad4;}.print-btn{background:#1a1916;color:white;border:none;padding:9px 22px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;}</style></head><body><div class="no-print"><button class="print-btn" onclick="window.print()">Print / Save PDF</button></div><div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:28px;padding-bottom:14px;border-bottom:1px solid #dedad4"><div><div style="font-size:10px;color:#6b6860;margin-bottom:5px;text-transform:uppercase;letter-spacing:.2em">Village Bakery + Provisions</div><div style="font-size:22px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">${title}</div></div><div style="text-align:right;font-size:12px;color:#6b6860;line-height:1.8"><div>${rangeLabel}</div><div>Printed ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div></div></div>${body}</body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

// ---------- Auth and data initialization (renamed from init) ----------
async function initAuthAndData() {
  auth.onAuthStateChanged(async (user) => {
    if (!user) { show('v-auth'); return; }
    currentUser = user;
    try {
      const snap = await db.collection('profiles').doc(user.uid).get();
      profile = snap.exists ? { id: snap.id, ...snap.data() } : null;
      if (!profile?.is_admin) { show('v-unauthorized'); return; }
      await Promise.all([loadOrders(), loadVendors(), loadMenu()]);
      // After data loads, render the current page's content
      renderCurrentPage();
      show('v-app');
    } catch (e) { console.error(e); show('v-auth'); }
  });
}

// Helper to determine current page and call the appropriate render function
function renderCurrentPage() {
  const path = window.location.pathname;
  if (path.includes('clients.html')) renderVendors();
  else if (path.includes('menu.html')) renderMenu();
  else if (path.includes('production.html')) renderProduction();
  else if (path.includes('packing.html')) renderPacking();
  else if (path.includes('invoicing.html')) renderInvoicing();
  else renderOrders(); // default orders.html
}

// Login / Logout handlers (unchanged)
window.handleLogin = async function() {
  const email = document.getElementById('admin-email').value.trim();
  const pass = document.getElementById('admin-pass').value;
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';
  try {
    const { user } = await auth.signInWithEmailAndPassword(email, pass);
    currentUser = user;
    const snap = await db.collection('profiles').doc(user.uid).get();
    profile = snap.exists ? { id: snap.id, ...snap.data() } : null;
    if (!profile?.is_admin) { show('v-unauthorized'); return; }
    await Promise.all([loadOrders(), loadVendors(), loadMenu()]);
    renderCurrentPage();
    show('v-app');
  } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
};
window.handleLogout = async function() { await auth.signOut(); show('v-auth'); };

// ---------- DOMContentLoaded: set active tab, call init ----------
document.addEventListener('DOMContentLoaded', () => {
  // Set active class on tab links based on current file
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
  // Start auth flow
  initAuthAndData();
});