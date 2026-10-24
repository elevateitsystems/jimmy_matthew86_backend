import { createRequire } from 'node:module';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Workbook } from 'exceljs';
import type { Prisma } from '@prisma/client';

const { Workbook: ExcelWorkbook } = createRequire(import.meta.url)(
  'exceljs',
) as { Workbook: new () => Workbook };
import type { AuthUser } from '../auth/auth.types.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  calendarDayDifference,
  formatDisplayDate,
  presentContainer,
  type ShipmentStatus,
  type Urgency,
} from './container.rules.js';
import type {
  ContainerBucket,
  ContainerView,
} from './dto/list-containers.dto.js';
import type { UpdateContainerDto } from './dto/update-container.dto.js';
import {
  formatContainerNumber,
  normalizeContainerNumber,
  timelineFromHistory,
} from './opentrack.map.js';
import { ContainersSyncService } from './containers.sync.service.js';

const listSelect = {
  id: true,
  containerNumber: true,
  masterBillNumber: true,
  scacCode: true,
  steamshipLine: true,
  vesselName: true,
  voyageNumber: true,
  containerSize: true,
  containerType: true,
  equipmentType: true,
  originName: true,
  portName: true,
  terminalName: true,
  trackingStatus: true,
  lastFreeDay: true,
  detentionLastFreeDay: true,
  dischargedAt: true,
  outgatedAt: true,
  emptyReturnedAt: true,
  etaAtTerminal: true,
  etdFromOrigin: true,
  hasAvailableEvent: true,
  lastSeenAt: true,
  missingFromFeed: true,
  destination: true,
  carrier: true,
  appointmentAt: true,
  deliveredAt: true,
  notes: true,
  driverName: true,
  truckNumber: true,
  receivingContact: true,
  contactPhone: true,
  deliveryAddress: true,
} satisfies Prisma.ContainerSelect;

type ListedContainer = Prisma.ContainerGetPayload<{ select: typeof listSelect }>;

