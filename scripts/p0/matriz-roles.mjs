#!/usr/bin/env node
/**
 * P0-A · MATRIZ ROL × OPERACIÓN (derivada del TEXTO de firestore.rules)
 * =====================================================================
 * Clasifica cada celda (colección, operación) según qué predicado de rol la
 * autoriza. NO interpreta la lógica: clasifica por presencia de predicados.
 *
 * Salida: JSON + Markdown. Las celdas `DESCONOCIDO` son una ALARMA: significan
 * que una condición no encaja en ningún predicado conocido y necesita revisión
 * manual. El script sale con código 1 si hay alguna.
 *
 * Distingue, como exige la orden, entre:
 *   · permisos POR ROL (PROPIETARIO, PROFESIONAL, ADMINISTRADOR, INQUILINO)
 *   · permisos POR RELACIÓN (sobre el inmueble/contrato/incidencia/orden)
 *   · permisos del propio registro (request.auth.uid == uid)
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inventariarFirestore } from './inventario-reglas.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Catálogo de predicados reconocidos → roles que ese predicado PUEDE conceder.
 *
 * Se asigna el CONJUNTO de roles que el helper admite internamente, no solo el
 * rol "de su nombre". Ejemplo: `ambitoPorInmuebleLectura()` es
 * `esAdminInmuebles() || (activeUser() && (pid en mi ámbito || índice parcial))`,
 * así que puede conceder a MASTER, ADMINISTRADOR, PROPIETARIO y GESTOR. Reducirlo
 * a "propietario" sería una simplificación que ocultaría capacidad real.
 *
 * `relacion: true` marca permisos que dependen de la RELACIÓN del usuario con el
 * documento (inmueble/contrato/incidencia/orden), no del rol por sí solo.
 */
