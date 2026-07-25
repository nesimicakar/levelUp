#!/usr/bin/env python3
"""
Validate a LevelUp Vault Pack for import-readiness — READ ONLY.

Never touches the app, the database, or any source file. It only parses JSON
(from a file path or stdin) and checks it against the current Vault Pack
contract as implemented in src/lib/logic/vaultPack.ts and src/types/index.ts.

Usage:
    python3 validate.py concept.json
    cat concept.json | python3 validate.py
    python3 validate.py <<'EOF'
    { ... }
    EOF

Exit code 0 = valid (warnings allowed), 1 = invalid, 2 = bad usage / unreadable.
"""
import json
import sys

# Closed enum — mirrors KnowledgeSourceType in src/types/index.ts.
SOURCE_TYPES = {"book", "course", "recall", "yuno", "memoryos", "note", "manual"}

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def read_input() -> str:
    if len(sys.argv) > 1:
        path = sys.argv[1]
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return fh.read()
        except OSError as e:
            print(f"cannot read {path}: {e}", file=sys.stderr)
            sys.exit(2)
    data = sys.stdin.read()
    if not data.strip():
        print("no input: pass a file path or pipe JSON on stdin", file=sys.stderr)
        sys.exit(2)
    return data


def is_str(v) -> bool:
    return isinstance(v, str)


def check_no_id(obj: dict, where: str) -> None:
    # The importer always mints its own crypto.randomUUID(); any supplied id is
    # ignored, and inventing one violates the skill's "never invent IDs" rule.
    if "id" in obj:
        err(f'{where} contains a forbidden "id" field — the importer assigns IDs itself')


def main() -> int:
    raw = read_input()
    try:
        pack = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"INVALID: not valid JSON — {e}", file=sys.stderr)
        return 1

    if not isinstance(pack, dict):
        print("INVALID: top level must be a JSON object", file=sys.stderr)
        return 1

    # ── Envelope ──────────────────────────────────────────────────────────
    if pack.get("type") != "levelup-vault-pack":
        err('type must be exactly "levelup-vault-pack"')
    if pack.get("version") != 1:
        err(f'version must be the number 1 (got {pack.get("version")!r})')
    if not is_str(pack.get("exportedAt")):
        warn('exportedAt should be an ISO-8601 string (e.g. "2026-07-24T00:00:00.000Z")')

    domains = pack.get("domains")
    concepts = pack.get("concepts")
    if not isinstance(domains, list):
        err('"domains" must be an array')
        domains = []
    if not isinstance(concepts, list):
        err('"concepts" must be an array')
        concepts = []

    allowed_top = {"type", "version", "exportedAt", "domains", "concepts"}
    for k in pack:
        if k not in allowed_top:
            warn(f'unexpected top-level field "{k}" (importer ignores it)')

    # ── Domains ───────────────────────────────────────────────────────────
    domain_names = set()
    for i, d in enumerate(domains):
        if not isinstance(d, dict):
            err(f"domains[{i}] is not an object")
            continue
        check_no_id(d, f"domains[{i}]")
        if not is_str(d.get("name")) or not d.get("name", "").strip():
            err(f'domains[{i}] is missing a non-empty "name"')
        else:
            domain_names.add(d["name"].strip().lower())
        if not is_str(d.get("icon")):
            warn(f"domains[{i}] has no icon (fine — defaults to 📚 only when the domain is new)")
        if not is_str(d.get("color")):
            warn(f"domains[{i}] has no color (fine — defaults to #64748b only when the domain is new)")

    # ── Concepts ──────────────────────────────────────────────────────────
    allowed_concept = {
        "title", "domainName", "summary", "keyIdeas", "keyTakeaways",
        "personalNotes", "tags", "relatedConceptTitles", "sourceType", "sourceTitle",
    }
    if len(concepts) == 0:
        err("no concepts to import")
    if len(concepts) > 1:
        warn(f"{len(concepts)} concepts present — normal invocation should return exactly one")

    for i, c in enumerate(concepts):
        w = f"concepts[{i}]"
        if not isinstance(c, dict):
            err(f"{w} is not an object")
            continue
        label = c.get("title", w) if is_str(c.get("title")) else w
        check_no_id(c, w)

        for req in ("title", "domainName", "summary"):
            if not is_str(c.get(req)) or not c.get(req, "").strip():
                err(f'{w} ("{label}") is missing required "{req}"')

        dn = c.get("domainName")
        if is_str(dn) and dn.strip().lower() not in domain_names:
            # Not fatal — importer auto-creates the domain — but usually a typo.
            warn(f'{w} domainName "{dn}" has no matching domains[] entry '
                 f"(importer will auto-create it)")

        st = c.get("sourceType")
        if st is not None and st not in SOURCE_TYPES:
            err(f'{w} sourceType "{st}" is not a valid KnowledgeSourceType '
                f"({', '.join(sorted(SOURCE_TYPES))})")

        ki = c.get("keyIdeas")
        if ki is not None:
            if not isinstance(ki, list):
                err(f"{w} keyIdeas must be an array")
            else:
                for j, idea in enumerate(ki):
                    if not isinstance(idea, dict):
                        err(f"{w} keyIdeas[{j}] is not an object")
                        continue
                    if not is_str(idea.get("title")) and not is_str(idea.get("body")):
                        err(f"{w} keyIdeas[{j}] needs a title and/or body string")
                    for extra in idea:
                        if extra not in ("title", "body"):
                            # description is the legacy alias vaultPack normalizes; flag others.
                            note = " (legacy alias; use 'body')" if extra == "description" else ""
                            warn(f'{w} keyIdeas[{j}] has non-standard field "{extra}"{note}')

        for arr_field in ("tags", "relatedConceptTitles", "keyTakeaways"):
            v = c.get(arr_field)
            if v is not None and not (isinstance(v, list) and all(is_str(x) for x in v)):
                err(f"{w} {arr_field} must be an array of strings")

        if c.get("personalNotes") not in (None,) and not is_str(c.get("personalNotes")):
            err(f"{w} personalNotes must be a string")

        for k in c:
            if k not in allowed_concept and k != "id":  # id already errored above
                warn(f'{w} has unsupported field "{k}"')

    # ── Report ────────────────────────────────────────────────────────────
    for m in warnings:
        print(f"WARN: {m}")
    if errors:
        for m in errors:
            print(f"ERROR: {m}")
        print(f"\nINVALID — {len(errors)} error(s), {len(warnings)} warning(s)")
        return 1
    print(f"\nVALID — import-ready ({len(warnings)} warning(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
