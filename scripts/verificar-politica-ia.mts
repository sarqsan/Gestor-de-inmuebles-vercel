/**
 * VERIFICADOR DE LA POLÍTICA DE IA — FASE 7
 * =========================================
 * Uso:
 *   npx tsx scripts/verificar-politica-ia.mts                 # la política del entorno (IA_POLITICA_JSON)
 *   npx tsx scripts/verificar-politica-ia.mts --ejemplo        # la plantilla versionada (docs/politica-ia.ejemplo.json)
 *   npx tsx scripts/verificar-politica-ia.mts --fichero ruta.json
 *
 * No escribe NADA y no llama a la red: sólo valida la política y explica el
 * estado efectivo del gobierno de IA. Código de salida 1 si la política no
 * está declarada, si es inválida o si está incompleta (consumo bloqueado).
 *
 * La política es TODO O NADA (Fase 7): permisos explícitos de los cuatro
 * perfiles, tarifa de las 12 operaciones del catálogo y cuotas finitas. Los
 * comodines `'*'`, las tarifas implícitas y las cuotas `null` ya no existen.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OPERACIONES_IA } from '../src/ia/catalogoOperacionesIA.js';
import {
  CUOTAS_IA_REFERENCIA,
  TARIFAS_IA_REFERENCIA,
  TIPOS_PERFIL_IA,
  VARIABLE_ENTORNO_POLITICA_IA,
  costeOperacion,
  permiteOperacion,
  politicaGobiernoIADesdeEntorno,
  resumenPoliticaGobiernoIA,
  validarPoliticaGobiernoIA,
  type PoliticaGobiernoIA,
} from '../src/ia/gobiernoIAContrato.js';

const RAIZ = resolve(import.meta.dirname, '..');
const EJEMPLO = resolve(RAIZ, 'docs', 'politica-ia.ejemplo.json');

function politicaDeArgumentos(argumentos: string[]): { politica: PoliticaGobiernoIA; etiqueta: string } | { error: string } {
  const iEjemplo = argumentos.indexOf('--ejemplo');
  const iFichero = argumentos.indexOf('--fichero');
  if (iEjemplo !== -1 || iFichero !== -1) {
    const ruta = iFichero !== -1 ? argumentos[iFichero + 1] : EJEMPLO;
    if (!ruta) return { error: '--fichero necesita una ruta' };
    let crudo: unknown;
    try {
      crudo = JSON.parse(readFileSync(resolve(process.cwd(), ruta), 'utf8'));
    } catch (error) {
      return { error: `no se ha podido leer/parsear ${ruta}: ${(error as Error).message}` };
    }
    const resultado = validarPoliticaGobiernoIA(crudo);
    if (resultado.estado === 'INVALIDA') return { error: `política INVÁLIDA en ${ruta}: ${resultado.error}` };
    return { politica: resultado.politica, etiqueta: `fichero ${ruta}` };
  }
  const resultado = politicaGobiernoIADesdeEntorno(process.env);
  if (resultado.estado === 'INVALIDA') return { error: `política INVÁLIDA en ${VARIABLE_ENTORNO_POLITICA_IA}: ${resultado.error}` };
  const declarada = Boolean(process.env[VARIABLE_ENTORNO_POLITICA_IA]?.trim());
  return { politica: resultado.politica, etiqueta: declarada ? `entorno (${VARIABLE_ENTORNO_POLITICA_IA})` : 'política POR_DEFECTO (sin IA_POLITICA_JSON)' };
}

const leido = politicaDeArgumentos(process.argv.slice(2));
if ('error' in leido) {
  console.error(`\n  BLOQUEADO · ${leido.error}\n`);
  console.error('  Con la política incompleta o inválida el servidor responde 503 y NO consume IA.');
  console.error('  Plantilla aprobada: docs/politica-ia.ejemplo.json\n');
  process.exitCode = 1;
} else {
  const { politica, etiqueta } = leido;
  const resumen = resumenPoliticaGobiernoIA(politica);
  const completa = resumen.politicaCompleta; // declarada (ENTORNO) y completa
  const aprobada = !resumen.pendienteAprobacionComercial;

  console.log(`\n  POLÍTICA DE IA · origen: ${etiqueta}`);
  console.log(`  estado: ${aprobada ? 'APROBADA (el consumo de IA puede ejecutarse)' : 'PENDIENTE / BLOQUEADA (ninguna operación se ejecuta)'}`);
  console.log(`  completa: ${completa ? 'sí' : 'no'} · comodines: no · cuotas: ${politica.cuotas.operacionesPorDia}/día · ${politica.cuotas.operacionesPorMes}/mes`);
  console.log(`  referencia del repositorio: ${CUOTAS_IA_REFERENCIA.operacionesPorDia}/día · ${CUOTAS_IA_REFERENCIA.operacionesPorMes}/mes\n`);

  const ancho = Math.max(...OPERACIONES_IA.map((o) => o.id.length));
  console.log(`  ${'OPERACIÓN'.padEnd(ancho)}  ${TIPOS_PERFIL_IA.map((p) => p.slice(0, 5).padStart(5)).join(' ')}  coste`);
  console.log(`  ${'-'.repeat(ancho)}  ${TIPOS_PERFIL_IA.map(() => '-----').join(' ')}  -----`);
  for (const { id } of OPERACIONES_IA) {
    const marcas = TIPOS_PERFIL_IA.map((perfil) => (permiteOperacion(politica, perfil, id) ? '  sí ' : '  ·  ').padStart(5)).join(' ');
    const coste = costeOperacion(politica, id);
    const referencia = TARIFAS_IA_REFERENCIA[id];
    const nota = coste === referencia ? '' : ` (referencia ${referencia})`;
    console.log(`  ${id.padEnd(ancho)}  ${marcas}  ${coste}${nota}`);
  }

  const sinPermiso = OPERACIONES_IA.filter(({ id }) => TIPOS_PERFIL_IA.every((p) => !permiteOperacion(politica, p, id)));
  for (const perfil of TIPOS_PERFIL_IA) {
    const cuantas = OPERACIONES_IA.filter(({ id }) => permiteOperacion(politica, perfil, id)).length;
    console.log(`\n  ${perfil}: ${cuantas} de ${OPERACIONES_IA.length} operaciones`);
  }
  if (sinPermiso.length > 0) {
    console.log(`\n  AVISO · operaciones sin ningún perfil declarado: ${sinPermiso.map((o) => o.id).join(', ')}`);
  }
  if (!aprobada) {
    console.log('\n  BLOQUEADO · el consumo de IA seguirá desactivado (503) hasta declarar la política completa.');
    process.exitCode = 1;
  }
  console.log('');
}
