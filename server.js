require('dotenv').config();
const express = require('express');
const session = require('express-session');
const http = require('http');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: 'routzy.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

function safeUser(user) {
  return { id: user.id, username: user.username, role: user.role, fullName: user.full_name, email: user.email };
}
function auth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in.' });
  next();
}
function role(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Please log in.' });
    if (!roles.includes(req.session.user.role)) return res.status(403).json({ error: 'You do not have permission for this action.' });
    next();
  };
}
function busForDriver(userId) {
  return db.prepare('SELECT * FROM buses WHERE driver_id = ?').get(userId);
}
function studentData(userId) {
  return db.prepare(`
    SELECT u.id, u.full_name, u.username, b.id AS bus_id, b.bus_number,
      r.name AS route_name, p.name AS pickup_name, p.latitude AS pickup_lat, p.longitude AS pickup_lng,
      d.name AS dropoff_name, d.latitude AS dropoff_lat, d.longitude AS dropoff_lng,
      l.latitude AS bus_lat, l.longitude AS bus_lng, l.recorded_at
    FROM users u
    LEFT JOIN student_assignments a ON a.student_id = u.id
    LEFT JOIN buses b ON b.id = a.bus_id
    LEFT JOIN routes r ON r.id = b.route_id
    LEFT JOIN stops p ON p.id = a.pickup_stop_id
    LEFT JOIN stops d ON d.id = a.dropoff_stop_id
    LEFT JOIN locations l ON l.bus_id = b.id
    WHERE u.id = ? AND u.role = 'student'
  `).get(userId);
}
function busState(recordedAt) {
  if (!recordedAt) return 'offline';
  const age = Date.now() - new Date(recordedAt + (recordedAt.endsWith('Z') ? '' : 'Z')).getTime();
  return age < 120000 ? 'live' : 'stale';
}
function dashboardBus(row) {
  return { ...row, tracking_status: busState(row.recorded_at) };
}

app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));
app.post('/api/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!username || !password) return res.status(400).json({ error: 'Enter your username and password.' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Incorrect username or password.' });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not create a session.' });
    req.session.user = safeUser(user);
    res.json({ user: req.session.user });
  });
});
app.post('/api/logout', auth, (req, res) => req.session.destroy(() => {
  res.clearCookie('routzy.sid');
  res.json({ ok: true });
}));

app.get('/api/student/dashboard', role('student'), (req, res) => {
  const data = studentData(req.session.user.id);
  if (!data) return res.status(404).json({ error: 'Student profile not found.' });
  res.json({ student: data, tracking_status: busState(data.recorded_at) });
});

app.get('/api/driver/dashboard', role('driver'), (req, res) => {
  const bus = db.prepare(`
    SELECT b.id, b.bus_number, r.name AS route_name
    FROM buses b LEFT JOIN routes r ON r.id = b.route_id WHERE b.driver_id = ?
  `).get(req.session.user.id);
  const location = bus ? db.prepare('SELECT latitude, longitude, recorded_at FROM locations WHERE bus_id = ?').get(bus.id) : null;
  res.json({ bus: bus || null, location: location ? { ...location, tracking_status: busState(location.recorded_at) } : null });
});

