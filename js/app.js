import { auth, db, ADMIN_EMAIL, isAdminEmail } from "./firebase-config.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendEmailVerification, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, getDocsFromServer,
  collection, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Tell the stylesheet that JS booted. The .reveal animations only hide their
// content while this class is present, so a script failure can never leave
// the page blank.
document.documentElement.classList.add('js-ready');

// ─── STATE ──────────────────────────────────────────────────
let currentUser = null;
let currentUserData = null;
let allUsers = [];
let allShipments = [];
let mapInstance = null;
let editingShipID = null;

// ─── ROUTER ─────────────────────────────────────────────────
window.navigate = function (page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(`page-${page}`);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
  updateNav(page);
  // The admin panel is also reachable straight from the nav link, so its data
  // must be loaded here too - not only by the post-login redirect.
  if (page === 'admin' && isAdminEmail(currentUser?.email)) loadAdmin();
};

function updateNav(page) {
  closeNav(); // never leave the mobile menu open behind a page change
  const isAdmin = isAdminEmail(currentUser?.email);
  const nav = document.getElementById('navLinks');
  const isAuth = !!currentUser;

  if (page === 'admin') { document.getElementById('mainNav').style.display = 'none'; return; }
  document.getElementById('mainNav').style.display = 'flex';

  if (isAdmin) {
    nav.innerHTML = `<a onclick="navigate('contact')">Contact</a><a onclick="navigate('admin')">Admin Panel</a><a onclick="doLogout()">Logout</a>`;
  } else if (isAuth) {
    nav.innerHTML = `<a onclick="navigate('tracking')">Track</a><a onclick="navigate('contact')">Contact</a><a onclick="navigate('dashboard')">My Dashboard</a><a onclick="doLogout()" class="btn-nav">Logout</a>`;
  } else {
    nav.innerHTML = `<a onclick="navigate('tracking')">Track</a><a onclick="navigate('contact')">Contact</a><a ondblclick="navigate('login')">Connect</a><a ondblclick="navigate('register')" class="btn-nav">Swift Ways</a>`;
  }
}

// ─── AUTH STATE ─────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) {
    const snap = await getDoc(doc(db, 'users', user.uid));
    currentUserData = snap.exists() ? snap.data() : null;

    // Must use the same admin check as updateNav(): when the two disagreed the
    // panel could be opened without loadAdmin() ever running, which left the
    // Users and Shipments tabs permanently empty.
    if (isAdminEmail(user.email)) {
      navigate('admin');
      await loadAdmin();
    } else {
      navigate('dashboard');
      await loadDashboard();
    }
  } else {
    currentUserData = null;
    navigate('home');
  }
});

// ─── HOME ───────────────────────────────────────────────────
window.homeTrack = function () {
  const id = document.getElementById('homeTrackInput').value.trim();
  if (!id) return;
  document.getElementById('trackInput').value = id;
  navigate('tracking');
  doTrack();
};
window.demoTrack = function () {
  document.getElementById('homeTrackInput').value = 'SHIP-DEMO0001';
  homeTrack();
};

// ─── LOGIN ──────────────────────────────────────────────────
window.doLogin = async function () {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginErr');
  err.style.display = 'none';
  btn.textContent = 'Signing in…'; btn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    err.textContent = 'Invalid email or password.';
    err.style.display = 'block';
    btn.textContent = 'Sign In'; btn.disabled = false;
  }
};

// ─── REGISTER ───────────────────────────────────────────────
window.doRegister = async function () {
  const name = document.getElementById('regName').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const address = document.getElementById('regAddress').value.trim();
  const pass = document.getElementById('regPass').value;
  const pass2 = document.getElementById('regPass2').value;
  const btn = document.getElementById('regBtn');
  const err = document.getElementById('regErr');
  const suc = document.getElementById('regSuccess');
  err.style.display = 'none'; suc.style.display = 'none';

  if (pass !== pass2) { err.textContent = 'Passwords do not match.'; err.style.display = 'block'; return; }
  btn.textContent = 'Creating account…'; btn.disabled = true;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await sendEmailVerification(cred.user);
    const tid = generateTrackingID();
    await setDoc(doc(db, 'users', cred.user.uid), {
      uid: cred.user.uid, fullName: name, phone, email, address,
      trackingID: tid, role: 'user', status: 'active', createdAt: serverTimestamp()
    });
    suc.textContent = `Account created! Your Tracking ID is ${tid}. Check your email for verification.`;
    suc.style.display = 'block';
    btn.textContent = 'Done!';
  } catch (e) {
    err.textContent = e.message; 
    err.style.display = 'block';
    btn.textContent = 'Create Account'; 
    btn.disabled = false;
  }
};