@Injectable()
export class ContainersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: ContainersSyncService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
  ) {}

  async summary() {
    const all = await this.views();
    const counts = dashboardCounts(all);
    const lastSync = await this.prisma.syncRun.findFirst({
      orderBy: { startedAt: 'desc' },
    });

    return {
      ...counts,
      ...screen(counts),
      missingFromFeed: all.filter((view) => view.missingFromFeed).length,
      lastSync: lastSync
        ? {
            startedAt: lastSync.startedAt,
            finishedAt: lastSync.finishedAt,
            success: lastSync.success,
            containersSeen: lastSync.containersSeen,
            message: lastSync.message,
          }
        : null,
    };
  }

  async list(query: {
    search?: string;
    view?: ContainerView;
    bucket?: ContainerBucket;
    page?: number;
    perPage?: number;
  }) {
    const savedView =
      query.view || query.bucket ? null : (await this.settings.get()).defaultView;
    const view = query.view ?? 'arrived';
    const bucket =
      query.bucket ??
      (savedView === 'All containers' ? 'all' : defaultBucket(view));
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 15;
    const all = await this.views();
    const counts = dashboardCounts(all);
    const rows = this.sort(
      all
        .filter((item) => matchesSearch(item, query.search))
        .filter((item) => matchesBucket(item, bucket)),
      bucket,
    );
    const total = rows.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);
    const currentPage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    const start = (currentPage - 1) * perPage;

    return {
      view,
      bucket,
      ...screen(counts),
      data: rows.slice(start, start + perPage),
      pagination: {
        page: currentPage,
        perPage,
        total,
        totalPages,
        hasPrevious: currentPage > 1 && totalPages > 0,
        hasNext: totalPages > 0 && currentPage < totalPages,
        perPageOptions: [10, 15, 25],
      },
    };
  }

  async findOne(containerNumber: string) {
    const record = await this.findOrFetch(containerNumber);
    return this.presentDetail(record.id);
  }

  async update(
    containerNumber: string,
    dto: UpdateContainerDto,
    actor?: AuthUser,
  ) {
    const record = await this.findOrFetch(containerNumber);
    const data = staffData(dto);
    await this.prisma.container.update({
      where: { id: record.id },
      data,
    });
    await this.notifyDeliveryChange(record, data, actor);
    return this.presentDetail(record.id);
  }

  private async notifyDeliveryChange(
    before: ListedContainer,
    data: Prisma.ContainerUpdateInput,
    actor?: AuthUser,
  ) {
    const changes = deliveryChanges(before, data);
    if (changes.length === 0) {
      return;
    }
    const settings = await this.settings.get();
    if (!settings.emailUpdates) {
      return;
    }
    await this.mail.sendDeliveryUpdate({
      containerNumber: formatContainerNumber(before.containerNumber),
      updatedBy: actor ? `${actor.name} (${actor.email})` : 'Staff',
      changes,
    });
  }

  async export(query: { search?: string; bucket?: ContainerBucket }) {
    const bucket = query.bucket ?? 'all';
    const views = this.sort(
      (await this.views(query.search)).filter((view) =>
        matchesBucket(view, bucket),
      ),
      bucket,
    );
    const workbook = new ExcelWorkbook();
    const sheet = workbook.addWorksheet('Containers');
    sheet.columns = [
      { header: 'Container', key: 'containerNumber', width: 18 },
      { header: 'MBL', key: 'masterBillNumber', width: 20 },
      { header: 'Size', key: 'size', width: 22 },
      { header: 'Port · Terminal', key: 'portTerminal', width: 28 },
      { header: 'Status', key: 'statusLabel', width: 22 },
      { header: 'Key date', key: 'keyDateLabel', width: 24 },
      { header: 'Date', key: 'keyDate', width: 16 },
      { header: 'Days', key: 'daysLabel', width: 22 },
      { header: 'Final destination', key: 'destination', width: 24 },
      { header: 'Carrier', key: 'carrier', width: 22 },
      { header: 'Appointment', key: 'appointmentAt', width: 16 },
      { header: 'Delivered', key: 'deliveredAt', width: 16 },
      { header: 'Notes', key: 'notes', width: 40 },
    ];
    for (const view of views) {
      sheet.addRow({
        ...view,
        keyDate: view.keyDate ? view.keyDate.slice(0, 10) : '',
        appointmentAt: view.appointmentAt?.slice(0, 10) ?? '',
        deliveredAt: view.deliveredAt?.slice(0, 10) ?? '',
      });
    }
    sheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async views(search?: string) {
    const rows = await this.prisma.container.findMany({
      where: searchWhere(search),
      select: listSelect,
      orderBy: { containerNumber: 'asc' },
    });
    return rows.map((row) => this.toView(row));
  }

  private async findOrFetch(containerNumber: string) {
    const normalized = normalizeContainerNumber(containerNumber);
    const existing = await this.prisma.container.findUnique({
      where: { containerNumber: normalized },
      select: listSelect,
    });
    if (existing) {
      return existing;
    }
    const created = await this.sync.saveFromFeed(normalized);
    if (!created) {
      throw new NotFoundException('Container was not found');
    }
    return this.prisma.container.findUniqueOrThrow({
      where: { id: created.id },
      select: listSelect,
    });
  }

  private async presentDetail(id: string) {
    const full = await this.prisma.container.findUniqueOrThrow({
      where: { id },
    });
    const view = this.toView(full);
    return {
      ...view,
      subtitle: [full.masterBillNumber, full.steamshipLine, full.vesselName]
        .filter(Boolean)
        .join(' · '),
      origin: full.originName,
      originName: full.originName,
      equipment: view.size,
      lastFreeDay: full.lastFreeDay?.toISOString() ?? null,
      lastFreeDayText: full.lastFreeDay
        ? formatDisplayDate(full.lastFreeDay)
        : null,
      detentionLastFreeDay: full.detentionLastFreeDay?.toISOString() ?? null,
      detentionLastFreeDayText: full.detentionLastFreeDay
        ? formatDisplayDate(full.detentionLastFreeDay)
        : null,
      etaAtTerminal: full.etaAtTerminal?.toISOString() ?? null,
      etdFromOrigin: full.etdFromOrigin?.toISOString() ?? null,
      dischargedAt: full.dischargedAt?.toISOString() ?? null,
      outgatedAt: full.outgatedAt?.toISOString() ?? null,
      emptyReturnedAt: full.emptyReturnedAt?.toISOString() ?? null,
      deliveredText: view.deliveredAt
        ? formatDisplayDate(new Date(view.deliveredAt))
        : 'Not yet delivered',
      timeline: timelineFromHistory(full.history),
    };
  }

  private toView(row: ListedContainer) {
    const presentation = presentContainer(row);
    return {
      id: row.id,
      containerNumber: row.containerNumber,
      container: formatContainerNumber(row.containerNumber),
      masterBillNumber: row.masterBillNumber,
      mbl: row.masterBillNumber,
      scacCode: row.scacCode,
      steamshipLine: row.steamshipLine,
      vesselName: row.vesselName,
      voyageNumber: row.voyageNumber,
      size: presentation.size,
      portName: row.portName,
      terminalName: row.terminalName,
      portTerminal: presentation.portTerminal,
      status: presentation.status,
      statusLabel: presentation.statusLabel,
      trackingStatus: row.trackingStatus,
      keyDate: presentation.keyDate,
      keyDateText: presentation.keyDate
        ? formatDisplayDate(new Date(presentation.keyDate))
        : null,
      keyDateLabel: presentation.keyDateLabel,
      days: presentation.days,
      daysLabel: presentation.daysLabel,
      daysUntil: presentation.daysUntil,
      urgency: presentation.urgency,
      onOperationsList: presentation.onOperationsList,
      missingFromFeed: row.missingFromFeed,
      destination: row.destination,
      carrier: row.carrier,
      appointmentAt: row.appointmentAt?.toISOString() ?? null,
      appointment: row.appointmentAt
        ? formatDisplayDate(row.appointmentAt)
        : null,
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      notes: row.notes,
      driverName: row.driverName,
      truckNumber: row.truckNumber,
      receivingContact: row.receivingContact,
      contactPhone: row.contactPhone,
      deliveryAddress: row.deliveryAddress,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    };
  }

  private sort<
    T extends {
      urgency: Urgency;
      daysUntil: number | null;
      containerNumber: string;
      deliveredAt: string | null;
    },
  >(views: T[], bucket: ContainerBucket) {
    return [...views].sort((left, right) => {
      if (bucket === 'delivered') {
        return (right.deliveredAt ?? '').localeCompare(left.deliveredAt ?? '');
      }
      const urgencyOrder = urgencyRank(left.urgency) - urgencyRank(right.urgency);
      if (urgencyOrder !== 0) {
        return urgencyOrder;
      }
      const leftDays = left.daysUntil ?? Number.POSITIVE_INFINITY;
      const rightDays = right.daysUntil ?? Number.POSITIVE_INFINITY;
      if (leftDays !== rightDays) {
        return leftDays - rightDays;
      }
      return left.containerNumber.localeCompare(right.containerNumber);
    });
  }
}

