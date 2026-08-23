#!/usr/bin/env node
// _fix_openfeedback.mjs — 注入"打开配置文件"内容展示。
// 背景：settings.openDocument 在无 GUI 容器里由 xdg-open 脚本把文件复制到
// /workspace/open-here/settings.yaml，前端成功路径静默无反馈。本脚本注入 fetch hook：
// 拦截 /api/settings.openDocument 响应成功后，再请求 /api/troubleshoot/settings-doc
// （插件宿主端点，返回 settings.yaml 原文），弹出一个真实的 modal 内容框展示配置。
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) { console.error('用法: node _fix_openfeedback.mjs <index.html>'); process.exit(1) }
let html = readFileSync(file, 'utf8')
if (html.includes('__DSH_OPEN_FEEDBACK__')) { console.log('already patched'); process.exit(0) }

const marker = '</head>'
const injection = `
<script>
// [dsh-offline 修复] "打开配置文件"内容展示：点击后弹出 modal 显示 settings.yaml 原文。
(function () {
  'use strict';
  if (window.__dshOpenFeedbackModalInjected) return;
  window.__dshOpenFeedbackModalInjected = true;
  // 弹出一个全屏遮罩 + 内容框（modal），展示配置原文。
  function showSettingsModal(text, path) {
    var old = document.getElementById('dsh-settings-doc-modal');
    if (old) old.remove();
    var wrap = document.createElement('div');
    wrap.id = 'dsh-settings-doc-modal';
    wrap.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483646', 'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,.45)'
    ].join(';');
    var box = document.createElement('div');
    box.style.cssText = [
      'background:#fff', 'color:#1f2937', 'border-radius:12px', 'width:min(860px,92vw)', 'max-height:86vh',
      'display:flex', 'flex-direction:column', 'box-shadow:0 12px 40px rgba(0,0,0,.3)', 'font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    ].join(';');
    var head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e5e7eb;flex-shrink:0';
    var title = document.createElement('span');
    title.style.cssText = 'font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    title.textContent = '配置文件 · ' + (path || '');
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '关闭 ✕';
    closeBtn.style.cssText = 'border:1px solid #d1d5db;border-radius:6px;background:transparent;color:#374151;font-size:12px;padding:4px 10px;cursor:pointer;flex-shrink:0';
    closeBtn.onclick = function () { wrap.remove(); };
    head.appendChild(title); head.appendChild(closeBtn);
    var pre = document.createElement('pre');
    pre.style.cssText = 'margin:0;padding:14px 16px;overflow:auto;flex:1;font:12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-all;background:#f9fafb;color:#111827';
    pre.textContent = text;
    box.appendChild(head); box.appendChild(pre);
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    // 点击遮罩关闭
    wrap.addEventListener('click', function (e) { if (e.target === wrap) wrap.remove(); });
    // Esc 关闭
    var onKey = function (e) { if (e.key === 'Escape') { wrap.remove(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
  }
  // 失败时用 toast 提示（不弹框）。
  function showToast(kind, text) {
    var id = 'dsh-open-feedback-toast';
    var old = document.getElementById(id);
    if (old) old.remove();
    var t = document.createElement('div');
    t.id = id;
    t.textContent = text;
    t.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647', 'max-width:420px', 'padding:10px 14px', 'border-radius:8px',
      'font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', 'box-shadow:0 4px 16px rgba(0,0,0,.18)',
      kind === 'error' ? 'background:#b3261e;color:#fff' : 'background:#0f5132;color:#fff'
    ].join(';');
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 6000);
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
              // 成功后拉取配置原文并弹框展示
              origFetch('/api/troubleshoot/settings-doc', { headers: { 'content-type': 'application/json' } })
                .then(function (r) { return r.json(); })
                .then(function (doc) {
                  if (doc && doc.exists) showSettingsModal(doc.text, doc.path);
                  else showToast('error', '[已打开] 已复制到 /workspace/open-here/settings.yaml（配置文件原文端点不可用，可在工作区文件树查看）');
                })
                .catch(function () { showToast('error', '[已打开] 已复制到 /workspace/open-here/settings.yaml（读取内容失败）'); });
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
})();
</script>
</head>`
if (!html.includes(marker)) { console.error('未找到 </head> 注入点'); process.exit(1) }
html = html.replace(marker, injection)
writeFileSync(file, html)
console.log('open-feedback modal injected into', file)