// ─── LOGOUT ─────────────────────────────────────────────────
window.doLogout = async function () {
  await signOut(auth);
  currentUser = null; currentUserData = null;
  navigate('home');
};

// ─── TRACKING ───────────────────────────────────────────────
window.doTrack = async function () {
  const id = (document.getElementById('trackInput').value || '').trim().toUpperCase();
  if (!id) return;
  document.getElementById('trackResult').style.display = 'none';
  document.getElementById('trackNotFound').style.display = 'none';

  try {
    const q = query(collection(db, 'shipments'), where('trackingID', '==', id));
    const snap = await getDocs(q);
    if (snap.empty) { document.getElementById('trackNotFound').style.display = 'block'; return; }
    renderTracking(snap.docs[0].data());
  } catch (e) { console.error(e); }
};

function renderTracking(s) {
  document.getElementById('trID').textContent = s.trackingID;
  document.getElementById('trOrigin').textContent = s.origin || '—';
  document.getElementById('trDest').textContent = s.destination || '—';
  document.getElementById('trWeight').textContent = s.weight ? `${s.weight} kg` : '—';
  document.getElementById('trDimensions').textContent = s.dimensions || '—';
  document.getElementById('trPkgTypeText').textContent = s.packageType || '—';

  // Package type badge
  const pkgBadge = document.getElementById('trPkgType');
  if (s.packageType) {
    const icons = { Parcel: '📦', Freight: '🚛', Document: '📄' };
    pkgBadge.textContent = `${icons[s.packageType] || '📦'} ${s.packageType}`;
    pkgBadge.style.display = 'inline-flex';
  }

  // Status badge
  const sb = document.getElementById('trStatus');
  sb.textContent = s.status || 'Pending';
  sb.className = 'badge ' + statusBadgeClass(s.status);

  // Status progress bar
  const stages = ['Pending', 'In Transit', 'Out for Delivery', 'Delivered'];
  const currentIdx = stages.indexOf(s.status);
  stages.forEach((st, i) => {
    const el = document.getElementById(`stage-${st}`);
    if (!el) return;
    el.className = 'stage';
    if (i < currentIdx) el.classList.add('done');
    else if (i === currentIdx) el.classList.add('current');
    // lines
    const line = document.getElementById(`line-${i + 1}`);
    if (line) line.className = 'stage-line' + (i < currentIdx ? ' done' : '');
  });

  // Countdown timer
  const countdownBox = document.getElementById('countdownBox');
  const countdownEl = document.getElementById('countdownTimer');
  const deliveryEl = document.getElementById('trDeliveryDate');
  if (s.estimatedDelivery) {
    deliveryEl.textContent = new Date(s.estimatedDelivery).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    if (s.status === 'Delivered') {
      countdownEl.innerHTML = '<span class="countdown-delivered">✅ Delivered!</span>';
    } else {
      updateCountdown(s.estimatedDelivery, countdownEl);
      if (window._countdownInterval) clearInterval(window._countdownInterval);
      window._countdownInterval = setInterval(() => updateCountdown(s.estimatedDelivery, countdownEl), 1000);
    }
    countdownBox.style.display = 'flex';
  } else {
    deliveryEl.textContent = '—';
    countdownEl.textContent = '—';
  }

  // Timeline
  const tl = document.getElementById('timeline');
  tl.innerHTML = '';
  const cps = s.checkpoints || [];
  cps.forEach((cp, i) => {
    const div = document.createElement('div');
    const isActive = i === cps.length - 1;
    div.className = `timeline-item${isActive ? ' tl-active' : ' tl-done'}`;
    div.innerHTML = `
      <div class="tl-dot"></div>
      <div>
        <p class="tl-status">${statusIcon(cp.status)} ${cp.status}</p>
        <p class="tl-loc">📍 ${cp.location}</p>
        <p class="tl-time">${cp.timestamp}</p>
      </div>`;
    tl.appendChild(div);
  });

  // Map — show all checkpoint pins
  if (mapInstance) { mapInstance.remove(); mapInstance = null; }
  const lat = s.currentLat || 40.7128, lng = s.currentLng || -74.0060;
  setTimeout(() => {
    mapInstance = L.map('map').setView([lat, lng], 3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapInstance);

    // Current location marker (accent)
    const currentIcon = L.divIcon({
      className: '',
      html: `<div style="width:16px;height:16px;background:#00d4ff;border:3px solid #fff;border-radius:50%;box-shadow:0 0 10px rgba(0,212,255,.7)"></div>`,
      iconAnchor: [8, 8]
    });
    L.marker([lat, lng], { icon: currentIcon }).addTo(mapInstance)
      .bindPopup(`<b>${s.trackingID}</b><br><b>${s.status}</b><br>${s.origin || ''} → ${s.destination || ''}`).openPopup();

    // Checkpoint pins
    (s.checkpoints || []).forEach((cp, i) => {
      if (cp.lat && cp.lng) {
        const isLast = i === (s.checkpoints.length - 1);
        const cpIcon = L.divIcon({
          className: '',
          html: `<div style="width:10px;height:10px;background:${isLast ? '#00d4ff' : '#64748b'};border:2px solid #fff;border-radius:50%;"></div>`,
          iconAnchor: [5, 5]
        });
        L.marker([cp.lat, cp.lng], { icon: cpIcon }).addTo(mapInstance)
          .bindPopup(`<b>${cp.status}</b><br>📍 ${cp.location}<br>${cp.timestamp}`);
      }
    });
  }, 100);

  document.getElementById('trackResult').style.display = 'block';
}

