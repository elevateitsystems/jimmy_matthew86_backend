import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { MailService } from '../mail/mail.service.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { SettingsService } from './settings.service.js';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly mail: MailService,
  ) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Patch()
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }

  @Post('reset')
  reset() {
    return this.settings.reset();
  }

  @Post('test-email')
  async testEmail() {
    const result = await this.mail.sendTest();
    if (!result.sent) {
      throw new ServiceUnavailableException(result.message);
    }
    return result;
  }
}
