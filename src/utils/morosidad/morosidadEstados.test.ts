/**
 * BLOQUE C — pruebas del dominio de morosidad (máquina de estados + política de recobro).
 * Motor puro, sin I/O. Ejecutar: npx vitest run src/utils/morosidad
 */
import { describe, expect, it } from 'vitest';
import {
  TRANSICIONES_CON_MOTIVO_OBLIGATORIO,
  TRANSICIONES_MOROSIDAD,
  construirTransicion,
  describirEstado,
  esEstadoTerminal,
  idTransicion,
  transicionPermitida,
  validarTransicion,
} from './morosidadEstados';
import {
  CRITERIOS_ESCALADO_DEFECTO,
  PASOS_POLITICA_DEFECTO,
  PLANTILLA_POR_CODIGO,
  clavePlantillaPaso,
  evaluarEscalado,
  generarPlanRecobro,
  politicaDefecto,
  proximasAcciones,
  validarPolitica,
  versionarPolitica,
} from './dunningPolicy';
import type { EstadoExpediente, ExpedienteMorosidad, MotivoTransicion, PasoPoliticaMorosidad, PiezaDeuda, PoliticaMorosidad } from '../../types/morosidad';
import { ESTADO_EXPEDIENTE_LABELS } from '../../types/morosidad';

const FECHA = '2026-01-01T00:00:00.000Z';
const politica = (): PoliticaMorosidad => politicaDefecto(undefined, FECHA);

const baseExp = (parcial: Partial<ExpedienteMorosidad> = {}): ExpedienteMorosidad =>
  ({
    id: 'mor_x',
    estado: 'DETECTADA',
    saldoPendiente: 0,
    requerimientoFehacienteExiste: false,
    enDisputa: false,
    numEvidencias: 0,
    ...parcial,
  }) as unknown as ExpedienteMorosidad;

const pieza = (mes: string, venc: string, estado = 'VENCIDA_TOTAL'): PiezaDeuda =>
  ({
    id: `pieza_cobro_${mes}`,
    cobroId: `cobro_${mes}`,
    periodoMesAnio: mes,
    fechaVencimiento: venc,
    importeReclamado: 900,
    estado,
    clasificacion: estado,
  }) as unknown as PiezaDeuda;

