#!/usr/bin/env python3
"""Reference raw-format Inlay CLI. Python 3.9+, standard library only.

The combined file is exactly carrier + payload. JSON sidecars are separate.
SHA-256 checks accidental corruption; this tool does not encrypt or authenticate.
"""

import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import sys
import tempfile

BUFFER_SIZE = 1 << 20
MAX_SAFE_INTEGER = (1 << 53) - 1
MAX_RECIPE_BYTES = 65536


def integer(value, name):
    if type(value) is not int or not 0 <= value <= MAX_SAFE_INTEGER:
        raise ValueError(f"{name} must be a nonnegative safe integer")
    return value


def gap_value(value, size):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]+", value):
        raise ValueError("gap must contain decimal digits only")
    gap = integer(int(value), "gap")
    if gap > size:
        raise ValueError("gap exceeds the combined file size")
    return gap


def read_recipe(path):
    with Path(path).open("rb") as source:
        data = source.read(MAX_RECIPE_BYTES + 1)
    if len(data) > MAX_RECIPE_BYTES:
        raise ValueError("recipe exceeds 64 KiB")
    recipe = json.loads(data.decode("utf-8"))
    if not isinstance(recipe, dict) or recipe.get("format") not in ("inlay", "file-fold"):
        raise ValueError("unsupported recipe format")
    if type(recipe.get("version")) is not int or recipe["version"] != 1:
        raise ValueError("unsupported recipe version")
    gap = integer(recipe.get("gap"), "gap")
    payload_size = integer(recipe.get("payloadSize"), "payloadSize")
    combined_size = integer(recipe.get("combinedSize"), "combinedSize")
    if gap + payload_size != combined_size:
        raise ValueError("recipe size fields disagree")
    name = recipe.get("payloadName")
    if not isinstance(name, str) or not name.strip() or len(name) > 4096:
        raise ValueError("invalid payloadName")
    if "payloadSha256" in recipe:
        digest = recipe["payloadSha256"]
        if not isinstance(digest, str) or not re.fullmatch(r"[a-fA-F0-9]{64}", digest):
            raise ValueError("invalid payloadSha256")
        recipe["payloadSha256"] = digest.lower()
    return recipe


def input_path(value):
    path = Path(value).expanduser().resolve()
    if not path.is_file():
        raise ValueError(f"input is not a regular file: {path}")
    return path


def output_path(value, inputs, force):
    path = Path(value).expanduser().absolute()
    resolved = path.resolve()
    if resolved in inputs:
        raise ValueError("input and output paths must be different, including with --force")
    if not path.parent.is_dir():
        raise ValueError(f"output directory does not exist: {path.parent}")
    if path.exists() and (not force or not path.is_file()):
        raise ValueError(f"output exists; use --force to replace a regular file: {path}")
    if path.is_symlink():
        raise ValueError("output may not be a symbolic link")
    return path


def temporary_output(target):
    # Same directory keeps final publication on the same filesystem.
    return tempfile.NamedTemporaryFile(prefix=".inlay-", dir=target.parent, delete=False)


def publish(temporary, target, force):
    if force:
        os.replace(temporary, target)
    else:
        # Unlike rename(), link() atomically refuses an existing destination.
        os.link(temporary, target)
        os.unlink(temporary)


def copy_chunks(source, destination, digest=None):
    count = 0
    while True:
        chunk = source.read(BUFFER_SIZE)
        if not chunk:
            return count
        destination.write(chunk)
        if digest is not None:
            digest.update(chunk)
        count += len(chunk)


def encode(args):
    carrier, payload = input_path(args.carrier), input_path(args.payload)
    inputs = {carrier, payload}
    target = output_path(args.output, inputs, args.force)
    recipe_target = output_path(args.recipe, inputs | {target.resolve()}, args.force) if args.recipe else None
    if recipe_target and recipe_target.resolve() == target.resolve():
        raise ValueError("combined output and recipe paths must be different")
    carrier_size, payload_size = carrier.stat().st_size, payload.stat().st_size
    integer(carrier_size + payload_size, "combinedSize")
    digest = hashlib.sha256()
    temporary = temporary_output(target)
    recipe_temporary = None
    try:
        with temporary as destination, carrier.open("rb") as first, payload.open("rb") as second:
            gap = copy_chunks(first, destination)
            copied = copy_chunks(second, destination, digest)
        if gap != carrier_size or copied != payload_size:
            raise ValueError("an input changed size during processing; retry with stable files")
        recipe = {
            "format": "inlay", "version": 1, "gap": gap,
            "carrierName": carrier.name, "payloadName": payload.name,
            "payloadSize": copied, "combinedSize": gap + copied,
            "payloadSha256": digest.hexdigest(),
        }
        if recipe_target:
            recipe_temporary = temporary_output(recipe_target)
            with recipe_temporary as destination:
                destination.write((json.dumps(recipe, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        publish(temporary.name, target, args.force)
        if recipe_target:
            publish(recipe_temporary.name, recipe_target, args.force)
        print(f"Combined {gap + copied} bytes; gap={gap}; payload SHA-256={digest.hexdigest()}")
        if not recipe_target:
            print("Save the gap. Use --recipe recipe.json to save extraction parameters and checksum.")
    finally:
        for item in (temporary, recipe_temporary):
            if item and Path(item.name).exists():
                Path(item.name).unlink()


def decode(args):
    combined = input_path(args.combined)
    size = combined.stat().st_size
    recipe_path = input_path(args.recipe) if args.recipe else None
    recipe = read_recipe(recipe_path) if recipe_path else None
    target = output_path(args.output, {combined, recipe_path}, args.force)
    if recipe:
        if size != recipe["combinedSize"]:
            raise ValueError("combined file size does not match the recipe")
        gap = recipe["gap"]
    else:
        gap = gap_value(args.gap, size)
    if gap == size and not (recipe and recipe["payloadSize"] == 0) and not args.allow_empty:
        raise ValueError("gap is at end of file: no payload; use --allow-empty only if intentional")
    digest = hashlib.sha256()
    temporary = temporary_output(target)
    try:
        with temporary as destination, combined.open("rb") as source:
            source.seek(gap)
            copied = copy_chunks(source, destination, digest)
        if copied != size - gap:
            raise ValueError("input changed size during processing")
        expected = recipe.get("payloadSha256") if recipe else None
        if expected and not hmac.compare_digest(expected, digest.hexdigest()):
            raise ValueError("payload SHA-256 mismatch; no output was published")
        publish(temporary.name, target, args.force)
        status = "SHA-256 verified" if expected else "UNVERIFIED: no trusted expected checksum was supplied"
        print(f"Extracted {copied} bytes; {status}")
    finally:
        if Path(temporary.name).exists():
            Path(temporary.name).unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    merge = commands.add_parser("encode", help="append payload bytes to carrier bytes")
    merge.add_argument("carrier")
    merge.add_argument("payload")
    merge.add_argument("output")
    merge.add_argument("--recipe", help="write a separate JSON sidecar including SHA-256")
    merge.add_argument("--force", action="store_true", help="replace existing output files; never overwrite an input")
    merge.set_defaults(run=encode)
    extract = commands.add_parser("decode", help="extract bytes after gap; verify a sidecar checksum when supplied")
    extract.add_argument("combined")
    extract.add_argument("output")
    parameters = extract.add_mutually_exclusive_group(required=True)
    parameters.add_argument("--gap", help="carrier size in decimal bytes")
    parameters.add_argument("--recipe", help="read gap, sizes and optional SHA-256 from JSON")
    extract.add_argument("--allow-empty", action="store_true", help="allow manual extraction at end of file")
    extract.add_argument("--force", action="store_true", help="replace an existing output; never overwrite an input")
    extract.set_defaults(run=decode)
    args = parser.parse_args()
    try:
        args.run(args)
    except (OSError, ValueError, TypeError, UnicodeError) as error:
        print(f"Inlay: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
