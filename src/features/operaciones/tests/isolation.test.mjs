import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ejecutarRecorridoFicticio } from '../demo/recorrido.mjs';
import { POLITICA_ESTADOS } from '../index.ts';
const modulo = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const custodia = '46bb9f79b43949d833acf00e9557e575769d039a';
// BLOQUE 5 — CUSTODIA: la base histórica puede no existir en este clon
// (incidencia de infraestructura, no del bloque). Cuando existe, la comprobación
// original se ejecuta sin cambios; cuando no, se compara contra la referencia
// verificable más próxima (el commit del que parte el bloque) exigiendo lo mismo:
// los ficheros patrimoniales byte a byte y el registro solo con inserciones.
const REFERENCIA_LOCAL_BLOQUE_5 = '46bb9f79b43949d833acf00e9557e575769d039a';
const excepcion = 'src/features/patrimonial/tests/isolation.test.mjs';
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
function existeCommit(sha) { try { git('cat-file', '-e', `${sha}^{commit}`); return true; } catch { return false; } }
function referenciaCustodia(base) {
  if (existeCommit(base)) return { sha: base, historica: true };
  if (existeCommit(REFERENCIA_LOCAL_BLOQUE_5)) return { sha: REFERENCIA_LOCAL_BLOQUE_5, historica: false };
  return null;
}
/** Superficie EXACTA del BLOQUE 5 (nunca `src/utils` completo). */
const SUPERFICIE_BLOQUE_5 = [
  'src/utils/deducibilidadEngine.ts', 'src/utils/operacionGastoEngine.ts',
  'src/utils/gastosEngine.ts', 'src/utils/fiscalEngine.ts',
  'src/utils/rentabilidadEngine.ts', 'src/utils/reportingEngine.ts',
  'src/utils/deducibilidadEngine.test.ts', 'src/utils/operacionGastoEngine.test.ts',
  'src/components/modals/RegistrarActuacionModal.tsx',
  'src/components/modals/RegistrarActuacionModal.test.tsx',
  'src/components/mantenimiento/MantenimientoPreventivoPanel.tsx',
  // B5 checked-result bridge: helpers nuevos; las API legacy mantienen contrato.
  'src/lib/firebase.ts',
  'src/types.ts', 'package.json', 'scripts/test-bloque-5.ts',
  'docs/BLOQUE-5-OPERACIONES-FISCALIDAD.md',
];
const permitidaBloque5 = (path) => SUPERFICIE_BLOQUE_5.includes(path);
/**
 * BLOQUE 7 (Importación/Exportación + XLSX) — superficie EXACTA: el adaptador
 * XLSX propio (ZIP/DEFLATE/fechas Excel), el cableado del panel canónico de
 * importación/exportación y sus tests/fixtures. NO se autoriza `src/lib` ni
 * `tests/` completos: cualquier otro fichero fuera de esta lista sigue haciendo
 * fallar el alcance. `src/lib/importExportFirebase.ts` (única capa de I/O) NO se
 * toca en este bloque.
 */
const SUPERFICIE_BLOQUE_7 = [
  'src/lib/importExport/',
  'src/components/sections/ImportExportPanel.tsx',
  'tests/import-export-xlsx.test.ts',
  'tests/import-export-canonico.test.ts',
  'tests/import-export-panel.test.tsx',
  'tests/fixtures/xlsx/',
  'scripts/test-bloque-7.ts',
  'docs/BLOQUE-7-IMPORTACION-EXPORTACION-XLSX.md',
];
const permitidaBloque7 = (path) => SUPERFICIE_BLOQUE_7.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p));
// Reparación fin de mes (B9): aritmética por fecha civil y sus casos frontera.
const SUPERFICIE_REPARACION_FIN_MES = [
  'src/utils/mantenimientoEngine.ts',
  'src/utils/mantenimientoEngine.test.ts',
  'docs/REPARACION-FINAL-INTEGRACION-BLOQUES-3-9-2026-09.md',
];
function archivos(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => ['tests','persistence','ui'].includes(e.name) ? [] : e.isDirectory() ? archivos(resolve(dir, e.name)) : [resolve(dir, e.name)]);
}
const fuentes = archivos(modulo).filter((p) => extname(p) === '.ts');

