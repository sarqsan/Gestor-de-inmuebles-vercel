/**
 * IA · FASE 5 — ASISTENTE DE INCIDENCIAS PARA INQUILINOS
 * ======================================================
 * Pruebas sin red, sin Firebase real y sin proveedor real: fuente autorizada
 * simulada (puerto de lectura), proveedor inyectado y traza en memoria.
 *
 * Cubre exactamente lo pedido en la fase:
 *   · AUTORIZACIÓN — identidad del token, inquilino veraz, contratos derivados
 *     de la ficha del usuario y denegación de contrato/incidencia ajenos;
 *     las relaciones del cliente se ignoran.
 *   · CONTRATOS — sólo cláusulas y anexos autorizados del portal; sin DNI,
 *     segundo propietario, scoring, notas internas ni datos de contacto.
 *   · CASOS INCIERTOS — poca información ⇒ incertidumbre ALTA y preguntas;
 *     señales de riesgo ⇒ urgencia y acción inmediata.
 *   · FALLOS DEL PROVEEDOR — excepción, respuesta inválida o claves prohibidas
 *     ⇒ análisis determinista con aviso; la seguridad NUNCA la aporta el modelo.
 *   · DERIVACIÓN HUMANA — sugerencia con destinos y motivo; sin efectos.
 *   · LÍMITES — sin responsabilidad, sin importes, sin escrituras en la incidencia.
 *   · TRAZABILIDAD MÍNIMA — sólo códigos y contadores, sin texto libre.
 */
import { describe, expect, it } from 'vitest';
import {
  CLAVES_PROHIBIDAS_PROVEEDOR_IA,
  DESTINOS_DERIVACION_IA,
  LIMITES_DIAGNOSTICO_IA,
  MAX_PREGUNTAS,
  construirDiagnosticoDeterministaIA,
  detectarSenalesIA,
  distinguirPlanos,
} from '../src/ia/asistenteIncidenciasIA';
import {
  crearAsistenteIncidenciasIA,
  crearFuenteAutorizadaInquilinoIA,
  normalizarPeticionAsistenteIncidenciasIA,
  type TrazaIncidenciaIA,
} from '../server/ia/asistenteIncidenciasInquilino';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ESPEJO_INQUILINO = { usuarioId: 'usuario-ines', estado: 'ACTIVO', tipoPerfil: 'INQUILINO' };
const FICHA_INQUILINO = {
  authUid: 'uid-ines',
  estado: 'ACTIVO',
  tipoPerfil: 'INQUILINO',
  contratoIds: ['contrato-ines'],
  notasInternas: 'NOTA INTERNA DEL USUARIO (no debe salir)',
  scoringSolvencia: 812,
};

const CONTRATO = {
  inmuebleId: 'inm-1',
  propietarioId: 'prop-1',
  estado: 'ACTIVO',
  fechaInicioContrato: '2026-01-01',
  fechaFinContrato: '2027-01-01',
  esVigente: true,
  suministrosCargo: 'arrendatario',
  gastosComunidadCargo: 'arrendador',
  ibiCargo: 'arrendador',
  incluyeMueblesInventario: true,
  inventarioDetalle: 'Lavadora y frigorífico',
  permitirMascotas: false,
  clausulaDesistimientoAnticipado: true,
  clausulasPersonalizadas: [
    { titulo: 'Mantenimiento de electrodomésticos', contenido: 'La reparación de los electrodomésticos incluidos en el inventario se tramita desde la propiedad.' },
    { titulo: 'Anexo I — Inventario', contenido: 'Inventario: lavadora, frigorífico y horno.' },
  ],
  // Campos que NUNCA deben salir del servidor:
  candidatoDni: '12345678Z',
  candidatoEmail: 'ines.privada@example.com',
  segundoPropietarioNombre: 'Segundo Propietario Secreto',
  scoringAsegurabilidad: 91,
  notasInternas: 'NOTA INTERNA DEL CONTRATO',
  historialFormalizacion: [{ accion: 'ENVIO', fecha: '2026-01-02' }],
};

const INMUEBLE = {
  direccion: 'Calle Falsa 1',
  ciudad: 'Alicante',
  notasInternas: 'NOTA INTERNA DEL INMUEBLE',
  valorPatrimonial: 250000,
};

