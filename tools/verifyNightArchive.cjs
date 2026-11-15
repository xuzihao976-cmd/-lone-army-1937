/* Optional browser QA: install Playwright in the test environment, not the game runtime.
   First: UI_REVIEW_OUTPUT=<dir> npx vite-node tools/makeUiReviewFixtures.ts
   Then: UI_REVIEW_OUTPUT=<dir> UI_REVIEW_URL=http://127.0.0.1:3022/ node tools/verifyNightArchive.cjs */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = path.resolve(process.env.UI_REVIEW_OUTPUT || 'test-artifacts/night-archive');
const base = process.env.UI_REVIEW_URL || 'http://127.0.0.1:3022/';
const fixtures = JSON.parse(fs.readFileSync(path.join(out, 'fixtures.json')));
const expected = JSON.parse(fs.readFileSync(path.join(out, 'expected.json')));
const legacy = JSON.parse(fs.readFileSync(path.join(out, 'legacy-storage.json')));
const report = { base, layouts: [], flows: [], errors: [], modelRequests: [], contrasts: [] };
let browser, active;
const input = p => p.getByLabel('军令或对话', { exact: true });
const send = p => p.getByRole('button', { name: '发送', exact: true });
const settle = async p => { await p.waitForTimeout(200); const skip = p.getByRole('button', { name: '跳过', exact: true }); if (await skip.count()) await skip.first().click(); await p.waitForTimeout(180); };
const stats = async p => { await settle(p); return p.evaluate(() => JSON.parse(localStorage.getItem('lone_army_autosave')).stats); };
async function open(w, h, storage = {}) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', locale: 'zh-CN' });
  await c.addInitScript(data => {
    localStorage.setItem('lone_army_sound', 'off'); localStorage.setItem('lone_army_ai_enhancement', 'off');
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
  }, storage);
  const p = await c.newPage(); active = p; p.setDefaultTimeout(15000);
  p.on('pageerror', e => report.errors.push(e.message));
  p.on('request', r => { if (/\/api\/|dashscope|openai\.com|anthropic/.test(r.url())) report.modelRequests.push(r.url()); });
  p.on('dialog', d => d.accept());
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.getByRole('heading', { name: '选择章节', exact: true }).waitFor();
  return { c, p };
}
async function resume(p) {
  await p.getByRole('button', { name: /^继续本关|^继续最近战役/ }).first().click();
  await input(p).waitFor(); await settle(p);
}
async function geometry(p, name, primary, minLog = 0) {
  const b = await primary.boundingBox();
  const d = await p.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, productWidth: document.querySelector('.game-shell').scrollWidth, productClient: document.querySelector('.game-shell').clientWidth }));
  assert(d.documentWidth <= d.width + 1 && d.productWidth <= d.productClient + 1, name + ': horizontal overflow');
  assert(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= d.width + 1 && b.y + b.height <= d.height + 1, name + ': clipped primary ' + JSON.stringify(b));
  assert(b.height >= 44 && b.width >= 44, name + ': target below 44');
  const log = await p.locator('.battle-log').count() ? await p.locator('.battle-log').boundingBox() : null;
  if (minLog) assert(log.height >= minLog, name + ': collapsed journal ' + log.height);
  report.layouts.push({ name, ...d, primary: b, journal: log });
  await p.screenshot({ path: path.join(out, name + '.png'), animations: 'disabled' });
}
async function query(p, command) {
  const before = await stats(p); await input(p).fill(command); await send(p).click();
  assert.deepEqual(await stats(p), before, command + ': read-only query changed state');
}
async function enlarge(p, factor) {
  await p.evaluate(f => {
    const elements = [...document.querySelectorAll('body *')].filter(e => !['svg', 'path'].includes(e.tagName.toLowerCase()));
    elements.forEach(e => { if (!e.dataset.reviewFontSize) e.dataset.reviewFontSize = getComputedStyle(e).fontSize; e.style.fontSize = parseFloat(e.dataset.reviewFontSize) * f + 'px'; });
  }, factor);
}
async function focusCycle(p, dialog) {
  await p.waitForTimeout(50);
  for (let i = 0; i < 18; i++) { await p.keyboard.press('Tab'); assert(await dialog.evaluate(el => el.contains(document.activeElement)), 'focus escaped dialog'); }
  for (let i = 0; i < 3; i++) { await p.keyboard.press('Shift+Tab'); assert(await dialog.evaluate(el => el.contains(document.activeElement)), 'reverse focus escaped dialog'); }
}
function contrast(a, b) {
  const lum = value => value.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const l = [lum(a), lum(b)].sort((a, b) => a - b); return (l[1] + .05) / (l[0] + .05);
}
(async () => {
  browser = await chromium.launch({ executablePath: process.env.UI_REVIEW_CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const sizes = [[320, 640], [390, 844], [768, 1024], [1280, 900], [844, 390], [320, 480]];
  for (const [w, h] of sizes) {
    const { c, p } = await open(w, h);
    await geometry(p, `start-${w}x${h}`, p.getByRole('button', { name: '开始街巷撤收', exact: true }));
    await p.getByRole('button', { name: '携带分组接应', exact: true }).click();
    assert.match(await p.locator('.archive-selection').innerText(), /分组接应/);
    await p.getByRole('button', { name: '开始街巷撤收', exact: true }).click(); await settle(p);
    assert.equal((await stats(p)).equippedTactic.id, 'group_escort');
    await geometry(p, `street-${w}x${h}`, send(p), h >= 640 ? 100 : 15);
    await query(p, '报告任务');
    const before = await stats(p); await input(p).fill('组织撤离');
    await p.getByRole('region', { name: '军令预览', exact: true }).waitFor();
    assert.deepEqual(await stats(p), before);
    await geometry(p, `preview-${w}x${h}`, send(p));
    await input(p).fill('');
    await p.getByRole('button', { name: /^军令 · 战术/ }).click();
    let dialog = p.getByRole('dialog', { name: '军令簿', exact: true });
    await geometry(p, `orders-${w}x${h}`, dialog.getByRole('button', { name: '关闭军令簿' }));
    await focusCycle(p, dialog);
    await dialog.getByRole('button', { name: '查看战术', exact: true }).click();
    dialog = p.getByRole('dialog', { name: /分组接应/ });
    await geometry(p, `tactic-${w}x${h}`, p.getByRole('button', { name: '关闭战术预览', exact: true }));
    await focusCycle(p, dialog); await p.keyboard.press('Escape');
    assert.deepEqual(await stats(p), before);
    await p.getByRole('button', { name: '顾问', exact: true }).click();
    dialog = p.getByRole('dialog', { name: /战地顾问/ });
    await geometry(p, `advisor-${w}x${h}`, p.getByRole('button', { name: '关闭战地顾问', exact: true }));
    await p.getByLabel('顾问问题', { exact: true }).fill('怎么获胜');
    await p.getByRole('button', { name: '查询', exact: true }).click(); await settle(p);
    await focusCycle(p, dialog); await p.keyboard.press('Escape');
    assert.deepEqual(await stats(p), before);
    report.flows.push({ viewport: [w, h], chapter: 'street', tacticSelection: true, queryPreviewAdvisorCancelReadOnly: true, keyboardContained: true });
    await c.close();
  }
  for (const chapter of ['bridge', 'sihang']) for (const [w, h] of sizes) {
    const { c, p } = await open(w, h, { lone_army_autosave: JSON.stringify(fixtures['order_' + chapter]) });
    await resume(p); await geometry(p, `${chapter}-${w}x${h}`, send(p), h >= 640 ? 100 : 15);
    await query(p, chapter === 'bridge' ? '报告任务' : '报告弹药和士气');
    if (chapter === 'sihang') {
      assert.equal(await p.getByLabel('现有物资', { exact: true }).locator('.supply-cell').count(), 5);
      const before = await stats(p); await input(p).fill('检修机枪一连');
      await geometry(p, `repair-preview-${w}x${h}`, send(p)); assert.deepEqual(await stats(p), before);
      await input(p).fill(''); await p.getByRole('button', { name: '阵地', exact: true }).click();
      const dialog = p.getByRole('dialog', { name: '阵地地图', exact: true });
      await geometry(p, `map-${w}x${h}`, dialog.getByRole('button', { name: '关闭阵地地图', exact: true }));
      await focusCycle(p, dialog); await p.keyboard.press('Escape'); assert.deepEqual(await stats(p), before);
    }
    report.flows.push({ viewport: [w, h], chapter, readOnly: true }); await c.close();
  }
  for (const chapter of ['street', 'bridge', 'sihang']) {
    const { c, p } = await open(390, 844, { lone_army_autosave: JSON.stringify(fixtures['order_' + chapter]) });
    await resume(p); const before = await stats(p);
    await p.getByRole('button', { name: /全部军令/ }).click();
    const dialog = p.getByRole('dialog', { name: '军令簿', exact: true });
    const name = chapter === 'street' ? /^侦察路线 / : chapter === 'bridge' ? /^压制射击 / : /^加固 /;
    await dialog.getByRole('button', { name }).click();
    assert.deepEqual(await stats(p), before, 'shortcut executed before Send');
    await send(p).click(); assert.deepEqual(await stats(p), expected['order_' + chapter], 'command did not match exact engine result');
    if (chapter === 'sihang') {
      await p.locator('.featured-orders').getByRole('button', { name: /^休息 / }).click();
      const preRest = await stats(p); assert.equal(preRest.tutorialStep, 2); await send(p).click();
      assert.equal((await stats(p)).tutorialStep, 3);
      await geometry(p, 'sihang-after-tutorial-390', send(p), 150);
    }
    report.flows.push({ chapter, shortcutOnlyFills: true, sendMatchesExactEngineResult: true }); await c.close();
  }
  for (const name of ['blocked', 'jam', 'corner', 'beam', 'knock', 'medicine']) {
    const { c, p } = await open(320, 640, { lone_army_autosave: JSON.stringify(fixtures[name]) });
    await resume(p); const before = await stats(p); const dialog = p.getByRole('dialog');
    if (name === 'blocked') assert(await dialog.getByRole('button', { name: /^A\./ }).isDisabled());
    await p.keyboard.press('Escape'); assert(await dialog.isVisible(), 'mandatory decision dismissed by Escape');
    await focusCycle(p, dialog);
    for (const option of await dialog.getByRole('button').all()) {
      await option.scrollIntoViewIfNeeded(); const b = await option.boundingBox(); assert(b.height >= 44 && b.x >= 0 && b.x + b.width <= 321);
    }
    await geometry(p, `event-${name}`, dialog.getByRole('button', { name: '保存并返回选关', exact: true }));
    await dialog.getByRole('button', { name: '保存并返回选关', exact: true }).click(); await resume(p);
    assert.deepEqual(await stats(p), before);
    report.flows.push({ event: name, optionsReachable: true, escapeDoesNotDismiss: true, saveResumePreservesPending: true }); await c.close();
  }
  // Full-state legacy migration, map preparation, manual save/load and actual ending.
  {
    const { c, p } = await open(320, 640, legacy); await resume(p); const before = await stats(p);
    assert.deepEqual(before, expected.legacy); await input(p).fill('报告弹药和士气');
    await p.getByRole('button', { name: '阵地', exact: true }).click(); const map = p.getByRole('dialog', { name: '阵地地图', exact: true });
    const expand = map.getByRole('button', { name: /展开指挥/ }); if (await expand.count()) await expand.click();
    await map.getByRole('button', { name: /加固/ }).filter({ hasNotText: '工事已' }).first().click();
    assert.deepEqual(await stats(p), before); assert.match(await input(p).inputValue(), /加固/);
    await input(p).fill(''); await p.getByRole('button', { name: '打开战时菜单', exact: true }).click();
    await p.getByRole('button', { name: '保存进度', exact: true }).click();
    await geometry(p, 'save-320', p.getByRole('button', { name: '关闭作战记录', exact: true }));
    await focusCycle(p, p.getByRole('dialog')); await p.getByRole('button', { name: /编号 01/ }).click();
    assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('lone_army_slot_0')).stats), before);
    await p.getByRole('button', { name: '打开战时菜单', exact: true }).click();
    await p.getByRole('button', { name: '返回主菜单', exact: true }).click(); await p.getByRole('button', { name: '确认返回', exact: true }).click();
    await p.getByRole('button', { name: '读取手动档案', exact: true }).click();
    await p.getByRole('button', { name: /编号 01/ }).click(); assert.deepEqual(await stats(p), before);
    report.flows.push({ v10Migration: true, fullStatsPreserved: true, mapOnlyFills: true, manualSaveLoad: true }); await c.close();
  }
  {
    const { c, p } = await open(320, 640, { lone_army_autosave: JSON.stringify(fixtures.student) }); await resume(p);
    await p.getByRole('button', { name: /^A\./ }).click(); await settle(p);
    const review = p.getByRole('button', { name: '返回战场复盘', exact: true }); await review.waitFor(); await review.scrollIntoViewIfNeeded();
    await geometry(p, 'ending-320', review); assert.deepEqual(await stats(p), expected.student);
    await review.click(); assert.deepEqual(await stats(p), expected.student);
    report.flows.push({ actualEnding: true, exactEngineResult: true, reviewReadOnly: true }); await c.close();
  }
  for (const sample of ['menu', 'street', 'sihang']) {
    const { c, p } = await open(320, 640, sample === 'menu' ? {} : { lone_army_autosave: JSON.stringify(fixtures['order_' + sample]) });
    if (sample !== 'menu') await resume(p);
    await enlarge(p, 2);
    await geometry(p, `font200-${sample}`, sample === 'menu' ? p.getByRole('button', { name: '开始街巷撤收', exact: true }) : send(p));
    if (sample !== 'menu') { await input(p).fill(sample === 'street' ? '组织撤离' : '检修机枪一连'); await enlarge(p, 2); await geometry(p, `font200-preview-${sample}`, send(p));
      const nav = await p.locator('.dock-tools').boundingBox(); assert(nav.y + nav.height <= 641, 'enlarged tools clipped'); }
    report.flows.push({ textScale: 2, sample }); await c.close();
  }
  {
    const { c, p } = await open(390, 844, { lone_army_autosave: JSON.stringify(fixtures.order_sihang) }); await resume(p);
    for (const selector of ['.war-prose', '.battle-chapter', '.supply-cell dt', '.supply-cell dd', '.order-caption', '.send-order', '.dock-tools > span']) {
      const colors = await p.locator(selector).first().evaluate(el => {
        let node = el, bg; do { bg = getComputedStyle(node).backgroundColor; if (bg !== 'rgba(0, 0, 0, 0)') break; node = node.parentElement; } while (node);
        return { fg: getComputedStyle(el).color, bg };
      });
      const ratio = contrast(colors.fg, colors.bg); assert(ratio >= 4.5, selector + ': low contrast ' + ratio);
      report.contrasts.push({ selector, ...colors, ratio });
    }
    await c.close();
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.modelRequests, []);
  fs.writeFileSync(path.join(out, 'browser-' + (base.startsWith('https:') ? 'online' : 'local') + '.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ layouts: report.layouts.length, flows: report.flows.length, minimumMeasuredContrast: Math.min(...report.contrasts.map(c => c.ratio)), errors: report.errors, modelRequests: report.modelRequests }));
  await browser.close();
})().catch(async error => {
  console.error(error); if (active && !active.isClosed()) await active.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  fs.writeFileSync(path.join(out, 'browser-progress.json'), JSON.stringify(report, null, 2));
  if (browser) await browser.close(); process.exit(1);
});
