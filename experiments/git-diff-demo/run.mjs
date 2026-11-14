#!/usr/bin/env node
import { runDemo } from './demo.mjs';

const { exitCode, stdout, stderr } = await runDemo();
if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);
process.exitCode = exitCode;
