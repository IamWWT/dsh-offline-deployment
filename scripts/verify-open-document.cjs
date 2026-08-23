#!/usr/bin/env node
// verify-open-document.cjs — [09 测试验证规范] L3 浏览器验证：打开配置文件全链路。
// 用法: node scripts/verify-open-document.cjs [baseUrl]  默认 http://127.0.0.1:9488
// 断言: 设置页出现按钮 → 点击 → 请求发出且 200 → toast 出现 → 容器 OPEN_LOG 追加
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let openReq = 0, openResp = 0, openRespStatus = 0;
  page.on('request', r => { if (r.url().includes('/api/settings.openDocument')) openReq++; });
  page.on('response', r => { if (r.url().includes('/api/settings.openDocument')) { openResp++; openRespStatus = r.status(); } });

  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(5000);
  await page.click('button:has-text("设置")');
  await page.waitForTimeout(2000);

  const hasBtn = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some(el => (el.textContent || '').includes('打开配置文件')));
  check('设置页有「打开配置文件」按钮', hasBtn, base);

  await page.click('button:has-text("打开配置文件")');
  let toast = null;
  try {
    await page.waitForSelector('#dsh-open-feedback-toast', { timeout: 8000 });
    toast = await page.evaluate(() => document.getElementById('dsh-open-feedback-toast').textContent);
  } catch { toast = null; }
  check('点击后 toast 出现', toast !== null && toast.includes('已打开'), toast ? toast.slice(0, 40) : '无');
  check('settings.openDocument 请求发出', openReq > 0, openReq + ' req');
  check('settings.openDocument 响应 200', openResp > 0 && openRespStatus === 200, 'HTTP ' + openRespStatus);

  try {
    const log = execSync('docker exec dsh-harness tail -1 /workspace/open-here/OPEN_LOG.md', { encoding: 'utf8' }).trim();
    check('容器 OPEN_LOG 有打开记录', log.includes('打开配置文件'), log.slice(-50));
  } catch { check('容器 OPEN_LOG 可读', false, 'docker exec 失败'); }

  await browser.close();
  console.log(failures === 0 ? '\n=== 全部通过 ===' : '\n=== 有 ' + failures + ' 项失败 ===');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
