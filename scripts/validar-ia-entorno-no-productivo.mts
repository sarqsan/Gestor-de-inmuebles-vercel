/**
 * VALIDACIÓN DE IA EN ENTORNO NO PRODUCTIVO — FASE 8
 * =================================================
 * Uso:
 *   npx tsx scripts/validar-ia-entorno-no-productivo.mts                  # política del entorno
 *   npx tsx scripts/validar-ia-entorno-no-productivo.mts --ejemplo        # plantilla del repositorio
 *   npx tsx scripts/validar-ia-entorno-no-productivo.mts --usuarios 25    # tamaño para los límites de gasto
 *   npx tsx scripts/validar-ia-entorno-no-productivo.mts --json           # salida legible por máquina
 *
 * Qué hace: evalúa el entorno (proyecto, entorno y límites identificados), se
 * NIEGA a ejecutar en producción, calcula el peor caso de consumo con las
 * cuotas y tarifas declaradas y ensaya las DOCE operaciones del catálogo con
 * una CUENTA DE PRUEBA usando el proveedor SIMULADO (sin SDK, sin clave y sin
 * red). Imprime el consumo y el log resultantes para su revisión.
 *
 * Qué NO hace: no activa nada, no toca Firestore, no llama al proveedor real y
 * no modifica la configuración del proyecto. Código de salida 1 cuando el
 * entorno no permite validar (producción, política ausente o incompleta).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TIPOS_PERFIL_IA,
  VARIABLE_ENTORNO_POLITICA_IA,
  politicaGobiernoIADesdeEntorno,
  resumenPoliticaGobiernoIA,
  validarPoliticaGobiernoIA,
  type PoliticaGobiernoIA,
  type TipoPerfilIA,
} from '../src/ia/gobiernoIAContrato.js';
import {
  CLAVE_PROVEEDOR_SIMULADO,
  evaluarEntornoIA,
  ejecutarSandboxIA,
  limitesGastoIA,
  proveedorSimulado,
} from '../server/ia/validacionEntornoIA.js';

const RAIZ = resolve(import.meta.dirname, '..');
const EJEMPLO = resolve(RAIZ, 'docs', 'politica-ia.ejemplo.json');

function politicaDeArgumentos(argumentos: string[]): { politica: PoliticaGobiernoIA | null; etiqueta: string; error?: string } {
  const iFichero = argumentos.indexOf('--fichero');
  const usarEjemplo = argumentos.includes('--ejemplo') || iFichero !== -1;
  if (usarEjemplo) {
    const ruta = iFichero !== -1 ? argumentos[iFichero + 1] : EJEMPLO;
    if (!ruta) return { politica: null, etiqueta: '(sin fichero)', error: '--fichero necesita una ruta' };
    try {
      const resultado = validarPoliticaGobiernoIA(JSON.parse(readFileSync(resolve(process.cwd(), ruta), 'utf8')));
      if (resultado.estado === 'INVALIDA') return { politica: null, etiqueta: ruta, error: `política INVÁLIDA: ${resultado.error}` };
      return { politica: resultado.politica, etiqueta: `fichero ${ruta}` };
    } catch (error) {
      return { politica: null, etiqueta: ruta, error: `no se ha podido leer/parsear: ${(error as Error).message}` };
    }
  }
  const resultado = politicaGobiernoIADesdeEntorno(process.env);
  if (resultado.estado === 'INVALIDA') return { politica: null, etiqueta: VARIABLE_ENTORNO_POLITICA_IA, error: resultado.error };
  const declarada = Boolean(process.env[VARIABLE_ENTORNO_POLITICA_IA]?.trim());
  return { politica: resultado.politica, etiqueta: declarada ? `entorno (${VARIABLE_ENTORNO_POLITICA_IA})` : 'política POR_DEFECTO (sin IA_POLITICA_JSON)' };
}

const argumentos = process.argv.slice(2);
const iUsuarios = argumentos.indexOf('--usuarios');
const usuariosPrevistos = iUsuarios !== -1 ? Number(argumentos[iUsuarios + 1]) : 25;
const comoJson = argumentos.includes('--json');
const leido = politicaDeArgumentos(argumentos);
const evaluacion = evaluarEntornoIA(process.env, leido.politica);

if (leido.error) evaluacion.bloqueos.push(leido.error);

const informe = {
  entorno: evaluacion.identificacion,
  produccion: evaluacion.produccion,
  puedeValidarEnSandbox: evaluacion.puedeValidarEnSandbox,
  bloqueos: evaluacion.bloqueos,
  avisos: evaluacion.avisos,
  politica: leido.politica ? resumenPoliticaGobiernoIA(leido.politica) : null,
  etiquetaPolitica: leido.etiqueta,
  limites: leido.politica ? limitesGastoIA(leido.politica, usuariosPrevistos) : null,
  sandbox: [] as Array<{ perfil: TipoPerfilIA; filas: number; permitidas: number; proveedor: number; creditos: number; reembolsados: number }>,
};

if (!comoJson) {
  console.log('\n  VALIDACIÓN DE IA EN ENTORNO NO PRODUCTIVO · Fase 8');
  console.log(`  entorno: ${evaluacion.identificacion.entorno} · producción: ${evaluacion.produccion ? 'SÍ' : 'no'}`);
  console.log(`  proyecto: ${evaluacion.identificacion.proyecto ?? '(sin identificar)'} · base de datos: ${evaluacion.identificacion.baseDatos ?? '(sin identificar)'}`);
  console.log(`  política: ${leido.etiqueta}\n`);
  for (const bloqueo of evaluacion.bloqueos) console.log(`  BLOQUEO · ${bloqueo}`);
  for (const aviso of evaluacion.avisos) console.log(`  aviso   · ${aviso}`);
}

if (evaluacion.puedeValidarEnSandbox && leido.politica) {
  if (informe.limites) {
    const l = informe.limites;
    if (!comoJson) {
      console.log('\n  LÍMITES IDENTIFICADOS (peor caso según la política declarada)');
      console.log(`  por usuario: ${l.operacionesPorDiaPorUsuario}/día · ${l.operacionesPorMesPorUsuario}/mes`);
      console.log(`  sistema (${l.usuariosPrevistos} usuarios): ${l.operacionesDiaSistema}/día · ${l.operacionesMesSistema}/mes · ${l.creditosMesSistema} créditos/mes`);
      console.log(`  operación más cara: ${l.creditosPorOperacionMasCara} créditos`);
      console.log('  el coste real del proveedor se acota en Google Cloud (presupuesto + cuotas de API): pendiente de verificar en la activación autorizada');
    }
  }
  const perfilesAEvaluar: TipoPerfilIA[] = ['ADMINISTRADOR', ...TIPOS_PERFIL_IA.filter((p) => p !== 'ADMINISTRADOR')];
  for (const perfil of perfilesAEvaluar) {
    const sandbox = await ejecutarSandboxIA({
      politica: leido.politica,
      perfil,
      uidPrueba: `uid-prueba-fase8-${perfil.toLowerCase()}`,
      perfilesExtra: TIPOS_PERFIL_IA.filter((p) => p !== perfil),
      creditoInicial: 200,
    });
    const permitidas = sandbox.filas.filter((f) => f.permitida).length;
    informe.sandbox.push({
      perfil,
      filas: sandbox.filas.length,
      permitidas,
      proveedor: sandbox.consumo.llamadasProveedor,
      creditos: sandbox.consumo.creditosConsumidos,
      reembolsados: sandbox.consumo.creditosReembolsados,
    });
    if (!comoJson) {
      console.log(`\n  SANDBOX · cuenta de prueba con perfil ${perfil} (proveedor simulado, ${CLAVE_PROVEEDOR_SIMULADO} nunca se usa)`);
      console.log(`  operaciones permitidas: ${permitidas}/${sandbox.filas.length} · llamadas al proveedor simulado: ${sandbox.consumo.llamadasProveedor} · créditos consumidos: ${sandbox.consumo.creditosConsumidos} · reembolsados: ${sandbox.consumo.creditosReembolsados}`);
      for (const fila of sandbox.filas) {
        const marca = fila.permitida ? 'ok ' : '403';
        console.log(`    ${marca} ${fila.codigo} código ${fila.codigoHttp} · ${fila.motor} · coste ${fila.costeCreditos}${fila.creditosReembolsados ? ` (reembolsado ${fila.creditosReembolsados})` : ''} · ${fila.operacion}`);
      }
      const fallidos = sandbox.eventos.filter((e) => e.evento === 'RECHAZADA' || e.evento === 'SIN_REGISTRO');
      console.log(`  log del núcleo: ${sandbox.eventos.length} eventos (${fallidos.length} rechazos/sin registro) · ninguna credencial ni dato personal en el registro`);
      const registroConCampos = sandbox.registros.every((r) => !('prompt' in r) && !('email' in r));
      console.log(`  registro de consumo sin campos sensibles: ${registroConCampos ? 'sí' : 'NO'}`);
    }
  }
} else if (!comoJson) {
  console.log('\n  El ensayo NO se ejecuta: resuelve los bloqueos y repite. Ninguna operación de IA se ha ejecutado.');
}

if (comoJson) console.log(JSON.stringify(informe, null, 2));

if (!evaluacion.puedeValidarEnSandbox) {
  if (!comoJson) {
    console.log('\n  ACTIVACIÓN: NO autorizada ni ejecutada. Para activar el consumo real hacen falta, en este orden:');
    console.log('   1) autorización expresa del responsable del proyecto;');
    console.log('   2) política completa verificada (npm run ia:verificar-politica -- --ejemplo) en un entorno NO productivo;');
    console.log('   3) credencial de servicio y clave del proveedor de ese entorno;');
    console.log('   4) presupuesto y cuotas de API identificados y verificados en Google Cloud;');
    console.log('   5) revisión del consumo y los logs del ensayo con la cuenta de prueba.');
  }
  process.exitCode = 1;
} else {
  if (!comoJson) {
    console.log('\n  Ensayo completado. La activación real sigue PENDIENTE de autorización expresa: este script no activa nada.');
  }
}
