# Copyable commands for the published package

These commands use **Node.js 22.5 or newer**, npm, and the published **1.0.0** package. Run them in a new, writable directory. Installation needs access to npm; the subsequent declaration checks run locally. They do not start agents or open the files named in a task's scope.

## macOS / Linux: POSIX shell

```sh
mkdir arc-first-check
cd arc-first-check
npm init --yes
npm install --ignore-scripts @netsujo/agent-role-contracts@1.0.0
node node_modules/@netsujo/agent-role-contracts/bin/agent-role-contracts.mjs explain --bundle node_modules/@netsujo/agent-role-contracts/examples/starter-bundle.json --task node_modules/@netsujo/agent-role-contracts/examples/starter-task.json --format text
echo $?
```

## Windows: PowerShell

```powershell
mkdir arc-first-check
cd arc-first-check
npm.cmd init --yes
npm.cmd install --ignore-scripts @netsujo/agent-role-contracts@1.0.0
node node_modules/@netsujo/agent-role-contracts/bin/agent-role-contracts.mjs explain --bundle node_modules/@netsujo/agent-role-contracts/examples/starter-bundle.json --task node_modules/@netsujo/agent-role-contracts/examples/starter-task.json --format text
$LASTEXITCODE
```

Each CLI command is one line: no trailing backslash or backtick is needed. `npm.cmd` selects npm's Windows command launcher without changing PowerShell's execution policy. Check that each installation command succeeds before continuing. The CLI prints `PASS: explain`; the immediately following exit-code command prints `0`.

## Confirm a meaningful rejection

In either shell, run this unchanged single line:

```sh
node node_modules/@netsujo/agent-role-contracts/bin/agent-role-contracts.mjs explain --bundle node_modules/@netsujo/agent-role-contracts/examples/starter-bundle.json --task node_modules/@netsujo/agent-role-contracts/examples/starter-task-outside-scope.json --format text
```

It reports `TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY` and exits **1**. Immediately inspect `echo $?` in a POSIX shell or `$LASTEXITCODE` in PowerShell. This is the intended rejection of the supplied negative fixture. A missing input or CLI usage problem exits **2**, which is a different result. The examples are synthetic checks, not evidence that an agent was constrained during execution.

## If npm cannot write its cache

Only when the error names npm's cache directory, retry the failed npm command with `--cache ./.npm-cache`. For example:

```sh
npm --cache ./.npm-cache install --ignore-scripts @netsujo/agent-role-contracts@1.0.0
```

In PowerShell, use `npm.cmd` in that line. If `npm init` was the command that failed, retry `npm --cache ./.npm-cache init --yes` first (`npm.cmd` in PowerShell). Do not commit the local cache. An error naming an input JSON file needs a path/permission repair instead.

## Continue with your own task

Use the [consumer starter and first-task guide](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/adoption/README.md), or the [complete Japanese guide](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/adoption/README.ja.md). Installing the npm package does not install this repository's source-only adoption scripts into your project. Copy the starter deliberately, or follow the [published API recipe](https://github.com/suirindo/agent-role-contracts/blob/main/experiments/adoption/API-EXAMPLE.md) to call existing public exports from your own code.