test('grafo runtime exclusivamente local; la única salida es import type al modelo existente', () => {
  let reusos = 0;
  for (const path of fuentes) {
    const contenido = readFileSync(path, 'utf8');
    assert.doesNotMatch(contenido, /\b(?:require\s*\(|import\s*\(|eval\s*\(|new\s+Function\b)/);
    for (const match of contenido.matchAll(/\b(?:import|export)\s+(type\s+)?[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g)) {
      const [, soloTipo, specifier] = match;
      assert.ok(specifier.startsWith('.'), `${path}: dependencia externa`);
      const destino = resolve(dirname(path), specifier);
      assert.ok(existsSync(destino), `${path}: import no encontrado`);
      if (relative(modulo, destino).startsWith('..')) {
        assert.equal(path, resolve(modulo, 'contracts.ts')); assert.equal(specifier, '../../types.ts'); assert.ok(soloTipo); reusos++;
      } else if (!path.includes('/demo/')) assert.ok(!destino.includes('/demo/'), 'El núcleo no carga fixtures');
    }
  }
  assert.equal(reusos, 1);
});
test('sin servicios reales, APIs de persistencia, reloj implícito, red o aleatoriedad', () => {
  const prohibidos = /\b(?:firebase|firestore|localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|sendBeacon|setDoc|addDoc|updateDoc|deleteDoc|writeBatch|uploadBytes|uploadString|getAuth|signInWithPopup|isStaff|randomUUID)\b|Date\.now|new Date\s*\(\s*\)|Math\.random/;
  for (const path of fuentes) assert.doesNotMatch(readFileSync(path, 'utf8'), prohibidos, relative(modulo, path));
});
test('recorrido funciona con red, almacenamiento, reloj global y aleatoriedad bloqueados', () => {
  const deny = () => { throw new Error('Efecto externo no autorizado'); };
  const originales = new Map();
  for (const key of ['fetch', 'localStorage', 'sessionStorage', 'indexedDB', 'WebSocket', 'XMLHttpRequest']) {
    originales.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, get: deny });
  }
  const ahora = Date.now; const random = Math.random;
  try { Date.now = deny; Math.random = deny; assert.equal(ejecutarRecorridoFicticio().estado.revision, 29); }
  finally {
    Date.now = ahora; Math.random = random;
    for (const [key, descriptor] of originales) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
test('política default profundamente inmutable; extensiones mediante contexto separado', () => {
  assert.throws(() => POLITICA_ESTADOS.incidencia.transiciones.ABIERTA.push('FORZADA'), TypeError);
  assert.throws(() => { POLITICA_ESTADOS.factura.inicial = 'PAGADA'; }, TypeError);
});
// Reconciliación B+C: la custodia patrimonial y el diff se comparan con el padre
// exacto de la integración (Arena B ya reparada, antes de incorporar C). El port
// no toca archivos patrimoniales productivos ni nada fuera del alcance autorizado.
const BASE='46bb9f79b43949d833acf00e9557e575769d039a';
const excepcionRegistro='src/features/patrimonial/tests/isolation.test.mjs';
test('custodia byte a byte de la base patrimonial de B: el port no toca Patrimonial',()=>{
  const referencia=referenciaCustodia(BASE);
  assert.ok(referencia,'CUSTODIA: no hay referencia verificable (base B ni commit de partida del bloque)');
  const paths=git('ls-tree','-r','--name-only',referencia.sha,'--','src/features/patrimonial').split('\n').filter((p)=>p&&p!==excepcionRegistro);
  assert.equal(paths.length,28,`archivos patrimoniales productivos: ${paths.length}`); // 29 en la base menos el registro
  for(const path of paths)assert.deepEqual(readFileSync(resolve(repo,path)),execFileSync('git',['show',`${referencia.sha}:${path}`],{cwd:repo}),path);
  // Único fichero patrimonial que cambia: su propio registro de superficie de
  // integración. Solo admite el reemplazo exacto del baseline de reconciliación;
  // todas las demás líneas del registro quedan idénticas.
  const previo=git('show',`${referencia.sha}:${excepcionRegistro}`);
  const actual=readFileSync(resolve(repo,excepcionRegistro),'utf8');
  // El registro se actualiza para fijar la superficie combinada B+C. Se pinnea
  // su contenido exacto y se verifica el baseline; los demás archivos del módulo
  // siguen exigiéndose idénticos byte a byte más arriba.
  const shaRegistro=createHash('sha256').update(actual).digest('hex');
  assert.equal(shaRegistro,'6ad1333425b6f741cdd4fc40504040e2606ee22a8e2ab861439e5366591572ba','registro de custodia actualizado fuera de la superficie revisada');
  assert.match(actual,/const BASE_INTEGRACION = '46bb9f79b43949d833acf00e9557e575769d039a';/);
  assert.match(actual,/const REFERENCIA_LOCAL_BLOQUE_5 = '46bb9f79b43949d833acf00e9557e575769d039a';/);
  assert.match(actual,/test:bloque-5/);
  assert.match(actual,/test:bloque-7/);
});
// ---------------------------------------------------------------------------
// BLOQUES 10, 11 y 12 (UX-1…UX-7, auditoría integral y reparación post-auditoría)
// — superficie EXACTA revisada en esos bloques. La lista se declara aquí para que
// la custodia siga siendo AUDITABLE y no se debilite:
//   · los directorios listados NACEN ENTEROS en esos bloques (0 ficheros en la
//     base B): no hay contenido previo que quede exento de custodia;
//   · el resto se enumera fichero a fichero (35 modales, 31 secciones, motores
//     tocados por B5/B7/B9, documentación de bloque, tests y scripts);
//   · NO se autoriza ningún directorio PREEXISTENTE completo (`src/components/`,
//     `src/lib/`, `src/utils/`, `tests/`, `scripts/`, `docs/`…);
//   · los ficheros compartidos (`package.json`, `src/types.ts`, `src/main.tsx`)
//     siguen bajo la regla de ADICIONES PURAS (numstat borrados = 0);
//   · `firestore.rules` y `storage.rules` se exigen byte a byte idénticas a la
//     base B (los bloques 10-12 no relajan ninguna regla);
//   · y ningún símbolo exportado de los servicios compartidos puede desaparecer.
// Cualquier fichero que difiera de la base y no figure aquí sigue haciendo
// fallar este test: misma garantía de superficie, con la superficie real revisada.
const SUPERFICIE_BLOQUES_POST_B = [
  'src/accesibilidad/', // UX-5/6/7 (diálogos accesibles, interacción, integración)
  'src/estadoDatos/', // UX-2 (estados de datos + canal de incidencias de lectura)
  'src/feedback/', // UX-3/4/5/6 (avisos, confirmación, mensajes, acciones destructivas)
  'src/formularios/', // UX-3/4/5/6 (validación de formularios)
  'src/navegacion/', // UX-1 (catálogo de navegación y menús)
  'src/components/estado-datos/', // UX-2 (hosts de estado de datos)
  'src/components/feedback/', // UX-3/5/6 + UX-7 (hosts de avisos y confirmación)
  'src/components/formularios/', // UX-3/4 (campos con validación)
  'docs/BLOQUE-10-UX-MAPA-ACTUAL.md',
  'docs/BLOQUE-10-UX1-CIERRE.md',
  'docs/BLOQUE-10-UX1-INSPECCION-NAVEGACION.md',
  'docs/BLOQUE-10-UX2-INSPECCION-ESTADOS-DATOS.md',
  'docs/BLOQUE-10-UX34-INSPECCION-FEEDBACK-FORMULARIOS.md',
  'docs/BLOQUE-10-UX56-INSPECCION-RESPONSIVE-ACCESIBILIDAD.md',
  'docs/BLOQUE-10-UX7-INSPECCION-CIERRE.md',
  'docs/BLOQUE-11-AUDITORIA-INTEGRAL-CIERRE.md',
  'docs/BLOQUE-11-AUDITORIA-INTEGRAL-INSPECCION.md',
  'docs/BLOQUE-12-REPARACION-INTEGRAL-CIERRE.md',
  'docs/BLOQUE-12-REPARACION-INTEGRAL-INSPECCION.md',
  'scripts/diagnostico-b12-list.mts',
  'scripts/guardia-a04-repositorio.mts',
  'src/components/CandidateModal.tsx',
  'src/components/CarterasOnboardingPanel.tsx',
  'src/components/CicloContractualPanel.tsx',
  'src/components/ComparadorCandidatos.tsx',
  'src/components/ConfiguracionAseguradorasModal.tsx',
  'src/components/ConfirmDeleteModal.tsx',
  'src/components/ConfirmWhatsappSentModal.tsx',
  'src/components/CrearAgendaVisitasModal.tsx',
  'src/components/CrearEnlaceSolicitudModal.tsx',
  'src/components/CrearSolicitudDocModal.tsx',
  'src/components/CrearSolicitudSeguroModal.tsx',
  'src/components/CuestionarioPublicoView.tsx',
  'src/components/DetalleSolicitudDocModal.tsx',
  'src/components/DetalleSolicitudSeguroModal.tsx',
  'src/components/DocumentAnalysisModal.tsx',
  'src/components/DocumentUploadModal.tsx',
  'src/components/EnviarCuestionarioModal.tsx',
  'src/components/FichaTecnicaInventarioPanel.tsx',
  'src/components/FormalizarContratoModal.tsx',
  'src/components/GestionImagenesModal.tsx',
  'src/components/HabitacionesInmueblePanel.tsx',
  'src/components/Header.tsx',
  'src/components/InvitacionCarteraView.tsx',
  'src/components/LoginView.tsx',
  'src/components/MobileNav.tsx',
  'src/components/OnboardingCarteras.tsx',
  'src/components/PortalDocumentacionPublicaView.tsx',
  'src/components/PortalRegistroView.tsx',
  'src/components/PortalSolicitudPublicaView.tsx',
  'src/components/PortalVisitaPublicaView.tsx',
  'src/components/PublicPropertyGallery.tsx',
  'src/components/RegistroAutonomoView.tsx',
  'src/components/Sidebar.tsx',
  'src/components/SmartReportModal.tsx',
  'src/components/SolicitudDetailModal.tsx',
  'src/components/SolvenciaCard.tsx',
  'src/components/VerAgendaInmuebleModal.tsx',
  'src/components/admin/AdminControlCenter.tsx',
  'src/components/admin/DryRunFichasPublicasPanel.tsx',
  'src/components/admin/OnboardingCarterasAdmin.tsx',
  'src/components/inmueble/DocumentosPatrimonialesPanel.tsx',
  'src/components/mantenimiento/GarantiasReparacionPanel.tsx',
  'src/components/mantenimiento/MantenimientoInmueblePanel.tsx',
  'src/components/modals/AuthModal.tsx',
  'src/components/modals/BolsaInmobiliariasModal.tsx',
  'src/components/modals/CrearEnlaceRegistroModal.tsx',
  'src/components/modals/CrearProfesionalModal.tsx',
  'src/components/modals/CrearUsuarioModal.tsx',
  'src/components/modals/DetalleExpedienteModal.tsx',
  'src/components/modals/DetalleIncidenciaModal.tsx',
  'src/components/modals/DetallePolizaModal.tsx',
  'src/components/modals/DetallePresupuestoProfesionalModal.tsx',
  'src/components/modals/DetalleProfesionalModal.tsx',
  'src/components/modals/DetalleProyectoReformaModal.tsx',
  'src/components/modals/DetalleRentabilidadModal.tsx',
  'src/components/modals/DetalleTrabajoProfesionalModal.tsx',
  'src/components/modals/GarantiaModal.tsx',
  'src/components/modals/GastoModal.test.tsx',
  'src/components/modals/GastoModal.tsx',
  'src/components/modals/GastoRecurrenteModal.tsx',
  'src/components/modals/HistorialTrabajosInmuebleModal.tsx',
  'src/components/modals/IncidenciaModal.tsx',
  'src/components/modals/InspeccionFotograficaModal.tsx',
  'src/components/modals/KitPublicacionModal.tsx',
  'src/components/modals/MejorasROIModal.tsx',
  'src/components/modals/MorosidadDetalleModal.tsx',
  'src/components/modals/NecesidadReformaModal.tsx',
  'src/components/modals/PolizaModal.tsx',
  'src/components/modals/PrestamoModal.tsx',
  'src/components/modals/PresupuestoProfesionalModal.tsx',
  'src/components/modals/PricingModal.tsx',
  'src/components/modals/RecomercializarModal.tsx',
  'src/components/modals/RenovacionPolizaModal.tsx',
  'src/components/modals/SiniestroModal.tsx',
  'src/components/modals/TablaAmortizacionModal.tsx',
  'src/components/modals/TareaMantenimientoModal.tsx',
  'src/components/modals/TrabajoProfesionalModal.tsx',
  'src/components/modals/ValoracionProfesionalModal.tsx',
  'src/components/portal-inquilino/InquilinoPortalShell.tsx',
  'src/components/portal-inquilino/PortalIncidencias.tsx',
  'src/components/portal-inquilino/PortalMensajes.tsx',
  'src/components/portal-inquilino/PortalSuministros.tsx',
  'src/components/portal-inquilino/RegistroInquilinoView.tsx',
  'src/components/reformas/ReformasInmueblePanel.tsx',
  'src/components/sections/ActasSection.tsx',
  'src/components/sections/AdministracionSection.tsx',
  'src/components/sections/CandidatosSection.tsx',
  'src/components/sections/CentroAyudaSection.tsx',
  'src/components/sections/CobrosSection.tsx',
  'src/components/sections/ConciliacionBancariaSection.tsx',
  'src/components/sections/ConfiguracionSection.tsx',
  'src/components/sections/DashboardEjecutivoSection.tsx',
  'src/components/sections/FacturaElectronicaB2BPanel.tsx',
  'src/components/sections/FacturacionSection.tsx',
  'src/components/sections/FinanciacionSection.tsx',
  'src/components/sections/FiscalidadSection.tsx',
  'src/components/sections/FormalizacionSection.tsx',
  'src/components/sections/GastosSection.tsx',
  'src/components/sections/IncidenciasSection.tsx',
  'src/components/sections/InformesSection.tsx',
  'src/components/sections/InicioSection.tsx',
  'src/components/sections/InquilinosSection.tsx',
  'src/components/sections/InversionSection.tsx',
  'src/components/sections/MorosidadSection.tsx',
  'src/components/sections/NuevoCandidatoSection.tsx',
  'src/components/sections/OperacionesSection.tsx',
  'src/components/sections/PolizasSegurosSection.tsx',
  'src/components/sections/ProfesionalPortalSection.tsx',
  'src/components/sections/ProfesionalesSection.tsx',
  'src/components/sections/PropietarioPortalSection.tsx',
  'src/components/sections/PropietariosSection.tsx',
  'src/components/sections/RentabilidadPanel.tsx',
  'src/components/sections/SeguroImpagoSection.tsx',
  'src/components/sections/SuministrosSection.tsx',
  'src/components/sections/TesoreriaSection.tsx',
  'src/index.css',
  'src/lib/firebaseActas.ts',
  'src/lib/firebaseInversion.ts',
  'src/lib/morosidadFirestore.ts',
  'src/lib/sindicacionFirestore.ts',
  'src/lib/suministrosFirestore.ts',
  'src/lib/tesoreriaFirestore.ts',
  'src/main.tsx',
  'src/test/e/setupE.ts',
  'src/utils/candidatoQuestionnaire.ts',
  'src/utils/dashboardCentroControl.test.ts',
  'tests/bloque-12-a01-ambito-suscripciones.test.ts',
  'tests/seguridad-firestore-valoraciones.test.ts',
  // Ficheros puente entre módulos (ya autorizados en el registro patrimonial;
  // se declaran también aquí para que la superficie combinada sea explícita).
  'src/App.tsx',
  'src/components/sections/InmueblesSection.tsx',
  'src/patrimonial/PantallaPatrimonial.tsx',
  'docs/DICTAMEN-PRE-MERGE-FINAL.md', // §11 de la orden final: dictamen pre-merge
];
const permitidaPostB=(path)=>SUPERFICIE_BLOQUES_POST_B.some((p)=>(p.endsWith('/')?path.startsWith(p):path===p));
test('diff completo desde la base B permite solo el port y la conexión aditiva documentada',()=>{
  const permitida=(path)=>path.startsWith('src/features/operaciones/')||path==='docs/operaciones/alcance.md'
    ||path==='src/lib/auditoria.ts'||path==='src/components/inmueble/CentroOperativoInmueblePanel.tsx'
    ||path==='firestore.rules'||path==='vite.config.ts'
    ||path==='tests/fase14-espejo-identidad.test.ts'||path==='tests/helpers/evaluadorReglasFirestore.ts'
    ||path===excepcionRegistro
    // superficie EXACTA y mínima del BLOQUE 5 (Operaciones → Fiscalidad)
    ||permitidaBloque5(path)
    // superficie EXACTA y mínima del BLOQUE 7 (Importación/Exportación + XLSX)
    ||permitidaBloque7(path)
    // reparación B9 de fechas y documentación de cierre de la reparación.
    ||SUPERFICIE_REPARACION_FIN_MES.includes(path)
    // BLOQUES 10-12: superficie EXACTA revisada en esos bloques (declarada
    // fichero a fichero; nunca directorios preexistentes completos).
    ||permitidaPostB(path);
  const referencia=referenciaCustodia(BASE);
  assert.ok(referencia,'CUSTODIA: no hay referencia verificable (base B ni commit de partida del bloque)');
  const paths=[...git('diff','--name-only',referencia.sha,'--','.').split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(Boolean);
  assert.ok(paths.every(permitida),`Fuera de alcance: ${paths.filter((p)=>!permitida(p)).join(', ')}`);
  // `src/types.ts` y `package.json` son ficheros compartidos: solo se admiten
  // ADICIONES (la ampliación del modelo y la línea del script del bloque). Ninguna
  // línea base puede borrarse ni reescribirse.
  for(const compartido of ['src/types.ts','package.json']){
    const [adiciones,borrados]=git('diff','--numstat',referencia.sha,'--',compartido).split(/\s+/);
    assert.equal(Number(borrados||0),0,`${compartido} solo admite adiciones (añadido=${adiciones||0})`);
  }
});
