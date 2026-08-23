#!/usr/bin/env node
// _patch_openfeedback.mjs — 注入"打开配置文件"成功提示。
// 背景：settings.openDocument 在无 GUI 容器里由 xdg-open 脚本把文件复制到
// /workspace/open-here/settings.yaml，但前端成功路径是静默的（按钮点击后
// 页面无任何变化，用户以为没反应）。这里注入 fetch hook：拦截
// /api/settings.openDocument 响应，成功/失败都弹一个可见 toast。
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) { console.error('用法: node _patch_openfeedback.mjs <index.html>'); process.exit(1) }
let html = readFileSync(file, 'utf8')
if (html.includes('__DSH_OPEN_FEEDBACK__')) { console.log('already patched'); process.exit(0) }

const marker = '</head>'
const injection = `\n<script>\n// [dsh-offline 修复] "打开配置文件"成功提示：xdg-open 在无 GUI 容器里把
// settings.yaml 复制到工作区 open-here 目录，但前端成功路径静默无反馈。
// 拦截 settings.openDocument RPC 响应，用 toast 告知结果与文件位置。
(function () {
  'use strict';
  if (window.__dshOpenFeedbackInjected) return;
  window.__dshOpenFeedbackInjected = true;
  function showToast(kind, text, ms) {
    var id = 'dsh-open-feedback-toast';
    var old = document.getElementById(id);
    if (old) old.remove();
    var t = document.createElement('div');
    t.id = id;
    t.textContent = text;
    t.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
      'max-width:420px', 'padding:10px 14px', 'border-radius:8px',
      'font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'box-shadow:0 4px 16px rgba(0,0,0,.18)',
      kind === 'error' ? 'background:#b3261e;color:#fff' : 'background:#0f5132;color:#fff',
      'opacity:0', 'transition:opacity .25s'
    ].join(';');
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    setTimeout(function () {
      t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 300);
    }, ms || 6000);
  }
  var origFetch = window.fetch;
  if (typeof origFetch !== 'function') return;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && (input.href || input.url)) || '';
    var p = origFetch.apply(this, arguments);
    if (url.indexOf('/api/settings.openDocument') === -1) return p;
    return p.then(function (resp) {
      try {
        resp.clone().json().then(function (body) {
          try {
            var result = body && body.result;
            if (result && result.ok) {
              showToast('ok', '[已打开] 配置文件已复制到工作区 /workspace/open-here/settings.yaml，可在左侧工作区文件树中查看。');
            } else if (result && !result.ok) {
              var msg = (result.error && result.error.message) || '未知错误';
              showToast('error', '[打开失败] ' + msg);
            }
          } catch (e) { /* ignore */ }
        }).catch(function () { /* non-JSON body */ });
      } catch (e) { /* ignore */ }
      return resp;
    });
  };
})();\n</script>\n</head>`
if (!html.includes(marker)) { console.error("未找到 </head> 注入点"); process.exit(1) }
html = html.replace(marker, injection)
writeFileSync(file, html)
console.log('open-feedback toast injected into', file)