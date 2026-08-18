import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma?: PrismaService) {}

  @Get() check() { return { status: 'ok', service: 'weight-care-api', timestamp: new Date().toISOString() }; }

  @Get('ready')
  async ready() {
    if (!this.prisma) throw new ServiceUnavailableException('数据库尚未连接');
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'up', timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException('数据库连接不可用');
    }
  }
}
