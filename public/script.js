(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
      ...options
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      if (response.status === 401) { window.location.href = '/login.html'; }
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
  };
  const showMessage = (node, text, error = false) => {
    if (!node) return;
    node.textContent = text || '';
    node.classList.toggle('error', error);
    node.classList.toggle('toast', Boolean(text) && !node.matches('.form-message'));
  };
  const setDate = () => {
    const node = $('#today-date');
    if (node) node.textContent = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
  };
  const logout = async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch {}
    window.location.href = '/login.html';
  };
  $$('[data-logout]').forEach(button => button.addEventListener('click', logout));

  const loginForm = $('#login-form');
  if (loginForm) {
    $('#toggle-password')?.addEventListener('click', () => {
      const input = $('#password');
      input.type = input.type === 'password' ? 'text' : 'password';
      $('#toggle-password').textContent = input.type === 'password' ? 'Show' : 'Hide';
    });
    $$('.demo-login').forEach(button => button.addEventListener('click', () => {
      $('#username').value = button.dataset.user;
      $('#password').value = button.dataset.pass;
      $('#login-error').textContent = '';
      $('#username').focus();
    }));
    loginForm.addEventListener('submit', async event => {
      event.preventDefault();
      const error = $('#login-error');
      error.textContent = '';
      const submit = $('.login-submit');
      submit.disabled = true;
      submit.innerHTML = 'Signing in…';
      try {
        const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ username: $('#username').value, password: $('#password').value }) });
        window.location.href = `/${result.user.role}.html`;
      } catch (err) {
        error.textContent = err.message;
        submit.disabled = false;
        submit.innerHTML = 'Sign in <span>↗</span>';
      }
    });
  }

  async function protectPage(expectedRole) {
    try {
      const { user } = await api('/api/me');
      if (!user) { window.location.href = '/login.html'; return null; }
      if (user.role !== expectedRole) { window.location.href = `/${user.role}.html`; return null; }
      $$('[data-user-name]').forEach(node => node.textContent = user.fullName);
      setDate();
      return user;
    } catch { window.location.href = '/login.html'; return null; }
  }

  const page = document.body.dataset.page;
  if (page === 'student') initStudent();
  if (page === 'driver') initDriver();
  if (page === 'admin') initAdmin();

  async function initStudent() {
    const user = await protectPage('student');
    if (!user) return;
    let map, busMarker, pickupMarker, busId = null, currentBus = null;
    const defaultCenter = [22.7196, 75.8577];
    if (window.L && $('#student-map')) {
      map = L.map('student-map', { zoomControl: true }).setView(defaultCenter, 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
      const busIcon = L.divIcon({ className: 'routzy-bus-icon', html: '<div style="width:34px;height:34px;display:grid;place-items:center;border:3px solid white;border-radius:11px 11px 11px 3px;background:#173b32;color:white;box-shadow:0 3px 12px #173b3240;font-size:17px">↗</div>', iconSize: [34,34], iconAnchor: [17,17] });
      const stopIcon = L.divIcon({ className: 'routzy-stop-icon', html: '<div style="width:17px;height:17px;border:4px solid white;border-radius:50%;background:#d4a45e;box-shadow:0 2px 7px #3334"></div>', iconSize: [17,17], iconAnchor: [8,8] });
      map._routzyBusIcon = busIcon; map._routzyStopIcon = stopIcon;
    } else if ($('#student-map')) $('#student-map').innerHTML = '<p style="padding:24px">Map library unavailable. Check your internet connection.</p>';

    function updateLocation(location) {
      if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) return;
      currentBus = location;
      const point = [Number(location.latitude), Number(location.longitude)];
      if (map) {
        if (!busMarker) busMarker = L.marker(point, { icon: map._routzyBusIcon }).addTo(map).bindPopup('Latest bus location');
        else busMarker.setLatLng(point);
        if (pickupMarker) map.fitBounds(L.latLngBounds([point, pickupMarker.getLatLng()]).pad(.25), { maxZoom: 15 });
        else map.setView(point, 14);
      }
      $('#student-status').textContent = 'Live';
      $('#student-status-dot').className = 'status-dot live';
      $('#map-live-badge').classList.add('is-live');
      $('#map-live-badge').innerHTML = '<i></i> Live GPS update';
      $('#student-last-update').textContent = 'Updated ' + new Date(location.recorded_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      $('#student-location-note').textContent = 'A recent GPS update was received. The marker shows the last location sent by the driver.';
      if (pickupMarker) {
        const km = haversine(point[0], point[1], pickupMarker.getLatLng().lat, pickupMarker.getLatLng().lng);
        $('#student-distance').textContent = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
      }
    }
    try {
      const { student, tracking_status } = await api('/api/student/dashboard');
      busId = student.bus_id;
      $('#student-bus-number').textContent = student.bus_number || 'Not assigned';
      $('#student-route').textContent = student.route_name || 'No route assigned';
      $('#student-pickup').textContent = student.pickup_name || 'Not assigned';
      $('#student-dropoff').textContent = student.dropoff_name || 'Not assigned';
      $('#student-pickup-coords').textContent = student.pickup_lat != null && student.pickup_lng != null ? 'Pickup stop coordinates available' : 'Pickup coordinates not configured';
      if (map && student.pickup_lat != null && student.pickup_lng != null) {
        pickupMarker = L.marker([student.pickup_lat, student.pickup_lng], { icon: map._routzyStopIcon }).addTo(map).bindPopup(escapeHTML(student.pickup_name || 'Pickup stop'));
        map.setView([student.pickup_lat, student.pickup_lng], 12);
      }
      if (student.bus_lat != null && student.bus_lng != null) {
        updateLocation({ latitude: student.bus_lat, longitude: student.bus_lng, recorded_at: student.recorded_at });
        if (tracking_status !== 'live') markTracking(tracking_status, student.recorded_at);
      } else {
        $('#student-status').textContent = 'Offline';
        $('#student-status-dot').className = 'status-dot offline';
        $('#student-last-update').textContent = 'No GPS update received';
        $('#map-live-badge').innerHTML = '<i></i> Waiting for GPS';
        $('#student-location-note').textContent = student.bus_id ? 'The driver has not shared a GPS location yet. The map will update when tracking starts.' : 'No bus is assigned to your account yet. Ask the transport administrator to assign one.';
      }
      if (!student.bus_id) {
        $('#student-distance').textContent = '—';
        if (map) map.setView(defaultCenter, 11);
      }
    } catch (error) { $('#student-location-note').textContent = error.message; }

    function markTracking(status, timestamp) {
      const label = status === 'stale' ? 'Stale' : 'Offline';
      $('#student-status').textContent = label;
      $('#student-status-dot').className = `status-dot ${status}`;
      $('#map-live-badge').classList.remove('is-live');
      $('#map-live-badge').innerHTML = '<i></i> ' + label + ' location';
      $('#student-last-update').textContent = timestamp ? 'Last update ' + new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No GPS update received';
      if (status === 'stale') $('#student-location-note').textContent = 'The last GPS update is over two minutes old. The bus marker may not reflect its current position.';
    }
    if (window.io) {
      try {
        const socket = io();
        socket.on('bus:location', location => { if (!busId || Number(location.bus_id) === Number(busId)) updateLocation(location); });
        socket.on('connect_error', () => {});
      } catch {}
    }
    setInterval(() => {
      if (currentBus && currentBus.recorded_at) {
        const age = Date.now() - new Date(currentBus.recorded_at).getTime();
        if (age > 120000) markTracking('stale', currentBus.recorded_at);
      }
    }, 15000);
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const rad = n => n * Math.PI / 180;
    const dLat = rad(lat2-lat1), dLon = rad(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  async function initDriver() {
    const user = await protectPage('driver');
    if (!user) return;
    let watchId = null, active = false, bus = null;
    const start = $('#start-tracking'), stop = $('#stop-tracking'), message = $('#driver-message');
    const updateStatus = (title, detail, isActive) => {
      $('#driver-gps-title').textContent = title;
      $('#driver-gps-message').textContent = detail;
      $('#driver-gps-icon').classList.toggle('active', Boolean(isActive));
    };
    function stopTracking(showText = true) {
      if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
      watchId = null; active = false;
      start.disabled = false; stop.disabled = true;
      updateStatus('Tracking is off', 'Location sharing has stopped on this page.', false);
      if (showText) showMessage(message, 'GPS tracking stopped.');
    }
    try {
      const data = await api('/api/driver/dashboard');
      bus = data.bus;
      $('#driver-bus-number').textContent = bus?.bus_number || 'No bus assigned';
      $('#driver-route').textContent = bus?.route_name || 'Ask the admin to assign a route.';
      $('#driver-assignment-status').textContent = bus ? 'Assigned' : 'Unassigned';
      if (data.location) {
        $('#driver-last-update').textContent = new Date(data.location.recorded_at).toLocaleString();
        $('#driver-coordinates').textContent = `${Number(data.location.latitude).toFixed(5)}, ${Number(data.location.longitude).toFixed(5)}`;
      }
      if (!bus) {
        start.disabled = true;
        updateStatus('No bus assigned', 'The administrator must assign a bus before you can share GPS.', false);
      }
    } catch (error) { showMessage(message, error.message, true); }

    start.addEventListener('click', () => {
      message.textContent = '';
      if (!bus) { showMessage(message, 'No bus is assigned to this driver.', true); return; }
      if (!navigator.geolocation) { showMessage(message, 'This browser does not support geolocation.', true); return; }
      if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        showMessage(message, 'GPS requires HTTPS or localhost. Open this app through a secure connection on your phone.', true); return;
      }
      active = true; start.disabled = true; stop.disabled = false;
      updateStatus('Requesting GPS…', 'Allow location access in your browser when prompted.', true);
      showMessage(message, 'Waiting for a GPS fix…');
      watchId = navigator.geolocation.watchPosition(async position => {
        if (!active) return;
        const latitude = position.coords.latitude, longitude = position.coords.longitude;
        $('#driver-coordinates').textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        try {
          const result = await api('/api/driver/location', { method: 'POST', body: JSON.stringify({ latitude, longitude }) });
          $('#driver-last-update').textContent = new Date(result.location.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          updateStatus('Sharing your location', 'Your latest GPS position has been sent to Routzy.', true);
          showMessage(message, 'Location updated successfully.');
        } catch (error) {
          updateStatus('Update failed', error.message, false);
          showMessage(message, error.message, true);
        }
      }, error => {
        if (!active) return;
        const errors = { 1: 'Location permission was denied. Allow location access in browser settings.', 2: 'Your position is currently unavailable. Try moving outdoors or checking device location settings.', 3: 'GPS request timed out. Try again.' };
        updateStatus('GPS unavailable', errors[error.code] || 'Could not read your location.', false);
        showMessage(message, errors[error.code] || error.message, true);
        active = false; start.disabled = false; stop.disabled = true;
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    });
    stop.addEventListener('click', () => stopTracking());
    $$('[data-logout]').forEach(button => button.addEventListener('click', () => {
      if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    }));
    window.addEventListener('beforeunload', () => { if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId); });
  }

  async function initAdmin() {
    const user = await protectPage('admin');
    if (!user) return;
    let entity = 'buses', records = [], editing = null, routeOptions = [], busOptions = [], driverOptions = [], stopOptions = [];
    const head = $('#records-head'), body = $('#records-body'), modal = $('#record-modal'), form = $('#record-form'), fields = $('#record-fields');
    const entityLabels = { buses: 'Bus', students: 'Student', drivers: 'Driver', routes: 'Route', stops: 'Stop' };
    const configs = {
      buses: { columns: [['bus_number','Bus'],['route_name','Route'],['driver_name','Driver']], fields: [{name:'bus_number',label:'Bus number',required:true},{name:'route_id',label:'Route',type:'select',options:()=>routeOptions},{name:'driver_id',label:'Assigned driver',type:'select',options:()=>driverOptions}] },
      students: { columns: [['full_name','Name'],['username','Username'],['email','Email'],['bus_number','Assigned bus']], fields: [{name:'full_name',label:'Full name',required:true},{name:'username',label:'Username',required:true},{name:'email',label:'Email',type:'email'},{name:'password',label:'Initial password',required:true,type:'password'}] },
      drivers: { columns: [['full_name','Name'],['username','Username'],['email','Email'],['bus_number','Assigned bus']], fields: [{name:'full_name',label:'Full name',required:true},{name:'username',label:'Username',required:true},{name:'email',label:'Email',type:'email'},{name:'password',label:'Initial password',required:true,type:'password'}] },
      routes: { columns: [['name','Route name'],['description','Description']], fields: [{name:'name',label:'Route name',required:true},{name:'description',label:'Description',type:'text'}] },
      stops: { columns: [['name','Stop name'],['route_name','Route'],['latitude','Latitude'],['longitude','Longitude']], fields: [{name:'name',label:'Stop name',required:true},{name:'route_id',label:'Route',type:'select',options:()=>routeOptions},{name:'latitude',label:'Latitude',type:'number',step:'any'},{name:'longitude',label:'Longitude',type:'number',step:'any'},{name:'stop_order',label:'Stop order',type:'number',value:'1'}] }
    };
    async function loadOptions() {
      try {
        const [r,b,d,s] = await Promise.all([
          api('/api/admin/routes'), api('/api/admin/buses'), api('/api/admin/drivers'), api('/api/admin/stops')
        ]);
        routeOptions = r.items.map(x => ({ value:x.id, label:x.name }));
        busOptions = b.items.map(x => ({ value:x.id, label:x.bus_number }));
        driverOptions = d.items.map(x => ({ value:x.id, label:x.full_name }));
        stopOptions = s.items.map(x => ({ value:x.id, label:x.name }));
      } catch {}
    }
    async function loadSummary() {
      try {
        const { counts, buses } = await api('/api/admin/summary');
        $('#count-students').textContent = counts.students;
        $('#count-drivers').textContent = counts.drivers;
        $('#count-buses').textContent = counts.buses;
        $('#count-routes').textContent = counts.routes;
        $('#admin-bus-table').innerHTML = buses.length ? buses.map(bus => `<tr><td><strong>${escapeHTML(bus.bus_number)}</strong></td><td>${escapeHTML(bus.route_name || '—')}</td><td>${escapeHTML(bus.driver_name || 'Unassigned')}</td><td>${bus.recorded_at ? escapeHTML(new Date(bus.recorded_at).toLocaleString()) : 'No location yet'}</td><td><span class="status-pill ${escapeHTML(bus.tracking_status)}">${escapeHTML(bus.tracking_status)}</span></td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">No buses yet. Add one below.</td></tr>';
      } catch (error) { showMessage($('#admin-message'), error.message, true); }
    }
    async function loadRecords() {
      try {
        const result = await api(`/api/admin/${entity}`);
        records = result.items;
        renderRecords();
      } catch (error) { body.innerHTML = `<tr><td class="empty-cell">${escapeHTML(error.message)}</td></tr>`; }
    }
    function renderRecords() {
      const config = configs[entity];
      head.innerHTML = `<tr>${config.columns.map(col => `<th>${escapeHTML(col[1])}</th>`).join('')}<th>ACTIONS</th></tr>`;
      const query = ($('#record-search').value || '').toLowerCase();
      const filtered = records.filter(row => Object.values(row).some(value => String(value ?? '').toLowerCase().includes(query)));
      body.innerHTML = filtered.length ? filtered.map(row => `<tr>${config.columns.map(([key]) => `<td>${escapeHTML(row[key] ?? '—')}</td>`).join('')}<td><button class="table-action" data-edit="${row.id}">Edit</button><button class="table-action danger" data-delete="${row.id}">Delete</button></td></tr>`).join('') : `<tr><td colspan="${config.columns.length+1}" class="empty-cell">No matching records.</td></tr>`;
      $$('[data-edit]', body).forEach(button => button.addEventListener('click', () => openModal(Number(button.dataset.edit))));
      $$('[data-delete]', body).forEach(button => button.addEventListener('click', () => deleteRecord(Number(button.dataset.delete))));
    }
    function buildField(field, value = '') {
      const wrap = document.createElement('div');
      if (field.name === 'description' || field.name === 'email') wrap.classList.add('full-span');
      const label = document.createElement('label');
      label.htmlFor = `field-${field.name}`; label.textContent = field.label;
      let input;
      if (field.type === 'select') {
        input = document.createElement('select');
        const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Unassigned / select'; input.appendChild(empty);
        (field.options ? field.options() : []).forEach(option => { const o = document.createElement('option'); o.value = option.value; o.textContent = option.label; input.appendChild(o); });
      } else {
        input = document.createElement('input'); input.type = field.type || 'text';
        if (field.step) input.step = field.step;
        if (field.value) input.value = field.value;
      }
      input.id = `field-${field.name}`; input.name = field.name;
      if (field.required && !editing) input.required = true;
      if (field.required && editing && !['password','username'].includes(field.name)) input.required = true;
      if (field.name === 'password' && editing) { input.required = false; input.placeholder = 'Set only when creating a new account'; input.disabled = true; }
      if (value !== undefined && value !== null) input.value = value;
      wrap.append(label, input);
      return wrap;
    }
    function openModal(id = null) {
      editing = id;
      const record = id ? records.find(item => item.id === id) : null;
      $('#modal-title').textContent = `${id ? 'Edit' : 'Add'} ${entityLabels[entity].toLowerCase()}`;
      fields.innerHTML = '';
      configs[entity].fields.forEach(field => {
        const value = record ? (record[field.name] ?? '') : (field.value || '');
        fields.appendChild(buildField(field, value));
      });
      $('#modal-message').textContent = '';
      modal.hidden = false;
      const first = $('input,select', fields); if (first) first.focus();
    }
    function closeModal() { modal.hidden = true; editing = null; }
    async function deleteRecord(id) {
      const record = records.find(item => item.id === id);
      if (!confirm(`Delete this ${entityLabels[entity].toLowerCase()}${record?.name || record?.bus_number ? ` (${record.name || record.bus_number})` : ''}? This cannot be undone.`)) return;
      try {
        await api(`/api/admin/${entity}/${id}`, { method:'DELETE' });
        showMessage($('#admin-message'), 'Record deleted.');
        await loadOptions(); await loadRecords(); await loadSummary();
      } catch (error) { showMessage($('#admin-message'), error.message, true); }
    }
    $$('.record-tab').forEach(button => button.addEventListener('click', async () => {
      entity = button.dataset.entity;
      $$('.record-tab').forEach(tab => tab.classList.toggle('active', tab === button));
      $('#record-search').value = '';
      await loadOptions(); await loadRecords();
    }));
    $('#record-search').addEventListener('input', renderRecords);
    $('#add-record-button').addEventListener('click', () => openModal());
    $('#close-modal').addEventListener('click', closeModal);
    $('#cancel-modal').addEventListener('click', closeModal);
    modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
    $('#refresh-admin').addEventListener('click', async () => { await loadOptions(); await loadSummary(); await loadRecords(); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      Object.keys(data).forEach(key => { if (data[key] === '') data[key] = null; });
      const msg = $('#modal-message'); msg.textContent = '';
      try {
        if (editing) {
          if (['students','drivers'].includes(entity)) {
            const original = records.find(row => row.id === editing);
            data.username = original.username;
            delete data.password;
            await api(`/api/admin/${entity}/${editing}`, { method:'PUT', body:JSON.stringify(data) });
          } else await api(`/api/admin/${entity}/${editing}`, { method:'PUT', body:JSON.stringify(data) });
        } else {
          await api(`/api/admin/${entity}`, { method:'POST', body:JSON.stringify(data) });
        }
        closeModal(); showMessage($('#admin-message'), 'Changes saved successfully.');
        await loadOptions(); await loadRecords(); await loadSummary();
      } catch (error) { msg.textContent = error.message; }
    });
    if (window.io) {
      try { const socket = io(); socket.on('bus:location', () => loadSummary()); } catch {}
    }
    await loadOptions(); await loadSummary(); await loadRecords();
  }
})();
