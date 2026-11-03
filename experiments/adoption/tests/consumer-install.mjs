// Shared preflight for the adoption-kit tests. They run against the consumer's locked
// installation of the published 1.0.0 package, which a source checkout does not contain.
// `skipReason(root)` is false when that installation exists and otherwise the one-time
// instruction to run; node:test prints it once per skipped test instead of a failure per step.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const adoptionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const consumerRoot = join(adoptionRoot, 'consumer');
export const consumerPackageRoot = join(consumerRoot, 'node_modules/@netsujo/agent-role-contracts');
export const installCommand = 'npm ci --prefix experiments/adoption/consumer --ignore-scripts --include=dev --no-audit --no-fund';

export function skipReason(packageRoot = consumerPackageRoot) {
  if (existsSync(join(packageRoot, 'package.json'))) return false;
  return `pinned 1.0.0 consumer dependency is not installed at ${packageRoot}; from the repository root run: ${installCommand} (see experiments/adoption/README.md#run-the-kit-tests-from-a-source-checkout)`;
}
