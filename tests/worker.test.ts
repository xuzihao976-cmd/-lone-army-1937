import { describe, expect, it, vi } from 'vitest';
import worker from '../worker/index';
const origin = 'https://xuzihao976-cmd.github.io';
const request = (body: unknown, customOrigin = origin) => new Request('https://example.workers.dev/api/narrate', { method: 'POST', headers: { Origin: customOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const env = () => ({ AI: { run: vi.fn().mockResolvedValue({ choices: [{ message: { content: '{"type":"chat","reply":"收到"}' } }] }) }, RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) }, ALLOWED_ORIGIN: origin });
describe('Worker gateway', () => {
  it('rejects foreign origins before inference', async () => { const e=env(); expect((await worker.fetch(request({mode:'intent',prompt:'hello'},'https://attacker.test'),e)).status).toBe(403); expect(e.AI.run).not.toHaveBeenCalled(); });
  it('handles preflight without inference', async () => { const e=env(); const r=await worker.fetch(new Request('https://example.workers.dev/api/narrate',{method:'OPTIONS',headers:{Origin:origin}}),e); expect(r.status).toBe(204); expect(r.headers.get('Access-Control-Allow-Origin')).toBe(origin); expect(e.AI.run).not.toHaveBeenCalled(); });
  it('enforces per-IP rate limit', async () => { const e=env(); e.RATE_LIMITER.limit.mockResolvedValue({success:false}); expect((await worker.fetch(request({mode:'intent',prompt:'hello'}),e)).status).toBe(429); expect(e.AI.run).not.toHaveBeenCalled(); });
  it.each([{mode:'hack',prompt:'hello'},{mode:'intent',prompt:99},{mode:'intent',prompt:''},{mode:'intent',prompt:'a'.repeat(1601)}])('rejects invalid input %j', async body => { const e=env(); expect((await worker.fetch(request(body),e)).status).toBe(400); expect(e.AI.run).not.toHaveBeenCalled(); });
  it('limits actual body size', async () => { const e=env(); expect((await worker.fetch(request({mode:'intent',prompt:'a',context:'a'.repeat(10000)}),e)).status).toBe(413); expect(e.AI.run).not.toHaveBeenCalled(); });
  it('uses Qwen and returns structured content', async () => { const e=env(); const r=await worker.fetch(request({mode:'intent',prompt:'给屋顶的弟兄鼓劲'}),e); expect(r.status).toBe(200); expect((await r.json() as {text:string}).text).toContain('收到'); expect(e.AI.run.mock.calls[0][0]).toBe('@cf/qwen/qwen3-30b-a3b-fp8'); });
  it('fails closed when upstream fails or quota ends', async () => { const e=env(); e.AI.run.mockRejectedValue(new Error('quota')); expect((await worker.fetch(request({mode:'intent',prompt:'hello'}),e)).status).toBe(503); });
  it('strips thinking and accepts response-style outputs', async () => { const e=env(); e.AI.run.mockResolvedValue({response:'<think>private chain</think>收到'}); const r=await worker.fetch(request({mode:'advisor',prompt:'hello'}),e); expect(await r.json()).toEqual({text:'收到'}); });
});
