// 纯模块版 createSnapshotStore（供 esbuild 别名打包，供 SSR 渲染测试用）。
export function createSnapshotStore(init) {
  let state = { ...init }
  const listeners = new Set()
  return {
    getSnapshot() { return state },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    update(fn) { const draft = { ...state }; fn(draft); state = draft; for (const l of [...listeners]) l() },
  }
}
