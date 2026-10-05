import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VERSION} from '../src/index.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('API package and lockfile share one version',()=>{
 const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
 assert.equal(pkg.version,VERSION);assert.equal(lock.version,VERSION);assert.equal(lock.packages[''].version,VERSION);
});
test('both README files identify the current public version',()=>{
 for(const file of ['README.md','README.ja.md']){const text=read(file);assert.ok(text.includes(VERSION));assert.equal(text.includes('0.1.0-'+'preparation.'),false);}
 assert.equal(read('README.md').includes('currently remains the stable `0.1.0` release'),false);
 assert.equal(read('README.ja.md').includes('現在は安定版`0.1.0`を取得します'),false);
 assert.equal(read('README.md').includes('The published `0.5.0` preview'),false);
});

test('binding demo is part of the development package commands',()=>{
 assert.equal(JSON.parse(read('package.json')).scripts['demo:binding'],'node examples/action-binding/demo.mjs');
});

test('filesystem adapter is an explicit subpath with its own demo command',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.exports['./adapters/filesystem-write'],'./src/filesystem-write-adapter.mjs');
 assert.equal(pkg.scripts['demo:filesystem-adapter'],'node examples/filesystem-write-adapter/demo.mjs');
});
