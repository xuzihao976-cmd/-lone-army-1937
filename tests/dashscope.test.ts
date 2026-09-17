import { afterEach, describe, expect, it, vi } from 'vitest';
import { callDashscope } from '../worker/dashscope';
import worker from '../worker/index';
const env = { DASHSCOPE_API_KEY: 'test-only-key', DASHSCOPE_FREE_ONLY_CONFIRMED: 'true' };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('DashScope free-tier integration', () => {
  it.each([{}, { DASHSCOPE_API_KEY: 'test-only-key' }])('never requests inference before setup is complete', async setup => {
    const mock = vi.fn(); vi.stubGlobal('fetch', mock);
    expect((await callDashscope(setup, 'rules', 'hello', '', 'intent')).status).toBe(503);
    expect(mock).not.toHaveBeenCalled();
  });
  it('sends a server-only key to Beijing, disables thinking and requests JSON intents', async () => {
    const mock = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '收到' } }] })); vi.stubGlobal('fetch', mock);
    const result = await callDashscope(env, 'rules', 'hello', '', 'intent');
    expect(result.error).toBeUndefined();
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-only-key');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'qwen3.7-flash', enable_thinking: false, stream: false, response_format: { type: 'json_object' } });
  });
  it('stops on free-tier exhaustion without retrying or selecting another model', async () => {
    const mock = vi.fn().mockResolvedValue(Response.json({ error: { code: 'AllocationQuota.FreeTierOnly', message: 'private' } }, { status: 403 })); vi.stubGlobal('fetch', mock);
    expect(await callDashscope(env, 'rules', 'hello', '', 'intent')).toEqual({ error: 'dashscope_free_quota_exhausted', status: 403 });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('keeps the full worker response free of credentials and does not call Cloudflare inference', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '{"type":"chat","reply":"收到"}' } }] })));
    const cfRun = vi.fn();
    const result = await worker.fetch(new Request('https://example.test/api/narrate', { method:'POST', headers:{ Origin:'https://game.test' }, body:JSON.stringify({mode:'intent',prompt:'hello'}) }), { ...env, AI_PROVIDER:'dashscope', AI:{run:cfRun}, RATE_LIMITER:{limit:async()=>({success:true})}, ALLOWED_ORIGIN:'https://game.test' });
    expect(result.status).toBe(200); expect(await result.json()).toEqual({ text:'{"type":"chat","reply":"收到"}' }); expect(cfRun).not.toHaveBeenCalled();
  });
  it('aborts a stalled provider call', async () => {
    vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, init) => new Promise((_resolve,reject) => init.signal.addEventListener('abort',()=>reject(new Error('aborted'))))));
    const result=callDashscope(env,'rules','hello','','intent');
    await vi.advanceTimersByTimeAsync(7000);
    expect(await result).toEqual({error:'dashscope_timeout',status:503});
  });
});
