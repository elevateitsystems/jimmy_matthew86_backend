export const TIME_ZONE = 'America/New_York';

export type ShipmentStatus =
  | 'AT_ORIGIN'
  | 'ON_WATER'
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

const OPERATIONS_STATUS = new Set([
  'DISCHARGED',
  'DISCHARGED_FROM_BARGE_AT_DESTINATION',
  'AVAILABLE',
  'AVAILABLE_AT_RAIL_FACILITY',
  'AVAILABLE_AT_OFFDOCK_FACILITY',
  'FULL_OUTGATED',
  'FULL_OUTGATED_FROM_RAIL_FACILITY',
  'FULL_OUTGATED_FROM_OFFDOCK_FACILITY',
  'EMPTY_RETURNED',
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
  NOT_COLLECTED: 'Not collected',
  AT_WAREHOUSE: 'At warehouse',
  DEHIRED: 'Dehired',
  DELIVERED: 'Delivered',
};

export function isOnOperationsList(container: ContainerFacts) {
  return (
    container.hasAvailableEvent ||
    container.dischargedAt !== null ||
    container.outgatedAt !== null ||
    container.emptyReturnedAt !== null ||
    (container.trackingStatus !== null &&
      OPERATIONS_STATUS.has(container.trackingStatus))
  );
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
  if (isOnOperationsList(container)) {
    if (container.emptyReturnedAt) {
      return 'DEHIRED';
    }
    if (container.outgatedAt) {
      return 'AT_WAREHOUSE';
    }
    return 'NOT_COLLECTED';
  }
  if (
    container.trackingStatus &&
    ON_WATER.has(container.trackingStatus)
  ) {
    return 'ON_WATER';
  }
  return 'AT_ORIGIN';
}

export function presentContainer(container: ContainerFacts, now = new Date()) {
  const status = shipmentStatus(container);
  const key = keyDate(container, status);
  const daysUntil = key.date ? calendarDayDifference(key.date, now) : null;
  const urgency = dateUrgency(status, daysUntil);
  const days =
    status === 'DEHIRED' && daysUntil !== null ? -daysUntil : daysUntil;

  return {
    status,
    statusLabel: STATUS_LABEL[status],
    onOperationsList: isOnOperationsList(container),
    keyDate: key.date?.toISOString() ?? null,
    keyDateLabel: key.label,
    days,
    daysLabel: daysLabel(status, days),
    daysUntil,
    urgency,
    size: sizeLabel(container),
    portTerminal: [container.portName, container.terminalName]
      .filter(Boolean)
      .join(' · '),
  };
}

export function calendarDayDifference(target: Date, now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
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

export function formatDisplayDate(value: Date | null) {
  if (!value) {
    return '';
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(value);
}

function keyDate(container: ContainerFacts, status: ShipmentStatus) {
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
      return { date: container.etaAtTerminal, label: 'ETA' };
    case 'AT_ORIGIN':
      return { date: container.etdFromOrigin, label: 'ETD' };
  }
}

function dateUrgency(
  status: ShipmentStatus,
  daysUntil: number | null,
): Urgency {
  if (daysUntil === null) {
    return 'NONE';
  }
  if (status === 'NOT_COLLECTED' || status === 'AT_WAREHOUSE') {
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
