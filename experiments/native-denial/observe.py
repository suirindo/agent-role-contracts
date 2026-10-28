#!/usr/bin/env python3
"""Read-only Linux inotify observer for owned ARC85 synthetic fixtures.

The observer is a separate process, not a tamper-proof or privileged authority.
It never attempts the tested write and never decides native authorization.
"""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import select
import struct
import time


def snapshot(path):
    try:
        st = path.lstat()
        parent = path.parent.lstat()
        return {"exists": True, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "bytes": st.st_size, "dev": st.st_dev, "inode": st.st_ino,
                "mode": st.st_mode, "mtime_ns": st.st_mtime_ns, "ctime_ns": st.st_ctime_ns,
                "parent_dev": parent.st_dev, "parent_inode": parent.st_ino,
                "parent_mode": parent.st_mode, "parent_mtime_ns": parent.st_mtime_ns,
                "parent_ctime_ns": parent.st_ctime_ns}
    except OSError as exc:
        return {"exists": False, "error": type(exc).__name__}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", required=True)
    parser.add_argument("--commands", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--seconds", type=int, default=600)
    args = parser.parse_args()
    root = Path(args.fixture).resolve(strict=True)
    paths = {route: root / route / "sentinel.txt" for route in ("direct", "exec")}
    commands = Path(args.commands)
    libc = ctypes.CDLL(None, use_errno=True)
    fd = libc.inotify_init1(os.O_NONBLOCK | os.O_CLOEXEC)
    if fd < 0:
        raise OSError(ctypes.get_errno(), "inotify_init1 failed")
    masks = {2: "MODIFY", 4: "ATTRIB", 8: "CLOSE_WRITE", 64: "MOVED_FROM",
             128: "MOVED_TO", 256: "CREATE", 512: "DELETE", 1024: "DELETE_SELF",
             2048: "MOVE_SELF", 8192: "UNMOUNT", 16384: "QUEUE_OVERFLOW", 32768: "IGNORED"}
    watchmask = sum(masks)
    watches = {}
    for path in [root.parent, root, *[p.parent for p in paths.values()], *paths.values()]:
        wd = libc.inotify_add_watch(fd, os.fsencode(path), watchmask)
        if wd < 0:
            raise OSError(ctypes.get_errno(), "inotify_add_watch failed: " + str(path))
        watches[wd] = path
    phase = "setup"
    sequence = 0
    healthy = True
    start = time.monotonic()
    offset = 0
    pending = ""
    last_heartbeat = 0
    output = open(args.output, "x", encoding="utf-8", buffering=1)

    def emit(kind, **data):
        nonlocal sequence
        sequence += 1
        record = {"seq": sequence, "kind": kind, "phase": phase,
                  "monotonic_ns": time.monotonic_ns(), "wall_ns": time.time_ns(), **data}
        output.write(json.dumps(record, sort_keys=True) + "\n")

    def drain():
        nonlocal healthy
        while True:
            try:
                data = os.read(fd, 65536)
            except BlockingIOError:
                break
            pos = 0
            while pos < len(data):
                wd, mask, cookie, length = struct.unpack_from("iIII", data, pos)
                name = data[pos + 16:pos + 16 + length].split(b"\0", 1)[0].decode("utf-8", "replace")
                pos += 16 + length
                watched = watches.get(wd)
                if watched == root.parent and name != root.name:
                    continue
                flags = [label for bit, label in masks.items() if mask & bit]
                if mask & (8192 | 16384 | 32768):
                    healthy = False
                emit("event", watch=str(watched) if watched else None, name=name,
                     flags=flags, cookie=cookie, healthy=healthy)

    emit("ready", pid=os.getpid(), uid=os.getuid(), observer_source_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
         boot_id_sha256=hashlib.sha256(Path("/proc/sys/kernel/random/boot_id").read_bytes()).hexdigest(),
         subject={r: str(p) for r, p in paths.items()}, snapshots={r: snapshot(p) for r, p in paths.items()},
         limitations=["same UID as executor; not tamper-proof", "inotify coverage only; no whole-machine claim"])
    print(json.dumps({"status": "READY", "pid": os.getpid(), "output": args.output}), flush=True)
    stop = False
    while not stop and time.monotonic() - start < args.seconds:
        select.select([fd], [], [], 0.05)
        drain()
        if commands.exists():
            with commands.open() as source:
                source.seek(offset)
                pending += source.read()
                offset = source.tell()
            while "\n" in pending:
                line, pending = pending.split("\n", 1)
                command = json.loads(line)
                drain()
                phase = command["phase"]
                emit("barrier", command=command, healthy=healthy, snapshots={r: snapshot(p) for r, p in paths.items()})
                if command.get("stop"):
                    stop = True
        if time.monotonic() - last_heartbeat >= 1:
            last_heartbeat = time.monotonic()
            emit("heartbeat", healthy=healthy)
    drain()
    emit("terminal", healthy=healthy, reason="requested_stop" if stop else "timeout", snapshots={r: snapshot(p) for r, p in paths.items()})
    os.fsync(output.fileno())
    output.close()
    os.close(fd)


if __name__ == "__main__":
    main()
