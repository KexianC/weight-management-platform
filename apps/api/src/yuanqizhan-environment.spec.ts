import { assertSyntheticDatabaseBoundary } from './prisma.service';

describe('separate yuanqizhan synthetic database boundary', () => {
  const env = { RECONSTRUCTION_LOCAL_ONLY: 'true', NODE_ENV: 'test', API_BIND_ADDRESS: '127.0.0.1', PORT: '3361', RECONSTRUCTION_YUANQIZHAN_DB: 'rebuild_yuanqizhan_20261014t120000z', DATABASE_URL: 'mysql://synthetic:synthetic@127.0.0.1:3308/rebuild_yuanqizhan_20261014t120000z' };
  it('permits only the separate loopback activity database process', () => { expect(() => assertSyntheticDatabaseBoundary(env)).not.toThrow(); });
  it.each([
    { DATABASE_URL: 'mysql://synthetic:synthetic@127.0.0.1:3307/rebuild_yuanqizhan_20261014t120000z' },
    { DATABASE_URL: 'mysql://synthetic:synthetic@127.0.0.1:3308/rebuild_weightcare_test' },
    { API_BIND_ADDRESS: '0.0.0.0' }, { PORT: '3000' }, { NODE_ENV: 'production' },
    { RECONSTRUCTION_YUANQIZHAN_DB: 'production' },
  ])('rejects a changed host/database/runtime boundary: %p', (change) => { expect(() => assertSyntheticDatabaseBoundary({ ...env, ...change })).toThrow(); });
});