// ─── USER DASHBOARD ─────────────────────────────────────────
async function loadDashboard() {
  if (!currentUserData) return;
  document.getElementById('dashWelcome').textContent = `Welcome back, ${currentUserData.fullName.split(' ')[0]}!`;
  document.getElementById('dashTrackID').textContent = currentUserData.trackingID || '—';
  document.getElementById('profName').value = currentUserData.fullName || '';
  document.getElementById('profPhone').value = currentUserData.phone || '';
  document.getElementById('profEmail').value = currentUserData.email || '';
  document.getElementById('profAddress').value = currentUserData.address || '';

  const q = query(collection(db, 'shipments'), where('userUID', '==', currentUser.uid));
  const snap = await getDocs(q);
  const list = snap.docs.map(d => d.data());

  document.getElementById('dTotal').textContent = list.length;
  document.getElementById('dTransit').textContent = list.filter(s => s.status === 'In Transit').length;
  document.getElementById('dDelivered').textContent = list.filter(s => s.status === 'Delivered').length;

  const el = document.getElementById('dashShipments');
  el.innerHTML = list.length === 0
    ? '<p class="empty-text">No shipments yet. </p>'
    : `<table class="data-table">
        <thead><tr><th>Tracking ID</th><th>Origin</th><th>Destination</th><th>Status</th><th>Est. Delivery</th><th></th></tr></thead>
        <tbody>${list.map(s => `
          <tr>
            <td><strong>${s.trackingID}</strong></td>
            <td>${s.origin || '—'}</td><td>${s.destination || '—'}</td>
            <td><span class="badge ${statusBadgeClass(s.status)}">${s.status || '—'}</span></td>
            <td>${s.estimatedDelivery || '—'}</td>
            <td><button class="btn-sm" onclick="quickTrack('${s.trackingID}')">Track</button></td>
          </tr>`).join('')}
        </tbody></table>`;
}

window.quickTrack = function (id) {
  document.getElementById('trackInput').value = id;
  navigate('tracking'); doTrack();
};

window.showDashTab = function (tab) {
  document.getElementById('dashTabShipments').style.display = tab === 'shipments' ? 'block' : 'none';
  document.getElementById('dashTabProfile').style.display = tab === 'profile' ? 'block' : 'none';
  document.querySelectorAll('#page-dashboard .sidebar li').forEach(li => li.classList.remove('active'));
  document.getElementById(`dash-tab-${tab}`)?.classList.add('active');
};

window.saveProfile = async function () {
  if (!currentUser) return;
  await updateDoc(doc(db, 'users', currentUser.uid), {
    fullName: document.getElementById('profName').value,
    phone: document.getElementById('profPhone').value,
    address: document.getElementById('profAddress').value
  });
  const s = document.getElementById('profSuccess');
  s.textContent = 'Profile updated!'; s.style.display = 'block';
  setTimeout(() => s.style.display = 'none', 3000);
};

// ─── ADMIN ──────────────────────────────────────────────────
async function loadAdmin() {
  const dateEl = document.getElementById('adminDate');
  if (dateEl) dateEl.textContent = new Date().toDateString();
  await loadAdminTabData('overview');
}

