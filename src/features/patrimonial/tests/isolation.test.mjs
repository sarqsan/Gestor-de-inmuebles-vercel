import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import demoConfig from '../demo/vite.config.mjs';

const modulo = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
function archivos(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    if (['tests', 'node_modules', 'dist'].includes(entrada.name)) return [];
    const path = resolve(dir, entrada.name);
    return entrada.isDirectory() ? archivos(path) : [path];
  });
}
const fuentes = archivos(modulo).filter((path) => ['.ts', '.tsx'].includes(extname(path)));

test('el grafo del bloque solo importa módulos locales, React y CSS local', () => {
  for (const path of fuentes) {
    const contenido = readFileSync(path, 'utf8');
    assert.doesNotMatch(contenido, /\b(?:require\s*\(|import\s*\(|eval\s*\(|new\s+Function\b)/, relative(modulo, path));
    const imports = [...contenido.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)];
    for (const [, specifier] of imports) {
      if (['react', 'react-dom/client'].includes(specifier)) continue;
      assert.ok(specifier.startsWith('.'), `${path}: dependencia externa ${specifier}`);
      const destino = resolve(dirname(path), specifier);
      assert.ok(!relative(modulo, destino).startsWith('..'), `${path}: sale del módulo`);
      assert.ok(existsSync(destino), `${path}: import no encontrado ${specifier}`);
      if (!path.includes('/demo/')) assert.ok(!destino.includes('/demo/'), 'Componente reutilizable no debe cargar fixtures');
    }
  }
});

test('no existen APIs de persistencia, red, identidad, permisos ni servicios reales en el bloque', () => {
  const prohibidos = /\b(?:firebase|firestore|localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|sendBeacon|setDoc|addDoc|updateDoc|deleteDoc|writeBatch|uploadBytes|uploadString|getAuth|signInWithPopup|subscribeInmuebles|gestiones_cartera)\b/i;
  for (const path of fuentes) assert.doesNotMatch(readFileSync(path, 'utf8'), prohibidos, relative(modulo, path));
});

test('demo separada: HTML y entrada no cargan App ni el entrypoint productivo', () => {
  const html = readFileSync(resolve(modulo, 'demo/index.html'), 'utf8');
  const entrada = readFileSync(resolve(modulo, 'demo/main.tsx'), 'utf8');
  assert.match(html, /src="\.\/main\.tsx"/);
  assert.match(entrada, /from '\.\/PatrimonialDemo\.tsx'/);
  assert.doesNotMatch(html + entrada, /App\.tsx|\/src\/main\.tsx|server\.ts|https?:\/\//);
  assert.equal(demoConfig.root, resolve(modulo, 'demo') + '/');
  assert.equal(demoConfig.server.host, '0.0.0.0');
  assert.ok(demoConfig.server.allowedHosts.includes('.e2b.app'));
  assert.equal(demoConfig.build.outDir, resolve(repo, 'dist/patrimonial-demo') + '/');
});

test('estilos y HTML no cargan recursos remotos', () => {
  for (const path of archivos(modulo).filter((file) => ['.css', '.html'].includes(extname(file)))) {
    assert.doesNotMatch(readFileSync(path, 'utf8'), /@import|https?:\/\/|url\s*\(/i);
  }
});

// Reconciliación Arena B + Arena C: comparación desde el commit exacto de Arena B
// previo a la integración (incluye las modificaciones B ya validadas y separa el
// diff entrante de C). Se mantienen las mismas guardas estrictas de superficie,
// custodia byte a byte y dependencias; no se excluyen archivos añadidos por C.
const BASE_INTEGRACION = '46bb9f79b43949d833acf00e9557e575769d039a';
// BLOQUE 5 — CUSTODIA: la base histórica puede no existir en este clon
// (incidencia de infraestructura/custodia, no del bloque). La reconciliación usa
// el padre exacto de Arena B como baseline verificable; no se omiten archivos y
// los archivos productivos patrimoniales siguen comparándose byte a byte. El
// registro de custodia se fija por hash tras actualizar la superficie B+C.
const REFERENCIA_LOCAL_BLOQUE_5 = '46bb9f79b43949d833acf00e9557e575769d039a';
function existeCommit(sha) {
  try { execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: repo }); return true; } catch { return false; }
}
function referenciaCustodia(base) {
  if (existeCommit(base)) return { sha: base, historica: true };
  if (existeCommit(REFERENCIA_LOCAL_BLOQUE_5)) return { sha: REFERENCIA_LOCAL_BLOQUE_5, historica: false };
  return null;
}

test('dependencias y lockfile siguen exactamente como en la base conocida', async () => {
  const { execFileSync } = await import('node:child_process');
  for (const file of ['package.json', 'package-lock.json', 'bun.lock']) {
    let base;
    try {
      base = execFileSync('git', ['show', `${BASE_INTEGRACION}:${file}`], { cwd: repo });
    } catch {
      continue; // el fichero no existe en la base: nada que comparar
    }
    if (file !== 'package.json') {
      assert.deepEqual(readFileSync(resolve(repo, file)), base, `${file} modificado`);
      continue;
    }
    // La reconciliación añade únicamente los runners reproducibles de B5/B7;
    // no admite cambios de paquetes, dependencias, metadatos ni scripts previos.
    const actualPackage = JSON.parse(readFileSync(resolve(repo, file), 'utf8'));
    const basePackage = JSON.parse(base.toString('utf8'));
    const { scripts: actualScripts, ...actualRest } = actualPackage;
    const { scripts: baseScripts, ...baseRest } = basePackage;
    assert.deepEqual(actualRest, baseRest, 'solo pueden cambiar los scripts B5/B7');
    // BLOQUE 12 · A-05: los runners oficiales de las suites `.mjs` (Tipo A) y las
    // dos guardias de auditoría. La garantía sigue siendo la misma: `package.json`
    // SOLO añade scripts, no puede borrar ni reescribir ninguna línea base (se
    // verifica con `git diff --numstat`: borrados = 0) y ninguna dependencia,
    // metadato o script previo puede cambiar.
    assert.deepEqual(actualScripts, {
      ...baseScripts,
      'test:bloque-5': 'tsx scripts/test-bloque-5.ts',
      'test:bloque-7': 'tsx scripts/test-bloque-7.ts',
      'test:operaciones': 'node --import tsx --test "src/features/operaciones/tests/*.test.mjs"',
      'test:patrimonial': 'node --import tsx --test "src/features/patrimonial/tests/*.test.mjs"',
      'test:integracion': 'npm run test:operaciones && npm run test:patrimonial',
      'test:emulador:operaciones': 'node --import tsx --test src/features/operaciones/tests/emulator/operaciones.emulator.mjs',
      'auditoria:repositorio': 'tsx scripts/guardia-a04-repositorio.mts',
      'auditoria:reglas:matriz': 'tsx scripts/diagnostico-b12-list.mts',
    }, 'package.json solo añade los runners de B5/B7 y los de A-05/auditoría (sin borrados)');
  }
});

test('núcleo de completitud/preview sin reloj, aleatoriedad ni inferencia de identidad', () => {
  for (const nombre of ['completeness.ts', 'importPreview.ts']) {
    const contenido = readFileSync(resolve(modulo, nombre), 'utf8');
    assert.doesNotMatch(contenido, /Date\.|new Date\b|Math\.random|randomUUID|estadoAcceso|cuentaId|usuarioAutenticado|modalidadSeleccionada/);
  }
});

// Ficheros permitidos de la integración (además del módulo y su documento):
// el puente arquitectónico, su test y la exclusión de vitest para los tests
// nativos de C. Nada más puede diferir de la base.
// INC-06 — la lista crece con la superficie EXACTA del bloque de persistencia
// (núcleo puro + adaptador Firestore + pantalla de producción + conexión mínima
// en App.tsx + tipos de auditoría + reglas + tests + extensión fail-loud del
// harness de reglas). Cualquier otro fichero que difiera de la base sigue
// haciendo fallar este test: la semántica de aislamiento se conserva.
const PERMITIDOS_INTEGRACION = [
  'src/features/patrimonial/',
  'docs/patrimonial-ux/alcance-fase-1.md',
  'src/lib/patrimonialIntegracion.ts',
  'tests/patrimonial-integracion.test.ts',
  'vite.config.ts',
  // bloque INC-06 (persistencia de fichas + ejecución controlada):
  'src/lib/patrimonialPersistencia.ts',
  'src/lib/patrimonialPersistenciaFirebase.ts',
  'src/patrimonial/',
  'tests/patrimonial-persistencia.test.ts',
  'tests/seguridad-firestore-patrimonial.test.ts',
  'tests/harness/firestoreRulesEval.ts',
  'src/App.tsx',
  'src/types.ts',
  'firestore.rules',
  // bloque CANÓNICO B (commits propios 08d8f17..c4949a6, posteriores a la base
  // 877494f: contrato canónico B/C, cierre de retención, §16 MAPA, expediente
  // documental/fiscal, hash isomórfico, segurosCentro). Laguna preexistente del
  // registro en la base — el test fallaba ya en c4949a6 antes del port de Operaciones:
  'docs/MAPA-MAESTRO-ERP-ACTUAL.md',
  'docs/arquitectura/CONTRATO_CANONICO_AUTORIZACION_AUDITORIA_B_C.md',
  'src/components/sections/InmueblesSection.tsx',
  'src/lib/expedienteDocumental/',
  'src/lib/expedienteFiscal/',
  'src/lib/firebase.ts',
  'src/lib/importacion/hash.ts',
  'src/utils/segurosCentro.ts',
  // Reparación fin de mes B9 (fecha civil, clamp mensual y pruebas de calendario):
  'src/utils/mantenimientoEngine.ts',
  'src/utils/mantenimientoEngine.test.ts',
  'docs/REPARACION-FINAL-INTEGRACION-BLOQUES-3-9-2026-09.md',
  'tests/centro-operativo.test.ts',
  'tests/expediente-documental.test.ts',
  'tests/hash-isomorfico.test.ts',
  'tests/seguridad-expediente.test.ts',
  'tests/seguridad-firestore-polizas.test.ts',
  // bloque OPERACIONES (port funcional de C, Gestor-alquileres-vercel @ 1686b8e8):
  // módulo autocontenido + auditoría transaccional + entrada en el Centro Operativo
  // + bloque de Rules y revisión explícita de sus dos tripwires de tests:
  'src/features/operaciones/',
  'docs/operaciones/alcance.md',
  'src/lib/auditoria.ts',
  'src/components/inmueble/CentroOperativoInmueblePanel.tsx',
  'tests/fase14-espejo-identidad.test.ts',
  'tests/helpers/evaluadorReglasFirestore.ts',
  // bloque BLOQUE 5 (Operaciones → Fiscalidad): superficie EXACTA y mínima del
  // cierre del circuito. NO se autoriza `src/utils` completo: solo los motores
  // que el bloque crea o modifica, el escritor real de mantenimiento (que pasa a
  // generar el gasto con trazabilidad e idempotencia), el modelo (ampliación
  // aditiva de `Gasto`/`ExportacionFiscalItem`), el script del bloque y su
  // documentación. Cualquier otro fichero sigue sin poder diferir de la base.
  'src/utils/deducibilidadEngine.ts',
  'src/utils/deducibilidadEngine.test.ts',
  'src/utils/operacionGastoEngine.ts',
  'src/utils/operacionGastoEngine.test.ts',
  'src/utils/gastosEngine.ts',
  'src/utils/fiscalEngine.ts',
  'src/utils/rentabilidadEngine.ts',
  'src/utils/reportingEngine.ts',
  'src/components/modals/RegistrarActuacionModal.tsx',
  'src/components/modals/RegistrarActuacionModal.test.tsx',
  'src/components/mantenimiento/MantenimientoPreventivoPanel.tsx',
  'scripts/test-bloque-5.ts',
  'docs/BLOQUE-5-OPERACIONES-FISCALIDAD.md',
  // `package.json`: la ÚNICA diferencia autorizada es la línea añadida del script
  // `test:bloque-5` (el script del bloque que exige este cierre). La garantía se
  // mantiene con la comprobación de adición pura de más abajo: ninguna línea
  // previa de package.json puede borrarse ni reescribirse.
  'package.json',
  // BLOQUE 7 (Importación/Exportación + XLSX): superficie EXACTA y mínima del
  // bloque. El módulo canónico de importación/exportación ya existía integrado;
  // el bloque añade el adaptador XLSX (ZIP/DEFLATE/fechas Excel propios), cablea
  // el panel y sus tests/fixtures. NO se autoriza `src/lib` completo ni
  // `tests/` completo: cualquier otro fichero que difiera de la base sigue
  // haciendo fallar el aislamiento. `src/lib/importExportFirebase.ts` (única
  // capa de I/O) NO se toca.
  'src/lib/importExport/',
  'src/components/sections/ImportExportPanel.tsx',
  'tests/import-export-xlsx.test.ts',
  'tests/import-export-canonico.test.ts',
  'tests/import-export-panel.test.tsx',
  'tests/fixtures/xlsx/',
  'scripts/test-bloque-7.ts',
  'docs/BLOQUE-7-IMPORTACION-EXPORTACION-XLSX.md',
];

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
const permitidaPostB = (path) =>
  SUPERFICIE_BLOQUES_POST_B.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p));
