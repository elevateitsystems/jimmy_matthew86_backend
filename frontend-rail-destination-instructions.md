# Frontend: show the rail destination from the feed

Jimmy’s example is container **BMOU2460440**.

The ocean voyage ends at **Prince Rupert, BC**. The rail voyage ends at **Memphis**. Staff only type the leg after Memphis: collection from the Memphis rail ramp to the customer. Prince Rupert and Memphis both come from the tracking feed. Do not ask staff to type Memphis.

The live detail page already shows the rail ETA (**Nov 10, 2026**) and the status **At ocean terminal**. **Port · terminal** correctly shows **PRINCE RUPERT, BC · Fairview Container Terminal**. The gap is the line labeled **Final destination**, which says **Not yet entered**. That line is the empty staff field. The feed destination is already on the API as `finalDestinationName` and is not rendered.

The rail destination includes the state name from the feed. For this container it is `Memphis, Tennessee`. Ocean-only containers return `finalDestinationName: null`.

## Two different destinations

| What Jimmy means | API field | Who sets it | Where it belongs |
| --- | --- | --- | --- |
| Rail destination. Where the train delivers the container. Example: Memphis, Tennessee. | `finalDestinationName` | Tracking feed. Read only. | Summary on the detail page, and the list column that describes the rail destination. |
| Customer delivery after the rail ramp. The address his team collects to. | `destination` (saved as `user.destination`) | Staff, in the delivery form. | The editable form only. A refresh must never overwrite it. |

Do not copy `finalDestinationName` into `user.destination`. Saving Memphis into the staff field would make the container look like the customer delivery is done, and the next refresh must not own that field.

`port` / `portTerminal` stays the ocean port while the container is at Prince Rupert. The API already replaces `portTerminal` with the rail city once the status is **On rail** or **At rail terminal**. Keep using `container.port` for **Port · terminal**.

## API fields already returned

`GET /api/containers/BMOU2460440` and each row of `GET /api/containers` include:

```json
{
  "portTerminal": "PRINCE RUPERT, BC · Fairview Container Terminal",
  "finalDestinationName": "Memphis, Tennessee",
  "destination": null,
  "status": "AT_OCEAN_TERMINAL",
  "statusLabel": "At ocean terminal",
  "keyDateText": "Nov 10, 2026",
  "keyDateLabel": "ETA"
}
```

`finalDestinationName` is `null` when the feed has no inland rail city. Ocean containers that end at the discharge port have no rail destination. Show an em dash in that case. Do not fall back to the staff field in the read-only summary.

## 1. Map the field in `lib/backend.ts`

Inside `parseContainer`, the staff object is built today and the rail city is dropped:

```ts
const user: UserFields = {
  destination: text(staff.destination),
  // ...
};
```

Read the rail city from the same row and put it on the container object. Do not put it inside `user`.

```ts
const railDestination = text(row.finalDestinationName) || undefined;
```

Add it to the returned container, next to the other feed fields:

```ts
result.railDestination = railDestination;
```

Extend `BackendContainer` (or `OpenTrackRecord` if the result is spread from that type) with:

```ts
railDestination?: string;
```

`lib/data.ts` `UserFields.destination` stays the staff value. Do not add the rail city to `UserFields`.

## 2. Detail summary in `app/containers/[id]/page.tsx`

The read-only grid currently does this:

```tsx
<div className="info-label">Final destination</div>
<div className="info-value">{container.user.destination || 'Not yet entered'}</div>
```

Replace that block with the feed value:

```tsx
<div className="info-label">Rail destination</div>
<div className="info-value">{container.railDestination || '—'}</div>
```

Leave **Port · terminal** as `container.port`.

For **BMOU2460440** the summary then reads:

| Label | Value |
| --- | --- |
| Port · terminal | PRINCE RUPERT, BC · Fairview Container Terminal |
| Rail destination | Memphis, Tennessee |
| ETA | Nov 10, 2026 |

## 3. Keep the staff form, and rename it

The form under **Trucking & final destination** still edits `form.destination`. That is the customer stop after Memphis. Change the visible label so it is not the same words as the feed destination:

```tsx
<Field label="Customer delivery" value={form.destination} onChange={(v) => update('destination', v)} />
```

Change the section heading from **Trucking & final destination** to **Trucking & customer delivery**.

The PATCH body stays `destination`. `changedUserFields` and `staffPatch` already send `user.destination` as `destination`. Do not rename the JSON key.

Delivered status is unchanged: staff destination, carrier, and delivered date must all be saved. Memphis from the feed does not count as that staff destination.

## 4. List column in `components/shared.tsx`

The **Final destination** cell is:

```tsx
<td>{c.user.destination || '—'}</td>
```

Show the rail city from the feed in that column:

```tsx
<td>{c.railDestination || '—'}</td>
```

Rename the header from **Final destination** to **Rail destination**.

If the product also needs the typed customer stop in the table, add a separate column **Customer delivery** bound to `c.user.destination`. Do not combine the two strings in one cell.

## 5. Excel export in `lib/container-export.ts`

`containerExportRow` currently writes the staff field:

```ts
'Final destination': item.user.destination || '',
```

Write the feed city there, and keep the staff value under its own column:

```ts
'Rail destination': item.railDestination || '',
'Customer delivery': item.user.destination || '',
```

Update `lib/container-export.test.ts` so the expected headers and values match.

## 6. Do not change these

- Do not write `finalDestinationName` into the delivery form or into `user.destination`.
- Do not treat a rail destination as “destination entered” for the **No destination yet** count. That count is staff customer deliveries still missing, and the API already calculates it from `destination`.
- Do not replace **Port · terminal** with Memphis while the container is **At ocean terminal**. Prince Rupert is the port. Memphis is the rail destination.
- Search already includes `finalDestinationName`. `GET /api/containers?search=Memphis` returns the rail containers headed there. Ocean-only rows are not returned for that search.

## Check

1. Open `https://cargoquay.com/containers/BMOU2460440` after deploy.
2. **Port · terminal** is Prince Rupert. **Rail destination** is Memphis, Tennessee. The customer delivery box is empty.
3. Save a customer delivery such as “Hubbard, OH”. Reload. Memphis is still the rail destination. Hubbard remains in the form. A refresh does not clear Hubbard.
4. Open an ocean container with `finalDestinationName: null`. **Rail destination** is an em dash. **Port · terminal** is still the discharge port.
5. Export to Excel. **Rail destination** is Memphis, Tennessee on the Prince Rupert rows. **Customer delivery** is empty until staff save one.
