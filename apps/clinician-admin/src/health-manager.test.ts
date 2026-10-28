import { describe, expect, it } from 'vitest';
import { businessPayload } from './HealthManagerRecords';
describe('health manager read-only business projection',()=>{
  it('removes authentication metadata recursively while preserving clinical values',()=>{
    expect(businessPayload({activity:'虚构步行',durationMinutes:20,passwordHash:'fixture-secret',nested:{accessToken:'fixture-token',businessNote:'虚构说明'},items:[{api_key:'fixture-key',sleepHours:0}]})).toEqual({activity:'虚构步行',durationMinutes:20,nested:{businessNote:'虚构说明'},items:[{sleepHours:0}]});
  });
  it('does not mutate the original API response when projecting display values',()=>{
    const row={activity:'虚构步行',password:'fixture-password'};businessPayload(row);expect(row.password).toBe('fixture-password');
  });
});