// The admin panel must show what is really in Firestore. Plain getDocs()
// silently resolves from the (usually empty) local cache whenever the browser
// has not reached the server yet, which is what made the Users and Shipments
// tabs look like they never fetched anything. Ask the server first and only
// fall back to the cache when the device genuinely cannot connect.
async function readCollection(name) {
  try {
    const snap = await getDocsFromServer(collection(db, name));
    return { rows: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
  } catch (serverError) {
    const snap = await getDocs(collection(db, name));
    return { rows: snap.docs.map(d => ({ id: d.id, ...d.data() })), offline: true, reason: readErrorMessage(serverError) };
  }
}

// Reads both collections for the admin panel. Promise.allSettled is used on
// purpose: if one collection is unreadable (e.g. security rules) the other must
// still render, and a failed read must never wipe data already on screen.
// Returns { errors, stale } - errors are reads that produced nothing at all,
// stale are reads served from the offline cache.
async function refreshAdminData() {
  const [shipRes, userRes] = await Promise.allSettled([
    readCollection('shipments'),
    readCollection('users')
  ]);

  const errors = [];
  const stale = [];

  if (shipRes.status === 'fulfilled') {
    allShipments = shipRes.value.rows;
    if (shipRes.value.offline) stale.push({ name: 'shipments', message: shipRes.value.reason });
  } else {
    errors.push({ name: 'shipments', message: readErrorMessage(shipRes.reason) });
  }

  if (userRes.status === 'fulfilled') {
    allUsers = userRes.value.rows;
    if (userRes.value.offline) stale.push({ name: 'users', message: userRes.value.reason });
  } else {
    errors.push({ name: 'users', message: readErrorMessage(userRes.reason) });
  }

  // Populate user dropdown
  const sel = document.getElementById('aUserSelect');
  if (sel) {
    sel.innerHTML = '<option value="">-- Select a user --</option>';
    allUsers.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.uid; opt.textContent = `${u.fullName} (${u.email})`;
      opt.dataset.name = u.fullName; opt.dataset.email = u.email; opt.dataset.tid = u.trackingID || '';
      sel.appendChild(opt);
    });
  }

  return { errors, stale };
}

function readErrorMessage(e) {
  return (e && (e.message || e.code)) || 'unknown error';
}

// Every tap on Overview / Users / Shipments re-reads Firestore and re-renders,
// so a table can never be left showing stale - or empty - state just because
// the first load happened somewhere else.
let adminLoadToken = 0;

async function loadAdminTabData(tab) {
  const token = ++adminLoadToken;

  if (tab === 'overview') {
    setAdminMessage('aRecentShipments', 'Loading…');
    setAdminMessage('aRecentUsers', 'Loading…');
  }
  if (tab === 'users') setAdminMessage('usersTable', 'Loading users…');
  if (tab === 'shipments') setAdminMessage('shipmentsTable', 'Loading shipments…');

  const { errors, stale } = await refreshAdminData();

  // A newer load started while this one was in flight - let that one render, so
  // fast tab switching can never paint an out-of-date table.
  if (token !== adminLoadToken) return;

  renderAdminOverview(errors, stale);

  // Never leave the user staring at an empty table when the read itself failed.
  const target = tab === 'users' ? 'usersTable' : tab === 'shipments' ? 'shipmentsTable' : null;
  const failed = errors.find(e => e.name === tab);
  const offline = stale.some(s => s.name === tab);
  const notice = offline ? adminOfflineHtml(tab) : '';

  if (target && failed) setAdminMessage(target, adminErrorHtml(failed.name, failed.message), '');
  else if (tab === 'users') renderUsersTable(allUsers, notice);
  else if (tab === 'shipments') renderShipmentsTable(allShipments, notice);
}

function setAdminMessage(containerId, html, className = 'loading-text') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = className ? `<p class="${className}">${html}</p>` : html;
}

function adminErrorHtml(name, message) {
  return `<p class="error-msg" style="display:block">Couldn't load ${esc(name)} from Firestore: ${esc(message)}</p>`;
}

function adminOfflineHtml(name) {
  return `<p class="error-msg" style="display:block">Couldn't reach Firestore, so the last synced ${esc(name)} are shown below. Check your connection and tap the tab again to refresh.</p>`;
}

