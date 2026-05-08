#!/usr/bin/env python3
"""List and validate Codex custom pet packages."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Optional


EXPECTED_SIZE = (1536, 1872)


def image_size(path: Path) -> Optional[tuple[int, int, str]]:
    data = path.read_bytes()
    if len(data) >= 24 and data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR":
        return (int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big"), "png")
    if len(data) >= 20 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        offset = 12
        while offset + 8 <= len(data):
            chunk = data[offset : offset + 4]
            size = int.from_bytes(data[offset + 4 : offset + 8], "little")
            body = offset + 8
            if body + size > len(data):
                return None
            if chunk == b"VP8X" and size >= 10:
                width = int.from_bytes(data[body + 4 : body + 7], "little") + 1
                height = int.from_bytes(data[body + 7 : body + 10], "little") + 1
                return (width, height, "webp")
            if chunk == b"VP8L" and size >= 5 and data[body] == 47:
                bits = int.from_bytes(data[body + 1 : body + 5], "little")
                return ((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1, "webp")
            if chunk == b"VP8 " and size >= 10 and data[body + 3 : body + 6] == b"\x9d\x01\x2a":
                width = int.from_bytes(data[body + 6 : body + 8], "little") & 0x3FFF
                height = int.from_bytes(data[body + 8 : body + 10], "little") & 0x3FFF
                return (width, height, "webp")
            offset = body + size + (size % 2)
    return None


def inspect_pet(folder: Path) -> dict:
    manifest_path = folder / "pet.json"
    result = {"folder": folder.name, "path": str(folder), "valid": False, "errors": []}
    try:
        manifest = json.loads(manifest_path.read_text())
    except FileNotFoundError:
        result["errors"].append("missing pet.json")
        return result
    except Exception as exc:
        result["errors"].append(f"invalid pet.json: {exc}")
        return result

    result.update(
        id=manifest.get("id"),
        displayName=manifest.get("displayName"),
        description=manifest.get("description"),
        spritesheetPath=manifest.get("spritesheetPath", "spritesheet.webp"),
    )
    sprite = folder / result["spritesheetPath"]
    if not sprite.exists():
        result["errors"].append(f"missing spritesheet: {result['spritesheetPath']}")
        return result
    size = image_size(sprite)
    if size is None:
        result["errors"].append("spritesheet is not a readable PNG/WebP")
        return result
    width, height, kind = size
    result.update(width=width, height=height, format=kind)
    if (width, height) != EXPECTED_SIZE:
        result["errors"].append(f"expected {EXPECTED_SIZE[0]}x{EXPECTED_SIZE[1]}, got {width}x{height}")
    result["valid"] = not result["errors"]
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--codex-home", default=os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))
    parser.add_argument("--json", action="store_true", help="print machine-readable JSON")
    args = parser.parse_args()

    pets_dir = Path(args.codex_home).expanduser() / "pets"
    pets = [inspect_pet(path) for path in sorted(pets_dir.iterdir()) if path.is_dir()] if pets_dir.exists() else []

    if args.json:
        print(json.dumps({"petsDir": str(pets_dir), "pets": pets}, indent=2))
        return 0 if all(pet["valid"] for pet in pets) else 1

    print(f"Pets directory: {pets_dir}")
    if not pets:
        print("No custom pets found.")
        return 0
    for pet in pets:
        status = "OK" if pet["valid"] else "FAIL"
        name = pet.get("displayName") or pet.get("id") or pet["folder"]
        size = f"{pet.get('width', '?')}x{pet.get('height', '?')}"
        print(f"{status} {pet['folder']}: {name} [{size}]")
        for error in pet["errors"]:
            print(f"  - {error}")
    return 0 if all(pet["valid"] for pet in pets) else 1


if __name__ == "__main__":
    raise SystemExit(main())
