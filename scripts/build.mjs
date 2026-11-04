import { cp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist');
// Only this fixed build-output directory may be removed.
if (dirname(out) !== root) throw new Error('Invalid output directory');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(resolve(root, 'web'), out, { recursive: true });
const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY || '';
if (Boolean(url) !== Boolean(key)) throw new Error('Set both Supabase variables, or neither for local mode.');
if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) throw new Error('Invalid hosted Supabase URL.');
if (key) {
  if (key.startsWith('sb_secret_')) throw new Error('Secret keys must never be put in a browser build.');
  if (!key.startsWith('sb_publishable_')) {
    try {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      if (payload.role !== 'anon') throw new Error();
    } catch { throw new Error('Use a publishable key or legacy anon key only.'); }
  }
}
await writeFile(resolve(out, 'config.js'), `export const cloudConfig = ${JSON.stringify({ url, key })};\n`);
await build({entryPoints:[resolve(root,'web/app.js')],outfile:resolve(out,'app.js'),bundle:true,format:'esm',target:'es2022',minify:true,legalComments:'eof',external:['./config.js']});
// Source modules are bundled; keep the deployment surface small.
for (const f of ['cloud.js','cloud-store.js','pwa.js','email-credential.js']) await rm(resolve(out,f),{force:true});
await mkdir(resolve(out,'icons'),{recursive:true});
const svg=await readFile(resolve(root,'web/icons/icon.svg'));
for(const size of [192,512]) await sharp(svg).resize(size,size).png().toFile(resolve(out,`icons/icon-${size}.png`));
await sharp(svg).resize(180,180).png().toFile(resolve(out,'icons/apple-touch-icon.png'));
await writeFile(resolve(out,'.nojekyll'),'');
const files=[];
async function walk(dir,prefix=''){for(const e of await readdir(dir,{withFileTypes:true})){if(e.name.startsWith('.'))continue;const rel=prefix+e.name;if(e.isDirectory())await walk(resolve(dir,e.name),rel+'/');else if(rel!=='sw.js')files.push(rel);}}
await walk(out);
files.sort();
const hash=createHash('sha256');
for(const f of files)hash.update(f).update(await readFile(resolve(out,f)));
let sw=await readFile(resolve(root,'web/sw.js'),'utf8');
sw=sw.replace('__BUILD_VERSION__',hash.digest('hex').slice(0,16)).replace('__PRECACHE_FILES__',JSON.stringify(files.map(f=>'./'+f)));
await writeFile(resolve(out,'sw.js'),sw);
console.log(`Built ${files.length+1} files. Cloud ${url?'configured':'not configured (local mode)'}.`);
