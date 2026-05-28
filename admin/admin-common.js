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
          <tbody>${sortedItems.map(([itemName, qty]) => `<tr><td style="padding:8px 18px;border-bottom:1px solid #e2d5c0;">${escapeHtml(itemName)}</td><td style="padding:8px 18px;text-align:right;font-weight:600;">${qty}</td>`).join('')}</tbody>
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
      body += `<div style="margin-bottom:32px;page-break-inside:avoid"><div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:2px solid #1a1916"><span style="font-size:13px;font-weight:600;text-transform:uppercase">${fmtDate(date)}</span><span style="font-size:10px;color:#6b6860">${dO.length} order${dO.length !== 1 ? 's' : ''} &middot; ${dU} units</span></div><table style="width:100%;border-collapse:collapse"><thead><tr><th style="padding:8px 0;text-align:left;font-size:10px;color:#6b6860;border-bottom:1px solid #dedad4">Item</th><th style="padding:8px 0;text-align:left;font-size:10px;color:#6b6860;border-bottom:1px solid #dedad4">Clients</th><th style="padding:8px 0;text-align:right;font-size:10px;color:#6b6860;border-bottom:1px solid #dedad4">Qty</th></tr></thead><tbody>${Object.entries(iM).sort((a, b) => b[1].qty - a[1].qty).map(([name, data]) => `<tr style="border-bottom:1px solid #f0ece6"><td style="padding:10px 0;font-size:14px">${name}</td><td style="padding:10px 0;font-size:12px;color:#6b6860">${data.vendors.join(', ')}</td><td style="padding:10px 0;text-align:right;font-size:22px;font-weight:700">${data.qty} <span style="font-size:10px;font-weight:400;color:#6b6860">${data.unit === 'each' ? 'each' : (data.qty !== 1 ? data.unit + 's' : data.unit)}</span></td>`).join('')}</tbody></table></div>`;
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
      body += `<div style="margin-bottom:32px"><div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:2px solid #1a1916;margin-bottom:16px"><span style="font-size:13px;font-weight:600">${fmtDate(date)}</span><span style="font-size:10px;color:#6b6860">${sV.length} client${sV.length !== 1 ? 's' : ''}</span></div>${sV.map(([vendor, data]) => `<div style="border:1px solid #dedad4;margin-bottom:10px;page-break-inside:avoid"><div style="background:#f8f6f2;padding:10px 14px;display:flex;justify-content:space-between;border-bottom:1px solid #dedad4"><span style="font-size:14px;font-weight:600">${vendor}</span><div>${data.time ? `<span style="font-size:11px;color:#6b6860">Delivery ${data.time.slice(0, 5)}</span>&ensp;` : ''}<span style="font-size:10px;color:#6b6860">${data.total} unit${data.total !== 1 ? 's' : ''}</span></div></div><table style="width:100%;border-collapse:collapse">${data.items.map(i => `<tr style="border-bottom:1px solid #f0ece6"><td style="padding:8px 14px;font-size:13px">${i.item_name}</td><td style="padding:8px 14px;font-size:13px;font-weight:600;text-align:right">${i.quantity} ${i.unit === 'each' ? 'each' : (i.quantity !== 1 ? i.unit + 's' : i.unit)}</td>`).join('')}</table>${data.notes ? `<div style="padding:7px 14px;font-size:11px;color:#6b6860;font-style:italic;border-top:1px dashed #dedad4">Note: ${data.notes}</div>` : ''}</div>`).join('')}</div>`;
    });
  }
  const printHtml = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif; color: #1a1916; padding: 10mm; margin: 0; }
      @media print { body { padding: 5mm; } .no-print { display: none !important; } @page { margin: 0; } }
      .no-print { text-align: center; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #dedad4; }
      .print-btn { background: #1a1916; color: white; border: none; padding: 8px 20px; font-family: 'DM Sans', sans-serif; font-size: 11px; letter-spacing: .18em; text-transform: uppercase; cursor: pointer; }
      .header-section { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; padding-bottom: 14px; border-bottom: 1px solid #dedad4; }
      .title { font-size: 22px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
      .range { font-size: 12px; color: #6b6860; line-height: 1.8; text-align: right; }
      .date-group { margin-bottom: 28px; page-break-inside: avoid; }
    </style>
  </head>
  <body>
    <div class="no-print"><button class="print-btn" onclick="window.print()">Print / Save PDF</button></div>
    <div class="header-section">
      <div><div style="font-size:10px;color:#6b6860;margin-bottom:5px;text-transform:uppercase;letter-spacing:.2em">Village Bakery + Provisions</div><div class="title">${title}</div></div>
      <div class="range"><div>${rangeLabel}</div><div>Printed ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div></div>
    </div>
    ${body}
  </body>
  </html>`;
  const w = window.open('', '_blank');
  w.document.write(printHtml);
  w.document.close();
  setTimeout(() => w.print(), 500);
}  // <-- THIS BRACE CLOSES printTab FUNCTION

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