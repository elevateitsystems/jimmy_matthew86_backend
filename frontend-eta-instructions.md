# Frontend: show the final-destination ETA

The API now returns the ETA to the final destination. While a container is still on the water or arriving, that date is the rail-facility ETA when the shipment continues inland. When the shipment ends at the discharge port, the date stays the port ETA.

Deploy this backend, run `npx prisma migrate deploy`, restart the API, and refresh shipments once. The list and detail screens already render `keyDateText`, so they pick up the new date from that refresh. The frontend change below keeps a UTC timestamp from shifting the calendar day.

## Fields

| Field | Use |
| --- | --- |
| `keyDateText` | Date string to show, already in the destination time zone. Example: `Nov 12, 2026`. |
| `keyDateLabel` | Label beside it: `ETA`, `Last free day`, `Empty returned`, and so on. |
| `daysLabel` | Relative text, such as `11 days away`. |
| `eta` | Final ETA as an ISO timestamp. Same instant as `keyDate` while the status is `On water / arriving`. |
| `etaAtDestination` | Rail ETA. Present only when there is an inland rail leg. |
| `etaAtTerminal` | Discharge-port ETA. Do not show this as the customer ETA. |
| `keyDateTimeZone` | IANA zone used to build `keyDateText`, such as `America/Chicago`. |

`lib/backend.ts` already maps these onto the container view:

- `dateText` comes from `keyDateText`
- `dateLabel` comes from `keyDateLabel`
- `daysText` comes from `daysLabel`

## Display

In the container table and on the detail page, render the API text:

```tsx
<span className="muted">{container.dateLabel}</span>
<br />
{container.dateText}
```

Leave the `keyDateText` mapping in `lib/backend.ts` as it is.

Do not pass `keyDate`, `eta`, or `etaAtTerminal` through `formatDate()`. That helper keeps the first 10 characters of the UTC timestamp. A Memphis time of 9:00 PM on Nov 12 is `2026-11-13T03:00:00.000Z`, so `formatDate()` would show **Nov 13**. `keyDateText` is **Nov 12, 2026**.

## Excel export

In `app/containers/page.tsx`, the Key date column currently formats `dateValue`. Use the text returned by the API:

```ts
'Key date': `${item.dateLabel}: ${item.dateText || '—'}`
```

## Check

1. Refresh shipments once after the API restart.
2. Open `CAAU2252335`. The port is Prince Rupert. The ETA on screen is **Nov 12, 2026**, and the port date Nov 3 stays in `etaAtTerminal`.
3. Open `HASU1322250`. It ends in Houston, so the ETA stays **Nov 10, 2026**.
