/**
 * P1 · Pruebas del circuito de trabajo del profesional.
 * Puras: no tocan Firebase. Verifican permiso, aislamiento y cálculo.
 */
import { describe, expect, it } from 'vitest';

import {
  BLOQUES_PANEL,
  ESTADOS_QUE_PUEDE_FIJAR_EL_PROFESIONAL,
  MAX_BYTES_EVIDENCIA,
  anadirAlHistorial,
  calcularPresupuesto,
  clasificarEnBloques,
  puedeAceptarORechazar,
  puedeFinalizar,
  propietarioPuedeConfirmar,
  propietarioPuedeDecidir,
  resolverEncargo,
  rutaEvidencia,
  siguienteVersion,
  validarEdicionPresupuesto,
  validarEvidencia,
  validarInformeFinalizacion,
  validarTransicionProfesional,
} from './circuitoProfesional';

const PROF_A = 'prof_a';
const TRABAJO_MIO = { estado: 'ASIGNADO', profesionalId: PROF_A };
const TRABAJO_AJENO = { estado: 'ASIGNADO', profesionalId: 'prof_b' };

describe('P1 · aceptación de trabajos (A)', () => {
  it('el profesional asignado puede llevar un encargo a ACEPTADO', () => {
    expect(validarTransicionProfesional(TRABAJO_MIO, PROF_A, 'ACEPTADO')).toEqual({ ok: true });
  });

  it('NO puede tocar un trabajo que no es suyo (aislamiento)', () => {
    const r = validarTransicionProfesional(TRABAJO_AJENO, PROF_A, 'ACEPTADO');
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('PROFESIONAL_DISTINTO');
  });

  it('NO puede operar sobre un trabajo sin profesional asignado', () => {
    const r = validarTransicionProfesional({ estado: 'PENDIENTE', profesionalId: null }, PROF_A, 'ACEPTADO');
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('SIN_PROFESIONAL_ASIGNADO');
  });

  it('NO puede autoasignarse: no puede fijar ASIGNADO ni PENDIENTE', () => {
    for (const estado of ['ASIGNADO', 'ASIGNADA', 'PENDIENTE', 'BUSCANDO_PROFESIONAL'] as const) {
      const r = validarTransicionProfesional(TRABAJO_MIO, PROF_A, estado);
      expect(r.ok, `no debe poder fijar ${estado}`).toBe(false);
      expect(r.motivo).toBe('ESTADO_NO_PERMITIDO_AL_PROFESIONAL');
    }
  });

  it('NO puede cancelar un trabajo (cancelar es del propietario)', () => {
    const r = validarTransicionProfesional(TRABAJO_MIO, PROF_A, 'CANCELADO');
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('ESTADO_NO_PERMITIDO_AL_PROFESIONAL');
  });

  it('un trabajo cerrado no admite más cambios', () => {
    const r = validarTransicionProfesional({ estado: 'CANCELADO', profesionalId: PROF_A }, PROF_A, 'ACEPTADO');
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('TRABAJO_CERRADO');
  });

  it('rechazar exige motivo suficiente', () => {
    expect(resolverEncargo(TRABAJO_MIO, PROF_A, 'RECHAZAR', '').ok).toBe(false);
    expect(resolverEncargo(TRABAJO_MIO, PROF_A, 'RECHAZAR', 'no').ok).toBe(false);
    const ok = resolverEncargo(TRABAJO_MIO, PROF_A, 'RECHAZAR', 'No cubro esa zona');
    expect(ok.ok).toBe(true);
    expect(ok.estado).toBe('CANCELADO');
  });

  it('aceptar no exige motivo y devuelve ACEPTADO', () => {
    const r = resolverEncargo(TRABAJO_MIO, PROF_A, 'ACEPTAR');
    expect(r).toEqual({ ok: true, estado: 'ACEPTADO' });
  });

  it('no se puede aceptar dos veces (estado ya no es encargable)', () => {
    expect(puedeAceptarORechazar({ estado: 'ACEPTADO', profesionalId: PROF_A }, PROF_A)).toBe(false);
    expect(resolverEncargo({ estado: 'ACEPTADO', profesionalId: PROF_A }, PROF_A, 'ACEPTAR').ok).toBe(false);
  });

  it('los estados que puede fijar el profesional son exactamente los declarados', () => {
    expect([...ESTADOS_QUE_PUEDE_FIJAR_EL_PROFESIONAL]).toEqual([
      'ACEPTADO', 'PROGRAMADO', 'EN_EJECUCION', 'PENDIENTE_MATERIAL', 'PENDIENTE_PROPIETARIO', 'FINALIZADO',
    ]);
    // Guardia contra ampliaciones silenciosas: si alguien añade CANCELADO a esta
    // lista, el test falla y obliga a una decisión explícita.
    expect(ESTADOS_QUE_PUEDE_FIJAR_EL_PROFESIONAL).not.toContain('CANCELADO');
    expect(ESTADOS_QUE_PUEDE_FIJAR_EL_PROFESIONAL).not.toContain('ASIGNADO');
  });
});