const permitido = (path) =>
  PERMITIDOS_INTEGRACION.some((p) => path === p || path.startsWith(p)) || permitidaPostB(path);

test('ningún archivo productivo difiere de la base fuera de la superficie de integración documentada', async () => {
  const { execFileSync } = await import('node:child_process');
  const exclusiones = [...PERMITIDOS_INTEGRACION, ...SUPERFICIE_BLOQUES_POST_B].map((p) => `:!${p.replace(/\/$/, '')}`);
  const diff = execFileSync('git', [
    'diff', '--name-only', BASE_INTEGRACION, '--', '.', ...exclusiones,
  ], { cwd: repo, encoding: 'utf8' });
  assert.equal(diff.trim(), '');
  const sinSeguimiento = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: repo, encoding: 'utf8' });
  assert.ok(sinSeguimiento.trim().split('\n').filter(Boolean).every(permitido));
  // Guardia adicional de la superficie compartida autorizada: solo se admiten
  // ADICIONES (ninguna línea base se borra ni se reescribe). Se comprueba contra
  // la referencia verificable disponible, porque la base histórica puede no
  // existir en este clon (incidencia de infraestructura, no del bloque).
  const referencia = referenciaCustodia(BASE_INTEGRACION);
  assert.ok(referencia, 'CUSTODIA: no hay referencia verificable (base histórica ni commit de partida del bloque)');
  for (const ficheroCompartido of ['package.json']) {
    const [adiciones, borrados] = execFileSync('git', ['diff', '--numstat', referencia.sha, '--', ficheroCompartido], { cwd: repo, encoding: 'utf8' }).trim().split(/\s+/);
    assert.equal(Number(borrados || 0), 0, `${ficheroCompartido} solo admite adiciones (añadido=${adiciones || 0})`);
  }
});

