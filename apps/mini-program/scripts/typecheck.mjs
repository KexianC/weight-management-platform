import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const root = resolve(import.meta.dirname, '..')
const executable = resolve(root, '.typecheck-tools/node_modules/vue-tsc/bin/vue-tsc.js')
if (!existsSync(executable)) {
  console.error('Install isolated check tools: npm install --prefix .typecheck-tools --ignore-scripts --no-save --package-lock=false vue-tsc@2.2.12 typescript@5.8.3')
  process.exit(1)
}
const result = spawnSync(process.execPath, [executable, '--noEmit', '-p', resolve(root, 'tsconfig.json')], { cwd: root, stdio: 'inherit' })
process.exit(result.status ?? 1)
