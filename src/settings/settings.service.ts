import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import type { UpdateSettingsDto } from './dto/update-settings.dto.js';

const SETTINGS_ID = 'workspace';


const DEFAULTS = {
  emailUpdates: true,
  compactTable: false,
  defaultView: 'Active',
} as const;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async get() {
    const row = await this.prisma.workspaceSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID, ...DEFAULTS },
    });
    return this.present(row);
  }

  async update(dto: UpdateSettingsDto) {
    await this.get();
    const row = await this.prisma.workspaceSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        emailUpdates: dto.emailUpdates,
        compactTable: dto.compactTable,
        defaultView: normalizeView(dto.defaultView),
      },
    });
    return this.present(row);
  }

  async reset() {
    const row = await this.prisma.workspaceSettings.upsert({
      where: { id: SETTINGS_ID },
      update: DEFAULTS,
      create: { id: SETTINGS_ID, ...DEFAULTS },
    });
    return this.present(row);
  }

  private present(row: {
    emailUpdates: boolean;
    compactTable: boolean;
    defaultView: string;
    updatedAt: Date;
  }) {
    const mail = this.mail.status();
    return {
      emailUpdates: row.emailUpdates,
      compactTable: row.compactTable,
      defaultView: row.defaultView,
      updatedAt: row.updatedAt,
      mail: {
        configured: mail.configured,
        deliveryEmails: row.emailUpdates && mail.configured,
        alertEmail: mail.alertEmail,
      },
      workspace: {
        mode: 'live',
        preferencesStored: 'server',
        message: workspaceMessage(row.emailUpdates, mail),
      },
    };
  }
}

function normalizeView(value: UpdateSettingsDto['defaultView']) {
  if (!value) {
    return undefined;
  }
  return value === 'All' ? 'All containers' : value;
}

function workspaceMessage(
  emailUpdates: boolean,
  mail: { configured: boolean; alertEmail: string | null },
) {
  if (!mail.configured) {
    return 'Preferences are saved on the server. Add the alert address and SMTP settings before email can be sent.';
  }
  if (!emailUpdates) {
    return `Preferences are saved on the server. Delivery update emails are turned off. Failed shipment refreshes are emailed to ${mail.alertEmail}.`;
  }
  return `Preferences are saved on the server. Delivery updates are emailed to ${mail.alertEmail}.`;
}
