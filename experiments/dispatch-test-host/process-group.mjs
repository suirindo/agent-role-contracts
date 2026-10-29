/**
 * Process-group custody for helper children (#69). Every ssh child is spawned detached so it leads its own process group; a
 * ProxyCommand (or any descendant that stays in the group) is therefore reachable by signalling the group, and "reaped" means the
 * whole group is gone, not just the leader. Only groups this process spawned and still holds are ever signalled (no pattern kill).
 */
export const groupAlive = pgid => { try { process.kill(-pgid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
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
