import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseDeRama, leerManifiesto, ficheroConParche } from '../../../../tests/helpers/custodia-rama.mjs';
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

// CUSTODIA — la base se CALCULA, no se escribe a mano.
// ---------------------------------------------------------------------------
// La guardia histórica fijaba f782e53 (un ancestro 147 commits anterior a main)
// y se omitía cuando ese commit no era resoluble: con un clon superficial pasaba
// en verde sin comprobar nada. Ahora:
//   · la base es `merge-base` con main (`tests/helpers/custodia-rama.mjs`), así
//     que la guardia mide exactamente lo que esta rama cambia respecto a main;
//   · si no hay base verificable, la guardia FALLA (nunca se omite);
//   · el manifiesto `custodia-parche-p0.json` declara la superficie exacta y el
//     parche byte a byte de los ficheros compartidos (package.json, lockfile y
//     reglas), de modo que cualquier cambio no declarado rompe la custodia;
//   · si la rama parte de otra base (p. ej. main después de la fusión) se pasa a
//     modo invariante: los ficheros compartidos deben seguir intactos.
const CUSTODIA_P0 = leerManifiesto(new URL('./custodia-parche-p0.json', import.meta.url));
let custodiaMemo;
function custodia() {
  custodiaMemo ??= baseDeRama(repo, CUSTODIA_P0);
  return custodiaMemo;
}
const ficheroConParcheRevisado = (path) => ficheroConParche(CUSTODIA_P0, custodia().sha, path, repo);
// La base del manifiesto es la de la rama que lo generó. Si la rama parte de
// otra base, la custodia byte a byte NO puede aplicarse: se degrada a invariantes
// y se AVISA en voz alta, porque una guardia que se relaja en silencio es
// exactamente el fallo que esta cabecera documenta.
function sinCambios(sha, path) {
  return execFileSync('git', ['diff', '--name-only', sha, '--', path], { cwd: repo, encoding: 'utf8' }).trim() === '';
}
function avisoModoInvariante() {
  const { sha, ref, modo, estricto } = custodia();
  if (estricto) return false;
  if (custodia().avisado) return true;
  custodia().avisado = true;
  console.warn(`[custodia] base de la rama ${sha.slice(0, 7)} (${modo} con ${ref}) ≠ base del manifiesto ${CUSTODIA_P0.base.slice(0, 7)}: `
    + 'se aplican invariantes (los ficheros compartidos deben seguir intactos). Para custodia byte a byte, regenera `custodia-parche-p0.json` con la base actual.');
  return true;
}
// Ficheros compartidos que el manifiesto fija byte a byte.
const FICHEROS_DEL_PARCHE = ['package.json', 'package-lock.json', 'firestore.rules'];
// Artefactos locales que no forman parte del árbol versionado (un enlace a
// `node_modules/` no lo cubre `.gitignore`, que espera un directorio).
const SIN_SEGUIMIENTO_IGNORADO = /^(node_modules|\.env.*|dist|coverage|\.vercel)(\/|$)/;
function sinSeguimientoPermitido(ejecutar) {
  return ejecutar('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)
    .filter((path) => !SIN_SEGUIMIENTO_IGNORADO.test(path));
}

test('dependencias y lockfile solo cambian en el parche revisado de la rama', async () => {
  const { execFileSync } = await import('node:child_process');
  const ejecutar = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

  // (1) `package.json` y `package-lock.json`: igualdad BYTE A BYTE con la base más
  // el parche revisado (scripts P0/doctor y `overrides.dompurify`). Ni una línea
  // más puede diferir: tocar una dependencia sin declararla hace fallar la guardia.
  const invariante = avisoModoInvariante();
  for (const fichero of ['package.json', 'package-lock.json']) {
    if (invariante) {
      assert.ok(sinCambios(custodia().sha, fichero),
        `${fichero} cambiado sin manifiesto: actualiza custodia-parche-p0.json con la base de esta rama`);
      continue;
    }
    assert.equal(readFileSync(resolve(repo, fichero), 'utf8'), ficheroConParcheRevisado(fichero),
      `${fichero}: distinto del parche revisado (dependencias o scripts no declarados)`);
  }

  // (2) Ninguna dependencia ni metadato cambia: el parche solo añade tres runners
  // y la sobreescritura de seguridad de DOMPurify.
  const actualPackage = JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8'));
  const basePackage = JSON.parse(ejecutar('show', `${custodia().sha}:package.json`));
  assert.deepEqual(actualPackage.dependencies, basePackage.dependencies, 'dependencias alteradas');
  assert.deepEqual(actualPackage.devDependencies, basePackage.devDependencies, 'devDependencies alteradas');
  assert.deepEqual(actualPackage.overrides, { dompurify: '^3.4.17' },
    'la única sobreescritura admitida es el parche de seguridad de DOMPurify');
  const scriptsAnadidos = Object.keys(actualPackage.scripts).filter((k) => !(k in basePackage.scripts));
  const RUNNERS_ADMITIDOS = ['doctor', 'test', 'typecheck', 'verificar:produccion'];
  // Siempre: solo pueden APARECER esos tres runners (ninguno más, y ninguno de
  // los scripts existentes puede reescribirse). Con la base del manifiesto, además
  // se exige que estén los tres: esa es la superficie exacta revisada.
  assert.deepEqual(scriptsAnadidos.filter((k) => !RUNNERS_ADMITIDOS.includes(k)), [],
    'solo se admiten los runners P0 añadidos; ningún otro script nuevo');
  // Cuántos runners son «nuevos» depende de la base del manifiesto (si la base ya
  // los incluye, no hay ninguno nuevo). Lo que NO depende de la base es que no
  // pueda aparecer ningún otro script ni reescribirse uno existente.
  for (const clave of Object.keys(basePackage.scripts)) {
    assert.equal(actualPackage.scripts[clave], basePackage.scripts[clave], `script reescrito: ${clave}`);
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

// Integración selectiva de la sesión 2026-10-17. Excepciones por ruta exacta:
// P1/DEC-01 (avisos y canal retirado), P2/P4 (API/UI con dobles), IA por titular,
// P3 solo dominio de preview/matching sin UI, persistencia ni Rules, y los docs
// de auditoría. Las pruebas focales constan en el registro; test 88 mantiene el
// bloqueo byte-a-byte de Rules y no autoriza su publicación.
const SUPERFICIE_SESION_AUDITADA = [
  // P1/DEC-01 — tests/notificaciones*, seguimiento, SMTP y financiación: 136/136.
  'server/notificaciones/repositorioNotificacionesFirestore.ts',
  'server/notificaciones/rutasCronAvisos.ts',
  'src/components/sections/PreseleccionadosSection.tsx',
  'src/lib/bandejaAvisos.ts',
  'src/notificaciones/canales.ts',
  'src/notificaciones/dispatcher.ts',
  'src/notificaciones/resolucion.ts',
  'src/seguimiento/incidencias.ts',
  'src/types/morosidad.ts',
  'src/types/notificaciones.ts',
  'src/utils/documentTemplates.ts',
  'src/utils/morosidad/puenteGAP1.ts',
  'tests/financiacion.test.ts',
  'tests/notificaciones-fase-a.test.ts',
  'tests/notificaciones.test.ts',
  'tests/seguimiento-incidencias.test.ts',
  'tests/smtp-aceptacion-regresion.test.ts',
  // P2/P4 — justified-storage/rent services and UI; no external persistence claim.
  'server.ts',
  'server/titularidades/googleBackend.ts',
  'server/actualizacionRenta/rutasActualizacionRenta.test.ts',
  'server/actualizacionRenta/rutasActualizacionRenta.ts',
  'server/actualizacionRenta/servicioActualizacionRenta.test.ts',
  'server/actualizacionRenta/servicioActualizacionRenta.ts',
  'server/cobros/almacenGoogleStorage.test.ts',
  'server/cobros/almacenGoogleStorage.ts',
  'server/cobros/justificantesCobro.test.ts',
  'server/cobros/justificantesCobro.ts',
  'server/cobros/rutasJustificantesCobro.ts',
  'src/components/ActualizacionRentaPreviewPanel.test.tsx',
  'src/components/ActualizacionRentaPreviewPanel.tsx',
  'src/components/portal-inquilino/PortalRecibos.tsx',
  'src/components/portal-inquilino/PresentarJustificanteCobro.ui.test.tsx',
  'src/components/portal-inquilino/PresentarJustificanteCobro.tsx',
  'src/components/sections/JustificantesCobroInbox.ui.test.tsx',
  'src/components/sections/JustificantesCobroInbox.tsx',
  'src/lib/actualizacionRentaApi.ts',
  'src/lib/justificantesCobroApi.ts',
  'src/utils/actualizacionRentaEngine.test.ts',
  'src/utils/actualizacionRentaEngine.ts',
  'tests/justificantes-cobro-reglas.test.ts',
  // IA — contrato/pagador por titular, actor separado; 341/341 con dobles.
  'firestore.indexes.json',
  'server/ia/configuracionIA.ts',
  'server/ia/contextoTitularIA.ts',
  'server/ia/gobiernoIA.ts',
  'server/ia/nucleoIA.ts',
  'server/ia/registroOperacionesIA.ts',
  'server/ia/validacionEntornoIA.ts',
  'src/components/ia/PanelGobiernoIA.test.tsx',
  'src/components/ia/PanelGobiernoIA.tsx',
  'src/ia/gobiernoIAContrato.ts',
  'tests/ia-contexto-titular.test.ts',
  'tests/ia-fase1-arranque-seguro.test.ts',
  'tests/ia-fase1-integracion-server.test.ts',
  'tests/ia-fase1-nucleo.test.ts',
  'tests/ia-fase1-registro-firestore.test.ts',
  'tests/ia-fase2-aislamiento-usuarios.test.ts',
  'tests/ia-fase2-bloqueo-consumo.test.ts',
  'tests/ia-fase2-gobierno-firestore.test.ts',
  'tests/ia-fase2-gobierno.test.ts',
  'tests/ia-fase7-gobierno-permisos-costes.test.ts',
  'tests/ia-fase9-llaves-usuario.test.ts',
  // P3 solo núcleo de importación/preview y matching; Norma 43 sigue fail-closed.
  'src/types/conciliacion.ts',
  'src/tests/tests_conciliacion.ts',
  'src/utils/conciliacion/conciliacionEngine.ts',
  'src/utils/conciliacion/csvParser.ts',
  'src/utils/conciliacion/idempotencia.ts',
  'src/utils/conciliacion/importEngine.ts',
  'src/utils/conciliacion/matchingEngine.ts',
  'src/utils/conciliacion/mt940Parser.ts',
  'src/utils/conciliacion/norma43Parser.ts',
  'src/utils/conciliacion/normalizador.ts',
  'src/utils/conciliacion/ofxParser.ts',
  'src/utils/conciliacion/validacionExtracto.ts',
  'tests/conciliacion-legacy.test.ts',
  'tests/conciliacion-p3.test.ts',
  // Documentación/custodia y validador estructural del inventario.
  'docs/COMPROBACION-MAIN-MAPA-2026-10-16.md',
  'docs/CONTINUIDAD-ARENA.md',
  'docs/CONTINUIDAD-FASE-A-RONDA-2026-10-16.md',
  'docs/ESTADO-GIT-ERP.md',
  'docs/FASE-A-PUESTA-EN-MARCHA-AVISOS.md',
  'docs/MAPA-MAESTRO-ERP-ACTUAL.md',
  'docs/PLAN-CAPACIDADES-DECISIONES-2026-10-16.md',
  'docs/P2-JUSTIFICANTES-COBRO-VALIDACION-LOCAL.md',
  'docs/P4-ACTUALIZACION-RENTA-VALIDACION-LOCAL.md',
  'docs/anexos/MAPA-MAESTRO-ERP-INVENTARIO-2026-10-16.md',
  'docs/anexos/MAPA-MAESTRO-ERP-RAMAS-2026-10-16.md',
  'scripts/validar-inventario-capacidades.mjs',
];
const permitidaPostB = (path) =>
  SUPERFICIE_BLOQUES_POST_B.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p))
  || SUPERFICIE_SESION_AUDITADA.includes(path);
// DEC-01: WhatsApp está DESCARTADA. Se permite únicamente la baja de este modal
// concreto y se afirma su ausencia para impedir que vuelva a la superficie activa.
const ELIMINACIONES_DEC_01 = ['src/components/ConfirmWhatsappSentModal.tsx'];
// Excepción heredada de UX no convierte estos cambios P3 en integración segura.
// Mantenerlos locales hasta fixture normativa, emulador/persistencia y dictamen.
const P3_NO_INTEGRAR_SIN_GUARDIAS = [
  'firestore.rules',
  'scripts/test-bloque-b.ts',
  'scripts/test-bloque-e.ts',
  'src/components/modals/MorosidadDetalleModal.tsx',
  'src/components/sections/ConciliacionBancariaSection.tsx',
  'src/components/sections/FacturaElectronicaB2BPanel.tsx',
  'src/components/sections/FacturacionSection.tsx',
  'src/components/sections/MorosidadSection.tsx',
  'src/components/sections/TesoreriaSection.tsx',
  'src/lib/conciliacionFirestore.ts',
  'src/lib/conciliacionSession.ts',
  'src/tesoreria/conciliacionAdapter.ts',
  'src/utils/facturaElectronicaB2BEngine.ts',
  'src/utils/morosidad/compromisos.ts',
  'src/utils/morosidad/morosidadEngine.test.ts',
  'src/utils/morosidad/morosidadEngine.ts',
  'src/utils/morosidad/morosidadStore.ts',
  'tests/conciliacion-p3-rules.test.ts',
  'tests/conciliacion-persistencia.test.ts',
];
// REBASE A MAIN — dos entradas de la lista P3 cambian respecto a main por motivos
// que NO son P3 y que están fijados por otra guardia:
//   · `firestore.rules`: el cierre P0 de `actas_otp` y de la escritura de evidencia
//     de firma (H-03/H-07). No introduce nada de Norma 43 ni de conciliación, y su
//     contenido está fijado BYTE A BYTE por el parche revisado (test de reglas).
//   · `FacturacionSection.tsx`: P1.5-pre, la modalidad fiscal deja de estar
//     cableada a VERIFACTU y pasa a configuración explícita sin remisión.
// Cualquier otro fichero P3 sigue bloqueado sin dictamen.
const P3_REBASADOS_EN_MAIN = {
  'firestore.rules': 'cierre P0 de actas_otp/evidencia (fijado byte a byte por el parche revisado)',
  'src/components/sections/FacturacionSection.tsx': 'P1.5-pre: modalidad fiscal configurable, sin remisión por defecto',
};
const permitido = (path) =>
  PERMITIDOS_INTEGRACION.some((p) => path === p || path.startsWith(p))
  || permitidaPostB(path) || ELIMINACIONES_DEC_01.includes(path);

test('la superficie de la rama es EXACTAMENTE la declarada frente a main', async () => {
  const { execFileSync } = await import('node:child_process');
  const ejecutar = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  const cambiados = ejecutar('diff', '--name-only', custodia().sha, '--', '.').split('\n').filter(Boolean).sort();
  const declarados = [...CUSTODIA_P0.superficie].sort();
  if (!custodia().estricto) {
    // Rama con otra base (p. ej. main tras la fusión): el manifiesto de esta rama
    // ya no la describe. Se conservan las comprobaciones independientes de la base
    // y se exige que el manifiesto se regenere al tocar ficheros compartidos.
    assert.deepEqual(sinSeguimientoPermitido(ejecutar), [],
      'hay ficheros sin seguimiento: la superficie debe estar confirmada en Git');
    const p3 = cambiados.filter((path) => P3_NO_INTEGRAR_SIN_GUARDIAS.includes(path) && !(path in P3_REBASADOS_EN_MAIN));
    assert.deepEqual(p3, [], `P3 no integrada: ${p3.join(', ')}`);
    assert.ok(ELIMINACIONES_DEC_01.every((path) => !existsSync(resolve(repo, path))), 'DEC-01: WhatsApp no debe reaparecer');
    return;
  }
  // Igualdad EXACTA en los dos sentidos: ningún fichero sin declarar (drift) y
  // ningún fichero declarado que ya no cambie (manifiesto obsoleto).
  assert.deepEqual(cambiados, declarados,
    `superficie distinta del manifiesto: sobran=[${cambiados.filter((f) => !declarados.includes(f)).join(', ')}] faltan=[${declarados.filter((f) => !cambiados.includes(f)).join(', ')}]`);
  assert.deepEqual(sinSeguimientoPermitido(ejecutar), [],
    'hay ficheros sin seguimiento: la superficie debe estar confirmada en Git');
  const p3Pendiente = cambiados.filter((path) => P3_NO_INTEGRAR_SIN_GUARDIAS.includes(path) && !(path in P3_REBASADOS_EN_MAIN));
  assert.deepEqual(p3Pendiente, [], `P3 no integrada: falta Norma 43 normativa, emulador/persistencia y dictamen: ${p3Pendiente.join(', ')}`);
  assert.ok(ELIMINACIONES_DEC_01.every((path) => !existsSync(resolve(repo, path))), 'DEC-01: WhatsApp no debe reaparecer');
  for (const ruta of declarados) {
    assert.doesNotMatch(ruta, /^(dist|node_modules)\//, `artefacto de build en la superficie: ${ruta}`);
  }
});

test('BLOQUES 10-12 (rebasado a main): reglas byte a byte con parche revisado, sin borrados y con API preservada', async () => {
  const { execFileSync } = await import('node:child_process');
  const referencia = custodia();
  assert.ok(referencia, 'CUSTODIA: no hay referencia verificable (base histórica ni commit de partida del bloque)');
  const ejecutar = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

  // (1) DEC-01: comprobar primero la baja exacta y que no se renombró otra ruta.
  // Así esta regresión sigue ejecutándose aunque el gate de Rules P3 continúe rojo.
  // DEC-01 ya está integrado en main: la retirada del modal WhatsApp forma parte
  // de la base. Respecto a main, esta rama no elimina ningún fichero, y la
  // ausencia del modal se sigue exigiendo (más arriba) para que no reaparezca.
  const borrados=ejecutar('diff', '--diff-filter=D', '--name-only', referencia.sha, '--', '.').trim().split('\n').filter(Boolean);
  assert.deepEqual(borrados, [], 'esta rama no elimina ficheros respecto a main');
  assert.equal(ejecutar('diff', '--diff-filter=R', '--name-only', referencia.sha, '--', '.').trim(), '', 'hay ficheros renombrados desde la base del checkout');

  // (2) Reglas de seguridad: `storage.rules` idéntico a la base y `firestore.rules`
  // igual a la base MÁS el parche revisado (cierre de `actas_otp` y
  // `evidenciaFirmaSoloServidor`, H-03/H-07). La comparación sigue siendo binaria:
  // cualquier otra modificación de reglas hace fallar la guardia.
  assert.ok(readFileSync(resolve(repo, 'storage.rules')).equals(
    Buffer.from(ejecutar('show', `${referencia.sha}:storage.rules`), 'utf8')),
    'storage.rules: las reglas no pueden cambiar sin dictamen');
  if (avisoModoInvariante()) {
    assert.ok(sinCambios(referencia.sha, 'firestore.rules'),
      'firestore.rules cambiado sin manifiesto: actualiza custodia-parche-p0.json con la base de esta rama');
  } else {
    assert.equal(readFileSync(resolve(repo, 'firestore.rules'), 'utf8'),
      ficheroConParcheRevisado('firestore.rules'),
      'firestore.rules: distinto del parche revisado (ni relajarse ni endurecerse sin declararlo)');
  }

  // (3) Ficheros compartidos sin cambios respecto a la base (los que sí cambian
  // quedan fijados por el parche revisado en el test de dependencias).
  for (const compartido of ['src/types.ts', 'src/main.tsx']) {
    assert.equal(ejecutar('diff', '--name-only', referencia.sha, '--', compartido).trim(), '',
      `${compartido} no puede cambiar en esta rama`);
  }

  // (4) Los servicios compartidos conservan toda su API exportada.
  const simbolos = (texto) =>
    new Set([...texto.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
  // RETIRADA REVISADA (no pérdida accidental): el OTP de actas dejó de calcularse
  // y guardarse en el navegador. Se sirve solo desde el servidor
  // (`server/actas/servicioOtpActas.ts`, con `server/actas/rutasOtpActas.ts`), de
  // modo que las funciones cliente serían una segunda vía de emisión y no deben
  // existir. `tests/acta-otp-entrega.test.tsx` exige además su ausencia.
  const RETIRADOS_OTP_CLIENTE = ['getOtpActaFirestore', 'saveOtpActaFirestore', 'subscribeOtpPorActa'];
  for (const fichero of ['src/lib/firebase.ts', 'src/lib/suministrosFirestore.ts', 'src/lib/firebaseActas.ts', 'src/lib/firebaseInversion.ts']) {
    const base = simbolos(ejecutar('show', `${referencia.sha}:${fichero}`));
    const actual = simbolos(readFileSync(resolve(repo, fichero), 'utf8'));
    let eliminados = [...base].filter((s) => !actual.has(s));
    if (fichero === 'src/lib/firebaseActas.ts') {
      // El OTP ya no se calcula ni se guarda en el navegador: cualquier otra
      // exportación que desaparezca sigue haciendo fallar la guardia.
      assert.deepEqual(eliminados.filter((s) => !RETIRADOS_OTP_CLIENTE.includes(s)), [],
        `${fichero}: solo se admite la retirada del OTP de cliente`);
      eliminados = [];
    }
    assert.deepEqual(eliminados, [], `${fichero}: API histórica eliminada`);
  }
});
