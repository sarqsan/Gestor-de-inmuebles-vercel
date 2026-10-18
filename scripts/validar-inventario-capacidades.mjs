#!/usr/bin/env node
/**
 * Valida el inventario funcional canónico y genera sus recuentos por módulo.
 * La matriz detallada de MAPA-MAESTRO-ERP-INVENTARIO-2026-10-16.md es la única
 * fuente; el registro y el resumen se cotejan contra sus IDs en cada ejecución.
 * Uso: node scripts/validar-inventario-capacidades.mjs [--actualizar]
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'docs/anexos/MAPA-MAESTRO-ERP-INVENTARIO-2026-10-16.md');
const actualiza = process.argv.includes('--actualizar');
const estadosValidos = new Set(['CERRADA', 'A_MEDIAS', 'SIN_EMPEZAR', 'BLOQUEADA', 'DESCARTADA']);
const idsValidos = new Set();
const texto = await readFile(file, 'utf8');
const marcadorRegistro = '<!-- REGISTRO_CAPACIDADES_INICIO -->';
const marcadorRegistroFin = '<!-- REGISTRO_CAPACIDADES_FIN -->';
const marcadorResumen = '<!-- RESUMEN_CAPACIDADES_INICIO -->';
const marcadorResumenFin = '<!-- RESUMEN_CAPACIDADES_FIN -->';

function exigir(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

function celdas(linea) {
  return linea.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((valor) => valor.trim());
}

const inicioRegistro = texto.indexOf(marcadorRegistro);
const finRegistro = texto.indexOf(marcadorRegistroFin);
exigir(inicioRegistro >= 0 && finRegistro > inicioRegistro, 'Faltan los marcadores del registro funcional.');
const antesRegistro = texto.slice(0, inicioRegistro);
const seccionRegistro = texto.slice(inicioRegistro + marcadorRegistro.length, finRegistro);

let modulo = '';
let cabeceraDetalle = null;
let indiceFase = -1;
let indiceDependencias = -1;
let indiceCriterio = -1;
const detalles = new Map();
for (const linea of antesRegistro.split(/\r?\n/)) {
  const titulo = /^##\s+(.+)$/.exec(linea);
  if (titulo) modulo = titulo[1].trim();
  const encabezado = /^\|\s*ID\s*\|/.test(linea);
  if (encabezado) {
    cabeceraDetalle = celdas(linea);
    indiceFase = cabeceraDetalle.findIndex((celda) => /Fase técnica/i.test(celda));
    if (indiceFase < 0) indiceFase = cabeceraDetalle.findIndex((celda) => /^Fase$/i.test(celda));
    indiceDependencias = cabeceraDetalle.findIndex((celda) => /Dependencias?/i.test(celda));
    indiceCriterio = cabeceraDetalle.findIndex((celda) => /Criterio|Decisión de cierre/i.test(celda));
  }
  const coincidencia = /^\|\s*([A-Z]+-\d+)\s*\|/.exec(linea);
  if (!coincidencia) continue;
  exigir(cabeceraDetalle && indiceFase >= 0, `No se encontró columna de fase para ${coincidencia[1]}.`);
  exigir(indiceDependencias >= 0, `No se encontró columna de dependencias para ${coincidencia[1]}.`);
  exigir(indiceCriterio >= 0, `No se encontró columna de criterio/decisión para ${coincidencia[1]}.`);
  exigir(!idsValidos.has(coincidencia[1]), `ID de detalle duplicado: ${coincidencia[1]}.`);
  const fila = celdas(linea);
  exigir(fila.length > indiceFase && fila[indiceFase].length > 0, `Fase técnica ausente en ${coincidencia[1]}.`);
  detalles.set(coincidencia[1], {
    modulo,
    fase: fila[indiceFase],
    dependencias: fila[indiceDependencias],
    criterio: fila[indiceCriterio],
  });
  idsValidos.add(coincidencia[1]);
}

const filasRegistro = seccionRegistro.split(/\r?\n/).filter((linea) => /^\|\s*[A-Z]+-\d+\s*\|/.test(linea));
const registros = [];
const idsRegistro = new Set();
for (const linea of filasRegistro) {
  const fila = celdas(linea);
  exigir(fila.length >= 6, `Fila de registro incompleta: ${linea}`);
  const [id, grupo, estado, fase, relaciones, decision] = fila;
  exigir(!idsRegistro.has(id), `ID de registro duplicado: ${id}.`);
  exigir(estadosValidos.has(estado), `${id}: estado funcional inválido (${estado}).`);
  exigir(grupo.length > 0, `${id}: falta módulo.`);
  exigir(relaciones.length > 0, `${id}: falta declarar relaciones (use «—» si no hay relación directa).`);
  exigir(decision.length > 0, `${id}: falta decisión (use «—» si no está descartada).`);
  if (estado === 'DESCARTADA') {
    exigir(/^—/.test(fase), `${id}: una capacidad descartada no debe conservar fase pendiente.`);
    exigir(decision !== '—', `${id}: falta registrar la decisión de descarte.`);
  } else {
    exigir(fase.length > 0 && !/^—/.test(fase), `${id}: pendiente huérfano sin fase asignada.`);
    exigir(decision === '—', `${id}: una capacidad activa no debe tener una decisión de descarte.`);
  }
  const detalle = detalles.get(id);
  exigir(detalle, `${id}: falta su ficha detallada.`);
  exigir(detalle.fase && (estado === 'DESCARTADA' || !/^—/.test(detalle.fase)), `${id}: fase detallada incoherente con su estado.`);
  if (estado !== 'DESCARTADA') {
    exigir(detalle.dependencias && detalle.dependencias !== '—' && detalle.dependencias.length >= 20,
      `${id}: capacidad activa sin dependencia concreta en la ficha detallada.`);
    exigir(detalle.criterio && detalle.criterio.length >= 60,
      `${id}: capacidad activa sin criterio de cierre concreto en la ficha detallada.`);
  }
  for (const relacionado of relaciones.match(/[A-Z]+-\d+/g) ?? []) {
    exigir(idsValidos.has(relacionado) || filasRegistro.some((r) => celdas(r)[0] === relacionado), `${id}: relación desconocida ${relacionado}.`);
  }
  registros.push({ id, grupo, estado, fase, relaciones, decision });
  idsRegistro.add(id);
}

const faltanRegistro = [...idsValidos].filter((id) => !idsRegistro.has(id));
const sobranRegistro = [...idsRegistro].filter((id) => !idsValidos.has(id));
exigir(faltanRegistro.length === 0, `IDs detallados sin registro funcional: ${faltanRegistro.join(', ')}.`);
exigir(sobranRegistro.length === 0, `IDs en registro sin ficha detallada: ${sobranRegistro.join(', ')}.`);
exigir(registros.length === idsValidos.size, 'Los recuentos de detalle y registro no coinciden.');

const estados = ['CERRADA', 'A_MEDIAS', 'SIN_EMPEZAR', 'BLOQUEADA', 'DESCARTADA'];
const porModulo = new Map();
for (const fila of registros) {
  const grupo = porModulo.get(fila.grupo) ?? Object.fromEntries([['Total', 0], ...estados.map((estado) => [estado, 0])]);
  grupo.Total += 1;
  grupo[fila.estado] += 1;
  porModulo.set(fila.grupo, grupo);
}
const filasResumen = [...porModulo.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'));
const total = Object.fromEntries([['Total', 0], ...estados.map((estado) => [estado, 0])]);
for (const [, recuento] of filasResumen) {
  for (const clave of Object.keys(total)) total[clave] += recuento[clave];
}
const cabecera = '| Módulo | Total | CERRADA | A_MEDIAS | SIN_EMPEZAR | BLOQUEADA | DESCARTADA |';
const separador = '|---|---:|---:|---:|---:|---:|---:|';
const lineasTabla = [cabecera, separador];
for (const [nombre, recuento] of filasResumen) {
  lineasTabla.push(`| ${nombre} | ${recuento.Total} | ${recuento.CERRADA} | ${recuento.A_MEDIAS} | ${recuento.SIN_EMPEZAR} | ${recuento.BLOQUEADA} | ${recuento.DESCARTADA} |`);
}
lineasTabla.push(`| **TOTAL** | **${total.Total}** | **${total.CERRADA}** | **${total.A_MEDIAS}** | **${total.SIN_EMPEZAR}** | **${total.BLOQUEADA}** | **${total.DESCARTADA}** |`);
const tablaResumen = lineasTabla.join('\n');

const resumenInicio = texto.indexOf(marcadorResumen);
const resumenFin = texto.indexOf(marcadorResumenFin);
exigir(resumenInicio >= 0 && resumenFin > resumenInicio, 'Faltan los marcadores del resumen calculado.');
if (actualiza) {
  const nuevoTexto = texto.slice(0, resumenInicio + marcadorResumen.length)
    + `\n${tablaResumen}\n`
    + texto.slice(resumenFin);
  await writeFile(file, nuevoTexto, 'utf8');
}

const textoFinal = actualiza ? await readFile(file, 'utf8') : texto;
const resumenGuardado = textoFinal.slice(
  textoFinal.indexOf(marcadorResumen) + marcadorResumen.length,
  textoFinal.indexOf(marcadorResumenFin),
).trim();
exigir(resumenGuardado === tablaResumen, 'El resumen publicado no coincide con el recuento calculado. Ejecuta con --actualizar.');
console.log(`Inventario válido: ${idsValidos.size} fichas únicas; ${registros.length} estados, fases, relaciones por ID y criterios/dependencias estructuralmente verificados.`);
console.log(tablaResumen);
