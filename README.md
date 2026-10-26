# Java Maryland container tracker

Operations API for the Java Maryland container dashboard. One company, two sign-in accounts. Staff update destination, carrier, appointments, and delivered dates. A tracking feed refreshes shipment data three times a day.

## Requirements

- Node.js 22 or newer
- PostgreSQL 16
- Redis 7

## Setup

```bash
cp .env.example .env
npm install
docker compose up -d
npx prisma generate
npx prisma migrate deploy
npm run seed
npm run start:dev
```

Run those Prisma commands from this folder after `npm install`, so they use Prisma 7 from this project. Node.js 22 is required.

The API listens on `PORT` from `.env`. The local file uses `4003`.

`docker compose` starts Postgres (`postgres` / `root`, database `container_tracker`) and Redis. Point `DATABASE_URL` at that database.

## Accounts

`npm run seed` creates each account only when that email is missing. It does not reset an existing password.

| Role | Email | Password |
|---|---|---|
| `SUPER_ADMIN` | `admin@javamaryland.com` | `Admin@123456` |
| `STAFF` | `staff@javamaryland.com` | `Staff@123456` |

Both roles can sign in and use the container and settings routes. Change these passwords before any shared deploy. Override them with `SEED_ADMIN_*` and `SEED_STAFF_*` in `.env`.

## Sign in

```http
POST /api/login
Content-Type: application/json

{ "email": "staff@javamaryland.com", "password": "Staff@123456" }
```

`POST /api/auth/login` is the same login. The response `accessToken` lasts for `JWT_ACCESS_EXPIRES_IN` (7 days in the local `.env`). Send it on later requests:

```http
Authorization: Bearer <accessToken>
```

Login is limited to 5 attempts per minute. Other routes are limited to 100 requests per minute.

`GET /api/auth/me` returns the signed-in user.

## Containers

Tracking fields (status, vessel, port, free time, gate dates, history) come from the feed. A refresh never overwrites staff fields: destination, carrier, appointment, delivered date, notes, driver, truck number, receiving contact, phone, and delivery address.

A container stays in the database after the first successful save, even if a later refresh no longer returns it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/containers/summary` | Dashboard counts and the last refresh |
| `GET` | `/api/containers` | Paginated list. Query: `view`, `bucket`, `search`, `page`, `perPage` |
| `GET` | `/api/containers/:containerNumber` | One container, including the timeline |
| `PATCH` | `/api/containers/:containerNumber` | Save staff fields. Empty string clears a field |
| `GET` | `/api/containers/export` | Download `containers.xlsx`. Same `search` and `bucket` filters as the list |
| `POST` | `/api/containers/sync` | Refresh from the tracking feed now |

`view` is `arrived`, `in_transit`, or `delivered`.

`bucket` is `all`, `open`, `at_origin`, `on_water`, `not_collected`, `at_warehouse`, `dehired`, `delivered`, `overdue`, or `no_destination`.

If both `view` and `bucket` are omitted, the saved default view is used. **Active** opens the arrived/open list. **All containers** opens every row. Red rows are sorted first.

A row is delivered only when destination, carrier, and delivered date are all saved.

```json
{
  "destination": "Commerce, TX",
  "carrier": "Triangle Freight",
  "appointmentAt": "10/25/2026",
  "deliveredAt": "10/22/2026",
  "markDelivered": true,
  "driverName": "James",
  "truckNumber": "T-14",
  "receivingContact": "Dock office",
  "contactPhone": "410-555-0100",
  "deliveryAddress": "100 Warehouse Rd",
  "notes": "Call before arrival"
}
```

`markDelivered: true` with no `deliveredAt` sets the delivered date to today. Dates accept `YYYY-MM-DD` or `M/D/YYYY`.

When email updates are on, a real staff-field change is emailed. A failed refresh keeps the last saved containers and emails an alert.

The feed also refreshes by itself at 6:00, 14:00, and 22:00 America/New_York while the API process is running.

## Settings

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/settings` | Preferences, mail status, and alert address |
| `PATCH` | `/api/settings` | Save preferences |
| `POST` | `/api/settings/reset` | Restore defaults |
| `POST` | `/api/settings/test-email` | Send a test message to the alert inbox |

```json
{
  "emailUpdates": true,
  "compactTable": false,
  "defaultView": "Active"
}
```

`defaultView` is `Active` or `All containers`. Defaults are email updates on, compact rows off, and Active containers.

## Mail

Set these in `.env` before alerts can leave the server:

```
APP_NAME=Java Maryland
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_FROM_ADDRESS=
MAIL_FROM_NAME="${APP_NAME}"
ALERT_EMAIL_TO=
```

`ALERT_EMAIL_TO` is the inbox for delivery updates and failed refreshes. When it is empty, mail goes to `MAIL_FROM_ADDRESS`.

## Other routes

| Method | Path | Auth | What it does |
|---|---|---|---|
| `GET` | `/` | No | Server status page |
| `GET` | `/api/health` | No | Database and Redis check |

## Scripts

| Command | What it does |
|---|---|
| `npm run start:dev` | API with reload |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled API |
| `npm run prisma:migrate` | Apply migrations |
| `npm run seed` | Create the super admin and staff accounts |
