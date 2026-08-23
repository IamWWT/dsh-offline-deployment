/**
 * build.mjs — @dsh-tools/troubleshoot-assistant 构建脚本。
 *
 * 产出两半产物 + 类型声明：
 *   1. lib/index.js   宿主半（Node ESM）：插件 apply + 工具 + 设置命名空间。
 *   2. lib/client.js  浏览器半（lazy-CJS factory bundle）：注册设置卡片。
 *      格式与 dsh 仓库内 tsdown clientBundle 预设一致：
 *      window.__ModuleLoader__.load({ id, factory: (require) => {...} })，
 *      外部依赖（react、@deepseek-ai/*）通过 loader 的 require 走模块表，
 *      因此不产生任何额外全局变量 / import map。
 *   3. lib/types/**   TypeScript 声明（tsc --emitDeclarationOnly）。
 *
 * esbuild 与 typescript 均从 dsh 仓库的 node_modules（pnpm store）解析：
 *   宿主路径  ../deepseek-harness；容器路径 ../dsh（bind mount 到 /workspace/dsh）。
 * 可通过环境变量 DSH_REPO 显式指定仓库根。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/** 定位 dsh 仓库根（宿主编译环境 / 容器编译环境均支持）。 */
function findRepoRoot() {
  if (process.env.DSH_REPO && existsSync(process.env.DSH_REPO)) return resolve(process.env.DSH_REPO)
  for (const candidate of ['../../deepseek-harness', '../deepseek-harness', '../dsh', '../../dsh']) {
    const path = resolve(HERE, candidate)
    if (existsSync(join(path, 'package.json'))) return path
  }
  throw new Error('build: cannot locate the dsh repository (set DSH_REPO=<root>)')
}

const REPO = findRepoRoot()

/** 从 pnpm store 解析一个包的绝对路径（按版本号升序取最高版）。 */
function fromPnpmStore(pkgPrefix) {
  const store = join(REPO, 'node_modules', '.pnpm')
  const dirs = readdirSync(store).filter((name) => name.startsWith(pkgPrefix)).sort()
  const latest = dirs[dirs.length - 1]
  if (latest === undefined) throw new Error(`build: ${pkgPrefix} not found in ${store}`)
  return join(store, latest, 'node_modules')
}

/** 解析 esbuild 的 JS API 入口（lib/main.js，CJS）。 */
function loadEsbuild() {
  const storeNodeModules = fromPnpmStore('esbuild@')
  const require = createRequire(import.meta.url)
  return require(join(storeNodeModules, 'esbuild', 'lib', 'main.js'))
}

/** 解析 tsc 可执行文件路径。 */
function tscBin() {
  const bin = join(REPO, 'node_modules', '.bin', 'tsc')
  if (existsSync(bin)) return bin
  const storeNodeModules = fromPnpmStore('typescript@')
  return join(storeNodeModules, 'typescript', 'bin', 'tsc')
}

const pkg = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8'))

