import { DailyRoutineService, ROUTINE_SOURCE, routineDate, sleepDuration } from './daily-routine';

function harness(initial: any[] = [], legacy: any[] = []) {
  const records = structuredClone(initial), days = structuredClone(legacy);
  const tx: any = { $queryRaw: jest.fn(async () => []), mediaAsset: { updateMany: jest.fn(async () => ({ count: 0 })) } };
  const find = (where: any) => records.find(row => where.id ? row.id === where.id : row.requestKey === where.requestKey) ?? null;
  tx.healthRecord = {
    findUnique: jest.fn(async ({ where }) => find(where)),
    findMany: jest.fn(async ({ where }) => records.filter(row => row.patientId === where.patientId && where.recordType.in.includes(row.recordType)
      && row.measuredAt >= where.measuredAt.gte && row.measuredAt < where.measuredAt.lt).sort((a, b) => b.measuredAt.getTime() - a.measuredAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))),
    create: jest.fn(async ({ data }) => { const row = { id: 'new-' + records.length, weightKg: null, waistCm: null, sleepHours: null, payload: null, imageUrls: null, createdAt: new Date(), updatedAt: new Date(), ...data }; records.push(row); return row; }),
    update: jest.fn(async ({ where, data }) => { const row = find(where); if (!row) throw Error('missing'); Object.assign(row, data, { updatedAt: new Date() }); return row; }),
    delete: jest.fn(async ({ where }) => { const index = records.findIndex(row => row.id === where.id); return records.splice(index, 1)[0]; }),
  };
  tx.dailyCheckInRecord = {
    findUnique: jest.fn(async ({ where }) => days.find(row => where.id ? row.id === where.id : row.patientId === where.patientId_date.patientId && row.date === where.patientId_date.date) ?? null),
    create: jest.fn(async ({ data }) => { const row = { id: 'day-' + days.length, updatedAt: new Date(), ...data }; days.push(row); return row; }),
    update: jest.fn(async ({ where, data }) => { const row = days.find(row => row.id === where.id); Object.assign(row, data, { updatedAt: new Date() }); return row; }),
    delete: jest.fn(async ({ where }) => days.splice(days.findIndex(row => row.id === where.id), 1)[0]),
    deleteMany: jest.fn(async ({ where }) => { const found = days.filter(row => row.patientId === where.patientId && row.healthRecordId === where.healthRecordId); found.forEach(row => days.splice(days.indexOf(row), 1)); return { count: found.length }; }),
  };
  return { tx, records, days, service: new DailyRoutineService(tx) };
}
function record(id: string, type: string, patch = {}): any {
  const measuredAt = new Date('2026-11-13T01:30:00Z');
  return { id, patientId: 'patient', recordType: type, source: 'MANUAL', measuredAt, createdAt: measuredAt, updatedAt: measuredAt, weightKg: null, waistCm: null, sleepHours: null, payload: null, imageUrls: [], note: null, ...patch };
}

