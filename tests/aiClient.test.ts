import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialStats } from '../storage/saveStore';
import { TACTICS } from '../data/tactics';

let client: typeof import('../services/aiClient');
const fetchMock = vi.fn();
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('VITE_AI_GATEWAY_URL', 'https://example.workers.dev');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  client = await import('../services/aiClient');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const interpret = () => client.interpretUnknownCommand('副官，家乡的桂花开了吗', createInitialStats());
describe('AI failure diagnostics and safe fallback', () => {
  it('never requests a model from advisor while AI is off', async () => {
    await client.generateAdvisorResponse([], '陌生的题外话', undefined, {stats:createInitialStats(),enabled:false});
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('uses known local rules even with AI enabled', async () => {
    const r=await client.generateAdvisorResponse([], '怎么治疗伤员', undefined, {stats:createInitialStats(),enabled:true});
    expect(r.source).toBe('local');expect(r.text).toContain('60分钟');expect(fetchMock).not.toHaveBeenCalled();
    for (const card of TACTICS) {
      const answer = await client.generateAdvisorResponse([], `${card.title}怎么用？`, undefined,
        { stats: createInitialStats(1937, card.chapterId, card.id), enabled: true });
      expect(answer.source).toBe('local');
      expect(answer.text).toContain(card.effect);
      expect(answer.text).toContain(card.tradeoff);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('shows the provider cause instead of a generic 503', async () => {
    fetchMock.mockResolvedValue(Response.json({error:'ai_inference_failed',upstreamCode:3036,detail:'private'}, {status:503}));
    const result=await interpret();
    expect(client.describeAiFailure(result.failure!)).toContain('CF 3036');
    expect(client.describeAiFailure(result.failure!)).toContain('额度');
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it.each([401, 403, 429, 503])('preserves HTTP %i and does not retry during backoff', async status => {
    fetchMock.mockResolvedValue(new Response('unavailable', { status }));
    const result = await interpret();
    expect(result.order).toBeNull();
    expect(result.failure).toEqual({ code: 'http', status });
    expect(client.describeAiFailure(result.failure!)).toContain(String(status));
    expect(await interpret()).toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('distinguishes network failure from a known HTTP response', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect((await interpret()).failure?.code).toBe('network');
  });
  it('times out and restores a usable local result', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = interpret();
    await vi.advanceTimersByTimeAsync(8000);
    expect((await pending).failure?.code).toBe('timeout');
  });
  it('does not misreport player cancellation as an outage', async () => {
    const controller = new AbortController(); controller.abort();
    const result = await client.interpretUnknownCommand('家乡的桂花', createInitialStats(), controller.signal);
    expect(result.failure?.code).toBe('cancelled');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('identifies non-JSON gateway content', async () => {
    fetchMock.mockResolvedValue(new Response('<html>gateway error</html>'));
    expect((await interpret()).failure?.code).toBe('invalid_response');
  });
  it.each(['not json', '{"type":"chat","reply":"   "}', '{"type":"order","action":"cheat","confidence":1}'])('rejects unusable model output %s', async text => {
    fetchMock.mockResolvedValue(Response.json({ text }));
    expect((await interpret()).failure?.code).toBe('invalid_order');
  });
  it('clears previous error after reset and successful response', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await interpret();
    client.resetAiGatewayProbe();
    fetchMock.mockResolvedValue(Response.json({ text: '{"type":"chat","reply":"长官，家乡的花该开了。"}' }));
    expect(await interpret()).toEqual({ order: { reply: '长官，家乡的花该开了。' }, failure: undefined });
  });
});
