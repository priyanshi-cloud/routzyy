# Routzy Project Status

## Current implementation
- [x] Express server and static frontend
- [x] SQLite schema and first-run demo seed
- [x] Password-hashed demo accounts and server-side session login/logout
- [x] Role-protected APIs for student, driver, and admin
- [x] Student dashboard with Leaflet map, latest location, tracking freshness, and straight-line pickup distance
- [x] Driver real browser GPS tracking start/stop and Socket.IO location broadcasts
- [x] Admin database-backed counts, bus monitoring, and basic CRUD for students, drivers, buses, routes, and stops
- [x] Shared responsive styling and setup/demo documentation

## Run
```bash
npm install
npm start
```
Then open http://localhost:3000.

## Demo accounts
- admin / Routzy@123
- student / Student@123
- driver / Driver@123

## Known limitations / verification
- This is an MVP for local demonstration, not a production deployment.
- Real GPS requires browser location permission and HTTPS or localhost.
- Map tiles and CDN assets need internet access.
- Session storage uses Express's default in-memory store.
- Demo route and stop coordinates are illustrative.
- Verify `npm install`, server startup, role logins, and real GPS in the local environment before presenting.
- ETA, road routing, push notifications, reports, and background GPS are intentionally omitted.

## Suggested next action
Run `npm install`, then `npm start`. Fix any install/runtime errors before adding optional features.