const PREDICADOS = [
  { nombre: 'isMasterAdmin', patron: /isMasterAdmin\s*\(/, roles: ['MASTER'] },
  { nombre: 'esAdminInmuebles', patron: /esAdminInmuebles\s*\(/, roles: ['MASTER', 'ADMINISTRADOR'] },
  { nombre: 'isStaff', patron: /isStaff\s*\(/, roles: ['MASTER', 'GESTOR'] },
  { nombre: 'personalDesdeEspejo', patron: /personalDesdeEspejo\s*\(/, roles: ['GESTOR'] },
  { nombre: 'perfilAdministrador', patron: /tipoPerfil\s*==\s*'ADMINISTRADOR'/, roles: ['ADMINISTRADOR'] },
  { nombre: 'isPropietarioRole', patron: /isPropietarioRole\s*\(/, roles: ['PROPIETARIO'] },
  { nombre: 'perfilPropietario', patron: /tipoPerfil\s*==\s*'PROPIETARIO'/, roles: ['PROPIETARIO'] },
  {
    nombre: 'ámbito por inmueble/contrato',
    patron: /ambitoPorInmueble(Lectura|Escritura)\s*\(|ambitoPorContrato(Lectura|Escritura)\s*\(|pidEnAmbito(Lectura|Escritura)\s*\(|puedo(Leer|Escribir)TitularidadDe\s*\(|titular(DeAmbitoPropio|AsignableEnAmbito)\s*\(|gestionInvolucraAMi\s*\(/,
    roles: ['MASTER', 'ADMINISTRADOR', 'PROPIETARIO', 'GESTOR'],
    relacion: true,
  },
  {
    nombre: 'titularidad del inmueble',
    patron: /inmuebleEsMio\s*\(|canReachInmuebleId\s*\(|myInmuebleIds\s*\(|ownsPropietario\s*\(/,
    roles: ['PROPIETARIO'],
    relacion: true,
  },
  {
    nombre: 'ámbito aislado del propietario',
    patron: /aislado(Create|Update|Read)Ok\s*\(/,
    roles: ['PROPIETARIO'],
    relacion: true,
  },
  { nombre: 'contratoEsMio', patron: /contratoEsMio\s*\(/, roles: ['PROPIETARIO', 'INQUILINO'], relacion: true },
  { nombre: 'isProfesionalRole', patron: /isProfesionalRole\s*\(/, roles: ['PROFESIONAL'] },
  { nombre: 'perfilProfesional', patron: /tipoPerfil\s*==\s*'PROFESIONAL'/, roles: ['PROFESIONAL'] },
  {
    nombre: 'incidenciaAsignadaAmi',
    patron: /incidenciaAsignadaAmi\s*\(/,
    roles: ['PROFESIONAL'],
    relacion: true,
  },
  {
    nombre: 'conciliación bancaria (titular)',
    patron: /conciliacionEsMia\s*\(|actorEnAmbito\s*\(/,
    roles: ['MASTER', 'PROPIETARIO'],
    relacion: true,
  },
  {
    nombre: 'operaciones (acceso por propietario)',
    patron: /op(Lectura|Escritura)\s*\(/,
    roles: ['MASTER', 'PROPIETARIO', 'GESTOR', 'ADMINISTRADOR'],
    relacion: true,
  },
  {
    nombre: 'sindicación (estado por inmueble)',
    patron: /actorPuedeEscribirEstado\s*\(/,
    roles: ['MASTER', 'PROPIETARIO'],
    relacion: true,
  },
  { nombre: 'isTenant', patron: /isTenant\s*\(|tenantContratoIds\s*\(/, roles: ['INQUILINO'] },
  { nombre: 'perfilInquilino', patron: /tipoPerfil\s*==\s*'INQUILINO'/, roles: ['INQUILINO'] },
];

/** Permiso sobre el PROPIO registro (relación, no rol). */
const PROPIO = [/request\.auth\.uid\s*==\s*uid/, /request\.auth\.uid\s*==\s*\w+Id/];

export function clasificarCondicion(condicion) {
  const c = String(condicion).trim();
  if (c === 'false') return { clase: 'DENEGADO', roles: [], porRelacion: false, predicados: [] };
  if (c === 'true') return { clase: 'PUBLICO', roles: ['PUBLICO'], porRelacion: false, predicados: [] };

  const roles = new Set();
  const predicados = [];
  let porRelacion = false;
  for (const p of PREDICADOS) {
    if (p.patron.test(c)) {
      p.roles.forEach((r) => roles.add(r));
      predicados.push(p.nombre);
      if (p.relacion) porRelacion = true;
    }
  }
  const propio = PROPIO.some((p) => p.test(c));
  if (roles.size) return { clase: 'ROL', roles: [...roles], porRelacion, propio, predicados };
  if (propio) return { clase: 'PROPIO', roles: ['AUTENTICADO_PROPIO'], porRelacion: false, propio: true, predicados };
  if (/isSignedIn\s*\(/.test(c)) return { clase: 'AUTENTICADO', roles: ['AUTENTICADO'], porRelacion, propio: false, predicados };
  return { clase: 'DESCONOCIDO', roles: [], porRelacion, propio: false, predicados, condicion: c };
}

/** Aplana `get,list` → get, list; `update,delete` → update, delete. */
function expandirOps(ops) {
  return ops.flatMap((o) => o.split(',')).map((o) => o.trim()).filter(Boolean);
}

/**
 * `read` cubre `get` + `list`; `write` cubre `create`, `update`, `delete`.
 * Se expanden para poder comparar celda a celda con la matriz de la orden.
 */
function expandirLecturaEscritura(ops) {
  const out = new Set();
  for (const o of ops) {
    if (o === 'read') { out.add('get'); out.add('list'); }
    else if (o === 'write') { out.add('create'); out.add('update'); out.add('delete'); }
    else out.add(o);
  }
  return [...out];
}

const OPERACIONES = ['lectura', 'creacion', 'modificacion', 'eliminacion'];
const MAPA_OP = { get: 'lectura', list: 'lectura', create: 'creacion', update: 'modificacion', delete: 'eliminacion' };

export function construirMatriz(inventario) {
  return inventario.colecciones.map((c) => {
    const celdas = Object.fromEntries(OPERACIONES.map((op) => [op, { clase: 'DENEGADO', roles: [], detalle: [] }]));

    // `permite` es un objeto { "read": "cond", "create,update": "cond" }.
    for (const [claveOps, condicion] of Object.entries(c.permite)) {
      const ops = expandirLecturaEscritura(expandirOps([claveOps]));
      const cls = clasificarCondicion(condicion);
      for (const op of ops) {
        const celda = MAPA_OP[op];
        if (!celda) continue;
        // Regla de composición: gana la autorización más permisiva.
        const actual = celdas[celda];
        if (actual.clase === 'DESCONOCIDO') continue;
        if (cls.clase === 'DENEGADO') { continue; }
        if (actual.clase === 'DENEGADO') {
          celdas[celda] = { clase: cls.clase, roles: [...cls.roles], porRelacion: cls.porRelacion, detalle: [condicion] };
        } else {
          celdas[celda].roles = [...new Set([...actual.roles, ...cls.roles])];
          celdas[celda].porRelacion = actual.porRelacion || cls.porRelacion;
          celdas[celda].detalle.push(condicion);
          if (cls.clase === 'DESCONOCIDO') celdas[celda].clase = 'DESCONOCIDO';
        }
      }
    }
    return { coleccion: c.coleccion, linea: c.linea, celdas };
  });
}

function markdown(matriz) {
  const simbolo = (c) => {
    if (c.clase === 'DENEGADO') return '—';
    if (c.clase === 'PUBLICO') return 'TODOS';
    if (c.clase === 'DESCONOCIDO') return '⚠';
    const r = c.roles.filter((x) => x !== 'AUTENTICADO_PROPIO').join('+');
    return r || (c.rolES || 'AUTENTICADO');
  };
  const L = [];
  L.push('# P0-A · Matriz rol × operación');
  L.push('');
  L.push(`Generada automáticamente desde \`firestore.rules\` (${matriz.length} colecciones).`);
  L.push('Leyenda: **—** denegado · **TODOS** público · **⚠** condición no clasificada ·');
  L.push('roles separados por `+` · **AUTENTICADO** = cualquier sesión sin rol específico.');
  L.push('');
  L.push('> Clasificación por PREDICADO de rol presente en la condición, no por');
  L.push('> interpretación de la lógica. Las celdas con rol + ámbito de relación');
  L.push('> (inmueble/contrato/incidencia) se marcan con `·rel` en el JSON.');
  L.push('');
  L.push('| Colección | Lectura | Creación | Modificación | Eliminación |');
  L.push('|---|---|---|---|---|');
  for (const f of matriz) {
    const cel = (op) => {
      const c = f.celdas[op];
      const s = simbolo(c);
      return c.porRelacion && s !== '—' ? `${s}·rel` : s;
    };
    L.push(`| \`${f.coleccion}\` | ${cel('lectura')} | ${cel('creacion')} | ${cel('modificacion')} | ${cel('eliminacion')} |`);
  }
  return L.join('\n');
}

const inventario = inventariarFirestore(resolve(RAIZ, 'firestore.rules'));
const matriz = construirMatriz(inventario);

const desconocidas = [];
for (const f of matriz) {
  for (const op of OPERACIONES) {
    if (f.celdas[op].clase === 'DESCONOCIDO') desconocidas.push({ coleccion: f.coleccion, operacion: op, detalle: f.celdas[op].detalle });
  }
}

const salida = {
  generadoEn: new Date().toISOString(),
  commit: process.env.GIT_COMMIT || null,
  totalColecciones: matriz.length,
  celdasDesconocidas: desconocidas,
  matriz,
};

if (process.argv.includes('--json-out')) {
  const i = process.argv.indexOf('--json-out');
  const ruta = resolve(RAIZ, process.argv[i + 1]);
  writeFileSync(ruta, JSON.stringify(salida, null, 2), 'utf8');
  console.log(`[p0] matriz en ${ruta}`);
}
if (process.argv.includes('--md-out')) {
  const i = process.argv.indexOf('--md-out');
  const ruta = resolve(RAIZ, process.argv[i + 1]);
  writeFileSync(ruta, markdown(matriz) + '\n', 'utf8');
  console.log(`[p0] matriz en ${ruta}`);
}
if (!process.argv.includes('--json-out') && !process.argv.includes('--md-out')) {
  console.log(markdown(matriz));
}

if (desconocidas.length) {
  console.error(`\n❌ ${desconocidas.length} celdas DESCONOCIDAS (revisión manual requerida):`);
  for (const d of desconocidas.slice(0, 20)) console.error(`   ${d.coleccion} · ${d.operacion} → ${d.detalle}`);
  process.exit(1);
}