describe('P1 · presupuestos (B)', () => {
  it('calcula base, IVA y total con redondeo a 2 decimales', () => {
    const r = calcularPresupuesto([
      { concepto: 'Mano de obra', cantidad: 3, precioUnitario: 45.5 },
      { concepto: 'Material', cantidad: 1, precioUnitario: 120.99 },
    ], 21);
    expect(r.ok).toBe(true);
    expect(r.importeBase).toBe(257.49);
    // El IVA se calcula y redondea POR LÍNEA (criterio de facturación), no sobre
    // el total: 136,50×21% = 28,67 y 120,99×21% = 25,41 → 54,08.
    // Redondear sobre el total daría 54,07 y descuadraría la suma de líneas.
    expect(r.iva).toBe(54.08);
    expect(r.importeTotal).toBe(311.57);
  });

  it('el total coincide EXACTAMENTE con la suma de las líneas redondeadas', () => {
    const r = calcularPresupuesto([
      { concepto: 'A', cantidad: 1.333, precioUnitario: 10.007 },
      { concepto: 'B', cantidad: 2, precioUnitario: 0.005 },
      { concepto: 'C', cantidad: 7, precioUnitario: 1.115 },
    ], 21);
    const sumaSubtotales = r.partidas.reduce((s, p) => s + Number(p.importe), 0);
    expect(r.importeBase).toBeCloseTo(Math.round(sumaSubtotales * 100) / 100, 2);
  });

  it('admite IVA por línea distinto del general', () => {
    const r = calcularPresupuesto([
      { concepto: 'Obra', cantidad: 1, precioUnitario: 100, ivaPorcentaje: 10 },
      { concepto: 'Material', cantidad: 1, precioUnitario: 100, ivaPorcentaje: 21 },
    ], 21);
    expect(r.importeBase).toBe(200);
    expect(r.iva).toBe(31); // 10 + 21
    expect(r.importeTotal).toBe(231);
  });

  it('rechaza presupuesto sin conceptos', () => {
    const r = calcularPresupuesto([], 21);
    expect(r.ok).toBe(false);
    expect(r.errores.join(' ')).toMatch(/al menos un concepto/i);
  });

  it('rechaza concepto vacío, cantidad 0 o precio negativo', () => {
    expect(calcularPresupuesto([{ concepto: '  ', cantidad: 1, precioUnitario: 10 }]).ok).toBe(false);
    expect(calcularPresupuesto([{ concepto: 'X', cantidad: 0, precioUnitario: 10 }]).ok).toBe(false);
    expect(calcularPresupuesto([{ concepto: 'X', cantidad: 1, precioUnitario: -1 }]).ok).toBe(false);
  });

  it('rechaza IVA no permitido', () => {
    expect(calcularPresupuesto([{ concepto: 'X', cantidad: 1, precioUnitario: 10, ivaPorcentaje: 7 }]).ok).toBe(false);
    expect(calcularPresupuesto([{ concepto: 'X', cantidad: 1, precioUnitario: 10, ivaPorcentaje: 21 }]).ok).toBe(true);
  });

  it('acepta coma decimal (entrada de teclado en móvil)', () => {
    const r = calcularPresupuesto([{ concepto: 'X', cantidad: '2', precioUnitario: '10,50' }], 21);
    expect(r.ok).toBe(true);
    expect(r.importeBase).toBe(21);
  });

  it('un presupuesto ACEPTADO no se puede modificar: exige versión nueva', () => {
    const r = validarEdicionPresupuesto('ACEPTADO', PROF_A, PROF_A);
    expect(r.ok).toBe(false);
    expect(r.requiereNuevaVersion).toBe(true);
  });

  it('un borrador o un enviado sí se pueden editar', () => {
    expect(validarEdicionPresupuesto('BORRADOR', PROF_A, PROF_A).ok).toBe(true);
    expect(validarEdicionPresupuesto('RECIBIDO', PROF_A, PROF_A).ok).toBe(true);
  });

  it('no se puede editar el presupuesto de otro profesional', () => {
    const r = validarEdicionPresupuesto('BORRADOR', 'prof_b', PROF_A);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no es tuyo/i);
  });

  it('el versionado es correlativo y nunca reutiliza números', () => {
    expect(siguienteVersion([])).toBe(1);
    expect(siguienteVersion([1])).toBe(2);
    expect(siguienteVersion([1, 2, 3])).toBe(4);
    expect(siguienteVersion([2, 1])).toBe(3); // desordenado: sigue siendo max+1
    expect(siguienteVersion([undefined, 1])).toBe(2);
  });

  it('el propietario solo decide sobre presupuestos recibidos o en revisión', () => {
    expect(propietarioPuedeDecidir('RECIBIDO')).toBe(true);
    expect(propietarioPuedeDecidir('EN_REVISION')).toBe(true);
    expect(propietarioPuedeDecidir('BORRADOR')).toBe(false);
    expect(propietarioPuedeDecidir('ACEPTADO')).toBe(false);
  });
});

