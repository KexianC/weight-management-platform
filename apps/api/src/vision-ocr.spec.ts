import { createHash } from 'node:crypto';
import { configuredVisionOcrProvider, parseVisionContent, visionEndpoint, type OcrFetch } from './vision-ocr';

// One synthetic, anonymous 1×1 PNG; no uploaded or real customer file is part of this suite.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jUZkAAAAASUVORK5CYII=', 'base64');
const hash = createHash('sha256').update(png).digest('hex');
const image = { bytes: png, mimeType: 'image/png' };
const metrics = { fields: { weightKg: { value: 72, unit: 'kg' }, skeletalMuscleMassKg: { value: 28, unit: 'kg' } } };
function environment(provider: 'bailian' | 'deepseek' = 'bailian'): NodeJS.ProcessEnv {
  return { OCR_VISION_BASE_URL: provider === 'bailian' ? 'https://dashscope.aliyuncs.com/compatible-mode/v1' : 'https://api.deepseek.com', OCR_VISION_MODEL: provider === 'bailian' ? 'qwen3-vl-plus' : 'deepseek-flash', DASHSCOPE_API_KEY: 'unit-test-key-not-real', DEEPSEEK_API_KEY: 'unit-test-key-not-real', OCR_EXTERNAL_SYNTHETIC_SHA256_ALLOWLIST: hash, OCR_VISION_TIMEOUT_MS: '1000' };
}
function reply(content = JSON.stringify(metrics), finishReason = 'stop', headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ choices: [{ finish_reason: finishReason, message: { role: 'assistant', content } }] }), { headers: { 'content-type': 'application/json', ...headers } });
}

