import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
// Huellas de helpers reales B. `activeUser` fue actualizado en main después de
// fc14156; su SHA vigente se contrastó en origin/main, la base y el head PR #10.
// No acceso remoto ni copia de modelos B durante tests.
const expected = {
  "isSignedIn": "d59dae54acfa1bc96792488d87ce301d79d0bb03403f8e1e9de4ce2991ef84e2",
  "authEmail": "445e54ac6793df9b78985339e5b1550f32892002f46c0000080293a82e3c3e83",
  "isMasterAdmin": "9dd0395e14d7df6116a909ac1bb47d2a1bf39969de5fa6cf3e96f52c101ffc44",
  "me": "6e52d23e823f14c66448a621a15909e042d93145386511640ad555efa60ba044",
  "activeUser": "bea287f80b5cdf8e7c3372274adb103cf0f17a113efd2034805d5849b55be7e6",
  "isPropietarioRole": "add2a5e385f718af77ea725a73e1181ce1d3064fbba59b0de2e4b6c5e80fc260",
  "myPropId": "6d2693ad55fa289e08e500cd60cf75044c32b2897f3d1340cf399d082048b8f1",
  "ownsPropietario": "e38fdec7a232a7ff225b3f96f7e3afe5474a7104f30843cab33cad84459975ce",
  "carterasLectura": "14125468f512ea2ca7a3332c56f02eb3529e1af977252e6101cfd948932d4c64",
  "carterasEscritura": "83b3dd23ad99ec0ec8abe75bc6c205a7e9c7c4dd4ca3bc914d142912a16c766c"
};
const rules=readFileSync(new URL('../../../../firestore.rules',import.meta.url),'utf8');
function fn(name){const start=rules.indexOf('function '+name+'(');assert.ok(start>=0);let i=rules.indexOf('{',start)+1,n=1;while(n&&i<rules.length){if(rules[i]==='{')n++;else if(rules[i]==='}')n--;i++;}assert.equal(n,0);return rules.slice(start,i);}
for(const [name,hash]of Object.entries(expected))test('helper B literal sin reimplementación: '+name,()=>assert.equal(createHash('sha256').update(fn(name).replace(/\s+/g,'')).digest('hex'),hash));
