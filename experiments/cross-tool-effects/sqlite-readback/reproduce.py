"""Synthetic local fixture. No service, model, credentials or network."""
import hashlib
import json
import sqlite3
import tempfile
from contextlib import closing
from pathlib import Path

APPROVED_TARGET = "draft"
APPROVED_REVISION = "v1"
OPERATION_ID = "demo-001"


class Denied(Exception):
    pass


def apply(db, operation_id, target, revision, text, enforce):
    if enforce and (target, revision) != (APPROVED_TARGET, APPROVED_REVISION):
        raise Denied("AUTHORITY_MISMATCH")
    digest = hashlib.sha256(
        json.dumps([target, revision, text], ensure_ascii=False).encode()
    ).hexdigest()
    with db:
        db.execute("BEGIN IMMEDIATE")
        existing = db.execute(
            "SELECT digest FROM effects WHERE id = ?", (operation_id,)
        ).fetchone()
        if existing:
            if existing[0] != digest:
                raise Denied("OPERATION_ID_CONFLICT")
            return "ALREADY_APPLIED"
        db.execute("UPDATE documents SET body = ? WHERE id = ?", (text, target))
        db.execute("INSERT INTO effects VALUES (?, ?, ?)", (operation_id, target, digest))
    return "APPLIED"


def observe(db_path):
    with closing(sqlite3.connect(db_path.as_uri() + "?mode=ro", uri=True)) as reader:
        documents = dict(reader.execute("SELECT id, body FROM documents"))
        effects = list(reader.execute("SELECT id, target FROM effects"))
    return documents, effects


def run(name, target="draft", revision="v1", enforce=True, response_lost=False,
        read_unavailable=False):
    with tempfile.TemporaryDirectory() as temp:
        path = Path(temp) / "demo.sqlite"
        with closing(sqlite3.connect(path)) as db:
            db.executescript(
                "CREATE TABLE documents(id TEXT PRIMARY KEY, body TEXT);"
                "INSERT INTO documents VALUES ('draft','before'),('protected','before');"
                "CREATE TABLE effects(id TEXT PRIMARY KEY, target TEXT, digest TEXT);"
            )
            # The declared target stays "draft" for every run. The simulated adapter
            # may supply a different target at the actual write boundary.
            try:
                status = apply(db, OPERATION_ID, target, revision, "after", enforce)
                if response_lost:
                    raise TimeoutError("response dropped after commit")
            except Denied as error:
                status = str(error)
            except TimeoutError:
                status = "HOLD_UNKNOWN"
                if not read_unavailable:
                    _, observed = observe(path)
                    if (OPERATION_ID, target) in observed:
                        status = "READBACK_CONFIRMED"
            # Test-oracle readback, even when the simulated application reader failed.
            documents, effects = observe(path)
        return [name, status, documents["draft"], documents["protected"], len(effects)]


def main():
    results = [
        run("allowed"),
        run("declaration_only", target="protected", enforce=False),
        run("changed_target", target="protected"),
        run("stale_revision", revision="v0"),
        run("response_lost", response_lost=True),
        run("reader_unavailable", response_lost=True, read_unavailable=True),
    ]
    expected = [
        ["allowed", "APPLIED", "after", "before", 1],
        ["declaration_only", "APPLIED", "before", "after", 1],
        ["changed_target", "AUTHORITY_MISMATCH", "before", "before", 0],
        ["stale_revision", "AUTHORITY_MISMATCH", "before", "before", 0],
        ["response_lost", "READBACK_CONFIRMED", "after", "before", 1],
        ["reader_unavailable", "HOLD_UNKNOWN", "after", "before", 1],
    ]
    if results != expected:
        raise SystemExit(f"unexpected results: {results!r}")
    for result in results:
        print(*result, sep="\t")
    print("6/6 matched; network=0; resend=0")


if __name__ == "__main__":
    main()
