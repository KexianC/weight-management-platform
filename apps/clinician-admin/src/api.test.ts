import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from './api';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('ApiClient', () => {
  it('sends the bearer token and unwraps a successful API envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ code: 200, data: { items: [{ id: 'p1', displayName: '患者甲' }], total: 1 } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient(() => 'signed-token', 'https://api.example.test/api/v1');
    const page = await client.listPatients({ pageSize: 20 });
    expect(page.total).toBe(1);
    expect(page.items[0].displayName).toBe('患者甲');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/clinical/patients?pageSize=20',
      expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer signed-token' }) }),
    );
  });

  it('creates and binds a patient with explicit authorization confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      patient: { id: 'p2', displayName: '患者乙', phone: '13800000022', patientProfile: { heightCm: 168 } },
      accountCreated: true,
      relationCreated: true,
      relationActivated: true,
      passwordSetupRequired: true,
      nextStep: 'SMS_LOGIN_OR_PASSWORD_SETUP',
      message: '患者账号已创建并完成绑定',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient(() => 'signed-token', 'https://api.example.test/api/v1');
    const created = await client.createPatient({
      phone: '13800000022', displayName: '患者乙', gender: 'FEMALE', heightCm: 168,
      initialWeightKg: 72.5, targetWeightKg: 65, patientAuthorizationConfirmed: true,
    });
    expect(created).toMatchObject({
      patient: { id: 'p2', displayName: '患者乙', phone: '13800000022', heightCm: 168 },
      accountCreated: true, relationCreated: true, relationActivated: true, passwordSetupRequired: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/clinical/patients',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer signed-token', 'content-type': 'application/json' }),
        body: JSON.stringify({
          phone: '13800000022', displayName: '患者乙', gender: 'FEMALE', heightCm: 168,
          initialWeightKg: 72.5, targetWeightKg: 65, patientAuthorizationConfirmed: true,
        }),
      }),
    );
  });

  it('reports an existing account binding without inventing credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      patient: { id: 'p3', displayName: '已有患者', phone: '13800000023' },
      accountCreated: false, relationCreated: true, relationActivated: true,
    })));
    const client = new ApiClient(() => 'signed-token', 'https://api.example.test/api/v1');
    await expect(client.createPatient({
      phone: '13800000023', displayName: '已有患者', patientAuthorizationConfirmed: true,
    })).resolves.toMatchObject({
      accountCreated: false, relationCreated: true, relationActivated: true, temporaryPassword: undefined,
    });
  });

  it('reads an empty archive and saves a version-checked draft', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ archive: null }))
      .mockResolvedValueOnce(jsonResponse({ archive: {
        id: 'archive-1', patientId: 'p1', status: 'DRAFT', templateVersion: 'TCM_WEIGHT_V1',
        answers: { occupation: 'TEACHER', weightKg: 72.5 }, completionPercent: 22,
        updatedAt: '2026-08-18T10:00:00.000Z', createdAt: '2026-08-18T09:00:00.000Z',
      } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient(() => 'signed-token', 'https://api.example.test/api/v1');
    await expect(client.getPatientArchive('p1')).resolves.toBeNull();
    await expect(client.savePatientArchive('p1', {
      status: 'DRAFT', answers: { occupation: 'TEACHER', weightKg: 72.5 }, completionPercent: 22,
      expectedUpdatedAt: '2026-08-18T09:30:00.000Z',
    })).resolves.toMatchObject({ id: 'archive-1', status: 'DRAFT', completionPercent: 22, answers: { weightKg: 72.5 } });
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.example.test/api/v1/clinical/patients/p1/archive',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          status: 'DRAFT', answers: { occupation: 'TEACHER', weightKg: 72.5 }, completionPercent: 22,
          expectedUpdatedAt: '2026-08-18T09:30:00.000Z',
        }),
      }),
    );
  });

  it('normalizes a completed archive returned by the backend envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ archive: {
      id: 'archive-2', patientId: 'p2', status: 'COMPLETED', templateVersion: 'TCM_WEIGHT_V1',
      answers: { medicalAdvice: '规律复诊' }, completionPercent: 100, completedAt: '2026-08-18T10:00:00.000Z',
    } })));
    const client = new ApiClient(() => 'signed-token', 'https://api.example.test/api/v1');
    await expect(client.getPatientArchive('p2')).resolves.toMatchObject({
      patientId: 'p2', status: 'COMPLETED', completionPercent: 100, answers: { medicalAdvice: '规律复诊' },
    });
  });

  it('surfaces validation errors instead of reporting false success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: ['计划时间不能为空', '患者无访问权限'] }, 422)));
    const client = new ApiClient(() => 'signed-token', 'https://api.example.test/api/v1');
    await expect(client.createFollowUp({ patientId: 'p1', type: 'WEIGHT', priority: 'NORMAL', scheduledAt: '' }))
      .rejects.toMatchObject({ status: 422, message: '计划时间不能为空；患者无访问权限' });
  });

  it('logs practitioners in without a role choice and reads the nested practitioner profile', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      accessToken: 'access', refreshToken: 'refresh',
      user: { id: 'u1', displayName: '陈医生', role: 'DOCTOR', practitionerProfile: { hospital: '中心医院', department: '营养科', title: '主任医师' } },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient(() => null, 'https://api.example.test/api/v1');
    await expect(client.login('13800000000', 'password')).resolves.toMatchObject({
      accessToken: 'access', refreshToken: 'refresh',
      user: { role: 'DOCTOR', hospital: '中心医院', department: '营养科', title: '主任医师' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/auth/practitioner-login',
      expect.objectContaining({ body: JSON.stringify({ phone: '13800000000', password: 'password' }) }),
    );
  });

  it('uses the landed follow-up contract and returns the first created occurrence', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      items: [{ id: 'f1', patientId: 'p1', type: 'DIET', status: 'SCHEDULED', scheduledAt: '2026-08-18T09:00:00.000Z' }],
      total: 1,
      recurrenceSeriesId: null,
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient(() => 'signed-token', 'https://api.example.test/api/v1');
    const created = await client.createFollowUp({
      patientId: 'p1', type: 'DIET', priority: 'HIGH', scheduledAt: '2026-08-18T09:00:00.000Z',
      note: '复核饮食记录', recurrence: { frequency: 'weekly', count: 4 },
    });
    expect(created).toMatchObject({ id: 'f1', patientId: 'p1', status: 'PENDING' });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      patientIds: ['p1'], followType: 'DIET', priority: 'HIGH', scheduledAt: '2026-08-18T09:00:00.000Z',
      note: '复核饮食记录', recurrence: { frequency: 'weekly', count: 4 },
    });
  });

  it('normalizes object-shaped latestMessage from the conversations endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ items: [{
      id: 'p1', peerId: 'p1', peer: { id: 'p1', displayName: '患者甲' }, unreadCount: 2,
      latestMessage: { content: '体重记录已上传', createdAt: '2026-08-17T08:00:00.000Z' },
    }], total: 1 })));
    const client = new ApiClient(() => 'signed-token', 'https://api.example.test/api/v1');
    await expect(client.listConversations()).resolves.toEqual([expect.objectContaining({
      peerId: 'p1', peerName: '患者甲', lastMessage: '体重记录已上传', lastMessageAt: '2026-08-17T08:00:00.000Z', unreadCount: 2,
    })]);
  });

  it('publishes and normalizes a patient weekly care summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      id: 'summary-1', patientId: 'p1', practitionerId: 'd1', periodType: 'WEEKLY',
      periodStart: '2026-08-16T16:00:00.000Z', periodEnd: '2026-08-22T16:00:00.000Z',
      metrics: { weightChangeKg: -1.2, dietRecordCount: 6, exerciseRecordCount: 3, taskCount: 4, completedTaskCount: 3 },
      comment: '本周减重节奏平稳，请继续保持。', publishedAt: '2026-08-18T12:00:00.000Z',
      practitioner: { id: 'd1', displayName: '陈医生', role: 'DOCTOR', practitionerProfile: { title: '主任医师' } },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient(() => 'signed-token', 'https://api.example.test/api/v1');
    await expect(client.publishPatientCareSummary('p1', {
      periodType: 'WEEKLY', referenceDate: '2026-08-18', comment: '本周减重节奏平稳，请继续保持。',
    })).resolves.toMatchObject({
      id: 'summary-1', periodType: 'WEEKLY', metrics: { weightChangeKg: -1.2, completedTaskCount: 3 },
      practitioner: { displayName: '陈医生', title: '主任医师' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/clinical/patients/p1/care-summaries',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({
        periodType: 'WEEKLY', referenceDate: '2026-08-18', comment: '本周减重节奏平稳，请继续保持。',
      }) }),
    );
  });

  it('tries a compatibility route only after a 404', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ message: 'Not Found' }, 404)).mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient(() => 'signed-token', 'https://api.example.test/api/v1');
    await expect(client.listFollowUps()).resolves.toMatchObject({ items: [], total: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not hide server failures behind a fallback request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: '数据库暂不可用' }, 503));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient(() => 'signed-token', 'https://api.example.test/api/v1');
    await expect(client.listFollowUps()).rejects.toEqual(expect.objectContaining({ name: 'ApiError', status: 503, message: '数据库暂不可用' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