describe('official vision endpoints and complete configuration', () => {
  it.each([
    ['https://dashscope.aliyuncs.com/compatible-mode/v1', 'cn-beijing'],
    ['https://dashscope-intl.aliyuncs.com/compatible-mode/v1/', 'ap-southeast-1'],
    ['https://dashscope-us.aliyuncs.com/compatible-mode/v1', 'us-east-1'],
    ['https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1', 'cn-hongkong'],
    ['https://workspace-synthetic.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', 'cn-beijing'],
  ])('preserves explicit official Bailian target %s', (baseUrl, region) => {
    expect(visionEndpoint('bailian', baseUrl, region)).toEqual({ endpoint: `${baseUrl.replace(/\/$/, '')}/chat/completions`, region });
  });
  it.each(['https://api.deepseek.com', 'https://api.deepseek.com/v1', 'https://api.deepseek.com/chat/completions', 'https://api.deepseek.com/v1/chat/completions'])('accepts exact DeepSeek compatible endpoint %s', (baseUrl) => {
    expect(visionEndpoint('deepseek', baseUrl)?.endpoint).toBe(baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`);
  });
  it.each([
    'http://dashscope.aliyuncs.com/compatible-mode/v1', 'https://dashscope.aliyuncs.com.evil.invalid/compatible-mode/v1',
    'https://user:password@dashscope.aliyuncs.com/compatible-mode/v1', 'https://dashscope.aliyuncs.com:444/compatible-mode/v1',
    'https://dashscope.aliyuncs.com/compatible-mode/v1?redirect=elsewhere', 'https://dashscope.aliyuncs.com/compatible-mode/v1#fragment',
    'https://coding.dashscope.aliyuncs.com/v1', 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    'https://trial.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', 'https://other.unrecognised.maas.aliyuncs.com/compatible-mode/v1',
    'https://dashscope.aliyuncs.com/api/v1', 'https://dashscope.aliyuncs.com/compatible-mode/v1/../another',
    'https://api.deepseek.com/anthropic', 'https://127.0.0.1/v1',
    'https://constructor/compatible-mode/v1', 'https://__proto__/compatible-mode/v1', 'https://toString/compatible-mode/v1',
  ])('blocks non-approved address without requesting it %s', async (baseUrl) => {
    const fetcher = jest.fn<ReturnType<OcrFetch>, Parameters<OcrFetch>>();
    const provider = configuredVisionOcrProvider('bailian', { ...environment(), OCR_VISION_BASE_URL: baseUrl }, fetcher);
    expect(provider.status).toBe('UNCONFIGURED');
    expect((await provider.recognize({ image })).status).toBe('UNCONFIGURED');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('refuses a region mismatch without silently choosing a different region', () => {
    expect(visionEndpoint('bailian', environment().OCR_VISION_BASE_URL!, 'us-east-1')).toBeNull();
    expect(visionEndpoint('deepseek', 'https://api.deepseek.com', 'cn-beijing')).toBeNull();
  });
  it.each([
    { DASHSCOPE_API_KEY: '', BAILIAN_API_KEY: '' }, { OCR_VISION_BASE_URL: '' }, { OCR_VISION_MODEL: '' },
    { OCR_VISION_MODEL: 'deepseek-v4.1-flash' }, { OCR_EXTERNAL_SYNTHETIC_SHA256_ALLOWLIST: '' },
    { OCR_EXTERNAL_SYNTHETIC_SHA256_ALLOWLIST: '*' }, { OCR_EXTERNAL_SYNTHETIC_SHA256_ALLOWLIST: `${hash},not-a-hash` },
    { DASHSCOPE_API_KEY: 'synthetic\nheader' }, { OCR_VISION_TIMEOUT_MS: '0' }, { OCR_VISION_TIMEOUT_MS: '60001' },
  ])('remains unconfigured without every explicit prerequisite %j', async (overrides) => {
    const fetcher = jest.fn<ReturnType<OcrFetch>, Parameters<OcrFetch>>();
    const provider = configuredVisionOcrProvider('bailian', { ...environment(), ...overrides }, fetcher);
    expect(provider.status).toBe('UNCONFIGURED');
    expect(await provider.recognize({ image })).toMatchObject({ status: 'UNCONFIGURED', fields: {} });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('refuses the non-visual DeepSeek Pro and old chat aliases', () => {
    for (const model of ['deepseek-v4-pro', 'deepseek-chat', 'deepseek-v4.1-flash']) expect(configuredVisionOcrProvider('deepseek', { ...environment('deepseek'), OCR_VISION_MODEL: model }).status).toBe('UNCONFIGURED');
  });
});

describe('safe vendor request and actual synthetic-byte consent', () => {
  it.each(['bailian', 'deepseek'] as const)('sends approved inline bytes to %s using the official contract and preserves safe provenance', async (key) => {
    const fetcher = jest.fn<ReturnType<OcrFetch>, Parameters<OcrFetch>>().mockResolvedValue(reply());
    const provider = configuredVisionOcrProvider(key, environment(key), fetcher);
    const result = await provider.recognize({ image, localText: 'IDENTITY_MUST_NEVER_BE_SENT' });
    expect(provider.status).toBe('AVAILABLE');
    expect(result).toMatchObject({ status: 'DRAFT', fields: { weightKg: { value: 72, unit: 'kg', confidence: null, reviewRequired: true, source: key === 'bailian' ? 'BAILIAN_VISION' : 'DEEPSEEK_VISION' } } });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(visionEndpoint(key, environment(key).OCR_VISION_BASE_URL!)!.endpoint);
    expect(options).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(options.body as string);
    expect(body).toMatchObject({ model: key === 'bailian' ? 'qwen3-vl-plus' : 'deepseek-flash', stream: false, response_format: { type: 'json_object' } });
    expect(key === 'bailian' ? body.enable_thinking : body.thinking.type).toBe(key === 'bailian' ? false : 'disabled');
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content[1]).toEqual({ type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } });
    expect(options.body).not.toContain('IDENTITY_MUST_NEVER_BE_SENT');
    expect(body).not.toHaveProperty('tools');
    expect(JSON.stringify(result)).not.toContain('unit-test-key');
    expect(JSON.stringify(provider)).not.toContain('unit-test-key');
  });
  it('checks actual bytes rather than trusting spoofed SHA metadata', async () => {
    const fetcher = jest.fn<ReturnType<OcrFetch>, Parameters<OcrFetch>>();
    const changed = Buffer.from(png); changed[changed.length - 1] ^= 1;
    const provider = configuredVisionOcrProvider('bailian', environment(), fetcher);
    const result = await provider.recognize({ image: { bytes: changed, mimeType: 'image/png', sha256: hash } as typeof image });
    expect(result).toMatchObject({ status: 'FAILED', fields: {} });
    expect(result.errorMessage).toContain('未发送');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { bytes: png, mimeType: 'image/jpeg' }, { bytes: Buffer.from('not an image'), mimeType: 'image/png' },
    { bytes: Buffer.alloc(0), mimeType: 'image/png' }, { bytes: Buffer.alloc(10 * 1024 * 1024 + 1), mimeType: 'image/png' },
  ])('rejects MIME/signature/size mismatches before networking', async (badImage) => {
    const fetcher = jest.fn<ReturnType<OcrFetch>, Parameters<OcrFetch>>();
    expect((await configuredVisionOcrProvider('bailian', environment(), fetcher).recognize({ image: badImage })).status).toBe('FAILED');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('hashes and sends the same private Buffer copy when the caller later mutates its input', async () => {
    const original = Buffer.from(png);
    const fetcher = jest.fn<ReturnType<OcrFetch>, Parameters<OcrFetch>>().mockImplementation(async () => { original.fill(0); return reply(); });
    expect((await configuredVisionOcrProvider('bailian', environment(), fetcher).recognize({ image: { bytes: original, mimeType: 'image/png' } })).status).toBe('DRAFT');
    const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(body.messages[0].content[1].image_url.url).toBe(`data:image/png;base64,${png.toString('base64')}`);
  });
});

describe('strict JSON-only output and bounded transport failures', () => {
  it.each([
    JSON.stringify({ fields: { name: { value: 72, unit: 'kg' } } }),
    JSON.stringify({ fields: { weightKg: { value: 72, unit: 'kg', text: 'synthetic identity' } } }),
    JSON.stringify({ fields: { weightKg: { value: '72', unit: 'kg' } } }),
    JSON.stringify({ fields: { weightKg: { value: 501, unit: 'kg' } } }),
    JSON.stringify({ fields: { skeletalMuscleMassKg: { value: 151, unit: 'kg' } } }),
    JSON.stringify({ fields: { weightKg: { value: 72, unit: 'kgsynthetic@example.invalid' } } }),
    '{"fields":{"weightKg":{"value":1e999,"unit":"kg"}}}',
    '{"fields":{"weightKg":{"value":72,"unit":"kg"},"we\\u0069ghtKg":{"value":70,"unit":"kg"}}}',
    '{"fields":{"weightKg":{"value":72,"unit":"kg","unit":"kg"}}}',
    `${JSON.stringify(metrics)}\nsynthetic identity tail`, '```json\n' + JSON.stringify(metrics) + '\n```',
    JSON.stringify({ fields: {}, name: 'synthetic identity' }), '{"fields":', JSON.stringify({ fields: {} }),
  ])('fails closed on malformed, ambiguous, unknown or private supplier content', async (content) => {
    const fetcher = jest.fn<ReturnType<OcrFetch>, Parameters<OcrFetch>>().mockResolvedValue(reply(content));
    const result = await configuredVisionOcrProvider('bailian', environment(), fetcher).recognize({ image });
    expect(result).toMatchObject({ status: 'FAILED', fields: {} });
    expect(JSON.stringify(result)).not.toMatch(/synthetic identity|synthetic@example|unit-test-key/);
  });
  it('normalizes an explicit BMI unit but never changes a metric identity', () => {
    expect(parseVisionContent('{"fields":{"bmi":{"value":25.5,"unit":"kg/m2"}}}', 'deepseek').bmi).toMatchObject({ unit: 'kg/m²', source: 'DEEPSEEK_VISION' });
  });
  it.each(['length', 'tool_calls', 'content_filter', 'aborted', 'unknown'])('rejects %s even when the JSON is otherwise valid', async (reason) => {
    const fetcher = jest.fn<ReturnType<OcrFetch>, Parameters<OcrFetch>>().mockResolvedValue(reply(JSON.stringify(metrics), reason));
    expect((await configuredVisionOcrProvider('bailian', environment(), fetcher).recognize({ image })).status).toBe('FAILED');
  });
  it('rejects Bailian partial-response headers and refusals', async () => {
    const fetcher = jest.fn<ReturnType<OcrFetch>, Parameters<OcrFetch>>().mockResolvedValueOnce(reply(JSON.stringify(metrics), 'stop', { 'x-dashscope-partialresponse': 'true' })).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(metrics), refusal: 'synthetic private refusal' } }] }), { headers: { 'content-type': 'application/json' } }));
    const provider = configuredVisionOcrProvider('bailian', environment(), fetcher);
    expect((await provider.recognize({ image })).status).toBe('FAILED');
    const result = await provider.recognize({ image });
    expect(result.status).toBe('FAILED');
    expect(JSON.stringify(result)).not.toContain('private refusal');
  });
  it('rejects redirected responses and keeps upstream error bodies/credentials out of results', async () => {
    const redirected = reply(); Object.defineProperty(redirected, 'redirected', { value: true });
    const fetcher = jest.fn<ReturnType<OcrFetch>, Parameters<OcrFetch>>().mockResolvedValueOnce(redirected).mockResolvedValueOnce(new Response('synthetic private body and unit-test-key-not-real', { status: 401 }));
    const provider = configuredVisionOcrProvider('bailian', environment(), fetcher);
    expect((await provider.recognize({ image })).status).toBe('FAILED');
    expect(JSON.stringify(await provider.recognize({ image }))).not.toMatch(/private body|unit-test-key/);
  });
  it('redacts thrown transport errors instead of copying error messages', async () => {
    const fetcher = jest.fn<ReturnType<OcrFetch>, Parameters<OcrFetch>>().mockRejectedValue(new Error('synthetic key and private request payload'));
    const result = await configuredVisionOcrProvider('deepseek', environment('deepseek'), fetcher).recognize({ image });
    expect(result.status).toBe('FAILED');
    expect(JSON.stringify(result)).not.toMatch(/synthetic key|private request/);
  });
  it('enforces the streamed body limit even without content-length and cancels reading', async () => {
    const cancel = jest.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(65537)); }, cancel });
    const fetcher = jest.fn<ReturnType<OcrFetch>, Parameters<OcrFetch>>().mockResolvedValue(new Response(stream, { headers: { 'content-type': 'application/json' } }));
    expect((await configuredVisionOcrProvider('bailian', environment(), fetcher).recognize({ image })).status).toBe('FAILED');
    expect(cancel).toHaveBeenCalled();
  });
  it('rejects an oversized declared body before reading it and cancels the stream', async () => {
    const cancel = jest.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const fetcher = jest.fn<ReturnType<OcrFetch>, Parameters<OcrFetch>>().mockResolvedValue(new Response(stream, { headers: { 'content-type': 'application/json', 'content-length': '65537' } }));
    expect((await configuredVisionOcrProvider('bailian', environment(), fetcher).recognize({ image })).status).toBe('FAILED');
    expect(cancel).toHaveBeenCalled();
  });
  it('times out fetch even when the injected transport ignores AbortSignal', async () => {
    jest.useFakeTimers();
    try {
      const fetcher = jest.fn<ReturnType<OcrFetch>, Parameters<OcrFetch>>().mockImplementation(() => new Promise(() => undefined));
      const pending = configuredVisionOcrProvider('bailian', environment(), fetcher).recognize({ image });
      await jest.advanceTimersByTimeAsync(1000);
      expect(await pending).toMatchObject({ status: 'FAILED', errorMessage: expect.stringContaining('超时') });
      expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
    } finally { jest.useRealTimers(); }
  });
  it('times out and cancels a stalled response body after successful headers', async () => {
    jest.useFakeTimers();
    try {
      const cancel = jest.fn();
      const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(Buffer.from('{')); }, cancel });
      const fetcher = jest.fn<ReturnType<OcrFetch>, Parameters<OcrFetch>>().mockResolvedValue(new Response(stream, { headers: { 'content-type': 'application/json' } }));
      const pending = configuredVisionOcrProvider('bailian', environment(), fetcher).recognize({ image });
      await jest.advanceTimersByTimeAsync(1000);
      expect(await pending).toMatchObject({ status: 'FAILED', errorMessage: expect.stringContaining('超时') });
      expect(cancel).toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });
});