// For values rendered as HTML text.
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// For values rendered inside a single-quoted inline handler argument, e.g.
// onclick="editShipment('SHIP-1')". The backslash-escaped quote survives HTML
// decoding, so names such as O'Brien no longer break the row buttons.
function jsArg(v) {
  return String(v ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderAdminOverview(errors = [], stale = []) {
  const shipErr = errors.find(e => e.name === 'shipments');
  const userErr = errors.find(e => e.name === 'users');
  const shipOffline = stale.some(s => s.name === 'shipments') ? adminOfflineHtml('shipments') : '';
  const userOffline = stale.some(s => s.name === 'users') ? adminOfflineHtml('users') : '';

  document.getElementById('aTotal').textContent = allShipments.length;
  document.getElementById('aTransit').textContent = allShipments.filter(s => s.status === 'In Transit').length;
  document.getElementById('aDelivered').textContent = allShipments.filter(s => s.status === 'Delivered').length;
  document.getElementById('aUsers').textContent = allUsers.length;

  const recent5ship = allShipments.slice(-5).reverse();
  document.getElementById('aRecentShipments').innerHTML = shipErr
    ? adminErrorHtml('shipments', shipErr.message)
    : shipOffline + (recent5ship.length === 0
      ? '<p class="empty-text">No shipments yet.</p>'
      : `<table class="data-table">
        <thead><tr><th>Tracking ID</th><th>Recipient</th><th>Origin</th><th>Destination</th><th>Status</th><th></th></tr></thead>
        <tbody>${recent5ship.map(s => `
          <tr>
            <td><strong>${esc(s.trackingID)}</strong></td>
            <td>${esc(s.recipientName || '—')}</td>
            <td>${esc(s.origin || '—')}</td><td>${esc(s.destination || '—')}</td>
            <td><span class="badge ${statusBadgeClass(s.status)}">${esc(s.status || '—')}</span></td>
            <td><button class="btn-sm" onclick="editShipment('${jsArg(s.id)}')">Edit</button></td>
          </tr>`).join('')}
        </tbody></table>`);

  const recent5user = allUsers.slice(-5).reverse();
  document.getElementById('aRecentUsers').innerHTML = userErr
    ? adminErrorHtml('users', userErr.message)
    : userOffline + (recent5user.length === 0
      ? '<p class="empty-text">No users yet.</p>'
      : `<table class="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Tracking ID</th><th>Status</th><th></th></tr></thead>
        <tbody>${recent5user.map(u => `
          <tr>
            <td>${esc(u.fullName || '—')}</td><td>${esc(u.email || '—')}</td>
            <td><strong>${esc(u.trackingID || '—')}</strong></td>
            <td><span class="badge ${u.status === 'suspended' ? 'badge-suspended' : 'badge-active'}">${esc(u.status || 'active')}</span></td>
            <td><button class="btn-sm" onclick="openEditUser('${jsArg(u.uid)}','${jsArg(u.fullName || '')}','${jsArg(u.phone || '')}','${jsArg(u.address || '')}','${jsArg(u.status || 'active')}')">Edit</button></td>
          </tr>`).join('')}
        </tbody></table>`);
}

window.showAdminTab = async function (tab) {
  ['overview', 'users', 'shipments', 'create'].forEach(t => {
    const panel = document.getElementById(`adminTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    document.getElementById(`atab-${t}`)?.classList.toggle('active', t === tab);
  });

  // Everything above runs synchronously, so callers such as editShipment() can
  // keep filling the form in immediately after this call.
  if (tab === 'create') { resetCreateForm(); return; }

  // Users / Shipments / Overview all re-read Firestore on tap.
  await loadAdminTabData(tab);
};

// Users table
function renderUsersTable(list, notice = '') {
  const table = list.length === 0
    ? '<p class="empty-text">No users found.</p>'
    : `<table class="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Tracking ID</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${list.map(u => `
          <tr>
            <td>${esc(u.fullName || '—')}</td><td>${esc(u.email || '—')}</td><td>${esc(u.phone || '—')}</td>
            <td><strong>${esc(u.trackingID || '—')}</strong></td>
            <td><span class="badge ${u.status === 'suspended' ? 'badge-suspended' : 'badge-active'}">${esc(u.status || 'active')}</span></td>
            <td style="display:flex;gap:6px">
              <button class="btn-sm" onclick="openEditUser('${jsArg(u.uid)}','${jsArg(u.fullName || '')}','${jsArg(u.phone || '')}','${jsArg(u.address || '')}','${jsArg(u.status || 'active')}')">Edit</button>
              <button class="btn-sm btn-danger" onclick="suspendUser('${jsArg(u.uid)}')">Suspend</button>
            </td>
          </tr>`).join('')}
        </tbody></table>`;

  const el = document.getElementById('usersTable');
  if (el) el.innerHTML = notice + table;
}

window.filterUsers = function () {
  const q = document.getElementById('userSearch').value.toLowerCase();
  renderUsersTable(allUsers.filter(u => (u.fullName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)));
};

window.openEditUser = function (uid, name, phone, address, status) {
  document.getElementById('editUID').value = uid;
  document.getElementById('editName').value = name;
  document.getElementById('editPhone').value = phone;
  document.getElementById('editAddress').value = address;
  document.getElementById('editStatus').value = status;
  document.getElementById('editUserModal').classList.add('open');
};

window.closeModal = function () { document.getElementById('editUserModal').classList.remove('open'); };

window.saveUser = async function () {
  const uid = document.getElementById('editUID').value;
  await updateDoc(doc(db, 'users', uid), {
    fullName: document.getElementById('editName').value,
    phone: document.getElementById('editPhone').value,
    address: document.getElementById('editAddress').value,
    status: document.getElementById('editStatus').value
  });
  closeModal();
  await loadAdminTabData('users');
};

window.suspendUser = async function (uid) {
  if (!confirm('Suspend this user?')) return;
  await updateDoc(doc(db, 'users', uid), { status: 'suspended' });
  await loadAdminTabData('users');
};

// Shipments table
function renderShipmentsTable(list, notice = '') {
  const table = list.length === 0
    ? '<p class="empty-text">No shipments found.</p>'
    : `<table class="data-table">
        <thead><tr><th>Tracking ID</th><th>Recipient</th><th>Origin</th><th>Destination</th><th>Status</th><th>Est. Delivery</th><th>Actions</th></tr></thead>
        <tbody>${list.map(s => `
          <tr>
            <td><strong>${esc(s.trackingID)}</strong></td>
            <td>${esc(s.recipientName || '—')}</td>
            <td>${esc(s.origin || '—')}</td><td>${esc(s.destination || '—')}</td>
            <td><span class="badge ${statusBadgeClass(s.status)}">${esc(s.status || '—')}</span></td>
            <td>${esc(s.estimatedDelivery || '—')}</td>
            <td style="display:flex;gap:6px">
              <button class="btn-sm" onclick="editShipment('${jsArg(s.id)}')">Edit</button>
              <button class="btn-sm btn-danger" onclick="deleteShipment('${jsArg(s.id)}')">Delete</button>
            </td>
          </tr>`).join('')}
        </tbody></table>`;

  const el = document.getElementById('shipmentsTable');
  if (el) el.innerHTML = notice + table;
}

window.filterShipments = function () {
  const q = document.getElementById('shipSearch').value.toLowerCase();
  const st = document.getElementById('shipStatusFilter').value;
  renderShipmentsTable(allShipments.filter(s =>
    (!q || (s.trackingID || '').toLowerCase().includes(q)) && (!st || s.status === st)
  ));
};

window.deleteShipment = async function (id) {
  if (!confirm('Delete this shipment? This cannot be undone.')) return;
  await deleteDoc(doc(db, 'shipments', id));
  await loadAdminTabData('shipments');
};

// Create / edit shipment
function resetCreateForm() {
  editingShipID = null;
  document.getElementById('createTitle').textContent = 'New Shipment';
  document.getElementById('createBtn').textContent = 'Create Shipment';
  document.getElementById('editShipID').value = '';
  ['aTrackingID', 'aRecipName', 'aRecipEmail', 'aOrigin', 'aDest', 'aWeight', 'aDimensions', 'aDelivery'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('aStatus').value = 'Pending';
  document.getElementById('aPkgType').value = 'Parcel';
  document.getElementById('aUserSelect').value = '';
  document.getElementById('checkpoints').innerHTML = '';
  document.getElementById('createSuccess').style.display = 'none';
  document.getElementById('createErr').style.display = 'none';
}

window.editShipment = function (id) {
  const s = allShipments.find(x => x.id === id);
  if (!s) return;
  showAdminTab('create');
  editingShipID = id;
  document.getElementById('createTitle').textContent = 'Edit Shipment';
  document.getElementById('createBtn').textContent = 'Save Changes';
  document.getElementById('editShipID').value = id;
  document.getElementById('aTrackingID').value = s.trackingID || '';
  document.getElementById('aRecipName').value = s.recipientName || '';
  document.getElementById('aRecipEmail').value = s.recipientEmail || '';
  document.getElementById('aOrigin').value = s.origin || '';
  document.getElementById('aDest').value = s.destination || '';
  document.getElementById('aWeight').value = s.weight || '';
  document.getElementById('aDimensions').value = s.dimensions || '';
  document.getElementById('aStatus').value = s.status || 'Pending';
  document.getElementById('aPkgType').value = s.packageType || 'Parcel';
  document.getElementById('aDelivery').value = s.estimatedDelivery || '';
  document.getElementById('aUserSelect').value = s.userUID || '';
  document.getElementById('checkpoints').innerHTML = '';
  (s.checkpoints || []).forEach(cp => addCheckpoint(cp));
};

window.onAdminUserSelect = function () {
  const sel = document.getElementById('aUserSelect');
  const opt = sel.options[sel.selectedIndex];
  if (opt?.dataset?.name) document.getElementById('aRecipName').value = opt.dataset.name;
  if (opt?.dataset?.email) document.getElementById('aRecipEmail').value = opt.dataset.email;
  if (opt?.dataset?.tid) document.getElementById('aTrackingID').value = opt.dataset.tid;
};

window.genID = function () { document.getElementById('aTrackingID').value = generateTrackingID(); };

window.addCheckpoint = function (cp = {}) {
  const div = document.createElement('div');
  div.className = 'checkpoint-row form-row';
  div.innerHTML = `
    <div class="form-group"><label>Status</label><input type="text" class="cp-status" value="${cp.status || ''}" placeholder="e.g. Arrived at Hub"/></div>
    <div class="form-group"><label>Location</label><input type="text" class="cp-loc" value="${cp.location || ''}" placeholder="e.g. Dubai, UAE"/></div>
    <div class="form-group"><label>Timestamp</label><input type="text" class="cp-time" value="${cp.timestamp || ''}" placeholder="Jan 12, 2025 09:30 AM"/></div>
    <div class="form-group"><label>Lat</label><input type="number" class="cp-lat" value="${cp.lat || ''}" placeholder="25.2048" step="any"/></div>
    <div class="form-group"><label>Lng</label><input type="number" class="cp-lng" value="${cp.lng || ''}" placeholder="55.2708" step="any"/></div>
    <button type="button" class="btn-sm btn-danger" onclick="this.parentElement.remove()" style="flex-shrink:0;margin-bottom:0;align-self:flex-end;padding:12px">✕</button>`;
  document.getElementById('checkpoints').appendChild(div);
};

window.submitShipment = async function () {
  const btn = document.getElementById('createBtn');
  const suc = document.getElementById('createSuccess');
  const err = document.getElementById('createErr');
  suc.style.display = 'none'; err.style.display = 'none';

  const tid = document.getElementById('aTrackingID').value.trim();
  if (!tid) { err.textContent = 'Please enter or generate a Tracking ID.'; err.style.display = 'block'; return; }

  btn.textContent = 'Saving…'; btn.disabled = true;

  const checkpoints = [...document.querySelectorAll('.checkpoint-row')].map(r => ({
    status: r.querySelector('.cp-status').value,
    location: r.querySelector('.cp-loc').value,
    timestamp: r.querySelector('.cp-time').value,
    lat: parseFloat(r.querySelector('.cp-lat').value) || null,
    lng: parseFloat(r.querySelector('.cp-lng').value) || null
  }));

  const data = {
    trackingID: tid,
    userUID: document.getElementById('aUserSelect').value,
    recipientName: document.getElementById('aRecipName').value,
    recipientEmail: document.getElementById('aRecipEmail').value,
    origin: document.getElementById('aOrigin').value,
    destination: document.getElementById('aDest').value,
    weight: document.getElementById('aWeight').value,
    dimensions: document.getElementById('aDimensions').value,
    packageType: document.getElementById('aPkgType').value,
    status: document.getElementById('aStatus').value,
    estimatedDelivery: document.getElementById('aDelivery').value,
    checkpoints,
    updatedAt: serverTimestamp()
  };

  try {
    if (editingShipID) {
      await updateDoc(doc(db, 'shipments', editingShipID), data);
      suc.textContent = 'Shipment updated!';
    } else {
      const ref = doc(collection(db, 'shipments'));
      data.id = ref.id; data.createdAt = serverTimestamp();
      await setDoc(ref, data);
      suc.textContent = `Shipment created! Tracking ID: ${tid}`;
    }
    suc.style.display = 'block';
    const { errors, stale } = await refreshAdminData();
    renderAdminOverview(errors, stale);
  } catch (e) {
    err.textContent = e.message; err.style.display = 'block';
  }

  btn.textContent = editingShipID ? 'Save Changes' : 'Create Shipment';
  btn.disabled = false;
};

// ─── HELPERS ────────────────────────────────────────────────
// ─── CONTACT ────────────────────────────────────────────────
// Keep the address shown on the contact page in sync with firebase-config.js.
function initContactLinks() {
  const email = 'metaprizes@protonmail.com'
  const mailto = `mailto:${email}`;
  ['contactEmail', 'contactMailto'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.href = mailto; el.textContent = email; }
  });
}
window.addEventListener('DOMContentLoaded', initContactLinks);

window.submitContact = async function () {
  const btn = document.getElementById('contactBtn');
  const suc = document.getElementById('contactSuccess');
  const err = document.getElementById('contactErr');
  suc.style.display = 'none';
  err.textContent = '';
  err.style.display = 'none';

  const get = id => document.getElementById(id).value.trim();
  const name      = get('cName');
  const email     = get('cEmail');
  const trackingID= get('cTracking');
  const subject   = get('cSubject');
  const message   = get('cMessage');

  if (!name || !email || !message) {
    err.textContent = 'Please fill in your name, email address and message.';
    err.style.display = 'block';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    err.textContent = 'Please enter a valid email address.';
    err.style.display = 'block';
    return;
  }

  btn.textContent = 'Sending…';
  btn.disabled = true;

  try {
    const ref = doc(collection(db, 'contactMessages'));
    await setDoc(ref, {
      id: ref.id,
      name,
      email,
      trackingID: trackingID || null,
      subject: subject || '(no subject)',
      message,
      userUID: currentUser ? currentUser.uid : null,
      status: 'new',
      createdAt: serverTimestamp()
    });

    ['cName', 'cEmail', 'cTracking', 'cSubject', 'cMessage']
      .forEach(id => { document.getElementById(id).value = ''; });
    suc.textContent = `Thanks ${name}! Your message has been sent — we'll reply to ${email}.`;
    suc.style.display = 'block';
  } catch (e) {
    // Writing failed (e.g. security rules) — give the visitor a working fallback.
    err.textContent = `Sorry, your message could not be sent (${e.message}). Please email us directly at `;
    const link = document.createElement('a');
    link.href = `mailto:${ADMIN_EMAIL}`;
    link.textContent = ADMIN_EMAIL;
    link.style.color = 'inherit';
    err.appendChild(link);
    err.style.display = 'block';
  }

  btn.textContent = 'Send Message';
  btn.disabled = false;
};

function revealAll() {
  document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .stagger-item')
    .forEach(el => el.classList.add('active'));
}

function initScrollReveal() {
  // No IntersectionObserver support -> just show everything.
  if (!('IntersectionObserver' in window)) { revealAll(); return; }

  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
        // Handle staggered children if it's a grid/container
        const staggered = entry.target.querySelectorAll('.stagger-item');
        staggered.forEach((item, index) => {
          setTimeout(() => {
            item.classList.add('active');
          }, index * 100);
        });
      }
    });
  }, observerOptions);

  document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach(el => {
    observer.observe(el);
    // Already within the viewport at load time? Show it immediately.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) el.classList.add('active');
  });

  // Safety net: never leave content permanently hidden.
  setTimeout(revealAll, 1200);
}

