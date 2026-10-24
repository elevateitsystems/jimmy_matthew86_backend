import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SettingsModule } from '../settings/settings.module.js';
import { ContainersController } from './containers.controller.js';
import { ContainersService } from './containers.service.js';
import { ContainersSyncService } from './containers.sync.service.js';
import { OpenTrackClient } from './opentrack.client.js';

@Module({
  imports: [ScheduleModule.forRoot(), SettingsModule],
  controllers: [ContainersController],
  providers: [ContainersService, ContainersSyncService, OpenTrackClient],
})
export class ContainersModule {}