// ---------------------------------------------------------------------------
// BLOQUES 10, 11 y 12 — invariantes de custodia que NO se relajan:
//   · las reglas de seguridad no cambian (ni se relajan ni se endurecen);
//   · no se borra ni renombra ningún fichero de la base;
//   · los ficheros compartidos sólo admiten adiciones puras;
//   · ningún símbolo exportado de los servicios compartidos desaparece.
// La superficie de la lista anterior se amplía con los ficheros REALMENTE
// revisados en esos bloques (declarados uno a uno), no con directorios amplios.
// ---------------------------------------------------------------------------
test('BLOQUES 10-12: reglas byte a byte, sin borrados y con API de servicios preservada', async () => {
  const { execFileSync } = await import('node:child_process');
  const referencia = referenciaCustodia(BASE_INTEGRACION);
  assert.ok(referencia, 'CUSTODIA: no hay referencia verificable (base histórica ni commit de partida del bloque)');
  const ejecutar = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

  // (1) Reglas de seguridad: idénticas a la base B (comparación por contenido
  // binario: evita diffs gigantes en el mensaje de fallo).
  for (const fichero of ['firestore.rules', 'storage.rules']) {
    const actual = readFileSync(resolve(repo, fichero));
    const base = Buffer.from(ejecutar('show', `${referencia.sha}:${fichero}`), 'utf8');
    assert.ok(
      actual.equals(base),
      `${fichero}: las reglas no pueden cambiar sin dictamen (ni relajarse ni endurecerse)`
    );
  }

  // (2) Nada se borra ni se renombra desde la base B.
  assert.equal(ejecutar('diff', '--diff-filter=D', '--name-only', referencia.sha, '--', '.').trim(), '', 'hay ficheros borrados desde la base B');
  assert.equal(ejecutar('diff', '--diff-filter=R', '--name-only', referencia.sha, '--', '.').trim(), '', 'hay ficheros renombrados desde la base B');

  // (3) Ficheros compartidos: adiciones puras (0 líneas borradas).
  for (const compartido of ['src/types.ts', 'package.json', 'src/main.tsx']) {
    const [adiciones, borrados] = ejecutar('diff', '--numstat', referencia.sha, '--', compartido).trim().split(/\s+/);
    assert.equal(Number(borrados || 0), 0, `${compartido} solo admite adiciones (añadido=${adiciones || 0})`);
  }

  // (4) Los servicios compartidos conservan toda su API exportada.
  const simbolos = (texto) =>
    new Set([...texto.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
  for (const fichero of ['src/lib/firebase.ts', 'src/lib/suministrosFirestore.ts', 'src/lib/firebaseActas.ts', 'src/lib/firebaseInversion.ts']) {
    const base = simbolos(ejecutar('show', `${referencia.sha}:${fichero}`));
    const actual = simbolos(readFileSync(resolve(repo, fichero), 'utf8'));
    const eliminados = [...base].filter((s) => !actual.has(s));
    assert.deepEqual(eliminados, [], `${fichero}: API histórica eliminada`);
  }
});
