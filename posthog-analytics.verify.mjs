#!/usr/bin/env node
/**
 * Offline verification for the Acadex product analytics integration.
 *
 * Runs the real handler tests through the frontend's own Node toolchain with an
 * empty child environment and no shell, then checks the dependency and privacy
 * evidence that cannot be observed at runtime:
 *
 *   node posthog-analytics.verify.mjs
 *
 * Nothing here sends data, starts a server, or reads a credential or local env
 * file. The only configuration the checks use is synthetic and in-memory.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const PINNED_VERSION = '1.438.13'
const TEST_DIR = 'frontend/tests/analytics'
const ANALYTICS_SRC = 'frontend/src/shared/analytics'
const TIMEOUT_MS = 120_000
const TOKEN_LITERAL = /ph[cx]_[A-Za-z0-9]{8,}/

const passed = []
const failed = []

function check(name, fn) {
  try {
    const detail = fn()
    passed.push({ name, detail })
  } catch (error) {
    failed.push({ name, message: error instanceof Error ? error.message : String(error) })
  }
}

function require_(condition, message) {
  if (!condition) throw new Error(message)
}

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8')
}

function readJson(relativePath) {
  try {
    return JSON.parse(readText(relativePath))
  } catch (error) {
    throw new Error(`${relativePath} could not be read as JSON: ${error.message}`)
  }
}

function walk(relativeDir) {
  const absolute = path.join(root, relativeDir)
  if (!existsSync(absolute)) return []
  return readdirSync(absolute).flatMap(entry => {
    const relative = path.join(relativeDir, entry)
    return statSync(path.join(root, relative)).isDirectory() ? walk(relative) : [relative]
  })
}

// --- dependency and lock evidence -------------------------------------------

check('package manager is npm with one lock file', () => {
  for (const competitor of ['yarn.lock', 'frontend/yarn.lock', 'pnpm-lock.yaml', 'frontend/pnpm-lock.yaml', 'bun.lockb', 'frontend/bun.lockb', 'bun.lock', 'frontend/bun.lock']) {
    require_(!existsSync(path.join(root, competitor)), `unexpected ${competitor}: this project installs with npm`)
  }
  require_(existsSync(path.join(root, 'frontend/package-lock.json')), 'frontend/package-lock.json is missing')
  return 'npm + frontend/package-lock.json'
})

check(`frontend/package.json pins posthog-js ${PINNED_VERSION}`, () => {
  const manifest = readJson('frontend/package.json')
  const declared = manifest.dependencies?.['posthog-js']
  require_(declared === PINNED_VERSION, `expected ${PINNED_VERSION}, found ${declared ?? 'nothing'}`)
  return declared
})

check(`frontend/package-lock.json resolves posthog-js ${PINNED_VERSION}`, () => {
  const lock = readJson('frontend/package-lock.json')
  const resolved = lock.packages?.['node_modules/posthog-js']?.version
  require_(resolved === PINNED_VERSION, `lock resolves ${resolved ?? 'nothing'}`)
  const rootDependency = lock.packages?.['']?.dependencies?.['posthog-js']
  require_(rootDependency === PINNED_VERSION, `lock root dependency is ${rootDependency ?? 'missing'}`)
  return resolved
})

check('installed SDK matches the pin', () => {
  const installed = readJson('frontend/node_modules/posthog-js/package.json')
  require_(installed.version === PINNED_VERSION, `installed ${installed.version}`)
  return installed.version
})

check('only the browser app imports the SDK', () => {
  const importers = walk('frontend/src')
    .filter(file => /\.(ts|tsx)$/.test(file))
    .filter(file => /from ['"]posthog-js['"]/.test(readText(file)) || /import\(['"]posthog-js['"]\)/.test(readText(file)))
  require_(importers.length === 1, `expected one SDK boundary, found ${importers.join(', ') || 'none'}`)
  require_(importers[0] === path.join(ANALYTICS_SRC, 'posthogSdk.ts'), `unexpected importer ${importers[0]}`)
  return importers[0]
})

check('the server route adds no SDK', () => {
  const pyproject = readText('backend/pyproject.toml')
  require_(!/posthog/i.test(pyproject), 'backend/pyproject.toml declares a PostHog SDK')
  const sources = walk('backend/app')
  require_(!sources.some(file => /posthog/i.test(readText(file))), 'backend application code references PostHog')
  return 'backend untouched'
})

// --- configuration and privacy evidence -------------------------------------

check('example env declares empty PostHog placeholders', () => {
  const example = readText('frontend/.env.example')
  require_(/^VITE_POSTHOG_PROJECT_TOKEN=\s*$/m.test(example), 'VITE_POSTHOG_PROJECT_TOKEN placeholder is missing or not empty')
  require_(/^VITE_POSTHOG_HOST=\s*$/m.test(example), 'VITE_POSTHOG_HOST placeholder is missing or not empty')
  return 'frontend/.env.example'
})

check('local env files stay ignored by git', () => {
  const ignore = readText('.gitignore').split(/\r?\n/).map(line => line.trim())
  require_(ignore.includes('.env'), '.env is not ignored')
  require_(ignore.includes('.env.*'), '.env.* is not ignored')
  require_(ignore.includes('!.env.example'), '.env.example is not allowed back into git')
  return '.gitignore'
})

check('no changed source, test or note hardcodes a PostHog token', () => {
  const files = [
    ...walk('frontend/src'),
    ...walk(TEST_DIR),
    'frontend/.env.example',
    'frontend/package.json',
    'posthog-analytics.md',
  ]
  const offenders = files.filter(file => existsSync(path.join(root, file)) && TOKEN_LITERAL.test(readText(file)))
  require_(offenders.length === 0, `token literal found in ${offenders.join(', ')}`)
  return 'none'
})

check('the capture path never reads process.env or dotenv', () => {
  const files = walk(ANALYTICS_SRC).filter(file => !file.endsWith('posthogSdk.ts'))
  const offenders = files.filter(file => /process\.env|dotenv/.test(readText(file)))
  require_(offenders.length === 0, `environment read in ${offenders.join(', ')}`)
  return files.map(file => path.basename(file)).join(', ')
})

// --- real handler tests ------------------------------------------------------

const testFiles = walk(TEST_DIR).filter(file => file.endsWith('.test.mjs'))

function runTests() {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', ...testFiles], {
      cwd: root,
      // Empty environment: no OS secrets, no dotenv, no framework autoload.
      env: {},
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, TIMEOUT_MS)
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', error => {
      clearTimeout(timer)
      resolve({ code: null, stdout, stderr: `${stderr}\n${error.message}`, timedOut })
    })
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}

const totals = output => ({
  pass: Number((output.match(/^# pass (\d+)$/m) ?? [])[1] ?? 0),
  fail: Number((output.match(/^# fail (\d+)$/m) ?? [])[1] ?? 0),
  tests: Number((output.match(/^# tests (\d+)$/m) ?? [])[1] ?? 0),
  cancelled: Number((output.match(/^# cancelled (\d+)$/m) ?? [])[1] ?? 0),
  skipped: Number((output.match(/^# skipped (\d+)$/m) ?? [])[1] ?? 0),
})

async function main() {
  if (testFiles.length === 0) {
    failed.push({ name: 'offline handler tests exist', message: `no *.test.mjs files under ${TEST_DIR}` })
  } else {
    const result = await runTests()
    const counts = totals(result.stdout)
    check('offline handler tests run and pass', () => {
      require_(!result.timedOut, `test run exceeded ${TIMEOUT_MS}ms`)
      if (result.stderr.trim()) throw new Error(`runner stderr:\n${result.stderr.trim()}`)
      require_(result.code === 0, `node --test exited ${result.code}`)
      require_(counts.tests > 0, 'no tests were collected')
      require_(counts.pass > 0, 'zero assertions passed')
      require_(counts.fail === 0, `${counts.fail} failing test(s)`)
      require_(counts.cancelled === 0 && counts.skipped === 0, 'tests were cancelled or skipped')
      require_(counts.pass === counts.tests, `${counts.pass}/${counts.tests} tests passed`)
      return `${counts.pass} tests, ${testFiles.length} file(s)`
    })
    if (result.code !== 0 || result.stderr.trim()) {
      process.stdout.write(`${result.stdout}\n${result.stderr}\n`)
    }
  }

  for (const item of passed) console.log(`ok   ${item.name}${item.detail ? ` — ${item.detail}` : ''}`)
  for (const item of failed) console.log(`FAIL ${item.name} — ${item.message}`)
  console.log(`\n${passed.length} passed, ${failed.length} failed`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

await main()
