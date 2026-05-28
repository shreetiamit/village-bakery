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

const EMAILJS_PUBLIC_KEY = 'YOUR_EMAILJS_PUBLIC_KEY';
const EMAILJS_SERVICE_ID = 'YOUR_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';
if (EMAILJS_PUBLIC_KEY !== 'YOUR_EMAILJS_PUBLIC_KEY') {
  emailjs.init(EMAILJS_PUBLIC_KEY);
}

let currentUser = null;
let currentProfile = null;
let menuItems = [];
let quantities = {};
let vendorPricing = {};
let weekOffset = 0;
let weeklyQuantities = {};

// ---------- History state ----------
let allClientOrders = [];
let historyFilter = 'upcoming'; // 'upcoming' | 'past' | 'all'

// ---------- Edit order state ----------
let editOrderId = null;
let editQtys = {};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getItemPrice(item) {
  return vendorPricing[item.id] !== undefined ? vendorPricing[item.id] : (item.price || 0);
}

function show(id) {
  ['v-loading', 'v-auth', 'v-business-name', 'v-pending', 'v-app'].forEach(v => {
    const el = document.getElementById(v);
    if (el) el.classList.toggle('hidden', v !== id);
  });
}

function showErr(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function hideErr(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

async function sendOrderEmail(params) {
  if (EMAILJS_PUBLIC_KEY === 'YOUR_EMAILJS_PUBLIC_KEY') return;
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params);
  } catch (e) {
    console.warn('Email failed:', e);
  }
}

// ---------- Authentication ----------
async function loadProfile() {
  const snap = await db.collection('profiles').doc(currentUser.uid).get();
  currentProfile = snap.exists ? { id: snap.id, ...snap.data() } : null;
  if (currentProfile) {
    const userNameSpan = document.getElementById('user-name');
    if (userNameSpan) userNameSpan.textContent = currentProfile.business_name || currentProfile.email;
  }
}

async function loadMenu() {
  const snap = await db.collection('menu_items').where('active', '==', true).orderBy('sort_order').get();
  menuItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function loadVendorPricing() {
  const snap = await db.collection('vendor_pricing').where('vendor_id', '==', currentUser.uid).get();
  vendorPricing = {};
  snap.docs.forEach(d => {
    const data = d.data();
    vendorPricing[data.menu_item_id] = Number(data.price);
  });
}

async function handleGoogleSignIn() {
  hideErr('google-error');
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await auth.signInWithPopup(provider);
    currentUser = result.user;
    const snap = await db.collection('profiles').doc(currentUser.uid).get();
    if (snap.exists) {
      currentProfile = { id: snap.id, ...snap.data() };
      if (!currentProfile.approved) { show('v-pending'); return; }
      await loadMenu();
      await loadVendorPricing();
      show('v-app');
      initCurrentPage();
    } else {
      const dn = currentUser.displayName || '';
      const greeting = document.getElementById('bname-greeting');
      if (greeting) greeting.textContent = dn ? `Welcome, ${dn.split(' ')[0]}!` : 'Welcome!';
      show('v-business-name');
    }
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') showErr('google-error', e.message);
  }
}