// Call on load and on navigation
window.addEventListener('DOMContentLoaded', initScrollReveal);
const originalNavigate = window.navigate;
window.navigate = function (page) {
  originalNavigate(page);
  setTimeout(initScrollReveal, 100);
};

function generateTrackingID() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return 'SHIP-' + Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function statusBadgeClass(s) {
  const map = {
    'Pending': 'badge-pending', 'In Transit': 'badge-transit',
    'Out for Delivery': 'badge-delivery', 'Delivered': 'badge-delivered', 'Returned': 'badge-returned'
  };
  return map[s] || 'badge-pending';
}

function statusIcon(status) {
  const icons = {
    'Pending': '🕐', 'In Transit': '🚢', 'Arrived at Hub': '🏭',
    'Out for Delivery': '🚚', 'Delivered': '✅', 'Returned': '↩️',
    'Customs Clearance': '🛃', 'Departed': '✈️', 'On Hold': '⏸️'
  };
  return icons[status] || '📍';
}

function updateCountdown(deliveryDateStr, el) {
  const now = new Date();
  const delivery = new Date(deliveryDateStr);
  const diff = delivery - now;
  if (diff <= 0) { el.innerHTML = '<span class="countdown-delivered">Due Today / Overdue</span>'; return; }
  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  el.textContent = days > 0
    ? `${days}d ${hrs}h ${mins}m`
    : `${hrs}h ${mins}m ${secs}s`;
}

