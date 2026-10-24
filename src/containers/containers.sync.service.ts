import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { normalizeContainerNumber, toTrackingData } from './opentrack.map.js';
import { OpenTrackClient } from './opentrack.client.js';

@Injectable()
export class ContainersSyncService {
  private readonly logger = new Logger(ContainersSyncService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly opentrack: OpenTrackClient,
    private readonly mail: MailService,
  ) {}

  @Cron('0 6,14,22 * * *', {
    name: 'shipment-sync',
    timeZone: 'America/New_York',
    waitForCompletion: true,
  })
  async scheduledSync() {
    await this.run('schedule');
  }

  async run(source: 'schedule' | 'manual') {
    if (this.running) {
      return {
        success: false,
        message: 'A refresh is already running',
        containersSeen: 0,
        emailSent: false,
      };
    }

    this.running = true;
    const startedAt = new Date();
    try {
      const containers = await this.opentrack.listContainers();
      const seenAt = new Date();
      const seen = new Set<string>();

      for (const item of containers) {
        if (!item.containerId) {
          continue;
        }
        const data = toTrackingData(item, seenAt);
        if (!data.containerNumber) {
          continue;
        }
        seen.add(data.containerNumber);
        await this.prisma.container.upsert({
          where: { containerNumber: data.containerNumber },
          create: data,
          update: data,
        });
      }

      if (seen.size > 0 || containers.length === 0) {
        await this.prisma.container.updateMany({
          where: { containerNumber: { notIn: [...seen] } },
          data: { missingFromFeed: true },
        });
      }

      await this.prisma.syncRun.create({
        data: {
          startedAt,
          finishedAt: new Date(),
          success: true,
          source,
          containersSeen: seen.size,
          message: `Saved ${seen.size} containers`,
        },
      });

      return {
        success: true,
        message: `Saved ${seen.size} containers`,
        containersSeen: seen.size,
        emailSent: false,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Shipment refresh failed';
      this.logger.error(message);
      let emailSent = false;
      try {
        emailSent = await this.mail.sendSyncFailure(message);
      } catch (mailError) {
        this.logger.error(
          mailError instanceof Error
            ? mailError.message
            : 'Failure email could not be sent',
        );
      }
      await this.prisma.syncRun.create({
        data: {
          startedAt,
          finishedAt: new Date(),
          success: false,
          source,
          message,
          emailSent,
        },
      });
      return {
        success: false,
        message,
        containersSeen: 0,
        emailSent,
      };
    } finally {
      this.running = false;
    }
  }

  async saveFromFeed(containerNumber: string) {
    const item = await this.opentrack.getContainer(
      normalizeContainerNumber(containerNumber),
    );
    if (!item?.containerId) {
      return null;
    }
    const data = toTrackingData(item, new Date());
    return this.prisma.container.upsert({
      where: { containerNumber: data.containerNumber },
      create: data,
      update: data,
    });
  }
}
