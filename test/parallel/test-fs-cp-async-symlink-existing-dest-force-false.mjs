// This tests that cp() and fsPromises.cp() leave an existing destination in
// place when copying a symlink with force set to false, and fail with
// ERR_FS_CP_EEXIST when errorOnExist is also set, as they do for files.
// Refs: https://github.com/nodejs/node/issues/66774

import {
  canCreateSymLink,
  mustCall,
  mustNotMutateObjectDeep,
  skip,
} from '../common/index.mjs';
import { nextdir } from '../common/fs.js';
import assert from 'node:assert';
import {
  cp,
  mkdirSync,
  promises,
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

for (const { create, read, expected } of Object.values(existing)) {
  {
    const src = nextdir();
    const dest = nextdir();
    symlinkSync(srcTarget, src);
    create(dest);
    cp(src, dest, mustNotMutateObjectDeep({ force: false }), mustCall((err) => {
      assert.ifError(err);
      assert.strictEqual(read(dest), expected);
    }));
  }

  {
    const src = nextdir();
    const dest = nextdir();
    symlinkSync(srcTarget, src);
    create(dest);
    const opts = { force: false, errorOnExist: true };
    cp(src, dest, mustNotMutateObjectDeep(opts), mustCall((err) => {
      assert.strictEqual(err.code, 'ERR_FS_CP_EEXIST');
      assert.strictEqual(read(dest), expected);
    }));
  }

  {
    const src = nextdir();
    const dest = nextdir();
    symlinkSync(srcTarget, src);
    create(dest);
    await promises.cp(src, dest, mustNotMutateObjectDeep({ force: false }));
    assert.strictEqual(read(dest), expected);
    await assert.rejects(
      promises.cp(src, dest, mustNotMutateObjectDeep({ force: false, errorOnExist: true })),
      { code: 'ERR_FS_CP_EEXIST' },
    );
    assert.strictEqual(read(dest), expected);
  }

  // A symlink inside a directory that is copied into an existing one.
  for (const verbatimSymlinks of [false, true]) {
    const src = nextdir();
    const dest = nextdir();
    mkdirSync(src);
    mkdirSync(dest);
    symlinkSync(srcTarget, join(src, 'link'));
    create(join(dest, 'link'));
    const opts = { force: false, recursive: true, verbatimSymlinks };
    await promises.cp(src, dest, mustNotMutateObjectDeep(opts));
    assert.strictEqual(read(join(dest, 'link')), expected);
  }
}

// With force (the default), an existing destination symlink is still replaced.
{
  const src = nextdir();
  const dest = nextdir();
  symlinkSync(srcTarget, src);
  symlinkSync(destTarget, dest);
  await promises.cp(src, dest);
  assert.strictEqual(realpathSync(dest), realpathSync(srcTarget));
}

{
  const src = nextdir();
  const dest = nextdir();
  mkdirSync(src);
  mkdirSync(dest);
  symlinkSync(srcTarget, join(src, 'link'));
  symlinkSync(destTarget, join(dest, 'link'));
  await promises.cp(src, dest, mustNotMutateObjectDeep({ recursive: true }));
  assert.strictEqual(realpathSync(join(dest, 'link')), realpathSync(srcTarget));
}