describe('BLOQUE C · máquina de estados de morosidad', () => {
  it('el grafo cubre todos los estados y CERRADA es terminal', () => {
    const estados = Object.keys(ESTADO_EXPEDIENTE_LABELS) as EstadoExpediente[];
    for (const e of estados) expect(Array.isArray(TRANSICIONES_MOROSIDAD[e])).toBe(true);
    expect(TRANSICIONES_MOROSIDAD.CERRADA).toEqual([]);
    expect(esEstadoTerminal('CERRADA')).toBe(true);
    expect(esEstadoTerminal('PAGADA')).toBe(true);
    expect(esEstadoTerminal('JURIDICA')).toBe(false);
  });

  it('bloquea transiciones inválidas (no se salta de DETECTADA a JURIDICA)', () => {
    expect(transicionPermitida('DETECTADA', 'JURIDICA')).toBe(false);
    expect(transicionPermitida('DETECTADA', 'COMPROMISO_PAGO')).toBe(false);
    expect(transicionPermitida('PAGADA', 'DETECTADA')).toBe(false);
    expect(transicionPermitida('DETECTADA', 'PENDIENTE_CONTACTO')).toBe(true);
    // mismo estado ⇒ no es transición (evita "actualizaciones" que reescriben la historia)
    expect(transicionPermitida('EN_RECOBRO', 'EN_RECOBRO')).toBe(false);
  });

  it('PAGADA exige saldo cero en la fuente canónica', () => {
    const conDeuda = baseExp({ estado: 'RECLAMACION_INICIADA', saldoPendiente: 900 });
    const r = validarTransicion(conDeuda, 'PAGADA', 'PAGO_RECIBIDO');
    expect(r.ok).toBe(false);
    expect(r.errores).toContain('pagada_requiere_saldo_cero');
    const saldado = baseExp({ estado: 'RECLAMACION_INICIADA', saldoPendiente: 0 });
    expect(validarTransicion(saldado, 'PAGADA', 'PAGO_RECIBIDO').ok).toBe(true);
  });

  it('CERRADA con saldo exige confirmación y motivo habilitante', () => {
    const e = baseExp({ estado: 'EN_RECOBRO', saldoPendiente: 120 });
    expect(validarTransicion(e, 'CERRADA', 'CERRADA_SIN_COBRO').errores).toContain('cierre_con_saldo_requiere_confirmacion');
    expect(validarTransicion(e, 'CERRADA', 'CONTACTO_REALIZADO', { confirmarCierreConSaldo: true }).errores).toContain(
      'cierre_con_saldo_requiere_motivo_habilitante',
    );
    const ok = validarTransicion(e, 'CERRADA', 'CERRADA_SIN_COBRO', { confirmarCierreConSaldo: true });
    expect(ok.ok).toBe(true);
    expect(ok.advertencias).toContain('cerrado_con_saldo_pendiente_registrado');
  });

  it('ESCALADA requiere requerimiento con constancia (o confirmación explícita trazada)', () => {
    const e = baseExp({ estado: 'EN_RECOBRO', saldoPendiente: 900, requerimientoFehacienteExiste: false });
    expect(validarTransicion(e, 'ESCALADA', 'ESCALADO_ASEGURADORA').errores).toContain(
      'escalado_requiere_requerimiento_o_confirmacion',
    );
    const forzado = validarTransicion(e, 'ESCALADA', 'ESCALADO_ASEGURADORA', { forzarSinEvidencia: true });
    expect(forzado.ok).toBe(true);
    expect(forzado.advertencias).toContain('escalado_sin_requerimiento_fehaciente_registrado');
    const conEvidencia = baseExp({ estado: 'EN_RECOBRO', saldoPendiente: 900, requerimientoFehacienteExiste: true });
    expect(validarTransicion(conEvidencia, 'ESCALADA', 'ESCALADO_ASEGURADORA').ok).toBe(true);
  });

  it('JURIDICA depende del requisito de procedibilidad (LO 1/2025) si la política lo exige', () => {
    const e = baseExp({ estado: 'ESCALADA', saldoPendiente: 900, requerimientoFehacienteExiste: true });
    expect(validarTransicion(e, 'JURIDICA', 'ESCALADO_JURIDICO', { exigeMascParaJuridica: true }).errores).toContain(
      'juridica_requiere_actividad_negociadora_previa_LO1_2025',
    );
    const conMasc = baseExp({
      estado: 'ESCALADA',
      saldoPendiente: 900,
      requerimientoFehacienteExiste: true,
      juridico: { requisitoProcedibilidad: 'CUMPLIDO_EVIDENCIA', abogadoNombre: 'Letrada X' } as ExpedienteMorosidad['juridico'],
    });
    expect(validarTransicion(conMasc, 'JURIDICA', 'ESCALADO_JURIDICO', { exigeMascParaJuridica: true }).ok).toBe(true);
    // sin exigencia de política ⇒ solo aviso
    const sinExigencia = validarTransicion(e, 'JURIDICA', 'ESCALADO_JURIDICO', { exigeMascParaJuridica: false });
    expect(sinExigencia.ok).toBe(true);
    expect(sinExigencia.advertencias).toContain('juridica_sin_abogado_registrado');
  });

  it('los motivos obligatorios se validan por estado destino', () => {
    expect(Object.keys(TRANSICIONES_CON_MOTIVO_OBLIGATORIO).length).toBeGreaterThan(0);
    const e = baseExp({ estado: 'EN_RECOBRO', saldoPendiente: 300 });
    expect(validarTransicion(e, 'COMPROMISO_PAGO', undefined).errores.some((x) => x.startsWith('motivo_requerido'))).toBe(true);
    expect(
      validarTransicion(e, 'COMPROMISO_PAGO', 'PAGO_RECIBIDO' as MotivoTransicion).errores.some((x) => x.startsWith('motivo_no_admite_estado')),
    ).toBe(true);
  });

  it('el id de transición es determinista: replay ⇒ no duplica el histórico', () => {
    const a = idTransicion('mor_x', 'PAGADA', 'PAGO_RECIBIDO', '2026-04-10T08:00:00.000Z');
    const b = idTransicion('mor_x', 'PAGADA', 'PAGO_RECIBIDO', '2026-04-10T23:59:59.000Z');
    const c = idTransicion('mor_x', 'CERRADA', 'PAGO_RECIBIDO', '2026-04-10T08:00:00.000Z');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith('trn_')).toBe(true);
    // dos hechos del mismo día con importes distintos NO colisionan (histórico append-only)
    expect(a).not.toBe(idTransicion('mor_x', 'PAGADA', 'PAGO_RECIBIDO', '2026-04-10T08:00:00.000Z', '900>0'));
    const t = construirTransicion({
      expedienteId: 'mor_x',
      estadoAnterior: 'EN_RECOBRO',
      estadoNuevo: 'PAGADA',
      motivo: 'PAGO_RECIBIDO',
      importeTotalAntes: 900,
      importeTotalDespues: 0,
      fecha: '2026-04-10T08:00:00.000Z',
      actorNombre: 'Admin',
    });
    expect(t.id).toBe(idTransicion('mor_x', 'PAGADA', 'PAGO_RECIBIDO', '2026-04-10T08:00:00.000Z', '900>0'));
    expect(t.fecha).toBe('2026-04-10T08:00:00.000Z');
    expect(t.importeTotalAntes).toBe(900);
  });

  it('describirEstado expone el estado en forma interpretable (sin inventar datos)', () => {
    const d = describirEstado(baseExp({ estado: 'COMPROMISO_PAGO', saldoPendiente: 450 }));
    expect(d.etiqueta).toBe(ESTADO_EXPEDIENTE_LABELS.COMPROMISO_PAGO);
    expect(d.terminal).toBe(false);
    expect(d.transicionesPermitidas).toEqual(TRANSICIONES_MOROSIDAD.COMPROMISO_PAGO);
    expect(d.accionesHabilitadas).toContain('registrar_pago');
    expect(d.requiereAtencion).toBe(true);
    const cerrado = describirEstado(baseExp({ estado: 'CERRADA', saldoPendiente: 0 }));
    expect(cerrado.terminal).toBe(true);
    expect(cerrado.requiereAtencion).toBe(false);
    expect(cerrado.accionesHabilitadas).toEqual(['reabrir']);
  });
});