const PROPIETARIO = {
  nombre: 'Propietaria Uno',
  email: 'propietaria.privada@example.com',
  nif: 'X1234567Z',
  iban: 'ES9121000418450200051332',
};

const INCIDENCIA_INES = {
  contratoId: 'contrato-ines',
  contratoIdsVisibles: ['contrato-ines'],
  titulo: 'Fuga de agua en el baño',
  descripcion: 'Gotea la tubería bajo el lavabo desde ayer y se está mojando el armario.',
  categoria: 'FONTANERIA',
  prioridad: 'ALTA',
  estado: 'ABIERTA',
  fotografias: [{ id: 'f1', nombre: 'fuga.jpg', url: 'https://example.invalid/f1.jpg', fechaSubida: '2026-10-16T09:00:00Z', storagePath: 'incidencias/x/f1.jpg' }],
  notasInternas: 'NOTA INTERNA DE LA INCIDENCIA',
  responsabilidad: 'POSIBLE_INQUILINO',
  analisisIa: { urgenciaEstimada: 'URGENTE' },
};

const INCIDENCIA_AJENA = {
  contratoId: 'contrato-otro',
  contratoIdsVisibles: ['contrato-otro'],
  titulo: 'Incidencia de otro inquilino',
  descripcion: 'Contenido de otro usuario que no debe verse.',
  categoria: 'ELECTRICIDAD',
  prioridad: 'NORMAL',
  estado: 'ABIERTA',
};

function documento(base: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { datos: { ...base, ...extra } };
}

function puertoFalso(documentos: Record<string, Record<string, unknown>>, opciones: { fallar?: boolean } = {}) {
  const escritos: Array<{ coleccion: string; id: string; datos: Record<string, unknown> }> = [];
  return {
    escritos,
    async leerDocumento(ruta: string) {
      if (opciones.fallar) throw new Error('Firestore no disponible');
      return documentos[ruta] ? documento(documentos[ruta]) : null;
    },
    async crearDocumento(coleccion: string, id: string, datos: Record<string, unknown>) {
      escritos.push({ coleccion, id, datos });
      return escritos.filter((e) => e.coleccion === coleccion && e.id === id).length > 1 ? ('YA_EXISTE' as const) : ('CREADO' as const);
    },
  };
}

