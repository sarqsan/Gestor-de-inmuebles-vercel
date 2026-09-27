import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const runner=fileURLToPath(new URL('./emulator/operaciones.emulator.mjs',import.meta.url));
for(const [label,env,pattern]of [
 ['proyecto no-demo',{GCLOUD_PROJECT:'proyecto-prohibido'},/Solo se admite el proyecto demo/],
 ['endpoint no-local',{GCLOUD_PROJECT:'demo-operaciones-c',FIRESTORE_EMULATOR_HOST:'firestore.googleapis.com:443'},/Falta Emulator local/],
])test(`runner real falla cerrado antes de conectar: ${label}`,()=>{
 const r=spawnSync(process.execPath,['--experimental-strip-types',runner],{encoding:'utf8',env:{...process.env,...env},timeout:15000});
 assert.equal(r.status,1);assert.match(r.stderr,pattern);assert.doesNotMatch(r.stderr,/ENOTFOUND|ECONNREFUSED/);
});
