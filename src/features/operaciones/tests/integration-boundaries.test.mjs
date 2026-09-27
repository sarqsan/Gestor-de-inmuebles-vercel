import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const read=(p)=>readFileSync(new URL('../../../../'+p,import.meta.url),'utf8');
const base='c4949a62fb13bde3aeff74a213f2a2cd40e5305c'; // base canónica de B pre-port
// ADAPTACIÓN B: en C el punto de entrada era InmueblesSection.tsx; en B la entrada
// canónica del detalle del inmueble es el Centro Operativo (subtab 'operaciones').
// Mismo propósito: entrada desde el inmueble, sin app paralela ni navegación global nueva.
test('el punto de entrada es el detalle del inmueble (Centro Operativo de B), sin app paralela',()=>{
  const s2=read('src/components/inmueble/CentroOperativoInmueblePanel.tsx');
  assert.ok(s2.includes("import { OperacionesInmueble } from '../../features/operaciones/ui/OperacionesInmueble';"));
  assert.ok(s2.includes("type SubTab = 'resumen' | 'seguros' | 'averias' | 'expediente' | 'historico' | 'operaciones';"));
  assert.ok(s2.includes("{ id: 'operaciones', label: 'Operaciones',"));
  assert.match(s2,/subTab === 'operaciones' && \(\s*<OperacionesInmueble inmueble=\{inmueble\} onVolver=\{\(\) => setSubTab\('resumen'\)\} \/>\s*\)/);
  for(const g of ['src/App.tsx','src/main.tsx'])assert.doesNotMatch(read(g),/features\/operaciones/);
});
test('no se introducen seeds, carga a Storage, provisioning de usuarios ni llamadas de IA',()=>{
  for(const f of ['persistence/firebase.ts','persistence/repository.ts','ui/OperacionesInmueble.tsx','ui/panel.tsx'])assert.doesNotMatch(read('src/features/operaciones/'+f),/seedInitial|uploadBytes|uploadString|createUser|setCustomUserClaims|signInAnonymously|genai|generateContent/);
  const f=read('src/features/operaciones/persistence/firebase.ts');assert.ok(f.includes("COLECCION_USUARIOS_CANONICOS = 'usuarios'"));assert.doesNotMatch(f,/setDoc|addDoc|deleteDoc/);
});
test('auditoría usa una sola función canónica y una sola colección; no hay fallback de guardado ciego',()=>{
  const adapter=read('src/features/operaciones/persistence/firebase.ts'),repo=read('src/features/operaciones/persistence/repository.ts');
  assert.ok(adapter.includes("COLECCION_AUDITORIA = 'audit_logs'"));assert.match(repo,/registrarAuditoriaFirestore\(auditoriaDe\(evento, identidad\), tx\)/);
  assert.doesNotMatch(adapter+repo,/audit_logs_v2|collection\([^\n]*['"]historial|localStorage|catch\s*\([^)]*\)\s*\{\s*\}/);
});
// ADAPTACIÓN B: los compartidos se comparan contra la base canónica de B (bun.lock no
// existe en B). El único compartido que cambia es vite.config.ts, de forma aditiva
// (exclude de vitest para los tests node:test del módulo); package.json queda intacto
// (convención de B: el comando se documenta en el comentario de vite.config).
test('servicios/modelos heredados, configuración TS y entrypoints intactos frente a la base B',()=>{
  for(const f of ['src/types.ts','src/App.tsx','src/main.tsx','src/lib/firebase.ts','src/lib/googleAuth.ts','server.ts','tsconfig.json','package.json'])
    assert.equal(read(f),execFileSync('git',['show',`${base}:${f}`],{cwd:root,encoding:'utf8'}),f);
  assert.ok(read('vite.config.ts').includes("'src/features/operaciones/tests/**'"));
  assert.ok(read('vite.config.ts').includes('node --import tsx --test src/features/operaciones/tests/*.test.mjs'));
});
test('histórico/idempotencia se reconstruyen de versiones de negocio, nunca de audit_logs',()=>{
 const source=read('src/features/operaciones/persistence/firebase.ts');assert.match(source,/reconstruirHistorial/);
 assert.doesNotMatch(source,/getDocs\(query\(collection\(db, COLECCION_AUDITORIA|detalles\.evento/);
 assert.match(source,/versiones: \[\.\.\.\(previa\?\.versiones/);
});