async function completeGoogleSignup() {
  const bname = document.getElementById('google-bname').value.trim();
  hideErr('bname-error');
  if (!bname) { showErr('bname-error', 'Please enter your business name.'); return; }
  try {
    await db.collection('profiles').doc(currentUser.uid).set({
      business_name: bname,
      email: currentUser.email,
      approved: false,
      active: true,
      is_admin: false,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    await loadProfile();
    show('v-pending');
  } catch (e) { showErr('bname-error', e.message); }
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  hideErr('login-error');
  try {
    const { user } = await auth.signInWithEmailAndPassword(email, pass);
    currentUser = user;
    await loadProfile();
    if (!currentProfile?.approved) { show('v-pending'); return; }
    await loadMenu();
    await loadVendorPricing();
    show('v-app');
    initCurrentPage();
  } catch (e) { showErr('login-error', e.message); }
}

async function handleSignup() {
  const bname = document.getElementById('signup-bname').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass = document.getElementById('signup-password').value;
  hideErr('signup-error');
  if (!bname) { showErr('signup-error', 'Please enter your business name.'); return; }
  if (pass.length < 6) { showErr('signup-error', 'Password must be at least 6 characters.'); return; }
  try {
    const { user } = await auth.createUserWithEmailAndPassword(email, pass);
    currentUser = user;
    await db.collection('profiles').doc(user.uid).set({
      business_name: bname,
      email,
      approved: false,
      active: true,
      is_admin: false,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    await loadProfile();
    show('v-pending');
  } catch (e) { showErr('signup-error', e.message); }
}

async function handleSignout() {
  await auth.signOut();
  currentUser = null;
  currentProfile = null;
  menuItems = [];
  quantities = {};
  weeklyQuantities = {};
  allClientOrders = [];
  show('v-auth');
}

function switchAuthTab(tab) {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  if (loginForm) loginForm.classList.toggle('hidden', tab !== 'login');
  if (signupForm) signupForm.classList.toggle('hidden', tab !== 'signup');
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
}
window.switchTab = switchAuthTab;

// ---------- Single Orders Page ----------
function buildOrderForm() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;
  quantities = {};

  const grouped = {};
  menuItems.forEach(item => {
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
        <div class="product-row" id="row-${item.id}">
          <div class="product-info">
            <div class="product-name">${item.name}</div>
            <div class="product-unit">per ${item.unit}</div>
          </div>
          <div class="qty-ctrl">
            <button class="qty-btn" onclick="changeQty('${item.id}',-1)">−</button>
            <input class="qty-input" type="number" id="qty-${item.id}" value="0" min="0" max="999" oninput="setQty('${item.id}',this.value)">
            <button class="qty-btn" onclick="changeQty('${item.id}',1)">+</button>
          </div>
        </div>`;
    }
    html += `</div>`;
  }
  grid.innerHTML = html;

  const today = new Date();
  const dateInput = document.getElementById('delivery-date');
  if (dateInput) dateInput.value = localDateStr(today);
  const timeInput = document.getElementById('delivery-time');
  if (timeInput) timeInput.value = '08:00';
  updateSummary();
}

function changeQty(id, delta) {
  const el = document.getElementById('qty-' + id);
  if (!el) return;
  el.value = Math.max(0, (parseInt(el.value) || 0) + delta);
  setQty(id, el.value);
}
window.changeQty = changeQty;

function setQty(id, val) {
  const qty = Math.max(0, parseInt(val) || 0);
  const input = document.getElementById('qty-' + id);
  if (input) input.value = qty;
  const row = document.getElementById('row-' + id);
  if (qty > 0) {
    quantities[id] = qty;
    if (row) row.classList.add('has-qty');
  } else {
    delete quantities[id];
    if (row) row.classList.remove('has-qty');
  }
  updateSummary();
}
window.setQty = setQty;

function updateSummary() {
  const el = document.getElementById('order-summary');
  if (!el) return;
  const keys = Object.keys(quantities);
  if (!keys.length) {
    el.className = 'order-summary';
    el.innerHTML = 'No items selected.';
    return;
  }
  el.className = 'order-summary has-items';
  const total = keys.reduce((s, k) => s + quantities[k], 0);
  const rows = keys.map(k => {
    const m = menuItems.find(m => m.id === k);
    return `<div class="summary-item"><span>${m.name} &times; ${quantities[k]}</span><span>${quantities[k]} ${m.unit === 'each' ? 'each' : (quantities[k] !== 1 ? m.unit + 's' : m.unit)}</span></div>`;
  }).join('');
  el.innerHTML = rows + `<div class="summary-total"><span>Total</span><span>${total} units</span></div>`;
}

async function handleSubmit() {
  const date = document.getElementById('delivery-date').value;
  const time = document.getElementById('delivery-time').value;
  const notes = document.getElementById('order-notes').value.trim();
  hideErr('order-error');
  if (!date) { showErr('order-error', 'Please choose a delivery date.'); return; }
  if (!time) { showErr('order-error', 'Please choose a delivery time.'); return; }
  if (!Object.keys(quantities).length) { showErr('order-error', 'Please add at least one item.'); return; }
  const btn = document.getElementById('submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Placing order...'; }
  try {
    const items = Object.entries(quantities).map(([id, qty]) => {
      const m = menuItems.find(m => m.id === id);
      return { item_name: m.name, quantity: qty, unit: m.unit, price: getItemPrice(m) };
    });
    const orderRef = await db.collection('orders').add({
      vendor_id: currentUser.uid,
      vendor_name: currentProfile.business_name || currentProfile.email,
      delivery_date: date,
      delivery_time: time,
      notes,
      status: 'New',
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      items
    });
    await sendOrderEmail({
      vendor_name: currentProfile.business_name || currentProfile.email,
      delivery_date: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      delivery_time: time,
      items_list: items.map(i => `${i.item_name} × ${i.quantity} ${i.unit}`).join('\n'),
      notes: notes || 'None',
      order_id: orderRef.id.slice(0, 8).toUpperCase(),
      order_type: 'Single Order'
    });
    const successEl = document.getElementById('order-success');
    const formArea = document.getElementById('order-form-area');
    if (formArea) formArea.style.display = 'none';
    if (successEl) {
      successEl.style.display = 'block';
      successEl.classList.remove('success-animate');
      void successEl.offsetWidth;
      successEl.classList.add('success-animate');
    }
    const successIdSpan = document.getElementById('success-order-id');
    if (successIdSpan) successIdSpan.textContent = 'Order #' + orderRef.id.slice(0, 8).toUpperCase();
    quantities = {};
  } catch (e) {
    showErr('order-error', e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Place Order'; }
  }
}
window.handleSubmit = handleSubmit;

function resetForm() {
  const formArea = document.getElementById('order-form-area');
  const successEl = document.getElementById('order-success');
  if (formArea) formArea.style.display = 'block';
  if (successEl) successEl.style.display = 'none';
  buildOrderForm();
  const btn = document.getElementById('submit-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Place Order'; }
}
window.resetForm = resetForm;

// ---------- Weekly Orders Page ----------
function getWeekDates(offset) {
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

function getWeekLabel(offset) {
  const dates = getWeekDates(offset);
  const [, fm, fd] = dates[0].dateStr.split('-');
  const [, lm, ld] = dates[6].dateStr.split('-');
  const m1 = MONTHS[parseInt(fm) - 1];
  const m2 = MONTHS[parseInt(lm) - 1];
  return fm === lm ? `${m1} ${parseInt(fd)} – ${parseInt(ld)}` : `${m1} ${parseInt(fd)} – ${m2} ${parseInt(ld)}`;
}

function initWeekly() {
  weekOffset = 0;
  weeklyQuantities = {};
  const formArea = document.getElementById('weekly-form-area');
  const successEl = document.getElementById('weekly-success');
  if (formArea) formArea.style.display = 'block';
  if (successEl) successEl.style.display = 'none';
  const btn = document.getElementById('weekly-submit-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Place Weekly Orders'; }
  renderWeeklyGrid();
}

function clearWeeklyQuantities() {
  weeklyQuantities = {};
  renderWeeklyGrid();
  updateWeeklySummary();
}

async function repopulateFromPreviousWeek() {
  const currentDates = getWeekDates(weekOffset);
  if (!currentDates.length) return;
  const currentMonday = new Date(currentDates[0].dateStr + 'T12:00:00');
  const prevMonday = new Date(currentMonday);
  prevMonday.setDate(prevMonday.getDate() - 7);
  const prevSunday = new Date(prevMonday);
  prevSunday.setDate(prevSunday.getDate() + 6);

  const from = localDateStr(prevMonday);
  const to = localDateStr(prevSunday);

  try {
    const snap = await db.collection('orders')
      .where('vendor_id', '==', currentUser.uid)
      .get();

    const orders = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(o => o.delivery_date >= from && o.delivery_date <= to);

    if (!orders.length) {
      alert('No orders found for the previous week.');
      return;
    }

    const newWeeklyQtys = {};
    orders.forEach(order => {
      const date = order.delivery_date;
      if (!newWeeklyQtys[date]) newWeeklyQtys[date] = {};
      (order.items || []).forEach(item => {
        const itemId = menuItems.find(m => m.name === item.item_name)?.id;
        if (itemId) {
          newWeeklyQtys[date][itemId] = (newWeeklyQtys[date][itemId] || 0) + item.quantity;
        }
      });
    });

    const currentDatesMap = {};
    currentDates.forEach(d => {
      const dateObj = new Date(d.dateStr + 'T12:00:00');
      const weekday = dateObj.getDay();
      currentDatesMap[weekday] = d.dateStr;
    });

    weeklyQuantities = {};
    for (const [prevDateStr, items] of Object.entries(newWeeklyQtys)) {
      const prevDateObj = new Date(prevDateStr + 'T12:00:00');
      const prevWeekday = prevDateObj.getDay();
      const targetDate = currentDatesMap[prevWeekday];
      if (targetDate) {
        if (!weeklyQuantities[targetDate]) weeklyQuantities[targetDate] = {};
        Object.assign(weeklyQuantities[targetDate], items);
      }
    }

    renderWeeklyGrid();
    updateWeeklySummary();
    alert('Previous week quantities loaded. Adjust as needed.');
  } catch (e) {
    console.error(e);
    alert('Failed to load previous week orders: ' + e.message);
  }
}

window.repopulateFromPreviousWeek = repopulateFromPreviousWeek;
window.clearWeeklyQuantities = clearWeeklyQuantities;
window.repopulateFromPreviousWeek = repopulateFromPreviousWeek;
window.initWeekly = initWeekly;

function changeWeek(delta) {
  const newOffset = weekOffset + delta;
  if (newOffset < 0) return;
  weekOffset = newOffset;
  renderWeeklyGrid();
}
window.changeWeek = changeWeek;

function renderWeeklyGrid() {
  const dates = getWeekDates(weekOffset);
  const weekLabel = document.getElementById('week-label');
  if (weekLabel) weekLabel.textContent = getWeekLabel(weekOffset);
  const prevBtn = document.getElementById('week-prev');
  if (prevBtn) prevBtn.disabled = weekOffset <= 0;

  const headers = dates.map(d => `<th>${d.dayName}<br><span style="font-weight:400;font-size:11px;opacity:.7">${d.label}</span></th>`).join('');

  const grouped = {};
  menuItems.forEach(item => {
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
        const qty = weeklyQuantities[d.dateStr]?.[item.id] || '';
        const hasVal = qty !== '' && qty > 0;
        return `<td><input class="weekly-qty${hasVal ? ' has-val' : ''}" type="number" min="0" max="999" value="${qty || ''}" placeholder="—" oninput="setWeeklyQty('${d.dateStr}','${item.id}',this.value)"></td>`;
      }).join('');
      rows += `<tr><td class="item-col"><div class="weekly-item-name">${item.name}</div><div class="weekly-item-unit">per ${item.unit}</div></td>${cells}</tr>`;
    }
  }

  const gridDiv = document.getElementById('weekly-grid');
  if (gridDiv) {
    gridDiv.innerHTML = `<div class="weekly-table-container" style="overflow-x: auto; max-height: 70vh; overflow-y: auto;"><table class="weekly-table"><thead><tr><th class="item-col">Item</th>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  updateWeeklySummary();
}

function setWeeklyQty(dateStr, itemId, val) {
  const qty = Math.max(0, parseInt(val) || 0);
  if (!weeklyQuantities[dateStr]) weeklyQuantities[dateStr] = {};
  if (qty > 0) weeklyQuantities[dateStr][itemId] = qty;
  else delete weeklyQuantities[dateStr][itemId];
  const input = document.querySelector(`input[oninput*="'${dateStr}','${itemId}'"]`);
  if (input) input.classList.toggle('has-val', qty > 0);
  updateWeeklySummary();
}
window.setWeeklyQty = setWeeklyQty;

function updateWeeklySummary() {
  const el = document.getElementById('weekly-summary');
  if (!el) return;
  const allDates = Object.keys(weeklyQuantities).filter(d => Object.keys(weeklyQuantities[d] || {}).length > 0).sort();
  if (!allDates.length) { el.innerHTML = ''; return; }
  const totalUnits = allDates.reduce((s, d) => s + Object.values(weeklyQuantities[d]).reduce((ss, q) => ss + q, 0), 0);
  const rows = allDates.map(d => {
    const date = new Date(d + 'T12:00:00');
    const units = Object.values(weeklyQuantities[d]).reduce((s, q) => s + q, 0);
    const ic = Object.keys(weeklyQuantities[d]).length;
    return `<div class="weekly-preview-row"><span>${DAY_NAMES[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}</span><span>${ic} item${ic !== 1 ? 's' : ''} · ${units} unit${units !== 1 ? 's' : ''}</span></div>`;
  }).join('');
  el.innerHTML = `<div style="font-size:var(--fs-sm);font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--text2);margin-bottom:12px">${allDates.length} Order${allDates.length !== 1 ? 's' : ''} · ${totalUnits} Total Units</div>${rows}`;
}

async function handleWeeklySubmit() {
  const time = document.getElementById('weekly-time').value;
  const notes = document.getElementById('weekly-notes').value.trim();
  hideErr('weekly-error');
  if (!time) { showErr('weekly-error', 'Please choose a delivery time.'); return; }
  const daysWithItems = Object.keys(weeklyQuantities).filter(d => Object.keys(weeklyQuantities[d] || {}).length > 0).sort();
  if (!daysWithItems.length) { showErr('weekly-error', 'Please enter quantities for at least one day.'); return; }
  const btn = document.getElementById('weekly-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Placing orders...'; }
  try {
    let placed = 0;
    const emailLines = [];
    for (const date of daysWithItems) {
      const items = Object.entries(weeklyQuantities[date]).filter(([, qty]) => qty > 0).map(([id, qty]) => {
        const m = menuItems.find(m => m.id === id);
        return { item_name: m.name, quantity: qty, unit: m.unit, price: getItemPrice(m) };
      });
      if (!items.length) continue;
      await db.collection('orders').add({
        vendor_id: currentUser.uid,
        vendor_name: currentProfile.business_name || currentProfile.email,
        delivery_date: date,
        delivery_time: time,
        notes,
        status: 'New',
        created_at: firebase.firestore.FieldValue.serverTimestamp(),
        items
      });
      const df = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      emailLines.push(`${df}: ${items.map(i => `${i.item_name} ×${i.quantity}`).join(', ')}`);
      placed++;
    }
    await sendOrderEmail({
      vendor_name: currentProfile.business_name || currentProfile.email,
      delivery_date: 'Weekly Order',
      delivery_time: time,
      items_list: emailLines.join('\n'),
      notes: notes || 'None',
      order_id: `${placed} orders placed`,
      order_type: 'Weekly Order'
    });
    const formArea = document.getElementById('weekly-form-area');
    const successEl = document.getElementById('weekly-success');
    if (formArea) formArea.style.display = 'none';
    if (successEl) {
      successEl.style.display = 'block';
      successEl.classList.remove('success-animate');
      void successEl.offsetWidth;
      successEl.classList.add('success-animate');
    }
    const msgSpan = document.getElementById('weekly-success-msg');
    if (msgSpan) msgSpan.textContent = `${placed} order${placed !== 1 ? 's' : ''} placed.`;
    weeklyQuantities = {};
  } catch (e) {
    showErr('weekly-error', e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Place Weekly Orders'; }
  }
}
window.handleWeeklySubmit = handleWeeklySubmit;

function resetWeeklyForm() { initWeekly(); }
window.resetWeeklyForm = resetWeeklyForm;

// ============================================================
// ORDER HISTORY — redesigned with filters + grouping + editing
// ============================================================

function canEditOrCancelOrder(order) {
  const dDT = new Date(order.delivery_date + 'T' + (order.delivery_time || '23:59'));
  return (dDT - new Date()) / (1000 * 60 * 60) > 24;
}

// Keep old name as alias so nothing breaks
function canDeleteOrder(order) { return canEditOrCancelOrder(order); }

async function deleteOrder(orderId) {
  if (!confirm('Cancel this order? This cannot be undone.')) return;
  try {
    await db.collection('orders').doc(orderId).delete();
    allClientOrders = allClientOrders.filter(o => o.id !== orderId);
    renderHistoryContent();
  } catch (e) { alert('Could not cancel order: ' + e.message); }
}
window.deleteOrder = deleteOrder;

// ── Filter tab ──────────────────────────────────────────────
function setHistoryFilter(f) {
  historyFilter = f;
  // update active tab styling
  document.querySelectorAll('.history-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === f);
  });
  renderHistoryContent();
}
window.setHistoryFilter = setHistoryFilter;

// ── Main load ────────────────────────────────────────────────
async function loadHistory() {
  const container = document.getElementById('history-list');
  if (!container) return;
  container.innerHTML = '<div class="empty-state">Loading...</div>';

  try {
    const snap = await db.collection('orders').where('vendor_id', '==', currentUser.uid).get();
    allClientOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const today = localDateStr(new Date());
    const upcomingCount = allClientOrders.filter(o => o.delivery_date >= today).length;
    const pastCount = allClientOrders.filter(o => o.delivery_date < today).length;

    container.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:28px;flex-wrap:wrap;">
        <button class="history-tab-btn${historyFilter === 'upcoming' ? ' active' : ''}" data-filter="upcoming" onclick="setHistoryFilter('upcoming')">
          Upcoming <span class="history-tab-count">${upcomingCount}</span>
        </button>
        <button class="history-tab-btn${historyFilter === 'past' ? ' active' : ''}" data-filter="past" onclick="setHistoryFilter('past')">
          Past <span class="history-tab-count">${pastCount}</span>
        </button>
        <button class="history-tab-btn${historyFilter === 'all' ? ' active' : ''}" data-filter="all" onclick="setHistoryFilter('all')">
          All Orders <span class="history-tab-count">${allClientOrders.length}</span>
        </button>
      </div>
      <div id="history-content"></div>`;

    renderHistoryContent();
  } catch (e) {
    container.innerHTML = '<div class="empty-state">Failed to load orders.</div>';
  }
}
window.loadHistory = loadHistory;

// ── Render filtered + grouped content ────────────────────────
function renderHistoryContent() {
  const el = document.getElementById('history-content');
  if (!el) return;

  const today = localDateStr(new Date());
  let filtered;

  if (historyFilter === 'upcoming') {
    filtered = allClientOrders
      .filter(o => o.delivery_date >= today)
      .sort((a, b) => a.delivery_date !== b.delivery_date
        ? a.delivery_date.localeCompare(b.delivery_date)
        : (a.delivery_time || '').localeCompare(b.delivery_time || ''));
  } else if (historyFilter === 'past') {
    filtered = allClientOrders
      .filter(o => o.delivery_date < today)
      .sort((a, b) => b.delivery_date.localeCompare(a.delivery_date));
  } else {
    // All: upcoming first (asc), then past (desc)
    const upcoming = allClientOrders
      .filter(o => o.delivery_date >= today)
      .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
    const past = allClientOrders
      .filter(o => o.delivery_date < today)
      .sort((a, b) => b.delivery_date.localeCompare(a.delivery_date));
    filtered = [...upcoming, ...past];
  }

  if (!filtered.length) {
    const msg = historyFilter === 'upcoming' ? 'No upcoming orders.' : historyFilter === 'past' ? 'No past orders yet.' : 'No orders yet.';
    el.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  // Group by delivery date
  const byDate = {};
  filtered.forEach(o => {
    if (!byDate[o.delivery_date]) byDate[o.delivery_date] = [];
    byDate[o.delivery_date].push(o);
  });

  // For 'all' mode, preserve the upcoming-first order of dates
  const dateOrder = [...new Set(filtered.map(o => o.delivery_date))];

  let html = '';
  for (const date of dateOrder) {
    const orders = byDate[date];
    const d = new Date(date + 'T12:00:00');
    const isToday = date === today;
    const isTomorrow = date === (() => { const t = new Date(); t.setDate(t.getDate() + 1); return localDateStr(t); })();
    const dateLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const totalUnits = orders.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + i.quantity, 0), 0);

    let dateBadge = '';
    if (isToday) dateBadge = `<span style="font-size:10px;background:var(--accent);color:white;padding:2px 8px;letter-spacing:.1em;text-transform:uppercase;margin-left:10px;font-weight:700;">Today</span>`;
    else if (isTomorrow) dateBadge = `<span style="font-size:10px;background:var(--bg);border:1px solid var(--accent);color:var(--accent);padding:2px 8px;letter-spacing:.1em;text-transform:uppercase;margin-left:10px;font-weight:700;">Tomorrow</span>`;

    html += `
      <div style="margin-bottom:32px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:2px solid var(--accent);margin-bottom:0;">
          <div style="display:flex;align-items:center;gap:0;">
            <span style="font-size:14px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">${dateLabel}</span>
            ${dateBadge}
          </div>
          <span style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text2);">${orders.length} order${orders.length !== 1 ? 's' : ''} · ${totalUnits} units</span>
        </div>
        ${orders.map(order => renderOrderCard(order)).join('')}
      </div>`;
  }

  el.innerHTML = html;
}

// ── Single order card ─────────────────────────────────────────
function renderOrderCard(order) {
  const oI = order.items || [];
  const total = oI.reduce((s, i) => s + i.quantity, 0);
  const iT = oI.map(i => `${i.item_name} &times; ${i.quantity}`).join(', ');
  const st = (order.status || 'new').toLowerCase();
  const canAct = canEditOrCancelOrder(order);

  // Group items by category for the card display
  const grouped = {};
  oI.forEach(item => {
    const menuItem = menuItems.find(m => m.name === item.item_name);
    const cat = menuItem?.category || 'Other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });
  const cats = Object.keys(grouped).sort();

  const itemsDisplay = cats.length > 1
    ? cats.map(cat => `<span style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-right:4px;">${cat}:</span>${grouped[cat].map(i => `${i.item_name} ×${i.quantity}`).join(', ')}`).join('<br>')
    : iT;

  return `<div class="order-card">
    <div class="order-card-header">
      <div>
        <div class="order-date">Delivery at ${(order.delivery_time || '').slice(0, 5)}</div>
        <div class="order-id">#${order.id.slice(0, 8).toUpperCase()}</div>
      </div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
        <span class="status-badge ${st}">${order.status || 'New'}</span>
        <div class="order-units">${total} unit${total !== 1 ? 's' : ''}</div>
      </div>
    </div>
    <div class="order-items-text" style="line-height:1.8;">${itemsDisplay}</div>
    ${order.notes ? `<div class="order-notes-text">${order.notes}</div>` : ''}
    <div style="display:flex;gap:10px;align-items:center;margin-top:14px;flex-wrap:wrap;">
      ${canAct
        ? `<button class="btn-edit-order" onclick="openEditOrder('${order.id}')">Edit Order</button>
           <button class="btn-cancel-order" onclick="deleteOrder('${order.id}')">Cancel</button>`
        : `<button class="btn-cancel-order" disabled>Edit / Cancel</button>
           <span class="cancel-note">Cannot edit or cancel within 24 hours of delivery.</span>`
      }
    </div>
  </div>`;
}

// ============================================================
// EDIT ORDER MODAL
// ============================================================

function openEditOrder(orderId) {
  const order = allClientOrders.find(o => o.id === orderId);
  if (!order) return;

  editOrderId = orderId;
  editQtys = {};

  // Pre-populate quantities from the existing order
  (order.items || []).forEach(item => {
    const menuItem = menuItems.find(m => m.name === item.item_name);
    if (menuItem) editQtys[menuItem.id] = item.quantity;
  });

  // Build product grid (same structure as single-orders page)
  const grouped = {};
  menuItems.forEach(item => {
    const cat = item.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });
  const sortedCats = Object.keys(grouped).sort();

  let gridHtml = '';
  for (const cat of sortedCats) {
    gridHtml += `<div style="margin-top:16px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid var(--border);">${cat}</div>`;
    for (const item of grouped[cat].sort((a, b) => a.name.localeCompare(b.name))) {
      const qty = editQtys[item.id] || 0;
      gridHtml += `
        <div class="product-row${qty > 0 ? ' has-qty' : ''}" id="edit-row-${item.id}" style="padding:10px 0;">
          <div class="product-info">
            <div class="product-name">${item.name}</div>
            <div class="product-unit">per ${item.unit}</div>
          </div>
          <div class="qty-ctrl">
            <button class="qty-btn" onclick="changeEditQty('${item.id}',-1)">−</button>
            <input class="qty-input" type="number" id="edit-qty-${item.id}" value="${qty > 0 ? qty : ''}" min="0" max="999" placeholder="0" oninput="setEditQty('${item.id}',this.value)">
            <button class="qty-btn" onclick="changeEditQty('${item.id}',1)">+</button>
          </div>
        </div>`;
    }
    gridHtml += `</div>`;
  }

  const d = new Date(order.delivery_date + 'T12:00:00');
  const dateLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const modalHtml = `
    <div id="edit-order-overlay"
      style="position:fixed;inset:0;background:rgba(44,26,14,.6);z-index:2000;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:32px 16px;"
      onclick="handleEditOverlayClick(event)">
      <div style="background:var(--surface);max-width:580px;width:100%;border:1px solid var(--border);box-shadow:0 8px 48px rgba(44,26,14,.18);margin:auto;" onclick="event.stopPropagation()">

        <!-- Modal header -->
        <div style="padding:20px 24px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin-bottom:5px;">Edit Order</div>
            <div style="font-size:15px;font-weight:600;color:var(--text);">${dateLabel}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:2px;">#${order.id.slice(0, 8).toUpperCase()}</div>
          </div>
          <button onclick="closeEditOrder()"
            style="background:none;border:1px solid var(--border);width:32px;height:32px;cursor:pointer;color:var(--text2);font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;"
            onmouseover="this.style.borderColor='var(--border2)';this.style.color='var(--text)'"
            onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text2)'">&#x2715;</button>
        </div>

        <!-- Date + time row -->
        <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text2);margin-bottom:8px;">Delivery Date</div>
            <input type="date" id="edit-date" value="${order.delivery_date}"
              style="width:100%;padding:10px;border:1px solid var(--border);background:transparent;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--text);outline:none;border-radius:0;">
          </div>
          <div>
            <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text2);margin-bottom:8px;">Delivery Time</div>
            <input type="time" id="edit-time" value="${(order.delivery_time || '08:00').slice(0, 5)}"
              style="width:100%;padding:10px;border:1px solid var(--border);background:transparent;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--text);outline:none;border-radius:0;">
          </div>
        </div>

        <!-- Product grid (scrollable) -->
        <div style="padding:0 24px;max-height:40vh;overflow-y:auto;border-bottom:1px solid var(--border);">
          ${gridHtml}
          <div style="height:12px;"></div>
        </div>

        <!-- Notes -->
        <div style="padding:16px 24px;border-bottom:1px solid var(--border);">
          <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text2);margin-bottom:8px;">Notes</div>
          <textarea id="edit-notes"
            style="width:100%;padding:10px;border:1px solid var(--border);background:transparent;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--text);resize:vertical;min-height:60px;outline:none;border-radius:0;"
            placeholder="Any special instructions...">${order.notes || ''}</textarea>
        </div>

        <!-- Live summary -->
        <div id="edit-summary" style="padding:14px 24px;border-bottom:1px solid var(--border);font-size:13px;color:var(--text2);min-height:44px;"></div>

        <!-- Error -->
        <div id="edit-error" style="display:none;padding:0 24px 10px;font-size:12px;color:var(--err);font-weight:500;"></div>

        <!-- Actions -->
        <div style="padding:16px 24px;display:flex;gap:10px;justify-content:flex-end;">
          <button onclick="closeEditOrder()"
            style="background:none;border:1px solid var(--border);color:var(--text2);padding:11px 20px;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;transition:all .15s;"
            onmouseover="this.style.borderColor='var(--border2)'"
            onmouseout="this.style.borderColor='var(--border)'">Discard</button>
          <button id="edit-save-btn" onclick="saveEditOrder()"
            style="background:var(--accent);color:white;border:none;padding:11px 24px;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;transition:opacity .15s;"
            onmouseover="this.style.opacity='.85'"
            onmouseout="this.style.opacity='1'">Save Changes</button>
        </div>

      </div>
    </div>`;

  // Remove any existing modal, inject new one
  const existing = document.getElementById('edit-order-overlay');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  document.body.style.overflow = 'hidden';
  updateEditSummary();
}
window.openEditOrder = openEditOrder;

function handleEditOverlayClick(e) {
  if (e.target.id === 'edit-order-overlay') closeEditOrder();
}
window.handleEditOverlayClick = handleEditOverlayClick;

function closeEditOrder() {
  const overlay = document.getElementById('edit-order-overlay');
  if (overlay) overlay.remove();
  document.body.style.overflow = '';
  editOrderId = null;
  editQtys = {};
}
window.closeEditOrder = closeEditOrder;

function changeEditQty(id, delta) {
  const el = document.getElementById('edit-qty-' + id);
  if (!el) return;
  el.value = Math.max(0, (parseInt(el.value) || 0) + delta);
  setEditQty(id, el.value);
}
window.changeEditQty = changeEditQty;

function setEditQty(id, val) {
  const qty = Math.max(0, parseInt(val) || 0);
  const input = document.getElementById('edit-qty-' + id);
  if (input) input.value = qty > 0 ? qty : '';
  const row = document.getElementById('edit-row-' + id);
  if (qty > 0) {
    editQtys[id] = qty;
    if (row) row.classList.add('has-qty');
  } else {
    delete editQtys[id];
    if (row) row.classList.remove('has-qty');
  }
  updateEditSummary();
}
window.setEditQty = setEditQty;

function updateEditSummary() {
  const el = document.getElementById('edit-summary');
  if (!el) return;
  const keys = Object.keys(editQtys);
  if (!keys.length) {
    el.innerHTML = '<span style="color:var(--text3);font-style:italic;">No items selected.</span>';
    return;
  }
  const total = keys.reduce((s, k) => s + editQtys[k], 0);
  const preview = keys.slice(0, 3).map(k => {
    const m = menuItems.find(m => m.id === k);
    return `${m?.name || 'Item'} ×${editQtys[k]}`;
  }).join(', ') + (keys.length > 3 ? ` +${keys.length - 3} more` : '');
  el.innerHTML = `<span style="font-weight:600;color:var(--text);">${total} unit${total !== 1 ? 's' : ''}</span> <span style="color:var(--text3);margin:0 6px;">·</span> <span style="color:var(--text2);">${preview}</span>`;
}

async function saveEditOrder() {
  const errEl = document.getElementById('edit-error');
  if (errEl) errEl.style.display = 'none';

  const date = document.getElementById('edit-date')?.value;
  const time = document.getElementById('edit-time')?.value;
  const notes = document.getElementById('edit-notes')?.value.trim() || '';

  if (!date) {
    if (errEl) { errEl.textContent = 'Please set a delivery date.'; errEl.style.display = 'block'; }
    return;
  }
  if (!time) {
    if (errEl) { errEl.textContent = 'Please set a delivery time.'; errEl.style.display = 'block'; }
    return;
  }
  if (!Object.keys(editQtys).length) {
    if (errEl) { errEl.textContent = 'Please add at least one item.'; errEl.style.display = 'block'; }
    return;
  }

  const btn = document.getElementById('edit-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  try {
    const items = Object.entries(editQtys).map(([id, qty]) => {
      const m = menuItems.find(m => m.id === id);
      return { item_name: m.name, quantity: qty, unit: m.unit, price: getItemPrice(m) };
    });

    await db.collection('orders').doc(editOrderId).update({
      delivery_date: date,
      delivery_time: time,
      notes,
      items,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Update local cache
    const idx = allClientOrders.findIndex(o => o.id === editOrderId);
    if (idx !== -1) {
      allClientOrders[idx] = { ...allClientOrders[idx], delivery_date: date, delivery_time: time, notes, items };
    }

    closeEditOrder();
    renderHistoryContent();
  } catch (e) {
    if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  }
}
window.saveEditOrder = saveEditOrder;

// ============================================================
// PAGE INITIALIZER
// ============================================================

function initCurrentPage() {
  const path = window.location.pathname;
  if (path.includes('weekly-orders.html')) {
    initWeekly();
  } else if (path.includes('history.html')) {
    loadHistory();
  } else {
    buildOrderForm();
  }
}

// ---------- Auth state observer ----------
function initAuth() {
  auth.onAuthStateChanged(async (user) => {
    if (!user) { show('v-auth'); return; }
    currentUser = user;
    try {
      await loadProfile();
      if (!currentProfile) { show('v-auth'); return; }
      if (!currentProfile.approved) { show('v-pending'); return; }
      await loadMenu();
      await loadVendorPricing();
      show('v-app');
      initCurrentPage();
    } catch (e) { console.error(e); show('v-auth'); }
  });
}

window.handleGoogleSignIn = handleGoogleSignIn;
window.completeGoogleSignup = completeGoogleSignup;
window.handleLogin = handleLogin;
window.handleSignup = handleSignup;
window.handleSignout = handleSignout;

document.addEventListener('DOMContentLoaded', () => {
  const currentFile = window.location.pathname.split('/').pop();
  let activeTabId = '';
  if (currentFile === 'weekly-orders.html') activeTabId = 'tab-weekly';
  else if (currentFile === 'history.html') activeTabId = 'tab-history';
  else activeTabId = 'tab-order';
  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.dataset.tab === activeTabId) btn.classList.add('active');
    else btn.classList.remove('active');
  });
  initAuth();
});