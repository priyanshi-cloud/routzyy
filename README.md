# Routzy

Routzy is a smart college transport management system for live campus bus tracking.

## Live Project

**Working deployment:** https://routzyy.onrender.com

The deployed project uses HTTPS and Node.js 22.

> The free Render instance may sleep after inactivity. Opening the link may take up to 50 seconds to start the app.

## Demo Accounts

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `Routzy@123` |
| Student | `student` | `Student@123` |
| Driver | `driver` | `Driver@123` |

These are demo credentials for the college project only.

## Demo Workflow

1. Open the live project and select **Sign in**.
2. Sign in with the **Admin** account to review buses, routes, drivers, and students.
3. Open another browser window or browser profile and sign in with the **Driver** account.
4. Start GPS tracking and allow location permission.
5. Open another window or browser profile and sign in with the **Student** account.
6. Open **Live Tracking** to receive the driver's latest bus location through Socket.IO.
7. Return to the Admin dashboard and view the latest bus status and timestamp.

## Features

- Admin dashboard for transport management
- Driver dashboard for GPS location sharing
- Student dashboard for live route and bus tracking
- Admin, student, and driver authentication
- SQLite database with seeded demo data
- Socket.IO live-location updates
- OpenStreetMap and Leaflet map interface
- Responsive web interface

## Technology Stack

- HTML, CSS, and vanilla JavaScript
- Node.js
- Express
- SQLite with `better-sqlite3`
- Socket.IO
- Express sessions
- bcrypt password hashing
- Leaflet and OpenStreetMap

## Requirements

- Node.js 22 is recommended
- npm
- Internet access for map tiles and hosted fonts

## Run Locally

```bash
cd routzy
npm install
npm start
```

Open: http://localhost:3000

The SQLite database is created automatically at `data/routzy.sqlite`. Starting with an empty users table seeds the demo accounts and sample route.

## Environment Variables

| Variable | Purpose |
|---|---|
| `PORT` | Optional local server port. Render provides this automatically. |
| `SESSION_SECRET` | Secret used to sign session cookies. Use a long random value in production. |

For local use, `.env` can contain:

```env
PORT=3000
SESSION_SECRET=replace-with-a-long-random-secret
```

Do not commit `.env` or real credentials.

## Deploy on Render

1. Fork or push this repository to GitHub.
2. Sign in to Render and create a **New Web Service**.
3. Connect this GitHub repository.
4. Use:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Node version:** `22`
5. Add `SESSION_SECRET` as an environment variable and generate a random value.
6. Deploy the service.

A `render.yaml` file is included for Blueprint deployment.

## Reset Demo Data

Stop the server and delete:

```text
data/routzy.sqlite
```

Restart the server to recreate the schema and demo records. This permanently deletes local changes and assignments.

## GPS Testing

Browser location sharing requires permission and works on HTTPS or localhost. GPS is active while the driver page remains open; it is not background tracking.

## MVP Limitations

- SQLite storage is ephemeral on Render's free plan unless persistent storage or an external database is configured.
- Free Render instances spin down after inactivity.
- Free hosting does not provide a persistent disk.
- Distance to a pickup stop is a straight-line distance, not road distance.
- No routing engine, push notifications, CSV reports, or background GPS tracking are included.
- Session storage uses Express's in-memory store and is intended for local/demo use.
- Sample route coordinates and names are illustrative and should be replaced with real college information.

## Project Structure

```text
routzy/
├── database.js
├── package.json
├── render.yaml
├── schema.sql
├── server.js
├── public/
│   ├── admin.html
│   ├── driver.html
│   ├── index.html
│   ├── login.html
│   ├── student.html
│   ├── script.js
│   └── style.css
└── data/
```
