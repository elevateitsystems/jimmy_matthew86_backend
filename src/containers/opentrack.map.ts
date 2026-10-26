import type { Prisma } from '../generated/prisma/client.js';
import { formatDisplayDate } from './container.rules.js';
import type {
  OpenTrackContainer,
  OpenTrackHistoryEvent,
} from './opentrack.types.js';

const AVAILABLE = new Set([
  'AVAILABLE',
  'AVAILABLE_AT_RAIL_FACILITY',
  'AVAILABLE_AT_OFFDOCK_FACILITY',
]);

const DISCHARGED = new Set([
  'DISCHARGED',
  'DISCHARGED_FROM_BARGE_AT_DESTINATION',
]);

const OUTGATED = new Set([
  'FULL_OUTGATED',
  'FULL_OUTGATED_FROM_RAIL_FACILITY',
  'FULL_OUTGATED_FROM_OFFDOCK_FACILITY',
]);

const EMPTY_RETURNED = new Set(['EMPTY_RETURNED']);

export function normalizeContainerNumber(value: string) {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function formatContainerNumber(value: string) {
  const normalized = normalizeContainerNumber(value);
  const match = normalized.match(/^([A-Z]{4})(\d{6})(\d)$/);
  if (!match) {
    return normalized;
  }
  return `${match[1]} ${match[2]} ${match[3]}`;
}

export function toTrackingData(item: OpenTrackContainer, seenAt: Date) {
  const history = item.history ?? [];
  const containerNumber = normalizeContainerNumber(item.containerId ?? '');

  return {
    containerNumber,
    masterBillNumber: item.masterBillNumber ?? null,
    scacCode: item.scacCode ?? null,
    steamshipLine: item.steamshipLine ?? null,
    vesselName: item.vessel?.name ?? item.vesselName ?? null,
    voyageNumber: item.voyageNumber ?? null,
    containerSize: item.containerSize ?? null,
    containerType: item.containerType ?? null,
    equipmentType: item.equipmentType ?? null,
    originName: item.originPort?.name ?? item.portOfLoading ?? null,
    portName: item.destinationPort?.name ?? item.portOfDischarge ?? null,
    terminalName:
      item.terminalAtDestinationPort?.name ??
      item.terminalAtPortOfDischarge ??
      null,
    trackingStatus: item.status ?? null,
    lastFreeDay: parseDate(item.lastFreeDay),
    detentionLastFreeDay: parseDate(item.detentionLastFreeDay),
    dischargedAt:
      parseDate(item.dischargedDate) ?? milestoneDate(history, DISCHARGED),
    outgatedAt:
      parseDate(item.outgatedDate) ?? milestoneDate(history, OUTGATED),
    emptyReturnedAt:
      parseDate(item.emptyReturnedDate) ??
      milestoneDate(history, EMPTY_RETURNED),
    etaAtTerminal: parseDate(item.etaAtTerminal),
    etdFromOrigin: parseDate(item.etdFromOrigin),
    hasAvailableEvent: history.some(
      (event) => event.milestone !== undefined && AVAILABLE.has(event.milestone),
    ),
    history: history as Prisma.InputJsonValue,
    lastSeenAt: seenAt,
    missingFromFeed: false,
  };
}

export function timelineFromHistory(history: unknown) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .flatMap((event) => {
      if (!event || typeof event !== 'object') {
        return [];
      }
      const record = event as OpenTrackHistoryEvent;
      if (!record.milestone && !record.timestamp) {
        return [];
      }
      const copy = milestoneCopy(record.milestone);
      const timestamp = record.timestamp ?? null;
      return [
        {
          milestone: record.milestone ?? null,
          title: copy.title,
          description: copy.description,
          timestamp,
          date: timestamp ? formatDisplayDate(new Date(timestamp)) : null,
          location: record.location?.name ?? null,
        },
      ];
    })
    .sort((left, right) =>
      (right.timestamp ?? '').localeCompare(left.timestamp ?? ''),
    );
}

function milestoneDate(
  history: OpenTrackHistoryEvent[],
  milestones: Set<string>,
) {
  const timestamps = history
    .filter(
      (event) =>
        event.milestone !== undefined &&
        milestones.has(event.milestone) &&
        event.timestamp,
    )
    .map((event) => event.timestamp as string)
    .sort();
  return parseDate(timestamps.at(-1));
}

const MILESTONE_COPY: Record<string, { title: string; description: string }> = {
  EMPTY_RETURNED: {
    title: 'Empty returned',
    description: 'Empty container returned (dehired).',
  },
  FULL_OUTGATED: {
    title: 'Out-gated from terminal',
    description: 'Full container released to the dray carrier.',
  },
  FULL_OUTGATED_FROM_RAIL_FACILITY: {
    title: 'Out-gated from rail',
    description: 'Full container released from the rail facility.',
  },
  FULL_OUTGATED_FROM_OFFDOCK_FACILITY: {
    title: 'Out-gated from off-dock',
    description: 'Full container released from the off-dock facility.',
  },
  AVAILABLE: {
    title: 'Available for pickup',
    description: 'Released and available at the terminal.',
  },
  AVAILABLE_AT_RAIL_FACILITY: {
    title: 'Available for pickup',
    description: 'Released and available at the rail facility.',
  },
  AVAILABLE_AT_OFFDOCK_FACILITY: {
    title: 'Available for pickup',
    description: 'Released and available at the off-dock facility.',
  },
  DISCHARGED: {
    title: 'Discharged from vessel',
    description: 'Discharged at the destination terminal.',
  },
  DISCHARGED_FROM_BARGE_AT_DESTINATION: {
    title: 'Discharged from vessel',
    description: 'Discharged at the destination terminal.',
  },
  VESSEL_ARRIVED: {
    title: 'Vessel arrived',
    description: 'Vessel arrived at the destination port.',
  },
  VESSEL_BERTHED: {
    title: 'Vessel berthed',
    description: 'Vessel berthed at the destination port.',
  },
  LOADED: {
    title: 'Loaded on vessel',
    description: 'Loaded at origin port.',
  },
  VESSEL_DEPARTED: {
    title: 'Vessel departed',
    description: 'Departed the origin port.',
  },
};

function milestoneCopy(milestone?: string) {
  if (milestone && MILESTONE_COPY[milestone]) {
    return MILESTONE_COPY[milestone];
  }
  const title = milestone
    ? milestone
        .toLowerCase()
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : 'Update';
  return { title, description: title };
}

function parseDate(value?: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