function defaultBucket(view: ContainerView): ContainerBucket {
  if (view === 'in_transit') {
    return 'on_water';
  }
  if (view === 'delivered') {
    return 'delivered';
  }
  return 'open';
}

function dashboardCounts(views: DashboardRow[]) {
  const notCollected = count(views, 'NOT_COLLECTED');
  const atWarehouse = count(views, 'AT_WAREHOUSE');
  const dehired = count(views, 'DEHIRED');
  const delivered = count(views, 'DELIVERED');
  const onWater = count(views, 'ON_WATER');
  const atOrigin = count(views, 'AT_ORIGIN');
  const notCollectedPastLastFreeDay = views.filter(
    (view) => view.status === 'NOT_COLLECTED' && view.urgency === 'RED',
  ).length;
  const dehiredOverTenDays = views.filter(
    (view) => view.status === 'DEHIRED' && view.urgency === 'RED',
  ).length;
  const deliveredLast30Days = views.filter(
    (view) =>
      view.status === 'DELIVERED' &&
      view.deliveredAt &&
      calendarDayDifference(new Date(view.deliveredAt)) >= -30,
  ).length;
  const noDestination = views.filter((view) =>
    matchesBucket(view, 'no_destination'),
  ).length;
  const arrived = views.filter((view) => matchesBucket(view, 'open')).length;
  const overdue = views.filter((view) => matchesBucket(view, 'overdue')).length;

  return {
    atOrigin,
    onWater,
    notCollected,
    notCollectedPastLastFreeDay,
    atWarehouse,
    dehired,
    dehiredOverTenDays,
    delivered,
    deliveredLast30Days,
    noDestination,
    arrived,
    inTransit: onWater,
    open: arrived,
    overdue,
  };
}

