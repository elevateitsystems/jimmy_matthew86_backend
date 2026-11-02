export const TIME_ZONE = 'America/New_York';

export type ShipmentStatus =
  | 'AT_ORIGIN'
  | 'ON_WATER'
  | 'AT_OCEAN_TERMINAL'
  | 'ON_RAIL'
  | 'AT_RAIL_TERMINAL'
  | 'NOT_COLLECTED'
  | 'AT_WAREHOUSE'
  | 'DEHIRED'
  | 'DELIVERED';

export type Urgency = 'NONE' | 'AMBER' | 'RED';

export type ContainerFacts = {
  trackingStatus: string | null;
  lastFreeDay: Date | null;
  detentionLastFreeDay: Date | null;
  dischargedAt: Date | null;
  outgatedAt: Date | null;
  emptyReturnedAt: Date | null;
  etaAtTerminal: Date | null;
  etaAtDestination: Date | null;
  finalDestinationName: string | null;
  finalDestinationTimeZone: string | null;
  lastFreeDayAtRailStation: Date | null;
  isRailMove: boolean;
  departedOnRail: boolean;
  arrivedAtRail: boolean;
  etdFromOrigin: Date | null;
  hasAvailableEvent: boolean;
  destination: string | null;
  carrier: string | null;
  deliveredAt: Date | null;
  containerSize: string | null;
  containerType: string | null;
  equipmentType: string | null;
  portName: string | null;
  terminalName: string | null;
};

const ON_WATER = new Set([
  'LOADED',
  'VESSEL_DEPARTED',
  'VESSEL_ARRIVED_AT_TRANSSHIPMENT_PORT',
  'VESSEL_BERTHED_AT_TRANSSHIPMENT_PORT',
  'DISCHARGED_AT_TRANSSHIPMENT_PORT',
  'LOADED_AT_TRANSSHIPMENT_PORT',
  'VESSEL_DEPARTED_FROM_TRANSSHIPMENT_PORT',
  'VESSEL_ARRIVED',
  'VESSEL_BERTHED',
  'LOADED_ON_BARGE_AT_DESTINATION_PORT',
  'BARGE_DEPARTED_FROM_DESTINATION_PORT',
  'BARGE_BERTHED_AT_DESTINATION',
]);

const DISCHARGED_STATUS = new Set([
  'DISCHARGED',
  'DISCHARGED_FROM_BARGE_AT_DESTINATION',
]);

const ON_RAIL_STATUS = new Set(['LOADED_ON_RAIL', 'DEPARTED_ON_RAIL']);

const AT_RAIL_STATUS = new Set([
  'ARRIVED_AT_RAIL_FACILITY',
  'UNLOADED_FROM_RAIL',
  'AVAILABLE_AT_RAIL_FACILITY',
]);

const OUTGATE_STATUS = new Set([
  'FULL_OUTGATED',
  'FULL_OUTGATED_FROM_RAIL_FACILITY',
  'FULL_OUTGATED_FROM_OFFDOCK_FACILITY',
]);

const OCEAN_PICKUP_STATUS = new Set([
  'DISCHARGED',
  'DISCHARGED_FROM_BARGE_AT_DESTINATION',
  'AVAILABLE',
  'AVAILABLE_AT_OFFDOCK_FACILITY',
]);

const SIZE_LABEL: Record<string, string> = {
  TWENTY_FT: "20'",
  FORTY_FT: "40'",
  FORTY_FT_HC: "40' HC",
  FORTY_FIVE_FT_HC: "45' HC",
};

const TYPE_LABEL: Record<string, string> = {
  DRY: 'Dry',
  FLAT_RACK: 'Flat rack',
  OPEN: 'Open top',
  REEFER: 'Reefer',
  TANK: 'Tank',
  VENTILATED: 'Ventilated',
};

const STATUS_LABEL: Record<ShipmentStatus, string> = {
  AT_ORIGIN: 'At origin',
  ON_WATER: 'On water / arriving',
  AT_OCEAN_TERMINAL: 'At ocean terminal',
  ON_RAIL: 'On rail',
  AT_RAIL_TERMINAL: 'At rail terminal',
  NOT_COLLECTED: 'Not collected',
  AT_WAREHOUSE: 'At warehouse',
  DEHIRED: 'Dehired',
  DELIVERED: 'Delivered',
};

