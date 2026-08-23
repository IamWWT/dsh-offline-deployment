/**
 * Node loader hook：拦截 '@deepseek-ai/dsh-client-runtime/client' 的导入，
 * 注入一个内存版 createSnapshotStore（与真实 store 的 getSnapshot/subscribe/update
 * 契约一致）。客户端 bundle 依赖浏览器 window.__ModuleLoader__，无法在 Node 直接
 * import；此 mock 让控制器（src/client/controller.ts）可在 node --test 下加载，
 * 从而对 reseed 的条目 id 稳定性做回归测试。
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@deepseek-ai/dsh-client-runtime/client') {
    return { url: 'mock:dsh-client-runtime-client', shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url === 'mock:dsh-client-runtime-client') {
    return {
      format: 'module',
      shortCircuit: true,
      source: `
        export function createSnapshotStore(init) {
          let state = { ...init }
          const listeners = new Set()
          return {
            getSnapshot() { return state },
            subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
            update(fn) {
              const draft = { ...state }
              fn(draft)
              state = draft
              for (const l of [...listeners]) l()
            },
          }
        }
      `,
    }
  }
  return nextLoad(url, context)
}