// Close modal on outside click
// Close modal on outside click
document.getElementById('editUserModal').addEventListener('click', function (e) {
  if (e.target === this) closeModal();
});

// ─── MOBILE NAV ─────────────────────────────────────────────
// The hamburger button (#navToggle) only shows on small screens - see the
// 900px breakpoint in css/styles.css. updateNav() re-renders the links inside
// #navLinks, so the open/closed state is tracked on that container instead of
// on the individual links.
function closeNav() {
  const links = document.getElementById('navLinks');
  const toggle = document.getElementById('navToggle');
  if (links) links.classList.remove('open');
  if (toggle) {
    toggle.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }
}

window.toggleNav = function () {
  const links = document.getElementById('navLinks');
  const toggle = document.getElementById('navToggle');
  if (!links || !toggle) return;
  const isOpen = links.classList.toggle('open');
  toggle.classList.toggle('open', isOpen);
  toggle.setAttribute('aria-expanded', String(isOpen));
};

// Tapping outside the menu closes it. Clicks on a link are left alone so
// navigate() can run first - it closes the menu through updateNav().
document.addEventListener('click', e => {
  const links = document.getElementById('navLinks');
  const toggle = document.getElementById('navToggle');
  if (!links || !links.classList.contains('open')) return;
  if (links.contains(e.target) || (toggle && toggle.contains(e.target))) return;
  closeNav();
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNav(); });

window.addEventListener('resize', () => { if (window.innerWidth > 900) closeNav(); });

