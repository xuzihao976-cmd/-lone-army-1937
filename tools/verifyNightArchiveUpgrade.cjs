/* Two phases preserve a real old browser profile across the Pages deployment.
   UI_REVIEW_OUTPUT=<dir> node tools/verifyNightArchiveUpgrade.cjs --prepare
   Deploy v3.8.0, then run with --finish. Uses an isolated test profile only. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = path.resolve(process.env.UI_REVIEW_OUTPUT || 'test-artifacts/night-archive');
const base = process.env.UI_REVIEW_URL || 'https://xuzihao976-cmd.github.io/-lone-army-1937/';
const prepare = process.argv.includes('--prepare');
assert(prepare || process.argv.includes('--finish'), 'Specify --prepare or --finish');
let context;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  context = await chromium.launchPersistentContext(path.join(out, 'upgrade-browser-profile'), {
    executablePath: process.env.UI_REVIEW_CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox'],
    viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'zh-CN',
  });
  const p = context.pages()[0] || await context.newPage(); p.setDefaultTimeout(30000);
  const errors = [], modelRequests = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('request', r => { if (/\/api\/|dashscope|openai\.com/.test(r.url())) modelRequests.push(r.url()); });
  const readStats = () => p.evaluate(() => JSON.parse(localStorage.getItem('lone_army_autosave')).stats);
  const resume = async () => {
    await p.getByRole('button', { name: /^继续本关|^继续最近战役/ }).first().click();
    await p.getByLabel('军令或对话', { exact: true }).waitFor(); await p.waitForTimeout(250);
  };
  if (prepare) {
    await p.goto(base, { waitUntil: 'networkidle' });
    await p.getByText(/v3\.7\.0/).waitFor();
    await p.evaluate(data => {
      localStorage.clear();
      for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value);
      localStorage.setItem('lone_army_ai_enhancement', 'off'); localStorage.setItem('lone_army_sound', 'off');
    }, JSON.parse(fs.readFileSync('design/ui-verification/legacy-v10-storage.json')));
    await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await p.reload({ waitUntil: 'networkidle' }); await resume();
    await p.waitForFunction(() => JSON.parse(localStorage.getItem('lone_army_autosave')).schemaVersion === 14);
    const stats = await readStats(), cacheKeys = await p.evaluate(() => caches.keys());
    assert.equal(stats.ammo, 777); assert(cacheKeys.includes('lone-army-1937-v3.7.0'));
    assert.deepEqual(errors, []); assert.deepEqual(modelRequests, []);
    fs.writeFileSync(path.join(out, 'upgrade-before.json'), JSON.stringify({ base, version: '3.7.0', cacheKeys, stats, errors, modelRequests }, null, 2));
    console.log('Prepared and persisted actual v3.7.0 cache and migrated v10 test save.');
  } else {
    const before = JSON.parse(fs.readFileSync(path.join(out, 'upgrade-before.json')));
    await p.goto(base, { waitUntil: 'networkidle' });
    await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; await r.update(); });
    await p.waitForFunction(async () => (await caches.keys()).includes('lone-army-1937-v3.8.0'));
    await p.reload({ waitUntil: 'networkidle' }); await p.getByText(/v3\.8\.0/).waitFor();
    await resume(); assert.deepEqual(await readStats(), before.stats);
    const cacheKeys = await p.evaluate(() => caches.keys());
    assert(!cacheKeys.includes('lone-army-1937-v3.7.0'));
    await p.screenshot({ path: path.join(out, 'online-upgraded-save.png') });
    await context.setOffline(true); await p.reload({ waitUntil: 'domcontentloaded' });
    await p.getByText(/v3\.8\.0/).waitFor(); await resume(); assert.deepEqual(await readStats(), before.stats);
    assert.deepEqual(errors, []); assert.deepEqual(modelRequests, []);
    const report = { base, from: before.version, to: '3.8.0', schema: 14, cacheKeys, fullGameStatsPreserved: true, immediateOfflineRefresh: true, ammo: before.stats.ammo, rng: before.stats.rngState, errors, modelRequests };
    fs.writeFileSync(path.join(out, 'warm-upgrade.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  }
  await context.close();
})().catch(async error => { console.error(error); if (context) await context.close(); process.exit(1); });
