# Routzy

Routzy is a simplified college transport management and live bus-tracking MVP built with HTML, CSS, vanilla JavaScript, Node.js, Express, SQLite, Socket.IO, and Leaflet/OpenStreetMap.

## Requirements
- Node.js 18 or newer (Node.js 20 LTS recommended)
- npm
- Internet connection for map tiles, Leaflet, and Google Fonts

## Run locally
1. Open this folder in a terminal.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Review `.env` and replace `SESSION_SECRET` with a long random value for anything beyond local demo use.
4. Start the server:

   ```bash
   npm start
   ```

5. Open http://localhost:3000

The SQLite database is created automatically in `data/routzy.sqlite`; first startup seeds demo records if the users table is empty.

## Demo accounts
- Admin: `admin` / `Routzy@123`
- Student: `student` / `Student@123`
- Driver: `driver` / `Driver@123`

These credentials are for local demonstration only. Change them before any shared or public deployment.

## Demo workflow
1. Sign in as Admin and review the seeded bus, route, driver, and student.
2. Open a separate browser profile/window and sign in as Driver.
3. Start GPS tracking and allow location permission. Keep the page open.
4. Sign in as Student in another separate session and open Live Tracking. The map receives location updates through Socket.IO.
5. Return to Admin and refresh Bus Status to inspect the latest location and timestamp.
6. Admin can add, edit, and delete records in the Manage Records section.

## Testing GPS on a phone
Browser GPS works on `localhost` and secure contexts such as HTTPS. For a physical phone, use a trusted HTTPS development tunnel or deploy to an HTTPS host; do not expose this development server publicly without proper deployment security. Grant location permission and keep the driver page open. The current MVP sends location while the page is active; it is not a background-tracking app.

## MVP limitations
- Distance is straight-line distance to the configured pickup stop, not road distance.
- No routing-engine ETA, push notifications, CSV reports, or background GPS tracking.
- Session storage uses Express's default in-memory store, appropriate only for a local demo. Configure a persistent session store and HTTPS cookies before deployment.
- The sample route and stops are illustrative demo data. Replace coordinates and names with your college's real route before presenting it as local information.
- OpenStreetMap tiles and CDN-hosted libraries require internet access.

## Reset demo data
Stop the server and delete `data/routzy.sqlite`. Start the server again; the database schema and demo records will be recreated. This permanently deletes local changes.
