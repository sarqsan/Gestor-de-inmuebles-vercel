/**
 * ORDEN 2 — Regresión transversal de `gestiones_cartera`.
 *
 * Pines que deben fallar si alguien reinterpreta el modelo maestro:
 *  · S1: el rol patrimonial NO es el operativo; el operativo queda byte-estable.
 *  · Máquina de estados cerrada (matriz completa).
 *  · Importación: el destino SOLO sale de `propietarioDestinoId` (el ejecutor
 *    no puede influir ni como fallback).
 *  · Sin constructores de consulta global en el bloque.
 *  · Rules: escritura de `gestiones_cartera` SOLO master (pin de fuente).
 *  · Núcleo sin Firebase (pin de fuente; solo el adaptador importa Firebase).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROL_GESTOR_INMUEBLES_OPERATIVO,
  ROL_GESTOR_PATRIMONIAL,
  transicionPermitida,
  type EstadoGestionCartera,
  type TipoEventoGestion,
} from '../src/lib/gestionesCartera';
import * as accesoGestores from '../src/lib/accesoGestores';
import * as servicio from '../src/lib/gestionesCarteraServicio';
import { ROLES_PREDEFINIDOS } from '../src/types';
import {
  previsualizarImportacion,
  resolverDestinoImportacion,
} from '../src/features/patrimonial/importPreview.ts';
import type {
  ContextoPrevisualizacion,
  SolicitudPrevisualizacion,
} from '../src/features/patrimonial/contracts.ts';

describe('gestiones-cartera · regresión', () => {
  it('R1 · S1: rol patrimonial ≠ operativo; GESTOR_INMUEBLES intacto', () => {
    expect(ROL_GESTOR_PATRIMONIAL).toBe('GESTOR_PATRIMONIAL');
    expect(ROL_GESTOR_INMUEBLES_OPERATIVO).toBe('GESTOR_INMUEBLES');
    const operativo = ROLES_PREDEFINIDOS.find((r) => r.id === 'GESTOR_INMUEBLES');
    expect(operativo).toMatchObject({
      id: 'GESTOR_INMUEBLES',
      nombre: 'Gestor de Inmuebles & Alquileres',
      descripcion: 'Gestión operativa de candidatos, visitas, contratos y seguros',
    });
    // Permisos operativos EXACTOS: ni se amplían a carteras ni se recortan.
    expect(operativo?.permisos).toEqual([
      'inmuebles.ver', 'inmuebles.crear', 'inmuebles.editar',
      'candidatos.ver', 'candidatos.crear', 'candidatos.editar',
      'contratos.ver', 'contratos.crear',
      'seguros.ver', 'seguros.crear', 'seguros.tramitar',
      'profesionales.ver',
      'inquilinos.ver', 'inquilinos.gestionar',
      'suministros.ver', 'suministros.gestionar',
    ]);
  });

  it('R2 · matriz de transiciones cerrada (4 estados × 10 eventos)', () => {
    const estados: EstadoGestionCartera[] = ['PENDIENTE_ACEPTACION', 'ACTIVA', 'SUSPENDIDA', 'REVOCADA'];
    const eventos: TipoEventoGestion[] = [
      'ALTA', 'INVITACION', 'ACEPTACION', 'ACTIVACION', 'SUSPENSION',
      'REACTIVACION', 'CESION', 'DEVOLUCION', 'CAMBIO_PERMISOS', 'REVOCACION',
    ];
    const matriz = Object.fromEntries(
      estados.map((e) => [e, eventos.filter((t) => transicionPermitida(e, t)).sort()])
    );
    expect(matriz).toEqual({
      PENDIENTE_ACEPTACION: ['ACEPTACION', 'ACTIVACION', 'ALTA', 'INVITACION', 'REVOCACION'],
      ACTIVA: ['CAMBIO_PERMISOS', 'CESION', 'DEVOLUCION', 'REVOCACION', 'SUSPENSION'],
      SUSPENDIDA: ['REACTIVACION', 'REVOCACION'],
      REVOCADA: [],
    });
  });

  it('R3 · importación: destino SOLO de propietarioDestinoId (ejecutor no influye)', () => {
    const contexto: ContextoPrevisualizacion = {
      propietarios: [{ id: 'prop_santiago', nombre: 'Santiago' }],
      propietariosPermitidosIds: ['prop_santiago'],
      reglasPorRegistro: [null],
    };
    const solicitud = {
      datosOrigen: [{ direccion: 'Calle Luna 1' }],
      propietarioDestinoId: 'prop_santiago',
    } as SolicitudPrevisualizacion;
    const base = previsualizarImportacion(solicitud, contexto);
    expect(base.destino.estado).toBe('VALIDO');
    // Campos pícaros de "ejecutor" en solicitud Y contexto: se ignoran.
    const solicitudPícara = {
      ...solicitud,
      cuentaEjecutora: 'prop_otro',
      propietarioId: 'prop_otro',
    } as unknown as SolicitudPrevisualizacion;
    const contextoPícaro = {
      ...contexto,
      cuentaEjecutora: 'prop_otro',
      ejecutadoPor: 'uid_otro',
    } as unknown as ContextoPrevisualizacion;
    const picara = previsualizarImportacion(solicitudPícara, contextoPícaro);
    expect(picara.destino).toEqual(base.destino);
    // Sin destino explícito NO hay fallback al ejecutor: AUSENTE bloquea.
    const sinDestino = { ...solicitudPícara, propietarioDestinoId: null };
    const bloqueada = resolverDestinoImportacion(sinDestino.propietarioDestinoId, contextoPícaro);
    expect(bloqueada.estado).toBe('AUSENTE');
    expect(bloqueada.propietarioDestinoId).toBeNull();
  });

  it('R4 · sin constructores de consulta global en el bloque', () => {
    for (const [nombre, mod] of [
      ['accesoGestores', accesoGestores],
      ['servicio', servicio],
    ] as const) {
      for (const clave of Object.keys(mod)) {
        expect(clave, `${nombre}.${clave}`).not.toMatch(/global|todas|Todas|Todo$/);
      }
    }
    expect('especificarGestionesDePropietario' in accesoGestores).toBe(true);
    expect('especificarGestionesDeGestor' in accesoGestores).toBe(true);
  });

  it('R5 · rules: escritura de gestiones_cartera SOLO master (pin de fuente)', () => {
    const rules = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf-8');
    const bloque = rules.match(/match \/gestiones_cartera\/\{gestionId\} \{[\s\S]*?\n    \}/);
    expect(bloque, 'bloque gestiones_cartera ausente en rules').not.toBeNull();
    expect(bloque![0]).toMatch(/allow create: if isMasterAdmin\(\) && auditoriaVinculada\(/);
    expect(bloque![0]).toMatch(/allow update: if isMasterAdmin\(\) && auditoriaNueva\(/);
    expect(bloque![0]).toMatch(/allow delete: if false/);
    expect(bloque![0]).not.toMatch(/allow create[^:]*: if [^;]*esAdminInmuebles/);
  });

  it('R6 · núcleo sin Firebase (pin de fuente; solo el adaptador lo importa)', () => {
    const sinComentarios = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const f of ['accesoGestores.ts', 'gestionesCarteraServicio.ts', 'gestionesCartera.ts', 'carterasGestion.ts']) {
      const src = sinComentarios(readFileSync(join(__dirname, '..', 'src', 'lib', f), 'utf-8'));
      expect(src, f).not.toMatch(/from ['\"]firebase|from ['\"]@firebase|firebase-admin/);
    }
    const adapter = readFileSync(
      join(__dirname, '..', 'src', 'lib', 'gestionesCarteraServicioFirebase.ts'), 'utf-8'
    );
    expect(adapter).toMatch(/from 'firebase\/firestore'/);
  });
});
