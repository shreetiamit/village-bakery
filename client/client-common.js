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

// EmailJS – replace with your own keys or leave as is (no email will be sent)
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
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  }
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
      // After showing app, initialize the current page
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
  grid.innerHTML = menuItems.map(item => `
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
    </div>`).join('');
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
// Clear all weekly quantities
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
    // Fetch all orders for this vendor (no date filter to avoid composite index)
    const snap = await db.collection('orders')
      .where('vendor_id', '==', currentUser.uid)
      .get();
    
    // Filter by date range in JavaScript
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

// Expose functions globally
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
  const rows = menuItems.map(item => {
    const cells = dates.map(d => {
      const qty = weeklyQuantities[d.dateStr]?.[item.id] || '';
      const hasVal = qty !== '' && qty > 0;
      return `<td><input class="weekly-qty${hasVal ? ' has-val' : ''}" type="number" min="0" max="999" value="${qty || ''}" placeholder="—" oninput="setWeeklyQty('${d.dateStr}','${item.id}',this.value)"></td>`;
    }).join('');
    return `<tr><td class="item-col"><div class="weekly-item-name">${item.name}</div><div class="weekly-item-unit">per ${item.unit}</div></td>${cells}</tr>`;
  }).join('');
  const gridDiv = document.getElementById('weekly-grid');
  if (gridDiv) {
    gridDiv.innerHTML = `<table class="weekly-table"><thead><tr><th class="item-col">Item</th>${headers}</tr></thead><tbody>${rows}</tbody></tr>`;
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

// ---------- Order History Page ----------
function canDeleteOrder(order) {
  const dDT = new Date(order.delivery_date + 'T' + (order.delivery_time || '23:59'));
  return (dDT - new Date()) / (1000 * 60 * 60) > 24;
}

async function deleteOrder(orderId) {
  if (!confirm('Cancel this order? This cannot be undone.')) return;
  try {
    await db.collection('orders').doc(orderId).delete();
    loadHistory();
  } catch (e) { alert('Could not cancel order: ' + e.message); }
}
window.deleteOrder = deleteOrder;

async function loadHistory() {
  const container = document.getElementById('history-list');
  if (!container) return;
  container.innerHTML = '<div class="empty-state">Loading...</div>';
  const snap = await db.collection('orders').where('vendor_id', '==', currentUser.uid).get();
  const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  data.sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
  if (!data.length) { container.innerHTML = '<div class="empty-state">No orders yet.</div>'; return; }
  container.innerHTML = data.map(order => {
    const oI = order.items || [];
    const total = oI.reduce((s, i) => s + i.quantity, 0);
    const d = new Date(order.delivery_date + 'T12:00:00');
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const iT = oI.map(i => `${i.item_name} &times; ${i.quantity}`).join(', ');
    const st = (order.status || 'new').toLowerCase();
    const canDelete = canDeleteOrder(order);
    return `<div class="order-card">
      <div class="order-card-header">
        <div><div class="order-date">${dateStr} at ${(order.delivery_time || '').slice(0, 5)}</div><div class="order-id">#${order.id.slice(0, 8).toUpperCase()}</div></div>
        <div style="text-align:right"><span class="status-badge ${st}">${order.status || 'New'}</span><div class="order-units">${total} units</div></div>
      </div>
      <div class="order-items-text">${iT}</div>
      ${order.notes ? `<div class="order-notes-text">${order.notes}</div>` : ''}
      <div>${canDelete ? `<button class="btn-cancel-order" onclick="deleteOrder('${order.id}')">Cancel Order</button>` : `<button class="btn-cancel-order" disabled>Cancel Order</button><div class="cancel-note">Cannot cancel within 24 hours of delivery.</div>`}</div>
    </div>`;
  }).join('');
}
window.loadHistory = loadHistory;

// ---------- Page Initializer ----------
function initCurrentPage() {
  const path = window.location.pathname;
  if (path.includes('weekly-orders.html')) {
    initWeekly();
  } else if (path.includes('history.html')) {
    loadHistory();
  } else {
    // single-orders.html (or any other)
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

// Expose functions for inline onclick handlers
window.handleGoogleSignIn = handleGoogleSignIn;
window.completeGoogleSignup = completeGoogleSignup;
window.handleLogin = handleLogin;
window.handleSignup = handleSignup;
window.handleSignout = handleSignout;

// Start
document.addEventListener('DOMContentLoaded', () => {
  // Set active nav link based on current file
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