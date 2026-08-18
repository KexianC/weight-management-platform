const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

export async function createWeightRecord(token: string, weightKg: number) {
  const response = await fetch(`${API_BASE}/workflow/me/health-records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ weightKg, measuredAt: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error('体重记录同步失败');
  return response.json();
}
