// This tests that cpSync() leaves an existing destination in place when copying
// a symlink with force set to false, and throws ERR_FS_CP_EEXIST when
// errorOnExist is also set, as it does for files.
// Refs: https://github.com/nodejs/node/issues/66774

import { canCreateSymLink, mustNotMutateObjectDeep, skip } from '../common/index.mjs';
import { nextdir } from '../common/fs.js';
import assert from 'node:assert';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import tmpdir from '../common/tmpdir.js';

if (!canCreateSymLink())
  skip('insufficient privileges to create symbolic links');

tmpdir.refresh();

const targets = nextdir();
mkdirSync(targets);
const srcTarget = join(targets, 'src.txt');
const destTarget = join(targets, 'dest.txt');
const missingTarget = join(targets, 'missing');
writeFileSync(srcTarget, 'src');
writeFileSync(destTarget, 'dest');

// What may already be at the destination, how to read it back, and what that
// gives as long as it is left in place.
const existing = {
  'symlink': {
    create: (path) => symlinkSync(destTarget, path),
    read: readlinkSync,
    expected: destTarget,
  },
  'dangling symlink': {
    create: (path) => symlinkSync(missingTarget, path),
    read: readlinkSync,
    expected: missingTarget,
  },
  'file': {
    create: (path) => writeFileSync(path, 'existing'),
    read: (path) => readFileSync(path, 'utf8'),
    expected: 'existing',
  },
};

// A source directory with a symlink in it, and an existing destination
// directory with something already where the symlink would be copied.
function makeDirs(create) {
  const src = nextdir();
  const dest = nextdir();
  mkdirSync(src);
  mkdirSync(dest);
  symlinkSync(srcTarget, join(src, 'link'));
  create(join(dest, 'link'));
  return { src, dest, destLink: join(dest, 'link') };
}

for (const { create, read, expected } of Object.values(existing)) {
  {
    const src = nextdir();
    const dest = nextdir();
    symlinkSync(srcTarget, src);
    create(dest);
    cpSync(src, dest, mustNotMutateObjectDeep({ force: false }));
    assert.strictEqual(read(dest), expected);
    assert.throws(
      () => cpSync(src, dest, mustNotMutateObjectDeep({ force: false, errorOnExist: true })),
      { code: 'ERR_FS_CP_EEXIST' },
    );
    assert.strictEqual(read(dest), expected);
  }

  // With a filter, cpSync() walks the directory in JavaScript.
  for (const verbatimSymlinks of [false, true]) {
    const { src, dest, destLink } = makeDirs(create);
    cpSync(src, dest, { force: false, recursive: true, verbatimSymlinks, filter: () => true });
    assert.strictEqual(read(destLink), expected);
  }
}

// With force (the default), an existing destination symlink is still replaced.
{
  const src = nextdir();
  const dest = nextdir();
  symlinkSync(srcTarget, src);
  symlinkSync(destTarget, dest);
  cpSync(src, dest);
  assert.strictEqual(realpathSync(dest), realpathSync(srcTarget));
}

{
  const { src, dest, destLink } = makeDirs((path) => symlinkSync(destTarget, path));
  cpSync(src, dest, { recursive: true, filter: () => true });
  assert.strictEqual(realpathSync(destLink), realpathSync(srcTarget));
}