const ARRIVED_STATUSES = new Set<ShipmentStatus>([
  'AT_OCEAN_TERMINAL',
  'AT_RAIL_TERMINAL',
  'NOT_COLLECTED',
  'AT_WAREHOUSE',
  'DEHIRED',
]);

export function isOnOperationsList(container: ContainerFacts) {
  return ARRIVED_STATUSES.has(shipmentStatus(container));
}

export function isStaffDelivered(container: ContainerFacts) {
  return Boolean(
    container.destination?.trim() &&
      container.carrier?.trim() &&
      container.deliveredAt,
  );
}

export function shipmentStatus(container: ContainerFacts): ShipmentStatus {
  if (isStaffDelivered(container)) {
    return 'DELIVERED';
  }
  if (container.emptyReturnedAt || container.trackingStatus === 'EMPTY_RETURNED') {
    return 'DEHIRED';
  }
  if (
    container.outgatedAt !== null ||
    (container.trackingStatus !== null && OUTGATE_STATUS.has(container.trackingStatus))
  ) {
    return 'AT_WAREHOUSE';
  }
  const rail = railStage(container);
  if (rail === 'at_rail') {
    return 'AT_RAIL_TERMINAL';
  }
  if (rail === 'on_rail') {
    return 'ON_RAIL';
  }
  if (rail === 'ocean') {
    return 'AT_OCEAN_TERMINAL';
  }
  if (
    container.hasAvailableEvent ||
    container.dischargedAt !== null ||
    (container.trackingStatus !== null &&
      OCEAN_PICKUP_STATUS.has(container.trackingStatus))
  ) {
    return 'NOT_COLLECTED';
  }
  if (container.trackingStatus && ON_WATER.has(container.trackingStatus)) {
    return 'ON_WATER';
  }
  return 'AT_ORIGIN';
}

function railStage(container: ContainerFacts) {
  const railShipment =
    container.isRailMove ||
    container.etaAtDestination !== null ||
    container.departedOnRail ||
    container.arrivedAtRail;
  if (!railShipment) {
    return 'none';
  }
  if (
    container.arrivedAtRail ||
    (container.trackingStatus !== null && AT_RAIL_STATUS.has(container.trackingStatus))
  ) {
    return 'at_rail';
  }
  if (
    container.departedOnRail ||
    (container.trackingStatus !== null && ON_RAIL_STATUS.has(container.trackingStatus))
  ) {
    return 'on_rail';
  }
  if (
    container.dischargedAt !== null ||
    (container.trackingStatus !== null &&
      DISCHARGED_STATUS.has(container.trackingStatus))
  ) {
    return 'ocean';
  }
  return 'none';
}

export function presentContainer(container: ContainerFacts, now = new Date()) {
  const status = shipmentStatus(container);
  const key = keyDate(container, status);
  const keyDateTimeZone = safeTimeZone(key.timeZone);
  const daysUntil = key.date
    ? calendarDayDifference(key.date, now, keyDateTimeZone)
    : null;
  const urgency = dateUrgency(
    status,
    daysUntil,
    container.lastFreeDayAtRailStation !== null,
  );
  const days =
    status === 'DEHIRED' && daysUntil !== null ? -daysUntil : daysUntil;

  return {
    status,
    statusLabel: STATUS_LABEL[status],
    onOperationsList: isOnOperationsList(container),
    keyDate: key.date?.toISOString() ?? null,
    keyDateLabel: key.label,
    keyDateTimeZone,
    days,
    daysLabel: daysLabel(status, days),
    daysUntil,
    urgency,
    size: sizeLabel(container),
    portTerminal: placeLabel(container, status),
  };
}

function placeLabel(container: ContainerFacts, status: ShipmentStatus) {
  if (
    (status === 'ON_RAIL' || status === 'AT_RAIL_TERMINAL') &&
    container.finalDestinationName
  ) {
    return container.finalDestinationName;
  }
  return [container.portName, container.terminalName].filter(Boolean).join(' · ');
}