function screen(counts: ReturnType<typeof dashboardCounts>) {
  return {
    tabs: [
      { id: 'arrived', label: 'Arrived', count: counts.arrived },
      { id: 'in_transit', label: 'In transit', count: counts.inTransit },
      { id: 'delivered', label: 'Delivered', count: counts.delivered },
    ],
    cards: [
      { id: 'at_origin', label: 'At origin', count: counts.atOrigin },
      {
        id: 'on_water',
        label: 'On water / arriving',
        count: counts.onWater,
      },
      {
        id: 'not_collected',
        label: 'Available · not collected',
        count: counts.notCollected,
        detail:
          counts.notCollectedPastLastFreeDay > 0
            ? `${counts.notCollectedPastLastFreeDay} past terminal LFD`
            : null,
      },
      {
        id: 'at_warehouse',
        label: 'At warehouse · not unpacked',
        count: counts.atWarehouse,
      },
      {
        id: 'dehired',
        label: 'Dehired · awaiting delivery',
        count: counts.dehired,
        detail:
          counts.dehiredOverTenDays > 0
            ? `${counts.dehiredOverTenDays} over 10 days`
            : null,
      },
      {
        id: 'delivered',
        label: 'Delivered',
        count: counts.delivered,
        detail:
          counts.deliveredLast30Days > 0
            ? `${counts.deliveredLast30Days} in last 30 days`
            : null,
      },
    ],
    stats: [
      {
        id: 'not_collected',
        label: 'Available, not collected',
        count: counts.notCollected,
        detail:
          counts.notCollectedPastLastFreeDay > 0
            ? `${counts.notCollectedPastLastFreeDay} past terminal LFD`
            : null,
      },
      {
        id: 'at_warehouse',
        label: 'At warehouse, not unpacked',
        count: counts.atWarehouse,
      },
      {
        id: 'dehired',
        label: 'Dehired, awaiting delivery',
        count: counts.dehired,
        detail:
          counts.dehiredOverTenDays > 0
            ? `${counts.dehiredOverTenDays} over 10 days`
            : null,
      },
      {
        id: 'no_destination',
        label: 'No destination yet',
        count: counts.noDestination,
      },
    ],
    filters: [
      { id: 'open', label: 'All open', count: counts.arrived },
      { id: 'dehired', label: 'Dehired', count: counts.dehired },
      {
        id: 'not_collected',
        label: 'Not collected',
        count: counts.notCollected,
      },
      {
        id: 'no_destination',
        label: 'No destination',
        count: counts.noDestination,
      },
      { id: 'at_warehouse', label: 'At warehouse', count: counts.atWarehouse },
      { id: 'overdue', label: 'Overdue', count: counts.overdue },
    ],
  };
}

type DashboardRow = {
  status: ShipmentStatus;
  urgency: Urgency;
  onOperationsList: boolean;
  destination: string | null;
  deliveredAt: string | null;
  containerNumber: string;
  masterBillNumber: string | null;
  carrier: string | null;
  portName: string | null;
  portTerminal: string | null;
  steamshipLine: string | null;
};