describe('P1 · fotografías y evidencias (C)', () => {
  it('acepta imágenes y PDF dentro de límite', () => {
    expect(validarEvidencia({ nombre: 'a.jpg', tipo: 'image/jpeg', tamanoBytes: 1024, momento: 'ANTES' }).ok).toBe(true);
    expect(validarEvidencia({ nombre: 'b.pdf', tipo: 'application/pdf', tamanoBytes: 1024 }).ok).toBe(true);
  });

  it('rechaza tipos no admitidos', () => {
    const r = validarEvidencia({ nombre: 'x.exe', tipo: 'application/zip', tamanoBytes: 10 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no admitido/i);
  });

  it('rechaza archivos por encima de 10 MB', () => {
    const r = validarEvidencia({ nombre: 'a.jpg', tipo: 'image/jpeg', tamanoBytes: MAX_BYTES_EVIDENCIA + 1 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/10 MB/);
  });

  it('rechaza archivo vacío o sin nombre', () => {
    expect(validarEvidencia({ nombre: 'a.jpg', tipo: 'image/jpeg', tamanoBytes: 0 }).ok).toBe(false);
    expect(validarEvidencia({ nombre: '  ', tipo: 'image/jpeg', tamanoBytes: 10 }).ok).toBe(false);
  });

  it('la ruta queda SIEMPRE bajo incidencias/{id}/ y nunca es pública', () => {
    const ruta = rutaEvidencia('inc_1', 'ANTES', 'foto con espacios.jpg');
    expect(ruta).toMatch(/^incidencias\/inc_1\/antes_\d+_foto_con_espacios\.jpg$/);
    expect(ruta).not.toMatch(/^https?:/);
  });

  it('rechaza ids de incidencia con traversal', () => {
    expect(rutaEvidencia('../otra', 'ANTES', 'a.jpg')).toBeNull();
    expect(rutaEvidencia('a/b', 'ANTES', 'a.jpg')).toBeNull();
    expect(rutaEvidencia('', 'ANTES', 'a.jpg')).toBeNull();
  });
});

describe('P1 · finalización (E)', () => {
  it('solo se puede finalizar un trabajo en curso y propio', () => {
    expect(puedeFinalizar({ estado: 'EN_EJECUCION', profesionalId: PROF_A }, PROF_A)).toBe(true);
    expect(puedeFinalizar({ estado: 'ASIGNADO', profesionalId: PROF_A }, PROF_A)).toBe(false);
    expect(puedeFinalizar({ estado: 'EN_EJECUCION', profesionalId: 'prof_b' }, PROF_A)).toBe(false);
  });

  it('el informe de finalización pide evidencias y admite observaciones', () => {
    const r = validarInformeFinalizacion({ estado: 'EN_EJECUCION', profesionalId: PROF_A }, PROF_A, 'Cambiado el grifo');
    expect(r.ok).toBe(true);
    expect(r.exigeEvidencias).toBe(true);
  });

  it('rechaza observaciones desmedidas', () => {
    const r = validarInformeFinalizacion({ estado: 'EN_EJECUCION', profesionalId: PROF_A }, PROF_A, 'x'.repeat(2001));
    expect(r.ok).toBe(false);
  });

  it('el propietario solo confirma cuando el trabajo está finalizado', () => {
    expect(propietarioPuedeConfirmar({ estado: 'FINALIZADO' })).toBe(true);
    expect(propietarioPuedeConfirmar({ estado: 'EN_EJECUCION' })).toBe(false);
  });

  it('el profesional NO puede cerrar por su cuenta: FINALIZADO no es terminal', () => {
    // FINALIZADO existe como estado informado, pero el trabajo sigue abierto a
    // la revisión del propietario: se puede seguir actualizando.
    const r = validarTransicionProfesional({ estado: 'FINALIZADO', profesionalId: PROF_A }, PROF_A, 'EN_EJECUCION');
    expect(r.ok).toBe(true);
  });
});

describe('P1 · panel y aislamiento (3)', () => {
  it('clasifica en los seis bloques', () => {
    const bloques = clasificarEnBloques([
      { estado: 'ASIGNADO', profesionalId: PROF_A },
      { estado: 'ACEPTADO', profesionalId: PROF_A },
      { estado: 'EN_EJECUCION', profesionalId: PROF_A },
      { estado: 'FINALIZADO', profesionalId: PROF_A, evidencias: 0 },
      { estado: 'FINALIZADO', profesionalId: PROF_A, evidencias: 3 },
    ], PROF_A);
    expect(bloques.PENDIENTES_ACEPTAR).toHaveLength(1);
    expect(bloques.ACEPTADOS).toHaveLength(1);
    expect(bloques.EN_CURSO).toHaveLength(1);
    expect(bloques.FINALIZADOS).toHaveLength(2);
    // Solo el terminado SIN evidencias cuenta como pendiente de documentar.
    expect(bloques.PENDIENTES_DOCUMENTAR).toHaveLength(1);
  });

  it('descarta trabajos de otros profesionales aunque vengan en la lista', () => {
    const bloques = clasificarEnBloques([
      { estado: 'EN_EJECUCION', profesionalId: PROF_A },
      { estado: 'EN_EJECUCION', profesionalId: 'prof_b' },
      { estado: 'EN_EJECUCION', profesionalId: null },
    ], PROF_A);
    expect(bloques.EN_CURSO).toHaveLength(1);
  });

  it('marca presupuestos pendientes sin duplicar el trabajo en curso', () => {
    const bloques = clasificarEnBloques([
      { estado: 'EN_EJECUCION', profesionalId: PROF_A, presupuestos: [{ estado: 'RECIBIDO' }] },
    ], PROF_A);
    expect(bloques.PRESUPUESTOS_PENDIENTES).toHaveLength(1);
    expect(bloques.EN_CURSO).toHaveLength(1);
  });

  it('sin profesional autenticado no se clasifica nada', () => {
    const bloques = clasificarEnBloques([{ estado: 'EN_EJECUCION', profesionalId: PROF_A }], null);
    expect(bloques.EN_CURSO).toHaveLength(0);
  });

  it('el panel declara exactamente los seis bloques de la orden', () => {
    expect(BLOQUES_PANEL.map((b) => b.id)).toEqual([
      'PENDIENTES_ACEPTAR', 'ACEPTADOS', 'PRESUPUESTOS_PENDIENTES',
      'EN_CURSO', 'PENDIENTES_DOCUMENTAR', 'FINALIZADOS',
    ]);
  });
});

describe('P1 · historial inalterable', () => {
  it('añadir conserva todas las entradas previas', () => {
    const h = anadirAlHistorial([{ id: 'h1' }], { id: 'h2' });
    expect(h.map((x) => x.id)).toEqual(['h1', 'h2']);
  });

  it('es idempotente con el mismo id', () => {
    const h = anadirAlHistorial([{ id: 'h1' }], { id: 'h1' });
    expect(h).toHaveLength(1);
  });

  it('no muta el array original', () => {
    const original = [{ id: 'h1' }];
    anadirAlHistorial(original, { id: 'h2' });
    expect(original).toHaveLength(1);
  });
});
