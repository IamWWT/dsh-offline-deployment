// 用 esbuild 把 SSR 入口打包成临时 CJS 并运行（react 从宿主 store 解析，
// client-runtime 用纯 mock 别名）。验证卡片 renderToString 行为。
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// 与 build.mjs 一致：从 dsh 仓库 pnpm store 解析 esbuild JS API
function findRepoRoot() {
  if (process.env.DSH_REPO && existsSync(process.env.DSH_REPO)) return resolve(process.env.DSH_REPO)
  let dir = here
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'deepseek-harness', 'node_modules'))) return join(dir, 'deepseek-harness')
    const parent = dirname(dir); if (parent === dir) break; dir = parent
  }
  return '/home/wwt/Downloads/aigc/proj/deepseek/offline/deepseek-harness'
}
const REPO = findRepoRoot()
function fromPnpmStore(prefix) {
  const store = join(REPO, 'node_modules', '.pnpm')
  const dirs = require('node:fs').readdirSync(store).filter(name => name.startsWith(prefix)).sort()
  const latest = dirs[dirs.length - 1]
  if (!latest) throw new Error('store: ' + prefix)
  return join(store, latest, 'node_modules')
}
const require = createRequire(import.meta.url)
const esbuild = require(join(fromPnpmStore('esbuild@'), 'esbuild', 'lib', 'main.js'))

const STORE = join(REPO, 'node_modules', '.pnpm')
const reactDir = join(fromPnpmStore('react@'), 'react')
const reactDomServer = join(fromPnpmStore('react-dom@'), 'react-dom', 'server.node.js')
const mock = join(here, 'client-runtime-plain.mjs')
const entry = join(here, 'ssr-card-entry.tsx')

const dir = await mkdtemp(join(tmpdir(), 'dsh-ssr-'))
const outfile = join(dir, 'bundle.cjs')
try {
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    outfile,
    jsx: 'automatic',
    alias: {
      react: reactDir,
      'react-dom/server': reactDomServer,
      '@deepseek-ai/dsh-client-runtime/client': mock,
    },
    logLevel: 'silent',
  })
  await import(pathToFileURL(outfile).href)
} finally {
  await rm(dir, { recursive: true, force: true })
}
