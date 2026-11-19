const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'routzy.sqlite'));
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;
  const addUser = db.prepare('INSERT INTO users (username, password_hash, role, full_name, email) VALUES (?, ?, ?, ?, ?)');
  const adminId = Number(addUser.run('admin', bcrypt.hashSync('Routzy@123', 10), 'admin', 'Routzy Administrator', 'admin@routzy.local').lastInsertRowid);
  const studentId = Number(addUser.run('student', bcrypt.hashSync('Student@123', 10), 'student', 'Aarav Sharma', 'student@routzy.local').lastInsertRowid);
  const driverId = Number(addUser.run('driver', bcrypt.hashSync('Driver@123', 10), 'driver', 'Ravi Patel', 'driver@routzy.local').lastInsertRowid);
  const routeId = Number(db.prepare('INSERT INTO routes (name, description) VALUES (?, ?)').run('Dewas–Campus Route', 'Demo route serving Dewas and the campus').lastInsertRowid);
  const stop = db.prepare('INSERT INTO stops (route_id, name, latitude, longitude, stop_order) VALUES (?, ?, ?, ?, ?)');
  const pickupId = Number(stop.run(routeId, 'Dewas Bus Stand', 22.965, 76.055, 1).lastInsertRowid);
  const dropoffId = Number(stop.run(routeId, 'Campus Gate', 22.626, 75.805, 2).lastInsertRowid);
  const busId = Number(db.prepare('INSERT INTO buses (bus_number, route_id, driver_id) VALUES (?, ?, ?)').run('RZ-01', routeId, driverId).lastInsertRowid);
  db.prepare('INSERT INTO student_assignments (student_id, bus_id, pickup_stop_id, dropoff_stop_id) VALUES (?, ?, ?, ?)').run(studentId, busId, pickupId, dropoffId);
}
seed();

module.exports = db;
