#!/usr/bin/env node
// verify-data-source-fields.cjs — [09 测试验证规范] L3 浏览器验证：数据源全部字段可填、可保存、落库。
// 用法: node scripts/verify-data-source-fields.cjs [baseUrl]  默认 http://127.0.0.1:9488
// 覆盖: type/name/url/authType/token/username/password/headerName/queryPath/timeoutMs/description
//       共 11 字段（含 secret token/password——历史 bug：reseed 写死空导致填不进）
const { chromium } = require('/home/wwt/node_modules/playwright/index.js');
const { execSync } = require('node:child_process');

const base = process.argv[2] || 'http://127.0.0.1:9488';
let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
  if (!ok) failures++;
};

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(6000);
  await page.click('button:has-text("设置")');
  await page.waitForTimeout(1500);
  await page.click('button:has-text("插件")');
  await page.waitForTimeout(2000);
  await page.click('button:has-text("+ 添加数据源")');
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const d = [...document.querySelectorAll('details')].find(x => x.open);
    if (d) d.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(400);

  const d = page.locator('details[open]');
  const ctrls = d.locator('input, select');
  const cnt = await ctrls.count();
  check('新增条目有 11 个字段控件', cnt === 11, cnt + ' 个');

  const stamp = Date.now().toString(36);
  const vals = {
    type: 'logs', name: 'verify-' + stamp, url: 'http://v:3100', authType: 'basic',
    token: 'Tk' + stamp + '!', username: 'u' + stamp, password: 'Ps' + stamp + '!',
    headerName: 'X-V', queryPath: '/q', timeoutMs: '15000', description: 'desc ' + stamp,
  };
  await ctrls.nth(0).selectOption(vals.type);
  await ctrls.nth(1).fill(vals.name);
  await ctrls.nth(2).fill(vals.url);
  await ctrls.nth(3).selectOption(vals.authType);
  await ctrls.nth(4).fill(vals.token);
  await ctrls.nth(5).fill(vals.username);
  await ctrls.nth(6).fill(vals.password);
  await ctrls.nth(7).fill(vals.headerName);
  await ctrls.nth(8).fill(vals.queryPath);
  await ctrls.nth(9).fill(vals.timeoutMs);
  await ctrls.nth(10).fill(vals.description);
  await page.waitForTimeout(600);

  // 关键断言：secret 字段输入后值保留（历史 bug 点）
  const tok = await ctrls.nth(4).inputValue();
  const pwd = await ctrls.nth(6).inputValue();
  check('token 可填入且保留', tok === vals.token, tok);
  check('password 可填入且保留', pwd === vals.password, pwd);
  const name = await ctrls.nth(1).inputValue();
  const url = await ctrls.nth(2).inputValue();
  check('name 可填入', name === vals.name, name);
  check('url 可填入', url === vals.url, url);

  // 保存
  await d.locator('button:has-text("保存此数据源")').click({ timeout: 8000 });
  await page.waitForTimeout(2500);
  check('保存后条目折叠为一行', await page.evaluate(() =>
    [...document.querySelectorAll('details')].some(x => x.open === false && (x.textContent||'').includes('verify-'))), vals.name);

  // 落库验证（容器内 settings.yaml）
  try {
    const yaml = execSync('docker exec dsh-harness cat /opt/dsh/settings.yaml', { encoding: 'utf8' });
    const block = yaml.split('dataSources:')[1] || '';
    const entry = block.split(String.fromCharCode(10) + '    - id:').find(s => s.includes(vals.name)) || '';
    check('token 落库', entry.includes('token: ' + vals.token), vals.token);
    check('password 落库', entry.includes('password: ' + vals.password), vals.password);
    check('username 落库', entry.includes('username: ' + vals.username), vals.username);
    check('timeoutMs 落库', entry.includes('timeoutMs: 15000'), '15000');
    check('queryPath 落库', entry.includes('queryPath: /q'), '/q');
  } catch { check('settings.yaml 可读', false, 'docker exec 失败'); }

  await browser.close();
  console.log(failures === 0 ? '\n=== 数据源字段完备性验证：全部通过 ===' : '\n=== 有 ' + failures + ' 项失败 ===');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });