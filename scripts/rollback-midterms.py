#!/usr/bin/env python3
"""Validate an immutable midterms release and atomically restore its pointer."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile

ROOT = Path(__file__).resolve().parents[1] / 'private/midterms'
DIGEST = re.compile(r'^[a-f0-9]{64}$')


def rollback(release_id, root=ROOT, expected=None):
    if not DIGEST.fullmatch(release_id):
        raise ValueError('releaseId must be a 64-character SHA-256')
    root = Path(root)
    pointer = root / 'current.json'
    original = pointer.read_bytes()
    current = json.loads(original)['releaseId']
    if expected is not None and current != expected:
        raise ValueError('current release changed; inspect before rollback')
    release = root / 'releases' / release_id
    if release.is_symlink():
        raise ValueError('release directory must not be a symlink')
    manifest = json.loads((release / 'manifest.json').read_text())
    if manifest.get('releaseId') != release_id or not isinstance(manifest.get('artifacts'), list):
        raise ValueError('invalid release manifest')
    seen = set()
    for item in manifest['artifacts']:
        name = item['path']
        path = Path(name)
        if (not name or path.is_absolute() or '..' in path.parts or '\\' in name
                or name in seen):
            raise ValueError('invalid or duplicated artifact path')
        seen.add(name)
        file = release / path
        file.resolve().relative_to(release.resolve())
        content = file.read_bytes()
        if len(content) != item['bytes'] or hashlib.sha256(content).hexdigest() != item['sha256']:
            raise ValueError('artifact integrity mismatch: ' + name)
    if not {'index.html', 'data.json'}.issubset(seen):
        raise ValueError('reader and data artifacts are required')
    if pointer.read_bytes() != original:
        raise ValueError('current release changed during validation')
    fd, temporary = tempfile.mkstemp(prefix='.current-rollback-', dir=root)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump({'schema_version': 1, 'releaseId': release_id}, stream)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        if pointer.read_bytes() != original:
            raise ValueError('current release changed before switch')
        os.replace(temporary, pointer)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return {'previousReleaseId': current, 'releaseId': release_id, 'artifacts': len(seen)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('release_id')
    parser.add_argument('--expected-release', help='Refuse if the active release has changed')
    args = parser.parse_args()
    try:
        print(json.dumps(rollback(args.release_id, expected=args.expected_release)))
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(2, '期中回退失败：' + str(error) + '\n')


if __name__ == '__main__':
    main()