describe('BLOQUE C · política de recobro configurable y versionada', () => {
  it('los pasos D+n son offsets configurables de negocio (no plazos legales)', () => {
    const codigos = PASOS_POLITICA_DEFECTO.map((p) => p.codigo);
    expect(codigos).toEqual(['PRE-5', 'D+0', 'D+3', 'D+10', 'D+20', 'D+30']);
    for (const paso of PASOS_POLITICA_DEFECTO) {
      expect(paso.activo).toBe(true);
      const clave = clavePlantillaPaso(paso);
      expect(clave).toMatch(/^(cobro|morosidad)\./);
    }
    expect(PLANTILLA_POR_CODIGO['D+3']).toBe('morosidad.primer_recordatorio');
    expect(PLANTILLA_POR_CODIGO['D+20']).toBe('morosidad.requerimiento_fehaciente');
    expect(PASOS_POLITICA_DEFECTO.find((p) => p.codigo === 'D+3')?.notas).toMatch(/no es un requisito legal/i);
  });

  it('validarPolitica acepta la de defecto y rechaza incoherencias', () => {
    expect(validarPolitica(politica()).valida).toBe(true);
    const duplicados: PoliticaMorosidad = {
      ...politica(),
      pasos: [{ ...politica().pasos[0] }, { ...politica().pasos[0] }] as PasoPoliticaMorosidad[],
    };
    const r1 = validarPolitica(duplicados);
    expect(r1.valida).toBe(false);
    expect(r1.errores.some((e) => e.startsWith('paso_duplicado'))).toBe(true);

    const sinPlantilla: PoliticaMorosidad = {
      ...politica(),
      pasos: politica().pasos.map((p) => (p.codigo === 'D+3' ? { ...p, codigo: 'D+RAREZA', tipoEvento: undefined } : p)),
    };
    expect(validarPolitica(sinPlantilla).errores.some((e) => e.startsWith('paso_sin_plantilla'))).toBe(true);

    const sinEscalado: Partial<PoliticaMorosidad> = { ...politica(), escalado: undefined };
    expect(validarPolitica(sinEscalado).errores).toContain('escalado_requerido');
  });

  it('versionarPolitica incrementa versión, mantiene id y no toca la anterior', () => {
    const v1 = politica();
    const { politica: v2, advertencias } = versionarPolitica(
      v1,
      { pasos: v1.pasos.map((p) => ({ ...p, diasOffset: p.diasOffset + 1 })) },
      '2026-05-01T00:00:00.000Z',
    );
    expect(v2.version).toBe(v1.version + 1);
    expect(v2.id).toBe(v1.id);
    expect(v2.pasos[0].diasOffset).toBe(v1.pasos[0].diasOffset + 1);
    expect(v1.pasos[0].diasOffset).not.toBe(v2.pasos[0].diasOffset);
    expect(v2.fechaCreacion).toBe(v1.fechaCreacion);
    expect(validarPolitica(v2).valida).toBe(true);
    expect(advertencias).toEqual([]);
  });

  it('quitar un paso advierte sin borrar el histórico (inmutabilidad de planes)', () => {
    const v1 = politica();
    const sinD3 = { pasos: v1.pasos.filter((p) => p.codigo !== 'D+3') };
    const { politica: v2, advertencias } = versionarPolitica(v1, sinD3, '2026-05-01T00:00:00.000Z');
    expect(advertencias).toContain('paso_retirado:D+3');
    const planViejo = generarPlanRecobro({ expedienteId: 'mor_x', politica: v1, piezas: [pieza('2026-01', '2026-01-05')], fechaReferencia: '2026-04-01' });
    const planNuevo = generarPlanRecobro({ expedienteId: 'mor_x', politica: v2, piezas: [pieza('2026-01', '2026-01-05')], fechaReferencia: '2026-04-01' });
    expect(planViejo.plan.some((p) => p.pasoCodigo === 'D+3')).toBe(true);
    expect(planNuevo.plan.some((p) => p.pasoCodigo === 'D+3')).toBe(false);
    expect(planNuevo.plan[0].versionPolitica).toBe(v2.version);
    expect(planViejo.plan[0].versionPolitica).toBe(v1.version);
  });

  it('el plan ancla D+n al vencimiento del tramo más antiguo (+ días de gracia)', () => {
    const p = politica();
    const { plan, resumen } = generarPlanRecobro({
      expedienteId: 'mor_x',
      politica: p,
      piezas: [pieza('2026-01', '2026-01-05'), pieza('2026-02', '2026-02-05')],
      fechaReferencia: '2026-03-01',
    });
    expect(plan.length).toBe(p.pasos.length);
    const d3 = plan.find((x) => x.pasoCodigo === 'D+3');
    expect(d3?.fechaObjetivo).toBe('2026-01-10'); // 5 ene + 3 días + 2 de gracia
    expect(d3?.cobroId).toBe('cobro_2026-01');
    expect(d3?.estado).toBe('PREPARADO');
    expect(d3?.idempotencyKey).toBe('morosidad.primer_recordatorio|mor_x|cobro_2026-01');
    expect(resumen.total).toBe(plan.length);
    expect(resumen.accionables + resumen.programados + resumen.omitidos + resumen.bloqueados + resumen.sinTransporte).toBe(plan.length);
    // determinismo: misma entrada ⇒ mismos ids
    const otra = generarPlanRecobro({
      expedienteId: 'mor_x',
      politica: p,
      piezas: [pieza('2026-01', '2026-01-05'), pieza('2026-02', '2026-02-05')],
      fechaReferencia: '2026-03-01',
    });
    expect(otra.plan.map((x) => x.id)).toEqual(plan.map((x) => x.id));
  });

  it('paso ya comunicado ⇒ OMITIDO; sin transporte real ⇒ SIN_TRANSPORTE (nunca ENVIADO)', () => {
    const p = politica();
    const claveD3 = 'morosidad.primer_recordatorio';
    const omitido = generarPlanRecobro({
      expedienteId: 'mor_x',
      politica: p,
      piezas: [pieza('2026-01', '2026-01-05')],
      fechaReferencia: '2026-04-01',
      clavesComunicacionExistentes: [claveD3],
    });
    const paso = omitido.plan.find((x) => x.pasoCodigo === 'D+3');
    expect(paso?.estado).toBe('OMITIDO');
    expect(paso?.motivoBloqueo).toBe('comunicacion_ya_registrada');

    const sinEmail = generarPlanRecobro({
      expedienteId: 'mor_x',
      politica: p,
      piezas: [pieza('2026-01', '2026-01-05')],
      fechaReferencia: '2026-04-01',
      transporteDisponible: { email: false, inapp: true },
    });
    expect(sinEmail.plan.filter((x) => x.estado === 'SIN_TRANSPORTE').length).toBeGreaterThan(0);
    expect(sinEmail.resumen.sinTransporte).toBeGreaterThan(0);
    expect(sinEmail.plan.every((x) => x.estado !== 'ENVIADO')).toBe(true);
  });

  it('expediente cerrado ⇒ ningún paso es accionable', () => {
    const { plan } = generarPlanRecobro({
      expedienteId: 'mor_x',
      politica: politica(),
      piezas: [pieza('2026-01', '2026-01-05')],
      fechaReferencia: '2026-04-01',
      expedienteCerrado: true,
    });
    expect(plan.every((x) => x.estado === 'BLOQUEADO' && x.motivoBloqueo === 'expediente_cerrado')).toBe(true);
    expect(proximasAcciones(plan, '2026-04-01')).toEqual([]);
  });

  it('evaluarEscalado informa los bloqueos de la política', () => {
    const p = politica();
    const pronto = evaluarEscalado(p, {
      piezasAbiertas: [pieza('2026-03', '2026-03-25')],
      fechaReferencia: '2026-03-28',
      requerimientoFehacienteExiste: false,
    });
    expect(pronto.puedeEscalarAseguradora).toBe(false);
    expect(pronto.bloqueos.some((b) => b.startsWith('politica_dias_minimos'))).toBe(true);
    expect(pronto.bloqueos.some((b) => b.startsWith('politica_meses_minimos'))).toBe(true);
    expect(pronto.bloqueos).toContain('requiere_requerimiento_fehaciente_registrado');

    const maduro = evaluarEscalado(p, {
      piezasAbiertas: [pieza('2026-01', '2026-01-05'), pieza('2026-02', '2026-02-05')],
      fechaReferencia: '2026-04-01',
      requerimientoFehacienteExiste: true,
      mascDeclarado: true,
    });
    expect(maduro.bloqueos).toEqual([]);
    expect(maduro.puedeEscalarAseguradora).toBe(true);
    expect(maduro.puedeEscalarJuridico).toBe(true);

    const sinMasc = evaluarEscalado(p, {
      piezasAbiertas: [pieza('2026-01', '2026-01-05'), pieza('2026-02', '2026-02-05')],
      fechaReferencia: '2026-04-01',
      requerimientoFehacienteExiste: true,
      mascDeclarado: false,
    });
    expect(sinMasc.puedeEscalarJuridico).toBe(false);
    expect(sinMasc.bloqueos).toContain('masc_actividad_negociadora_previa_no_declarada');
  });

  it('un compromiso vigente se señala como revisión previa (decisión humana, no auto-cierre)', () => {
    const r = evaluarEscalado(politica(), {
      piezasAbiertas: [pieza('2026-01', '2026-01-05'), pieza('2026-02', '2026-02-05')],
      fechaReferencia: '2026-04-01',
      requerimientoFehacienteExiste: true,
      mascDeclarado: true,
      compromisoVigente: true,
    });
    expect(r.motivos).toContain('existe_compromiso_vigente_revisar_antes_de_escalar');
  });

  it('los umbrales por defecto quedan documentados como configurables', () => {
    expect(CRITERIOS_ESCALADO_DEFECTO).toEqual({
      diasRetrasoMinimo: 30,
      mesesImpagadosMinimos: 2,
      requiereRequerimientoFehaciente: true,
      requiereMascDeclaradoParaJuridica: true,
    });
    expect(politica().notas).toMatch(/plazos legales/i);
  });
});
