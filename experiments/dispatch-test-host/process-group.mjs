/**
 * Process-group custody for helper children (#69). Every ssh child is spawned detached so it leads its own process group; a
 * ProxyCommand (or any descendant that stays in the group) is therefore reachable by signalling the group, and "reaped" means the
 * whole group is gone, not just the leader. Only groups this process spawned and still holds are ever signalled (no pattern kill).
 *
 * "Alive" means "can still execute". On Linux a zombie (exited, not yet waited for by its parent or by init) holds no execution
 * and cannot produce an effect, so it counts as gone: an init that reaps orphans lazily, or a container without one, would
 * otherwise leave a fully killed group unconfirmable for seconds or forever. Elsewhere liveness is the kernel's signal-0 answer.
 */
import { readdirSync, readFileSync } from 'node:fs';

const LINUX = process.platform === 'linux';
const DEAD_STATES = new Set(['Z', 'X', 'x']);                                    // zombie, dead (both spellings seen across kernels)
/** Linux /proc/<pid>/stat: the fields after the parenthesised comm are state, ppid, pgrp, ... Returns null once the process is gone. */
export const procStat = pid => {
 let text; try { text = readFileSync('/proc/' + pid + '/stat', 'utf8'); } catch { return null; }
 const rest = text.slice(text.lastIndexOf(')') + 2).split(' ');
 return { state: rest[0], ppid: Number(rest[1]), pgrp: Number(rest[2]) };
};
/** Linux: does any member of the group still execute? null when /proc cannot be listed (the caller then keeps the signal-0 answer). */
const groupHasRunnable = pgid => {
 let names; try { names = readdirSync('/proc'); } catch { return null; }
 for (const name of names) {
  if (!/^\d+$/.test(name)) continue;
  const s = procStat(Number(name));                                             // null: exited between readdir and read; not a member any more
  if (s && s.pgrp === pgid && !DEAD_STATES.has(s.state)) return true;
 }
 return false;
};

/** One process can still execute: signal 0 is answered and, on Linux, it is not a zombie. */
export const processAlive = pid => {
 try { process.kill(pid, 0); } catch { return false; }
 if (!LINUX) return true;
 const s = procStat(pid); return s !== null && !DEAD_STATES.has(s.state);
};
/** Some member of the group can still execute. EPERM (a member we may not signal) is conservatively alive. */
export const groupAlive = pgid => {
 try { process.kill(-pgid, 0); } catch (e) { return e.code === 'EPERM'; }
 if (!LINUX) return true;
 const runnable = groupHasRunnable(pgid); return runnable === null ? true : runnable;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const signalGroup = (pgid, sig) => { try { process.kill(-pgid, sig); } catch { /* group gone */ } };
const waitGone = async (pgid, ms) => { const end = Date.now() + ms; while (groupAlive(pgid)) { if (Date.now() >= end) return false; await sleep(20); } return true; };

/** SIGTERM the group, bounded wait, SIGKILL the group, bounded wait. Resolves true only when the group is confirmed gone. */
export async function terminateGroup(pgid, { termMs = 500, killMs = 1500 } = {}) {
 if (!Number.isInteger(pgid) || pgid <= 1) return false;
 if (!groupAlive(pgid)) return true;
 signalGroup(pgid, 'SIGTERM');
 if (await waitGone(pgid, termMs)) return true;
 signalGroup(pgid, 'SIGKILL');
 return waitGone(pgid, killMs);
}

/** Spawned-group registry: entries leave only once the group is confirmed gone. */
export function createGroupRegistry() {
 const held = new Map();                                                         // pgid -> child
 return {
  track(child) {
   if (!child.pid) return child;                                                 // spawn failed: nothing to reap
   held.set(child.pid, child);
   const settle = () => { if (!groupAlive(child.pid)) held.delete(child.pid); };
   child.once('exit', settle); child.once('error', settle);
   return child;
  },
  /** Terminate every held group in parallel. { confirmed, unknown: [pgid] }; unconfirmed groups stay registered. */
  async terminateAll(opts) {
   const entries = [...held.keys()];
   const results = await Promise.all(entries.map(async pgid => { const ok = await terminateGroup(pgid, opts); if (ok) held.delete(pgid); return [pgid, ok]; }));
   const unknown = results.filter(([, ok]) => !ok).map(([pgid]) => pgid);
   return { confirmed: unknown.length === 0, unknown };
  },
  held: () => [...held.keys()],
 };
}

/** Hard failsafe: after delayMs run the (bounded) reap, report any UNKNOWN groups, then exit(124). Unref'd so it never keeps the process alive. */
export function armFailsafe({ delayMs, reap, note, write = s => process.stderr.write(s), exit = c => process.exit(c) }) {
 const t = setTimeout(async () => { await reap(); write('overall trial timeout (hard)\n' + note()); exit(124); }, Math.max(0, delayMs));
 t.unref(); return t;
}
