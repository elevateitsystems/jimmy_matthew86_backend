import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ContainersService } from './containers.service.js';
import { ContainersSyncService } from './containers.sync.service.js';
import { ListContainersQueryDto } from './dto/list-containers.dto.js';
import { UpdateContainerDto } from './dto/update-container.dto.js';

@Controller('containers')
@UseGuards(JwtAuthGuard)
export class ContainersController {
  constructor(
    private readonly containers: ContainersService,
    private readonly sync: ContainersSyncService,
  ) {}

  @Get('summary')
  summary() {
    return this.containers.summary();
  }

  @Get('export')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="containers.xlsx"')
  async export(@Query() query: ListContainersQueryDto) {
    const file = await this.containers.export(query);
    return new StreamableFile(file);
  }

  @Post('sync')
  async syncNow() {
    const result = await this.sync.run('manual');
    if (!result.success) {
      throw new ServiceUnavailableException(result.message);
    }
    return result;
  }

  @Get()
  findAll(@Query() query: ListContainersQueryDto) {
    return this.containers.list(query);
  }

  @Get(':containerNumber')
  findOne(@Param('containerNumber') containerNumber: string) {
    return this.containers.findOne(containerNumber);
  }

  @Patch(':containerNumber')
  update(
    @Param('containerNumber') containerNumber: string,
    @Body() dto: UpdateContainerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.containers.update(containerNumber, dto, user);
  }
}