app.post('/api/driver/location', role('driver'), (req, res) => {
  const bus = busForDriver(req.session.user.id);
  if (!bus) return res.status(400).json({ error: 'No bus is assigned to this driver.' });
  const latitude = Number(req.body.latitude);
  const longitude = Number(req.body.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Invalid GPS coordinates.' });
  }
  const recordedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO locations (bus_id, latitude, longitude, recorded_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(bus_id) DO UPDATE SET latitude=excluded.latitude, longitude=excluded.longitude, recorded_at=excluded.recorded_at
  `).run(bus.id, latitude, longitude, recordedAt);
  const payload = { bus_id: bus.id, bus_number: bus.bus_number, latitude, longitude, recorded_at: recordedAt, tracking_status: 'live' };
  io.to(`bus:${bus.id}`).emit('bus:location', payload);
  io.to('admins').emit('bus:location', payload);
  res.json({ ok: true, location: payload });
});

app.get('/api/admin/summary', role('admin'), (req, res) => {
  const counts = {
    students: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='student'").get().n,
    drivers: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='driver'").get().n,
    buses: db.prepare('SELECT COUNT(*) AS n FROM buses').get().n,
    routes: db.prepare('SELECT COUNT(*) AS n FROM routes').get().n
  };
  const buses = db.prepare(`
    SELECT b.id, b.bus_number, r.name AS route_name, u.full_name AS driver_name,
      l.latitude, l.longitude, l.recorded_at
    FROM buses b LEFT JOIN routes r ON r.id=b.route_id
    LEFT JOIN users u ON u.id=b.driver_id LEFT JOIN locations l ON l.bus_id=b.id
    ORDER BY b.bus_number
  `).all().map(dashboardBus);
  res.json({ counts, buses });
});

app.get('/api/admin/:entity', role('admin'), (req, res) => {
  const queries = {
    students: `SELECT u.id, u.username, u.full_name, u.email, b.bus_number FROM users u LEFT JOIN student_assignments a ON a.student_id=u.id LEFT JOIN buses b ON b.id=a.bus_id WHERE u.role='student' ORDER BY u.full_name`,
    drivers: `SELECT u.id, u.username, u.full_name, u.email, b.bus_number FROM users u LEFT JOIN buses b ON b.driver_id=u.id WHERE u.role='driver' ORDER BY u.full_name`,
    buses: `SELECT b.id, b.bus_number, b.route_id, b.driver_id, r.name AS route_name, u.full_name AS driver_name FROM buses b LEFT JOIN routes r ON r.id=b.route_id LEFT JOIN users u ON u.id=b.driver_id ORDER BY b.bus_number`,
    routes: `SELECT id, name, description FROM routes ORDER BY name`,
    stops: `SELECT s.id, s.name, s.route_id, s.latitude, s.longitude, s.stop_order, r.name AS route_name FROM stops s JOIN routes r ON r.id=s.route_id ORDER BY r.name, s.stop_order`
  };
  if (!queries[req.params.entity]) return res.status(404).json({ error: 'Unknown entity.' });
  res.json({ items: db.prepare(queries[req.params.entity]).all() });
});

app.post('/api/admin/:entity', role('admin'), (req, res) => {
  const b = req.body;
  try {
    let result;
    if (req.params.entity === 'students' || req.params.entity === 'drivers') {
      const entityRole = req.params.entity === 'students' ? 'student' : 'driver';
      if (!b.username || !b.password || !b.full_name) return res.status(400).json({ error: 'Name, username, and password are required.' });
      const info = db.prepare('INSERT INTO users (username,password_hash,role,full_name,email) VALUES (?,?,?,?,?)')
        .run(String(b.username).trim(), bcrypt.hashSync(String(b.password), 10), entityRole, String(b.full_name).trim(), b.email ? String(b.email).trim() : null);
      if (entityRole === 'student') db.prepare('INSERT INTO student_assignments (student_id,bus_id,pickup_stop_id,dropoff_stop_id) VALUES (?,NULL,NULL,NULL)').run(info.lastInsertRowid);
      result = { id: Number(info.lastInsertRowid) };
    } else if (req.params.entity === 'buses') {
      if (!b.bus_number) return res.status(400).json({ error: 'Bus number is required.' });
      const info = db.prepare('INSERT INTO buses (bus_number,route_id,driver_id) VALUES (?,?,?)')
        .run(String(b.bus_number).trim(), b.route_id ? Number(b.route_id) : null, b.driver_id ? Number(b.driver_id) : null);
      result = { id: Number(info.lastInsertRowid) };
    } else if (req.params.entity === 'routes') {
      if (!b.name) return res.status(400).json({ error: 'Route name is required.' });
      const info = db.prepare('INSERT INTO routes (name,description) VALUES (?,?)').run(String(b.name).trim(), String(b.description || ''));
      result = { id: Number(info.lastInsertRowid) };
    } else if (req.params.entity === 'stops') {
      if (!b.name || !b.route_id) return res.status(400).json({ error: 'Stop name and route are required.' });
      const lat = b.latitude === '' || b.latitude == null ? null : Number(b.latitude);
      const lng = b.longitude === '' || b.longitude == null ? null : Number(b.longitude);
      if ((lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) || (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180))) return res.status(400).json({ error: 'Invalid coordinates.' });
      const info = db.prepare('INSERT INTO stops (route_id,name,latitude,longitude,stop_order) VALUES (?,?,?,?,?)')
        .run(Number(b.route_id), String(b.name).trim(), lat, lng, Number(b.stop_order || 1));
      result = { id: Number(info.lastInsertRowid) };
    } else return res.status(404).json({ error: 'Unknown entity.' });
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    if (String(error.code || '').startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'That record conflicts with existing data or an invalid assignment.' });
    console.error('Admin create error:', error.message);
    res.status(500).json({ error: 'Could not create record.' });
  }
});

app.put('/api/admin/:entity/:id', role('admin'), (req, res) => {
  const id = Number(req.params.id), b = req.body;
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid record ID.' });
  try {
    let info;
    if (req.params.entity === 'buses') {
      info = db.prepare('UPDATE buses SET bus_number=?, route_id=?, driver_id=? WHERE id=?').run(String(b.bus_number || '').trim(), b.route_id ? Number(b.route_id) : null, b.driver_id ? Number(b.driver_id) : null, id);
    } else if (req.params.entity === 'routes') {
      info = db.prepare('UPDATE routes SET name=?, description=? WHERE id=?').run(String(b.name || '').trim(), String(b.description || ''), id);
    } else if (['students','drivers'].includes(req.params.entity)) {
      const expectedRole = req.params.entity === 'students' ? 'student' : 'driver';
      info = db.prepare('UPDATE users SET full_name=?, email=? WHERE id=? AND role=?').run(String(b.full_name || '').trim(), b.email ? String(b.email).trim() : null, id, expectedRole);
      if (req.params.entity === 'students' && b.bus_id !== undefined) {
        db.prepare('INSERT INTO student_assignments (student_id,bus_id,pickup_stop_id,dropoff_stop_id) VALUES (?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET bus_id=excluded.bus_id,pickup_stop_id=excluded.pickup_stop_id,dropoff_stop_id=excluded.dropoff_stop_id')
          .run(id, b.bus_id ? Number(b.bus_id) : null, b.pickup_stop_id ? Number(b.pickup_stop_id) : null, b.dropoff_stop_id ? Number(b.dropoff_stop_id) : null);
      }
    } else if (req.params.entity === 'stops') {
      info = db.prepare('UPDATE stops SET name=?, route_id=?, latitude=?, longitude=?, stop_order=? WHERE id=?')
        .run(String(b.name || '').trim(), Number(b.route_id), b.latitude === '' || b.latitude == null ? null : Number(b.latitude), b.longitude === '' || b.longitude == null ? null : Number(b.longitude), Number(b.stop_order || 1), id);
    } else return res.status(404).json({ error: 'Unknown entity.' });
    if (!info.changes) return res.status(404).json({ error: 'Record not found.' });
    res.json({ ok: true });
  } catch (error) {
    if (String(error.code || '').startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'That update conflicts with existing data.' });
    res.status(500).json({ error: 'Could not update record.' });
  }
});

app.delete('/api/admin/:entity/:id', role('admin'), (req, res) => {
  const tables = { students: "DELETE FROM users WHERE id=? AND role='student'", drivers: "DELETE FROM users WHERE id=? AND role='driver'", buses: 'DELETE FROM buses WHERE id=?', routes: 'DELETE FROM routes WHERE id=?', stops: 'DELETE FROM stops WHERE id=?' };
  const query = tables[req.params.entity];
  if (!query) return res.status(404).json({ error: 'Unknown entity.' });
  const info = db.prepare(query).run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'Record not found.' });
  res.json({ ok: true });
});

io.use((socket, next) => {
  const req = socket.request;
  const user = req.session && req.session.user;
  if (!user) return next(new Error('Authentication required'));
  socket.user = user;
  next();
});
io.on('connection', socket => {
  const user = socket.user;
  if (user.role === 'admin') socket.join('admins');
  if (user.role === 'student') {
    const row = studentData(user.id);
    if (row && row.bus_id) socket.join(`bus:${row.bus_id}`);
  }
  if (user.role === 'driver') {
    const bus = busForDriver(user.id);
    if (bus) socket.join(`bus:${bus.id}`);
  }
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: 'Unexpected server error.' });
});

server.listen(PORT, () => {
  console.log(`Routzy is running at http://localhost:${PORT}`);
  console.log('Demo accounts: admin / Routzy@123, student / Student@123, driver / Driver@123');
});