export function calendarDayDifference(
  target: Date,
  now = new Date(),
  timeZone = TIME_ZONE,
) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const toUtcDay = (date: Date) => {
    const [year, month, day] = formatter.format(date).split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtcDay(target) - toUtcDay(now)) / 86_400_000);
}

export function formatDisplayDate(value: Date | null, timeZone = TIME_ZONE) {
  if (!value) {
    return '';
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimeZone(timeZone),
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(value);
}

export function formatCalendarDate(value: Date, timeZone = TIME_ZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function safeTimeZone(timeZone?: string | null) {
  if (!timeZone) {
    return TIME_ZONE;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return timeZone;
  } catch {
    return TIME_ZONE;
  }
}

function keyDate(
  container: ContainerFacts,
  status: ShipmentStatus,
): { date: Date | null; label: string; timeZone?: string | null } {
  switch (status) {
    case 'NOT_COLLECTED':
      return { date: container.lastFreeDay, label: 'Last free day' };
    case 'AT_WAREHOUSE':
      return {
        date: container.detentionLastFreeDay,
        label: 'Detention last free day',
      };
    case 'DEHIRED':
      return { date: container.emptyReturnedAt, label: 'Empty returned' };
    case 'DELIVERED':
      return { date: container.deliveredAt, label: 'Delivered' };
    case 'ON_WATER':
    case 'AT_OCEAN_TERMINAL':
    case 'ON_RAIL':
      if (container.etaAtDestination) {
        return {
          date: container.etaAtDestination,
          label: 'ETA',
          timeZone: container.finalDestinationTimeZone,
        };
      }
      return { date: container.etaAtTerminal, label: 'ETA' };
    case 'AT_RAIL_TERMINAL':
      if (container.lastFreeDayAtRailStation) {
        return {
          date: container.lastFreeDayAtRailStation,
          label: 'Rail last free day',
          timeZone: container.finalDestinationTimeZone,
        };
      }
      return {
        date: container.etaAtDestination,
        label: 'ETA',
        timeZone: container.finalDestinationTimeZone,
      };
    case 'AT_ORIGIN':
      return { date: container.etdFromOrigin, label: 'ETD' };
  }
}

function dateUrgency(
  status: ShipmentStatus,
  daysUntil: number | null,
  hasRailDeadline = false,
): Urgency {
  if (daysUntil === null) {
    return 'NONE';
  }
  if (
    status === 'NOT_COLLECTED' ||
    status === 'AT_WAREHOUSE' ||
    (status === 'AT_RAIL_TERMINAL' && hasRailDeadline)
  ) {
    if (daysUntil < 0) {
      return 'RED';
    }
    if (daysUntil <= 2) {
      return 'AMBER';
    }
    return 'NONE';
  }
  if (status === 'DEHIRED') {
    const daysSince = -daysUntil;
    if (daysSince > 10) {
      return 'RED';
    }
    if (daysSince >= 8) {
      return 'AMBER';
    }
  }
  return 'NONE';
}

function daysLabel(status: ShipmentStatus, days: number | null) {
  if (days === null) {
    return null;
  }
  const noun = Math.abs(days) === 1 ? 'day' : 'days';
  if (status === 'DEHIRED') {
    return `${days} ${noun} since return`;
  }
  if (days < 0) {
    return `${Math.abs(days)} ${noun} past`;
  }
  if (days === 0) {
    return 'Today';
  }
  return `${days} ${noun} away`;
}

function sizeLabel(container: ContainerFacts) {
  const size = container.containerSize
    ? (SIZE_LABEL[container.containerSize] ?? container.containerSize)
    : null;
  const type = container.containerType
    ? (TYPE_LABEL[container.containerType] ?? container.containerType)
    : null;
  const base = [size, type].filter(Boolean).join(' ');
  if (base && container.equipmentType) {
    return `${base} (${container.equipmentType})`;
  }
  return base || container.equipmentType;
}