describe('shared routine uses real records without replacing their history', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-13T06:00:00Z')); });
  afterEach(() => jest.useRealTimers());

  it('reads the latest matching entry, counts other meals, and never writes while reading', async () => {
    const h = harness([
      record('a', 'DIET', { mealType: 'BREAKFAST', note: 'earlier', measuredAt: new Date('2026-11-13T00:00:00Z') }),
      record('b', 'DIET', { mealType: 'BREAKFAST', note: 'latest' }), record('c', 'DIET', { mealType: 'SNACK', note: 'extra' }),
      record('w', 'WEIGHT', { weightKg: 68, waistCm: 20.25 }),
    ]);
    const value = await h.service.read(h.tx, 'patient', '2026-11-13');
    expect(value.answers).toMatchObject({ breakfast_text: 'latest', waist_cm: 20.25 });
    expect(value.recordCounts).toMatchObject({ breakfast: 2, snack: 1, weight: 1 });
    expect(value.refs.breakfast.id).toBe('b'); expect(value.weightKg).toBe(68);
    expect(h.tx.healthRecord.create).not.toHaveBeenCalled(); expect(h.tx.dailyCheckInRecord.create).not.toHaveBeenCalled();
  });

  it('preserves nine photos, food detail, calories and existing IDs on a partial text save without weight', async () => {
    const row = record('meal', 'DIET', { mealType: 'BREAKFAST', note: 'old', imageUrls: Array.from({ length: 9 }, (_, i) => 'photo-' + i), mealItems: [{ name: 'egg', caloriesKcal: 70 }], caloriesKcal: 70, caloriesSource: 'MANUAL', reviews: [{ id: 'review' }] });
    const h = harness([row]);
    let value = await h.service.apply(h.tx, 'patient', '2026-11-13', undefined, { water_ml: 0 }, ['water_ml']);
    expect(value.weightKg).toBeNull(); expect(value.answers.water_ml).toBe(0); expect(h.days).toHaveLength(0);
    const revision = value.revision;
    value = await h.service.apply(h.tx, 'patient', '2026-11-13', undefined, { breakfast_text: 'updated' }, ['breakfast_text']);
    expect(value.revision).not.toBe(revision); expect(value.answers.water_ml).toBe(0);
    expect(value.answers.breakfast_photo_ids).toHaveLength(9);
    expect(h.records.find(row => row.id === 'meal')).toMatchObject({ id: 'meal', note: 'updated', mealItems: row.mealItems, caloriesKcal: 70, caloriesSource: 'MANUAL', reviews: row.reviews });
    expect(h.records.filter(row => row.recordType === 'DIET')).toHaveLength(1);
    expect(h.records.filter(row => row.source === ROUTINE_SOURCE)).toHaveLength(1);
  });

  it('retains diet and water after deleting the linked weight, without violating the mirror FK', async () => {
    const h = harness([record('w', 'WEIGHT', { weightKg: 70 }), record('m', 'DIET', { mealType: 'LUNCH', note: 'lunch', imageUrls: ['photo'] })]);
    await h.service.apply(h.tx, 'patient', '2026-11-13', undefined, { water_ml: 1500 }, ['water_ml']);
    expect(h.days).toHaveLength(1);
    await h.service.beforeDelete(h.tx, h.records.find(row => row.id === 'w'));
    expect(h.days).toHaveLength(0);
    await h.tx.healthRecord.delete({ where: { id: 'w' } });
    const result = await h.service.changed(h.tx, 'patient', '2026-11-13', ['weight']);
    expect(result.weightKg).toBeNull(); expect(result.answers).toMatchObject({ water_ml: 1500, lunch_text: 'lunch', lunch_photo_ids: ['photo'] });
    expect(result.hasData).toBe(true); expect(h.days).toHaveLength(0);
  });

  it('converts legacy fields in their original day once and never overwrites existing typed entries or weight', async () => {
    const time = new Date('2026-11-12T03:21:00Z');
    const weight = record('w', 'WEIGHT', { source: 'DAILY_CHECK_IN', weightKg: 70, measuredAt: time, createdAt: time, updatedAt: time });
    const lunch = record('l', 'DIET', { mealType: 'LUNCH', note: 'typed wins', measuredAt: time, createdAt: time, updatedAt: time, mealItems: [{ name: 'food' }] });
    const h = harness([weight, lunch], [{ id: 'legacy', patientId: 'patient', date: '2026-11-12', version: 4, weightKg: 70, healthRecordId: 'w', updatedAt: time, answers: { water_ml: 1000, breakfast_text: 'legacy breakfast', lunch_text: 'old lunch', sleep_start: '23:00', sleep_end: '07:00', exercise_minutes: 0 } }]);
    const first = await h.service.importLegacy(h.tx, 'patient', '2026-11-12', 4), count = h.records.length;
    expect(first.converted).toBe(true);
    const again = await h.service.importLegacy(h.tx, 'patient', '2026-11-12', 4);
    expect(again).toMatchObject({ converted: false, alreadyConverted: true, version: first.version }); expect(h.records).toHaveLength(count);
    expect(h.records.find(row => row.id === 'w')).toEqual(weight); expect(h.records.find(row => row.id === 'l')).toEqual(lunch);
    for (const row of h.records.filter(row => row.source === 'DAILY_CHECK_IN' && row.id !== 'w')) expect(row.measuredAt).toEqual(time);
    const snapshot = await h.service.read(h.tx, 'patient', '2026-11-12');
    expect(snapshot.answers).toMatchObject({ breakfast_text: 'legacy breakfast', lunch_text: 'typed wins', sleep_hours: 8, exercise_minutes: 0, water_ml: 1000 });
  });

  it('does not expose legacy remote URLs as media IDs and preserves valid 191-character IDs', async () => {
    const id = 'x'.repeat(191), h = harness([record('meal', 'DIET', { mealType: 'DINNER', imageUrls: ['https://old.example/private?token=secret', id] })]);
    const value = await h.service.read(h.tx, 'patient', '2026-11-13');
    expect(value.answers.dinner_photo_ids).toEqual([id]); expect(value.legacyMediaUnlinked).toEqual(['dinner']);
    expect(JSON.stringify(value.answers)).not.toContain('https:');
  });

  it('derives cross-midnight duration only from two known times', () => {
    expect(sleepDuration('23:00', '07:30')).toBe(8.5); expect(sleepDuration('07:00', '07:00')).toBe(0);
    expect(sleepDuration('23:00', undefined)).toBeUndefined(); expect(sleepDuration('24:00', '07:00')).toBeUndefined();
    expect(routineDate(new Date('2026-11-12T16:00:00Z'))).toBe('2026-11-13');
  });
});
