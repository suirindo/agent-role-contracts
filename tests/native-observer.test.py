#!/usr/bin/env python3
"""Standalone regressions for the experimental observer; no native authority claim."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
SOURCE = Path(__file__).resolve().parents[1] / "experiments/native-denial/observe.py"
spec = importlib.util.spec_from_file_location("arc_native_observer", SOURCE)
observer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(observer)
PARENT_FIELDS = ("parent_mode", "parent_mtime_ns", "parent_ctime_ns")


class ParentSnapshotTests(unittest.TestCase):
    def test_parent_only_changes_are_recorded_while_file_is_unchanged(self):
        with tempfile.TemporaryDirectory(prefix="arc-observer-test-") as directory:
            parent = Path(directory)
            sentinel = parent / "sentinel.txt"
            sentinel.write_bytes(b"fictional unchanged content\n")
            parent.chmod(0o700)
            before = observer.snapshot(sentinel)
            parent.chmod(0o750)
            changed_ns = 1760000000123456789
            os.utime(parent, ns=(changed_ns, changed_ns))
            after = observer.snapshot(sentinel)
            actual = parent.lstat()
            self.assertEqual(after["parent_mode"], actual.st_mode)
            self.assertEqual(after["parent_mtime_ns"], actual.st_mtime_ns)
            self.assertEqual(after["parent_ctime_ns"], actual.st_ctime_ns)
            self.assertIsInstance(after["parent_mtime_ns"], int)
            self.assertNotEqual(before["parent_mode"], after["parent_mode"])
            self.assertNotEqual(before["parent_mtime_ns"], after["parent_mtime_ns"])
            self.assertEqual({k: v for k, v in before.items() if k not in PARENT_FIELDS},
                             {k: v for k, v in after.items() if k not in PARENT_FIELDS})

    @unittest.skipUnless(sys.platform.startswith("linux"), "inotify observer is Linux-only")
    def test_ready_barrier_and_terminal_include_parent_metadata(self):
        with tempfile.TemporaryDirectory(prefix="arc-observer-lifecycle-") as directory:
            root = Path(directory)
            fixture = root / "fixture"
            for route in ("direct", "exec"):
                parent = fixture / route
                parent.mkdir(parents=True)
                (parent / "sentinel.txt").write_bytes(b"fictional sentinel\n")
            commands = root / "commands.jsonl"
            commands.write_text('{"phase":"complete","stop":true}\n', encoding="utf-8")
            output = root / "observer.jsonl"
            result = subprocess.run([sys.executable, str(SOURCE), "--fixture", str(fixture),
                                     "--commands", str(commands), "--output", str(output),
                                     "--seconds", "5"], capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["status"], "READY")
            records = [json.loads(line) for line in output.read_text().splitlines()]
            snapshots = [row for row in records if "snapshots" in row]
            self.assertEqual([row["kind"] for row in snapshots], ["ready", "barrier", "terminal"])
            for row in snapshots:
                for route in ("direct", "exec"):
                    actual = (fixture / route).lstat()
                    captured = row["snapshots"][route]
                    self.assertEqual(captured["parent_mode"], actual.st_mode)
                    self.assertEqual(captured["parent_mtime_ns"], actual.st_mtime_ns)
                    self.assertEqual(captured["parent_ctime_ns"], actual.st_ctime_ns)
            self.assertTrue(records[-1]["healthy"])
            self.assertEqual(records[-1]["reason"], "requested_stop")


if __name__ == "__main__":
    unittest.main()