function matchesSearch(view: DashboardRow, search?: string) {
  const term = search?.trim().toLowerCase();
  if (!term) {
    return true;
  }
  const compact = term.replace(/\s+/g, '');
  const haystack = [
    view.containerNumber,
    view.masterBillNumber,
    view.destination,
    view.carrier,
    view.portName,
    view.portTerminal,
    view.steamshipLine,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(term) || haystack.replace(/\s+/g, '').includes(compact);
}

function count(
  views: Array<{ status: ShipmentStatus }>,
  status: ShipmentStatus,
) {
  return views.filter((view) => view.status === status).length;
}

function matchesBucket(
  view: {
    status: ShipmentStatus;
    urgency: Urgency;
    onOperationsList: boolean;
    destination: string | null;
  },
  bucket: ContainerBucket,
) {
  switch (bucket) {
    case 'all':
      return true;
    case 'open':
      return view.onOperationsList && view.status !== 'DELIVERED';
    case 'at_origin':
      return view.status === 'AT_ORIGIN';
    case 'on_water':
      return view.status === 'ON_WATER';
    case 'not_collected':
      return view.status === 'NOT_COLLECTED';
    case 'at_warehouse':
      return view.status === 'AT_WAREHOUSE';
    case 'dehired':
      return view.status === 'DEHIRED';
    case 'delivered':
      return view.status === 'DELIVERED';
    case 'overdue':
      return view.urgency === 'RED' && view.status !== 'DELIVERED';
    case 'no_destination':
      return (
        view.onOperationsList &&
        view.status !== 'DELIVERED' &&
        !view.destination?.trim()
      );
  }
}

function searchWhere(search?: string): Prisma.ContainerWhereInput {
  const term = search?.trim();
  if (!term) {
    return {};
  }
  const compact = term.replace(/\s+/g, '');
  return {
    OR: [
      { containerNumber: { contains: compact, mode: 'insensitive' } },
      { masterBillNumber: { contains: term, mode: 'insensitive' } },
      { destination: { contains: term, mode: 'insensitive' } },
      { carrier: { contains: term, mode: 'insensitive' } },
      { portName: { contains: term, mode: 'insensitive' } },
      { steamshipLine: { contains: term, mode: 'insensitive' } },
    ],
  };
}

function staffData(dto: UpdateContainerDto): Prisma.ContainerUpdateInput {
  const data: Prisma.ContainerUpdateInput = {};
  if (dto.destination !== undefined) {
    data.destination = blankToNull(dto.destination);
  }
  if (dto.carrier !== undefined) {
    data.carrier = blankToNull(dto.carrier);
  }
  if (dto.appointmentAt !== undefined) {
    data.appointmentAt = parseStaffDate(dto.appointmentAt);
  }
  if (dto.markDelivered && dto.deliveredAt === undefined) {
    data.deliveredAt = new Date();
  }
  if (dto.deliveredAt !== undefined) {
    data.deliveredAt = parseStaffDate(dto.deliveredAt);
  }
  if (dto.notes !== undefined) {
    data.notes = blankToNull(dto.notes);
  }
  if (dto.driverName !== undefined) {
    data.driverName = blankToNull(dto.driverName);
  }
  if (dto.truckNumber !== undefined) {
    data.truckNumber = blankToNull(dto.truckNumber);
  }
  if (dto.receivingContact !== undefined) {
    data.receivingContact = blankToNull(dto.receivingContact);
  }
  if (dto.contactPhone !== undefined) {
    data.contactPhone = blankToNull(dto.contactPhone);
  }
  if (dto.deliveryAddress !== undefined) {
    data.deliveryAddress = blankToNull(dto.deliveryAddress);
  }
  return data;
}

function parseStaffDate(value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const usDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (isoDate || usDate) {
    const year = Number(isoDate?.[1] ?? usDate?.[3]);
    const month = Number(isoDate?.[2] ?? usDate?.[1]);
    const day = Number(isoDate?.[3] ?? usDate?.[2]);
    const date = new Date(Date.UTC(year, month - 1, day, 16, 0, 0));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException('Use a valid date');
    }
    return date;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Use a valid date');
  }
  return date;
}

function deliveryChanges(
  before: ListedContainer,
  data: Prisma.ContainerUpdateInput,
) {
  const changes: { label: string; from: string; to: string }[] = [];
  const textFields = [
    ['destination', 'Final destination'],
    ['carrier', 'Carrier'],
    ['notes', 'Notes'],
    ['driverName', 'Driver'],
    ['truckNumber', 'Truck number'],
    ['receivingContact', 'Receiving contact'],
    ['contactPhone', 'Phone'],
    ['deliveryAddress', 'Delivery address'],
  ] as const;
  for (const [key, label] of textFields) {
    if (data[key] === undefined) {
      continue;
    }
    const next = textValue(data[key]);
    const previous = before[key] ?? '';
    if (previous === next) {
      continue;
    }
    changes.push({
      label,
      from: previous || 'none',
      to: next || 'none',
    });
  }
  const dateFields = [
    ['appointmentAt', 'Appointment'],
    ['deliveredAt', 'Delivered'],
  ] as const;
  for (const [key, label] of dateFields) {
    if (data[key] === undefined) {
      continue;
    }
    const next = dateValue(data[key]);
    const previous = before[key];
    if (sameInstant(previous, next)) {
      continue;
    }
    changes.push({
      label,
      from: formatDisplayDate(previous) || 'none',
      to: formatDisplayDate(next) || 'none',
    });
  }
  return changes;
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function dateValue(value: unknown) {
  return value instanceof Date ? value : null;
}

function sameInstant(left: Date | null, right: Date | null) {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.getTime() === right.getTime();
}

function blankToNull(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function urgencyRank(urgency: Urgency) {
  if (urgency === 'RED') {
    return 0;
  }
  if (urgency === 'AMBER') {
    return 1;
  }
  return 2;
}
