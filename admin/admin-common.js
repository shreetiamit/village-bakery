console.log("admin-common.js loading...");

const firebaseConfig = {
  apiKey: "AIzaSyDpzmw5NGHagj1fv4L2v74Wfj1E2_KmmdY",
  authDomain: "village-bakery-6885a.firebaseapp.com",
  projectId: "village-bakery-6885a",
  storageBucket: "village-bakery-6885a.firebasestorage.app",
  messagingSenderId: "735648711607",
  appId: "1:735648711607:web:423ff3ca56572d9e7d9e32"
};

if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

console.log("auth initialized:", auth);

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
  ['v-loading', 'v-auth', 'v-unauthorized', 'v-app'].forEach(v => {
    const el = document.getElementById(v);
    if (el) el.classList.toggle('hidden', v !== id);
  });
}

// Minimal placeholder functions to avoid errors
function loadOrders() { return Promise.resolve(); }
function loadVendors() { return Promise.resolve(); }
function loadMenu() { return Promise.resolve(); }
function renderOrders() { console.log("renderOrders called"); }
function renderVendors() { console.log("renderVendors called"); }
function renderMenu() { console.log("renderMenu called"); }
function renderProduction() { console.log("renderProduction called"); }
function renderPacking() { console.log("renderPacking called"); }
function renderInvoicing() { console.log("renderInvoicing called"); }
function renderCurrentPage() { renderOrders(); }
function getDateRange(mode) { return { from: TODAY, to: TODAY }; }
function filterOrders(tab) { return []; }
function fmtDate(d) { return d; }
function filterBarHtml(tab) { return ''; }
function setFilter(tab, mode, btn) {}
function setCustomRange(tab) {}
function renderProductionContent() {}
function renderPackingContent() {}
function renderInvoicingContent() {}
function escapeHtml(str) { return str; }
function printTab(tab) { alert("Print function placeholder"); }

async function initAuthAndData() {
  console.log("initAuthAndData called");
  auth.onAuthStateChanged(async (user) => {
    console.log("onAuthStateChanged user:", user);
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

document.addEventListener('DOMContentLoaded', () => {
  console.log("DOMContentLoaded fired");
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