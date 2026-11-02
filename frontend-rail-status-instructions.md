# Frontend: separate rail containers from ocean pickups

A container discharged at Prince Rupert and booked onward to Memphis is not waiting for a truck. The API now gives that shipment its own status. Ocean containers that really end at the port stay **Not collected**.

Deploy the API, run `npx prisma migrate deploy`, restart it, and refresh shipments before checking the screens.

## Statuses

| `status` | `statusLabel` | Meaning | Headline date |
| --- | --- | --- | --- |
| `AT_OCEAN_TERMINAL` | At ocean terminal | Rail shipment, discharged, train not departed | Final rail ETA (`keyDateText`) |
| `ON_RAIL` | On rail | Loaded or departed on the train | Final rail ETA. `portTerminal` is the rail city, such as Memphis |
| `AT_RAIL_TERMINAL` | At rail terminal | Arrived, unloaded, or available at the rail ramp | Rail last free day, or the rail ETA when that day is not published yet. `portTerminal` is the rail city |
| `NOT_COLLECTED` | Not collected | Ocean shipment waiting for pickup at the port | Terminal last free day |

`finalDestinationName` is the rail city. `etaAtDestination` is the rail ETA. `lastFreeDayAtRailStation` is the rail pickup deadline. `etaAtTerminal` remains the discharge-port ETA and stays off the customer ETA.

Buckets for the list request:

| Bucket | Rows |
| --- | --- |
| `at_ocean_terminal` | Waiting for the train |
| `on_rail` | On the train |
| `at_rail_terminal` | Ready at the rail ramp |
| `in_transit` | On the water and on the rail |
| `not_collected` | Ocean pickups only |

The summary `cards` array includes `at_ocean_terminal`, `on_rail`, and `at_rail_terminal`.

## Show the API label

`lib/backend.ts` currently remaps an unknown `status` back to Not collected. Add the three statuses to that map and keep `statusLabel` from the API:

```ts
const statusMap: Record<string, ContainerStatus> = {
  notcollected: 'Not collected',
  atoceanterminal: 'At ocean terminal',
  onrail: 'On rail',
  atrailterminal: 'At rail terminal',
  atwarehouse: 'At warehouse',
  dehired: 'Dehired',
  nottracked: 'Not tracked',
  emptyreturned: 'Dehired',
  fulloutgated: 'At warehouse',
  available: 'Not collected',
  discharged: 'Not collected',
};
```

Extend `ContainerStatus` in `lib/tracking.ts`:

```ts
export type ContainerStatus =
  | 'Not collected'
  | 'At ocean terminal'
  | 'On rail'
  | 'At rail terminal'
  | 'At warehouse'
  | 'Dehired'
  | 'Not tracked';
```

In `components/shared.tsx`, add the badge colors and three metric cards:

```ts
export type MetricKey =
  | 'At origin'
  | 'On water / arriving'
  | 'At ocean terminal'
  | 'On rail'
  | 'At rail terminal'
  | 'Not collected'
  | 'At warehouse'
  | 'Dehired'
  | 'Delivered';
```

Suggested tones: At ocean terminal `gray`, On rail `blue`, At rail terminal `blue`. Card titles:

- At ocean terminal · awaiting rail
- On rail
- At rail terminal

Wire them in `trackerFilters`:

```ts
'At ocean terminal': { view: 'arrived', bucket: 'at_ocean_terminal' },
'On rail': { view: 'in_transit', bucket: 'on_rail' },
'At rail terminal': { view: 'arrived', bucket: 'at_rail_terminal' },
```

In `parseSummary`, read the new cards:

```ts
'At ocean terminal': read(['atoceanterminal']),
'On rail': read(['onrail']),
'At rail terminal': read(['atrailterminal']),
```

Copy `railPastLastFreeDay` onto the At rail terminal card as the red count, the same way `notCollectedPastLastFreeDay` feeds Not collected.

Add the three names to `TrackerView`. The In transit tab already calls `view=in_transit`. That view now includes both on-water and on-rail rows. Add the On rail count to the In transit tab total.

Keep rendering `keyDateText` for the date. Do not format `keyDate` with `formatDate()`.

## Check

1. `BMOU2460440` is **At ocean terminal**, port Prince Rupert, ETA **Nov 10, 2026**. It is not in Not collected.
2. A container whose feed status is `DEPARTED_ON_RAIL` or `LOADED_ON_RAIL` is **On rail**, and the place column is Memphis rather than Prince Rupert.
3. `ARRIVED_AT_RAIL_FACILITY`, `UNLOADED_FROM_RAIL`, or `AVAILABLE_AT_RAIL_FACILITY` is **At rail terminal**.
4. An ocean container discharged at Houston, with no rail leg, stays **Not collected**.
