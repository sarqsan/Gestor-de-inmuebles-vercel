/**
 * BLOQUE 10 · UX-2 — CANAL DE INCIDENCIAS Y AGREGACIÓN DE ESTADOS DE LECTURA.
 *
 * Cubre los hallazgos C1–C4 de la inspección:
 *  - C1: un origen pendiente NO es `LISTO` → ninguna pantalla puede afirmar «sin datos».
 *  - C2: un fallo de lectura registra incidencia y deja el origen en `ERROR`
 *        (nunca se traduce en una lista vacía).
 *  - C3: un fallo de guardado registra incidencia (el guardado no se presenta como éxito).
 *  - C4: los orígenes activos por perfil son los que el host suscribe realmente.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  calcularEstadoDatosPantalla,
  codigoDeError,
  descartarIncidencias,
  descartarIncidencia,
  estadoDeLectura,
  etiquetaOrigen,
  incidenciasDatos,
  incidenciasPendientes,
  limpiarIncidenciasDe,
  mensajeLegible,
  origenesActivosDePerfil,
  origenesDePantalla,
  reiniciarCanalIncidencias,
  reportarErrorGuardado,
  reportarErrorLectura,
  reportarResultadoGuardado,
  sembrarEstados,
  ultimaIncidenciaDe,
} from './canalIncidencias';

beforeEach(() => {
  reiniciarCanalIncidencias();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UX-2 · C1 — estado de lectura por pantalla', () => {
  it('un origen pendiente deja la pantalla en CARGANDO (nunca LISTO)', () => {
    const mapa = sembrarEstados(['inmuebles', 'contratos']);
    expect(estadoDeLectura(mapa, 'inmuebles')).toBe('CARGANDO');

    const estado = calcularEstadoDatosPantalla(['inmuebles', 'contratos'], mapa);
    expect(estado.estado).toBe('CARGANDO');
    expect(estado.pendientes).toEqual(['inmuebles', 'contratos']);
  });

  it('la pantalla solo queda LISTO cuando TODAS sus lecturas terminaron', () => {
    const mapa = sembrarEstados(['inmuebles', 'contratos']);
    expect(calcularEstadoDatosPantalla(['inmuebles', 'contratos'], mapa).estado).toBe('CARGANDO');

    const parcial = { ...mapa, inmuebles: 'LISTO' as const };
    expect(calcularEstadoDatosPantalla(['inmuebles', 'contratos'], parcial).estado).toBe('CARGANDO');

    const completo = { ...parcial, contratos: 'LISTO' as const };
    // LISTO = lectura terminada con cero o más elementos: aquí el vacío ya es legítimo.
    expect(calcularEstadoDatosPantalla(['inmuebles', 'contratos'], completo).estado).toBe('LISTO');
  });

  it('las lecturas que la pantalla NO necesita no la bloquean', () => {
    // `inquilinos` declara `usuarios` (solo activo para ADMINISTRADOR). Para el resto
    // de perfiles ese origen no existe en el mapa y no puede dejar la pantalla en carga.
    expect(origenesDePantalla('inquilinos')).toContain('usuarios');
    expect(estadoDeLectura({}, 'usuarios')).toBe('LISTO');
    expect(calcularEstadoDatosPantalla(origenesDePantalla('inquilinos'), {}).estado).toBe('LISTO');
  });

  it('ERROR tiene prioridad sobre CARGANDO (si algo falló, se dice)', () => {
    const mapa = { inmuebles: 'LISTO' as const, contratos: 'CARGANDO' as const, gastos: 'ERROR' as const };
    const estado = calcularEstadoDatosPantalla(['inmuebles', 'contratos', 'gastos'], mapa);
    expect(estado.estado).toBe('ERROR');
    expect(estado.conError).toEqual(['gastos']);
    expect(estado.pendientes).toEqual(['contratos']);
  });
});

describe('UX-2 · C2 — fallos de lectura: nunca se convierten en []', () => {
  it('reportarErrorLectura registra la incidencia con su origen', () => {
    reportarErrorLectura('inmuebles', { code: 'permission-denied' });

    const lectura = incidenciasPendientes('LECTURA');
    expect(lectura).toHaveLength(1);
    expect(lectura[0].origen).toBe('inmuebles');
    expect(lectura[0].codigo).toBe('permission-denied');
    expect(ultimaIncidenciaDe('inmuebles', 'LECTURA')?.id).toBe(lectura[0].id);
    // El aviso de guardado no se contamina con fallos de lectura.
    expect(incidenciasPendientes('GUARDADO')).toHaveLength(0);
  });

  it('los fallos de lectura NO crean datos: el error es un estado, no una lista vacía', () => {
    // El canal no expone ninguna estructura de datos de negocio: solo el estado de
    // cada lectura y las incidencias. Un fallo de lectura se representa con ERROR y
    // jamás con una colección vacía (`[]`), que es lo que producía el falso vacío.
    reportarErrorLectura('contratos', { code: 'unavailable' });
    expect(incidenciasDatos()).toHaveLength(1);

    const estado = calcularEstadoDatosPantalla(['contratos'], { contratos: 'ERROR' });
    expect(estado.estado).toBe('ERROR');
    expect(Object.keys(estado).sort()).toEqual(['conError', 'estado', 'pendientes']);
    expect(estado.estado).not.toBe('LISTO');
    expect(JSON.stringify(estado)).not.toContain('"datos"');
  });

  it('reintentar la lectura limpia las incidencias de los orígenes reintentados', () => {
    reportarErrorLectura('inmuebles', { code: 'unavailable' });
    reportarErrorLectura('contratos', { code: 'unavailable' });
    reportarErrorGuardado('inmuebles', { code: 'permission-denied' });

    limpiarIncidenciasDe(['inmuebles', 'contratos'], 'LECTURA');

    expect(incidenciasPendientes('LECTURA')).toHaveLength(0);
    // El fallo de guardado no es un fallo de lectura: no se limpia al reintentar la lectura.
    expect(incidenciasPendientes('GUARDADO')).toHaveLength(1);
    expect(ultimaIncidenciaDe('inmuebles', 'GUARDADO')?.codigo).toBe('permission-denied');
  });

  it('una sola incidencia vigente por origen y tipo (sin duplicar el aviso)', () => {
    reportarErrorLectura('inmuebles', { code: 'unavailable' });
    reportarErrorLectura('inmuebles', { code: 'permission-denied' });

    const lectura = incidenciasPendientes('LECTURA');
    expect(lectura).toHaveLength(1);
    expect(lectura[0].codigo).toBe('permission-denied');
  });
});

describe('UX-2 §8 — registro técnico: el detalle se queda en consola', () => {
  it('reportarErrorLectura conserva la traza técnica con la etiqueta de la capa de datos', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    reportarErrorLectura('inmuebles', { code: 'permission-denied' }, 'Firestore inmuebles snapshot error:');

    expect(error).toHaveBeenCalledWith('Firestore inmuebles snapshot error:', { code: 'permission-denied' });
    // El detalle técnico NO viaja al mensaje de la persona usuaria.
    const incidencia = ultimaIncidenciaDe('inmuebles', 'LECTURA');
    expect(incidencia?.mensaje).not.toContain('Firestore');
    expect(incidencia?.codigo).toBe('permission-denied');
  });

  it('reportarErrorGuardado deja traza del fallo de persistencia', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    reportarErrorGuardado('gastos', { code: 'unavailable' }, 'Error saving gastos to Firestore:');

    expect(error).toHaveBeenCalledWith('Error saving gastos to Firestore:', { code: 'unavailable' });
  });

  it('reportarResultadoGuardado deja traza del resultado negativo sin duplicar el error original', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    reportarResultadoGuardado('inmuebles', false);

    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(ultimaIncidenciaDe('inmuebles', 'GUARDADO')).toBeDefined();
  });
});

describe('UX-2 · C3 — fallos de guardado visibles', () => {
  it('reportarErrorGuardado deja el fallo como incidencia de GUARDADO', () => {
    reportarErrorGuardado('gastos', { code: 'deadline-exceeded' });

    const guardado = incidenciasPendientes('GUARDADO');
    expect(guardado).toHaveLength(1);
    expect(guardado[0].etiqueta).toBe('Gastos');
    expect(guardado[0].mensaje).toMatch(/no se pudieron guardar/i);
  });

  it('reportarResultadoGuardado: un `true` no genera aviso (no todo es un error)', () => {
    reportarResultadoGuardado('inmuebles', true);
    expect(incidenciasDatos()).toHaveLength(0);
  });

  it('reportarResultadoGuardado: un `false` avisa de que la persistencia no confirmó', () => {
    reportarResultadoGuardado('inmuebles', false);

    const incidencia = ultimaIncidenciaDe('inmuebles', 'GUARDADO');
    expect(incidencia).toBeDefined();
    expect(incidencia?.codigo).toBe('escritura-rechazada');
    expect(incidencia?.mensaje).toBe('No se han podido guardar los cambios.');
  });

  it('reportarResultadoGuardado conserva el error original si se aporta', () => {
    reportarResultadoGuardado('invitaciones', false, { code: 'permission-denied' });

    const incidencia = ultimaIncidenciaDe('invitaciones', 'GUARDADO');
    expect(incidencia?.codigo).toBe('permission-denied');
    expect(incidencia?.mensaje).toMatch(/permisos/i);
  });

  it('descartar incidencias deja el canal vacío (aviso descartable por la persona usuaria)', () => {
    reportarErrorGuardado('gastos', { code: 'unavailable' });
    const id = incidenciasDatos()[0].id;

    descartarIncidencia(id);
    expect(incidenciasDatos()).toHaveLength(0);

    reportarErrorLectura('gastos', { code: 'unavailable' });
    descartarIncidencias();
    expect(incidenciasDatos()).toHaveLength(0);
  });
});

describe('UX-2 §8/§10 — mensajes accionables y sin detalles técnicos', () => {
  it('el mensaje por defecto es el exigido por la orden', () => {
    expect(mensajeLegible('desconocido', 'LECTURA')).toBe('No se han podido cargar los datos.');
    expect(mensajeLegible('desconocido', 'GUARDADO')).toBe('No se han podido guardar los cambios.');
  });

  it('ningún mensaje de usuario filtra códigos ni nombres del SDK', () => {
    const codigos = [
      'permission-denied',
      'unauthenticated',
      'unavailable',
      'deadline-exceeded',
      'failed-precondition',
      'resource-exhausted',
      'network-request-failed',
      'storage/unauthorized',
      'desconocido',
    ];
    for (const codigo of codigos) {
      for (const tipo of ['LECTURA', 'GUARDADO'] as const) {
        const mensaje = mensajeLegible(codigo, tipo);
        expect(mensaje).not.toMatch(/firebase|firestore|storage|permission-denied|code[:=]/i);
        expect(mensaje.length).toBeGreaterThan(20);
      }
    }
  });

  it('codigoDeError extrae el código técnico que queda en consola', () => {
    expect(codigoDeError({ code: 'permission-denied' })).toBe('permission-denied');
    expect(codigoDeError(new Error('7 PERMISSION_DENIED: Missing or insufficient permissions'))).toBe(
      'permission-denied'
    );
    expect(codigoDeError(undefined)).toBe('desconocido');
  });

  it('etiquetaOrigen traduce los orígenes conocidos y conserva los desconocidos', () => {
    expect(etiquetaOrigen('inmuebles')).toBe('Inmuebles');
    expect(etiquetaOrigen('origen_inventado')).toBe('origen_inventado');
  });
});

describe('UX-2 · C4 — lecturas activas por perfil', () => {
  it('ADMINISTRADOR incluye las lecturas exclusivas de administración', () => {
    const activos = origenesActivosDePerfil('ADMINISTRADOR', null);
    expect(activos).toEqual(expect.arrayContaining(['morosidad', 'aseguradoras', 'gmail_config', 'usuarios', 'audit_logs']));
    expect(activos).toEqual(expect.arrayContaining(['inmuebles', 'contratos', 'gastos', 'liquidaciones']));
  });

  it('PROPIETARIO solo espera el espejo de morosidad si tiene propietarioId resuelto', () => {
    expect(origenesActivosDePerfil('PROPIETARIO', 'pid-1')).toContain('morosidad');
    expect(origenesActivosDePerfil('PROPIETARIO', null)).not.toContain('morosidad');
    expect(origenesActivosDePerfil('PROPIETARIO', 'pid-1')).not.toContain('usuarios');
  });

  it('PROFESIONAL no espera lecturas de administración', () => {
    const activos = origenesActivosDePerfil('PROFESIONAL', null);
    expect(activos).not.toContain('aseguradoras');
    expect(activos).not.toContain('audit_logs');
    expect(activos).toContain('inmuebles');
  });

  it('las pantallas con lecturas activas quedan cubiertas en todos los perfiles', () => {
    const comunes = origenesActivosDePerfil('PROFESIONAL', null);
    for (const seccion of ['dashboard', 'inmuebles', 'gastos', 'incidencias'] as const) {
      const requeridos = origenesDePantalla(seccion).filter((o) => comunes.includes(o));
      expect(requeridos.length).toBeGreaterThan(0);
    }
    // `configuracion` declara lecturas exclusivas de administración: para el resto
    // de perfiles no están activas y no pueden bloquear la pantalla.
    expect(origenesDePantalla('configuracion').filter((o) => comunes.includes(o))).toEqual([]);
    expect(estadoDeLectura({}, 'aseguradoras')).toBe('LISTO');
  });
});