function documentosBase(extra: Record<string, Record<string, unknown>> = {}) {
  return {
    'usuarios_auth/uid-ines': ESPEJO_INQUILINO,
    'usuarios/usuario-ines': FICHA_INQUILINO,
    'usuarios_auth/uid-ana': { usuarioId: 'usuario-ana', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO' },
    'usuarios/usuario-ana': { authUid: 'uid-ana', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO' },
    'contratos_formalizacion/contrato-ines': CONTRATO,
    'inmuebles/inm-1': INMUEBLE,
    'propietarios/prop-1': PROPIETARIO,
    'incidencias/inc-ines': INCIDENCIA_INES,
    'incidencias/inc-ajena': INCIDENCIA_AJENA,
    ...extra,
  };
}

function asistenteCon(puerto: ReturnType<typeof puertoFalso>) {
  const trazas: TrazaIncidenciaIA[] = [];
  const asistente = crearAsistenteIncidenciasIA({
    fuente: crearFuenteAutorizadaInquilinoIA(puerto),
    traza: { registrar: async (t) => void trazas.push(t) },
    ahora: () => new Date('2026-10-16T10:00:00Z'),
  });
  return { asistente, trazas };
}

const SIN_PROVEEDOR = async () => null;

// ---------------------------------------------------------------------------
// 1. Autorización
// ---------------------------------------------------------------------------

describe('Fase 5 · autorización del asistente de incidencias', () => {
  it('el inquilino veraz obtiene diagnóstico de su contrato, con alcance resuelto en servidor', async () => {
    const puerto = puertoFalso(documentosBase());
    const { asistente } = asistenteCon(puerto);
    const resultado = await asistente.diagnosticar({
      uid: 'uid-ines',
      operacionId: 'iaop_test_1',
      peticion: { incidenciaId: 'inc-ines', descripcion: 'Gotea la tubería bajo el lavabo desde ayer.' },
      consultarProveedor: SIN_PROVEEDOR,
    });
    expect(resultado.estado).toBe('OK');
    if (resultado.estado !== 'OK') return;
    expect(resultado.contexto.contratoId).toBe('contrato-ines');
    expect(resultado.contexto.inmueble.id).toBe('inm-1');
    expect(resultado.contexto.incidencia?.id).toBe('inc-ines');
    expect(resultado.origenRespuesta).toBe('DETERMINISTA');
  });

  it('un perfil no inquilino no puede usar el asistente (403 PERFIL_INQUILINO_REQUERIDO)', async () => {
    const puerto = puertoFalso(documentosBase());
    const { asistente } = asistenteCon(puerto);
    const resultado = await asistente.diagnosticar({
      uid: 'uid-ana',
      operacionId: 'iaop_test_2',
      peticion: { descripcion: 'Fuga de agua en el baño de una vivienda' },
      consultarProveedor: SIN_PROVEEDOR,
    });
    expect(resultado).toMatchObject({ estado: 'RECHAZADO', codigo: 'PERFIL_INQUILINO_REQUERIDO', codigoHttp: 403 });
  });

  it('sin espejo de identidad o sin contrato vinculado se deniega (nunca se analiza nada)', async () => {
    const sinPerfil = puertoFalso(documentosBase());
    const { asistente: a1 } = asistenteCon(sinPerfil);
    expect(await a1.diagnosticar({ uid: 'uid-desconocido', operacionId: 'op-x', peticion: { descripcion: 'algo ocurre en casa' }, consultarProveedor: SIN_PROVEEDOR }))
      .toMatchObject({ estado: 'RECHAZADO', codigo: 'PERFIL_INQUILINO_REQUERIDO' });

    const baseSinContratos = documentosBase();
    const puertoSinContrato = puertoFalso({ ...baseSinContratos, 'usuarios/usuario-ines': { ...FICHA_INQUILINO, contratoIds: [] } });
    const { asistente: a2 } = asistenteCon(puertoSinContrato);
    expect(await a2.diagnosticar({ uid: 'uid-ines', operacionId: 'op-y', peticion: { descripcion: 'algo ocurre en casa' }, consultarProveedor: SIN_PROVEEDOR }))
      .toMatchObject({ estado: 'RECHAZADO', codigo: 'SIN_CONTRATO_AUTORIZADO', codigoHttp: 403 });
  });

  it('el contrato sugerido por el cliente sólo vale si está vinculado a su ficha', async () => {
    const puerto = puertoFalso(documentosBase());
    const { asistente } = asistenteCon(puerto);
    const resultado = await asistente.diagnosticar({
      uid: 'uid-ines',
      operacionId: 'op-z',
      peticion: { contratoId: 'contrato-otro', descripcion: 'Quiero analizar el contrato de otro' },
      consultarProveedor: SIN_PROVEEDOR,
    });
    expect(resultado).toMatchObject({ estado: 'RECHAZADO', codigo: 'CONTRATO_NO_AUTORIZADO', codigoHttp: 403 });
  });

  it('una incidencia de otro contrato se rechaza aunque se conozca su id', async () => {
    const puerto = puertoFalso(documentosBase());
    const { asistente } = asistenteCon(puerto);
    const resultado = await asistente.diagnosticar({
      uid: 'uid-ines',
      operacionId: 'op-w',
      peticion: { incidenciaId: 'inc-ajena', descripcion: 'Intento de lectura transversal' },
      consultarProveedor: SIN_PROVEEDOR,
    });
    expect(resultado).toMatchObject({ estado: 'RECHAZADO', codigo: 'INCIDENCIA_NO_AUTORIZADA', codigoHttp: 403 });
  });

  it('las relaciones enviadas por el cliente (uid, propietario, inmueble, contratoIds) se ignoran por completo', async () => {
    const peticion = normalizarPeticionAsistenteIncidenciasIA({
      uid: 'uid-otro',
      usuarioId: 'usuario-ana',
      propietarioId: 'prop-ajena',
      inmuebleId: 'inm-ajena',
      contratoIds: ['contrato-otro'],
      rol: 'ADMINISTRADOR',
      contratoId: 'contrato-ines',
      descripcion: 'Gotea el grifo de la cocina',
    });
    expect(Object.keys(peticion).sort()).toEqual(['contratoId', 'descripcion']);
    const puerto = puertoFalso(documentosBase());
    const { asistente } = asistenteCon(puerto);
    const resultado = await asistente.diagnosticar({
      uid: 'uid-ines',
      operacionId: 'op-v',
      peticion,
      consultarProveedor: SIN_PROVEEDOR,
    });
    expect(resultado.estado).toBe('OK');
    if (resultado.estado !== 'OK') return;
    expect(resultado.contexto.contratoId).toBe('contrato-ines');
    expect(resultado.contexto.inmueble.id).toBe('inm-1');
  });

  it('si la fuente autorizada falla, el asistente falla cerrado (503) y no analiza nada', async () => {
    const puerto = puertoFalso(documentosBase(), { fallar: true });
    const { asistente } = asistenteCon(puerto);
    const resultado = await asistente.diagnosticar({
      uid: 'uid-ines',
      operacionId: 'op-u',
      peticion: { descripcion: 'Fuga de agua en el baño' },
      consultarProveedor: SIN_PROVEEDOR,
    });
    expect(resultado).toMatchObject({ estado: 'RECHAZADO', codigo: 'FUENTE_NO_DISPONIBLE', codigoHttp: 503 });
  });

  it('sin descripción utilizable responde 400 PETICION_INVALIDA', async () => {
    const puerto = puertoFalso(documentosBase());
    const { asistente } = asistenteCon(puerto);
    expect(await asistente.diagnosticar({ uid: 'uid-ines', operacionId: 'op-t', peticion: {}, consultarProveedor: SIN_PROVEEDOR }))
      .toMatchObject({ estado: 'RECHAZADO', codigo: 'PETICION_INVALIDA', codigoHttp: 400 });
  });
});

// ---------------------------------------------------------------------------
// 2. Contratos autorizados y privacidad
// ---------------------------------------------------------------------------

describe('Fase 5 · cláusulas y anexos autorizados (mínimo privilegio)', () => {
  it('sólo se usan las cláusulas autorizadas y no se filtra ningún dato interno', async () => {
    const puerto = puertoFalso(documentosBase());
    const { asistente, trazas } = asistenteCon(puerto);
    const resultado = await asistente.diagnosticar({
      uid: 'uid-ines',
      operacionId: 'iaop_privacidad',
      peticion: { incidenciaId: 'inc-ines', descripcion: 'Gotea la tubería bajo el lavabo desde ayer' },
      consultarProveedor: SIN_PROVEEDOR,
    });
    expect(resultado.estado).toBe('OK');
    if (resultado.estado !== 'OK') return;
    const serializado = JSON.stringify(resultado.diagnostico);
    for (const prohibido of [
      '12345678Z', 'X1234567Z', 'notasInternas', 'NOTA INTERNA', 'Segundo Propietario Secreto',
      'scoringAsegurabilidad', 'scoringSolvencia', 'historialFormalizacion', 'propietaria.privada@example.com',
      'ines.privada@example.com', 'ES9121000418450200051332', 'valorPatrimonial', '"responsabilidad"',
    ]) {
      expect(serializado, prohibido).not.toContain(prohibido);
    }
    // La urgencia Parte de la incidencia registrada (prioridad ALTA) y no de un campo inventado.
    expect(resultado.diagnostico.urgencia).toBe('ALTA');
    // La interpretación contractual se apoya en el reparto del contrato y en sus cláusulas.
    expect(resultado.diagnostico.interpretacionClausulas.length).toBeGreaterThan(0);
    for (const clausula of resultado.diagnostico.interpretacionClausulas) {
      expect(clausula.interpretacionOrientativa.length).toBeGreaterThan(10);
      expect(clausula.textoAutorizado.length).toBeGreaterThan(3);
    }
    // La traza tampoco guarda texto libre ni identificadores de personas.
    expect(trazas).toHaveLength(1);
    const trazaSerializada = JSON.stringify(trazas[0]);
    for (const prohibido of ['Fuga', 'fuga', 'lavabo', 'Calle Falsa', 'Propietaria', 'Lavadora', 'NOTA INTERNA']) {
      expect(trazaSerializada, prohibido).not.toContain(prohibido);
    }
    expect(Object.keys(trazas[0]).sort()).toEqual([
      'categoria', 'contratoId', 'creadaEn', 'derivacionRecomendada', 'destinosDerivacion',
      'incidenciaId', 'nivelIncertidumbre', 'operacionId', 'origenRespuesta', 'senales', 'uid', 'urgencia',
    ]);
  });

  it('las medidas preventivas y las advertencias son siempre las del servidor', () => {
    const diagnostico = construirDiagnosticoDeterministaIA({
      categoria: 'ELECTRICIDAD',
      texto: 'Salta el diferencial al encender la lavadora',
      respuestas: [],
      contrato: {
        contratoId: 'c', estado: 'ACTIVO', fechaInicioContrato: '2026-01-01', esVigente: true,
        suministrosCargo: 'arrendatario', gastosComunidadCargo: 'arrendador', ibiCargo: 'arrendador',
        incluyeMueblesInventario: false, permitirMascotas: false, permitirSubarriendo: false,
        clausulaDesistimientoAnticipado: false, clausulasPersonalizadas: [],
      },
      fotografias: 0,
    });
    expect(diagnostico.medidasPreventivas.some((m) => m.codigo === 'no_rearmar_a_ciegas' && m.inmediata)).toBe(true);
    expect(diagnostico.medidasProhibidas.map((m) => m.codigo)).toContain('no_gas');
    expect(diagnostico.limites).toEqual([...LIMITES_DIAGNOSTICO_IA]);
  });
});

// ---------------------------------------------------------------------------
// 3. Casos inciertos y señales de riesgo
// ---------------------------------------------------------------------------

describe('Fase 5 · incertidumbre, preguntas aclaratorias y señales de riesgo', () => {
  it('un relato escaso produce incertidumbre ALTA, motivos legibles y preguntas acotadas', async () => {
    const puerto = puertoFalso(documentosBase());
    const { asistente } = asistenteCon(puerto);
    const resultado = await asistente.diagnosticar({
      uid: 'uid-ines',
      operacionId: 'op-incertidumbre',
      peticion: { contratoId: 'contrato-ines', descripcion: 'Algo raro en la cocina' },
      consultarProveedor: SIN_PROVEEDOR,
    });
    expect(resultado.estado).toBe('OK');
    if (resultado.estado !== 'OK') return;
    const d = resultado.diagnostico;
    expect(d.incertidumbre.nivel).toBe('ALTA');
    expect(d.incertidumbre.requiereConfirmacionHumana).toBe(true);
    expect(d.incertidumbre.motivos.length).toBeGreaterThanOrEqual(2);
    expect(d.preguntas.length).toBeGreaterThan(0);
    expect(d.preguntas.length).toBeLessThanOrEqual(MAX_PREGUNTAS);
    expect(d.hipotesisTecnica.every((h) => h.confirmada === false)).toBe(true);
  });

  it('las señales de riesgo elevan la urgencia, aportan acción inmediata y derivación urgente', async () => {
    const puerto = puertoFalso(documentosBase());
    const { asistente } = asistenteCon(puerto);
    const resultado = await asistente.diagnosticar({
      uid: 'uid-ines',
      operacionId: 'op-gas',
      peticion: { contratoId: 'contrato-ines', descripcion: 'Huele a gas en la cocina desde hace una hora y hay niños en casa' },
      consultarProveedor: SIN_PROVEEDOR,
    });
    expect(resultado.estado).toBe('OK');
    if (resultado.estado !== 'OK') return;
    const d = resultado.diagnostico;
    expect(d.senales).toContain('GAS');
    expect(d.urgencia).toBe('URGENTE');
    expect(d.accionInmediata).toMatch(/112/);
    expect(d.derivacion.urgente).toBe(true);
    expect(d.derivacion.destinos).toContain('PROFESIONAL');
    expect(d.medidasPreventivas.some((m) => m.inmediata)).toBe(true);
  });

  it('detectar señales es determinista y no depende del proveedor', () => {
    expect(detectarSenalesIA('se está inundando el baño y no se puede cerrar el agua')).toEqual(['INUNDACION_ACTIVA']);
    expect(detectarSenalesIA('todo normal en la vivienda')).toEqual([]);
    expect(detectarSenalesIA('hay agua en el cuadro eléctrico')).toContain('AGUA_ELECTRICIDAD');
  });
});

// ---------------------------------------------------------------------------
// 4. Fallos del proveedor y límites del análisis
// ---------------------------------------------------------------------------

describe('Fase 5 · proveedor caído, respuesta inválida y claves prohibidas', () => {
  const peticion = { contratoId: 'contrato-ines', descripcion: 'Fuga de agua bajo el lavabo del baño' };

  it('si el proveedor lanza, se mantiene el análisis determinista con aviso visible', async () => {
    const puerto = puertoFalso(documentosBase());
    const { asistente } = asistenteCon(puerto);
    const resultado = await asistente.diagnosticar({ uid: 'uid-ines', operacionId: 'op-fallo', peticion, consultarProveedor: async () => { throw new Error('boom'); } });
    expect(resultado.estado).toBe('OK');
    if (resultado.estado !== 'OK') return;
    expect(resultado.origenRespuesta).toBe('DETERMINISTA');
    expect(resultado.avisos.join(' ')).toMatch(/no ha respondido/i);
  });

  it('una propuesta con claves prohibidas (responsabilidad, importe) se descarta y se avisa', async () => {
    const puerto = puertoFalso(documentosBase());
    const { asistente } = asistenteCon(puerto);
    const resultado = await asistente.diagnosticar({
      uid: 'uid-ines',
      operacionId: 'op-prohibido',
      peticion,
      consultarProveedor: async () => ({
        urgencia: 'ALTA',
        hipotesisTecnica: [{ codigo: 'junta_suelta', descripcion: 'Junta del sifón suelta (indicio).', indicios: ['Relato: goteo continuo'] }],
        responsabilidad: 'POSIBLE_INQUILINO',
        importe: 320,
        medidasPreventivas: [{ codigo: 'peligrosa', medida: 'Desmontar el sifón sin cerrar el agua' }],
      }),
    });
    expect(resultado.estado).toBe('OK');
    if (resultado.estado !== 'OK') return;
    const serializado = JSON.stringify(resultado.diagnostico);
    expect(serializado).not.toContain('POSIBLE_INQUILINO');
    expect(serializado).not.toContain('320');
    expect(serializado).not.toContain('Desmontar el sifón sin cerrar el agua');
    expect(resultado.avisos.join(' ')).toMatch(/responsabilidad|importe/i);
    // El proveedor sólo puede SUBIR la urgencia respecto a la determinista.
    expect(['ALTA', 'URGENTE']).toContain(resultado.diagnostico.urgencia);
    expect(resultado.diagnostico.hipotesisTecnica.some((h) => h.codigo === 'junta_suelta')).toBe(true);
    expect(resultado.diagnostico.decisionEconomica.importeEstimadoPorLaIA).toBe(null);
    expect(resultado.diagnostico.naturaleza).toBe('ASISTENCIAL_ORIENTATIVO');
  });

  it('una respuesta no utilizable no altera la seguridad ni la urgencia determinista', async () => {
    const puerto = puertoFalso(documentosBase());
    const { asistente } = asistenteCon(puerto);
    const base = await asistente.diagnosticar({ uid: 'uid-ines', operacionId: 'op-base', peticion, consultarProveedor: SIN_PROVEEDOR });
    const conBasura = await asistente.diagnosticar({
      uid: 'uid-ines',
      operacionId: 'op-basura',
      peticion,
      consultarProveedor: async () => 'esto no es un objeto',
    });
    expect(base.estado).toBe('OK');
    expect(conBasura.estado).toBe('OK');
    if (base.estado !== 'OK' || conBasura.estado !== 'OK') return;
    expect(conBasura.origenRespuesta).toBe('DETERMINISTA');
    expect(conBasura.diagnostico.urgencia).toBe(base.diagnostico.urgencia);
    expect(conBasura.diagnostico.medidasPreventivas).toEqual(base.diagnostico.medidasPreventivas);
    expect(conBasura.diagnostico.medidasProhibidas).toEqual(base.diagnostico.medidasProhibidas);
    expect(conBasura.diagnostico.limites).toEqual(base.diagnostico.limites);
  });

  it('el proveedor puede aportar hipótesis, pero nunca baja la urgencia determinista', async () => {
    const puerto = puertoFalso(documentosBase());
    const { asistente } = asistenteCon(puerto);
    const resultado = await asistente.diagnosticar({
      uid: 'uid-ines',
      operacionId: 'op-urgencia',
      peticion: { contratoId: 'contrato-ines', descripcion: 'Huele a gas y hay riesgo para los vecinos' },
      consultarProveedor: async () => ({ urgencia: 'BAJA', hipotesisTecnica: [{ codigo: 'x', descripcion: 'Posible fuga interna pendiente de comprobación.' }] }),
    });
    expect(resultado.estado).toBe('OK');
    if (resultado.estado !== 'OK') return;
    expect(resultado.diagnostico.urgencia).toBe('URGENTE');
    expect(resultado.diagnostico.senales).toContain('GAS');
  });

  it('el asistente no escribe nada en la incidencia ni en el contrato (sólo traza)', async () => {
    const puerto = puertoFalso(documentosBase());
    const { asistente, trazas } = asistenteCon(puerto);
    await asistente.diagnosticar({ uid: 'uid-ines', operacionId: 'op-sin-escrituras', peticion, consultarProveedor: SIN_PROVEEDOR });
    // Ninguna escritura de negocio: ni la incidencia, ni el contrato, ni el inmueble.
    expect(puerto.escritos).toEqual([]);
    expect(trazas).toHaveLength(1);
    expect(trazas[0].operacionId).toBe('op-sin-escrituras');
    expect(Object.keys(trazas[0])).not.toContain('importeEstimado');
    expect(Object.keys(trazas[0])).not.toContain('responsabilidad');
  });
});

describe('Fase 5 · traza mínima en Firestore y escritura determinista', () => {
  it('la traza se escribe UNA vez con id determinista y sin texto libre', async () => {
    const puerto = puertoFalso(documentosBase());
    const { crearRegistroTrazasFirestoreIA } = await import('../server/ia/asistenteIncidenciasInquilino');
    const asistente = crearAsistenteIncidenciasIA({
      fuente: crearFuenteAutorizadaInquilinoIA(puerto),
      traza: crearRegistroTrazasFirestoreIA(puerto as never),
    });
    await asistente.diagnosticar({
      uid: 'uid-ines',
      operacionId: 'iaop_determinista',
      peticion: { contratoId: 'contrato-ines', descripcion: 'Fuga de agua bajo el lavabo del baño' },
      consultarProveedor: SIN_PROVEEDOR,
    });
    // Reintentar la MISMA operación (mismo id) no duplica: el documento ya existe.
    await asistente.diagnosticar({
      uid: 'uid-ines',
      operacionId: 'iaop_determinista',
      peticion: { contratoId: 'contrato-ines', descripcion: 'Fuga de agua bajo el lavabo del baño' },
      consultarProveedor: SIN_PROVEEDOR,
    });
    expect(puerto.escritos).toHaveLength(2);
    for (const escrito of puerto.escritos) {
      expect(escrito.coleccion).toBe('ia_incidencias_trazas');
      expect(escrito.id).toBe('iaop_determinista');
      expect(Object.keys(escrito.datos)).not.toContain('prompt');
      expect(Object.keys(escrito.datos)).not.toContain('descripcion');
      expect(JSON.stringify(escrito.datos)).not.toContain('lavabo');
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Contrato puro: separación de planos y claves prohibidas
// ---------------------------------------------------------------------------

describe('Fase 5 · contrato del diagnóstico', () => {
  it('los tres planos (técnico, contractual, económico) están siempre presentes y separados', () => {
    const planos = distinguirPlanos({
      categoria: 'HUMEDADES',
      texto: 'Aparece humedad en el techo del salón',
      respuestas: [],
      contrato: {
        contratoId: 'c', estado: 'ACTIVO', fechaInicioContrato: '2026-01-01', esVigente: true,
        suministrosCargo: 'arrendatario', gastosComunidadCargo: 'arrendador', ibiCargo: 'arrendador',
        incluyeMueblesInventario: false, permitirMascotas: false, permitirSubarriendo: false,
        clausulaDesistimientoAnticipado: false, clausulasPersonalizadas: [],
      },
      fotografias: 0,
    });
    expect(planos.tecnico.length).toBeGreaterThan(0);
    expect(planos.contractual.length).toBeGreaterThan(0);
    expect(planos.economico.decide).toBe('PROPIETARIO_O_ADMINISTRACION');
  });

  it('las claves prohibidas del proveedor cubren responsabilidad, importes y automatismos', () => {
    for (const clave of ['responsabilidad', 'importe', 'ordenTrabajo', 'autorizacion', 'garantizar']) {
      expect(CLAVES_PROHIBIDAS_PROVEEDOR_IA).toContain(clave);
    }
  });

  it('los destinos de derivación son los tres perfiles humanos previstos', () => {
    expect([...DESTINOS_DERIVACION_IA]).toEqual(['PROPIETARIO', 'ADMINISTRADOR', 'PROFESIONAL']);
  });
});
