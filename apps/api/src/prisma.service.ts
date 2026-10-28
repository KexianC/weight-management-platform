import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export function assertSyntheticDatabaseBoundary(env: NodeJS.ProcessEnv) {
  if (env.RECONSTRUCTION_LOCAL_ONLY !== 'true') return;
  const uri = new URL(env.DATABASE_URL ?? '');
  const database = uri.pathname.slice(1);
  const normal = database === 'rebuild_weightcare_test';
  const isolatedRestore = env.NODE_ENV === 'test' && env.API_BIND_ADDRESS === '127.0.0.1'
    && env.PORT === '3311' && env.RECONSTRUCTION_RESTORE_DB === database
    && /^rebuild_weightcare_restore_[a-z0-9]{8,16}$/.test(database);
  const isolatedBodyOcr = env.NODE_ENV === 'test' && env.API_BIND_ADDRESS === '127.0.0.1' && env.PORT === '3359'
    && env.RECONSTRUCTION_BODY_OCR_DB === database && /^rebuild_body_cloud_[0-9]{8}t[0-9]{6}z$/.test(database);
  const isolatedYuanqizhan = env.NODE_ENV === 'test' && env.API_BIND_ADDRESS === '127.0.0.1' && env.PORT === '3361'
    && env.RECONSTRUCTION_YUANQIZHAN_DB === database && /^rebuild_yuanqizhan_[0-9]{8}t[0-9]{6}z$/.test(database)
    && uri.port === '3308';
  const previousBoundary = uri.port === '3307' && (normal || isolatedRestore || isolatedBodyOcr);
  if (uri.protocol !== 'mysql:' || uri.hostname !== '127.0.0.1' || (!previousBoundary && !isolatedYuanqizhan)) {
    throw new Error('Local reconstruction refuses a database outside the isolated synthetic boundary');
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    assertSyntheticDatabaseBoundary(process.env);
    await this.$connect();
  }
  async onModuleDestroy() { await this.$disconnect(); }
}