// ---- 1. 宿主半：lib/index.js（ESM，外部化所有 @deepseek-ai/* 依赖） ----
async function buildHost(esbuild) {
  await esbuild.build({
    entryPoints: [join(HERE, 'src', 'index.ts')],
    outfile: join(HERE, 'lib', 'index.js'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    sourcemap: true,
    // dsh-* 与框架包由 profile 的 node_modules 提供（同一版本，共享运行时身份）。
    external: ['@deepseek-ai/*'],
    logLevel: 'warning',
  })
  console.log('[build] lib/index.js (host ESM)')
}

// ---- 2. 浏览器半：lib/client.js（lazy-CJS factory bundle） ----
async function buildClient(esbuild) {
  const tmpOut = join(HERE, 'lib', '.client.cjs')
  await esbuild.build({
    entryPoints: [join(HERE, 'src', 'client', 'index.ts')],
    outfile: tmpOut,
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    // 基线外部：react（shell 注入）与全部 @deepseek-ai/*（模块表）。
    external: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@deepseek-ai/*'],
    logLevel: 'warning',
  })
  const body = readFileSync(tmpOut, 'utf8')
  // 契约（与仓库内 tsdown clientBundle 预设一致）：factory(require) 必须返回
  // exports —— 模块系统的物化逻辑 factory(require) → exports 依赖该返回值；
  // 缺少 return module.exports 会导致 loader 拿到 undefined（"invalid plugin"）。
  const wrapped = [
    'window.__ModuleLoader__.load({',
    `	id: ${JSON.stringify(pkg.name)},`,
    '	factory: (require) => {',
    '		var module = { exports: {} };',
    '		var exports = module.exports;',
    '		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
    body,
    '		return module.exports;',
    '	}',
    '});',
    '',
  ].join('\n')
  writeFileSync(join(HERE, 'lib', 'client.js'), wrapped)
  // 清理临时产物（source map 一并删除，bundle 未带 map）。
  const map = tmpOut + '.map'
  if (existsSync(map)) (await import('node:fs')).rmSync(map, { force: true })
  ;(await import('node:fs')).rmSync(tmpOut, { force: true })
  console.log('[build] lib/client.js (browser factory bundle)')
}

// ---- 3. 类型声明：tsc --emitDeclarationOnly ----
/**
 * 生成 tsconfig.json：把 react / react/jsx-runtime 的类型解析指向 pnpm store
 * 中的 @types/react，其余依赖通过仓库 node_modules 解析（@deepseek-ai/* 均为
 * 工作区符号链接，types 指向各包 lib/types）。
 */
function writeTsconfigForTypes() {
  const typesReact = join(fromPnpmStore('@types+react@'), '@types', 'react')
  const typesNode = join(fromPnpmStore('@types+node@'), '@types', 'node')
  const template = {
    compilerOptions: {
      target: 'ES2023',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ES2023', 'DOM'],
      jsx: 'react-jsx',
      strict: true,
      noImplicitAny: true,
      noUncheckedIndexedAccess: true,
      esModuleInterop: true,
      skipLibCheck: true,
      resolveJsonModule: true,
      declaration: true,
      emitDeclarationOnly: true,
      allowImportingTsExtensions: true,
      declarationDir: 'lib/types',
      rootDir: 'src',
      types: ['node'],
      typeRoots: [join(typesNode, '..')],
      paths: {
        react: [join(typesReact, 'index.d.ts')],
        'react/jsx-runtime': [join(typesReact, 'jsx-runtime.d.ts')],
        node: [join(typesNode, 'index.d.ts')],
        // 工作区包：指向仓库 node_modules/@deepseek-ai/*（含 lib/types 声明）。
        // 工作区包：仓库 node_modules/@deepseek-ai/* 里每个包都有到 packages 的符号链接，
        // 包内 exports 子路径（./client 等）由 bundler 解析；paths 只兜底顶层。
        '@deepseek-ai/*': [join(REPO, 'node_modules', '@deepseek-ai', '*')],
      },
    },
    include: ['src/**/*.ts', 'src/**/*.tsx'],
  }
  writeFileSync(join(HERE, 'tsconfig.types.json'), JSON.stringify(template, null, 2))
}

/** 运行 tsc 产出声明文件。 */
function runTsc() {
  writeTsconfigForTypes()
  execFileSync(tscBin(), ['-p', join(HERE, 'tsconfig.types.json')], { stdio: 'inherit' })
  console.log('[build] lib/types (declarations)')
}

mkdirSync(join(HERE, 'lib'), { recursive: true })
const esbuild = loadEsbuild()
await buildHost(esbuild)
await buildClient(esbuild)
// 类型声明：SKIP_TYPES=1 时跳过（容器 dev 环境用——插件 node_modules 的宿主软链
// 在容器内失效，tsc 无法解析 @deepseek-ai/* 类型；运行时只加载 JS 产物，
// 类型可在宿主 link-deps.sh 后随时全量重建）。
if (process.env.SKIP_TYPES === '1') {
  console.log('[build] lib/types skipped (SKIP_TYPES=1)')
} else {
  runTsc()
}
console.log('[build] done')
