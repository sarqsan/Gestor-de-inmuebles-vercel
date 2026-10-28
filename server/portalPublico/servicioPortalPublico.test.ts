/**
 * AG-02 — Servicio de portales públicos por token (sin Firebase real).
 *
 * El puerto Firestore se sustituye por un doble con versiones (`updateTime`),
 * de modo que se prueba lo que importa del diseño:
 *  · listas blancas de lectura (nada de notas, scores, análisis ni historiales);
 *  · reserva/cancelación atómicas con precondición de versión;
 *  · validación estricta de la aportación documental (Storage y ruta);
 *  · fallo cerrado ante token inexistente, slot ocupado o carrera perdida.
 *
 * La verificación contra Firestore real y el emulador oficial queda pendiente
 * (V): este entorno no tiene Java ni credenciales de servicio.
 */
import { describe, expect, it } from 'vitest';
import type {
  DocumentoLeido,
  EscrituraDocumentoFirestoreAtomica,
} from '../titularidades/googleBackend.js';
import {
  ErrorPortalPublico,
  crearServicioPortalPublico,
  type ConsultaPortalPublico,
  type PuertoPortalPublico,
} from './servicioPortalPublico.js';

const AHORA = new Date('2026-10-20T12:00:00.000Z');

interface DocumentoFalso {
  datos: Record<string, unknown>;
  updateTime: string;
}

class PuertoFalso implements PuertoPortalPublico {
  readonly docs = new Map<string, DocumentoFalso>();
  readonly commits: ReadonlyArray<EscrituraDocumentoFirestoreAtomica>[] = [];
  private version = 0;
  forzarConflicto = false;

  poner(ruta: string, datos: Record<string, unknown>): void {
    this.version += 1;
    this.docs.set(ruta, {
      datos: structuredClone(datos),
      updateTime: `2026-10-20T00:00:${String(this.version).padStart(2, '0')}.000Z`,
    });
  }

  private normalizar(ruta: string): string {
    return ruta.split('/').map((parte) => decodeURIComponent(parte)).join('/');
  }

  async leerDocumento(ruta: string): Promise<DocumentoLeido | null> {
    const clave = this.normalizar(ruta);
    const doc = this.docs.get(clave);
    if (!doc) return null;
    return { id: clave.split('/').pop() || clave, datos: structuredClone(doc.datos), updateTime: doc.updateTime };
  }

  async consultarIgualdadesOrden(coleccion: string, consulta: ConsultaPortalPublico): Promise<DocumentoLeido[]> {
    const salida: DocumentoLeido[] = [];
    for (const [ruta, doc] of this.docs) {
      if (!ruta.startsWith(`${coleccion}/`)) continue;
      const coincide = (consulta.igualdades || []).every(([campo, valor]) => doc.datos[campo] === valor);
      if (!coincide) continue;
      salida.push({ id: ruta.slice(coleccion.length + 1), datos: structuredClone(doc.datos), updateTime: doc.updateTime });
      if (salida.length >= consulta.limite) break;
    }
    return salida;
  }

  async escribirAtomico(
    escrituras: readonly EscrituraDocumentoFirestoreAtomica[]
  ): Promise<'COMMIT' | 'CONFLICTO'> {
    if (this.forzarConflicto) return 'CONFLICTO';
    // El alta publica usa precondición de CREACIÓN (`NO_EXISTE`): el doble debe
    // respetarla igual que el cliente real, o el alta nunca podría probarse.
    for (const escritura of escrituras) {
      const actual = this.docs.get(`${escritura.coleccion}/${escritura.id}`);
      if (escritura.precondicion.tipo === 'NO_EXISTE') {
        if (actual) return 'CONFLICTO';
        continue;
      }
      if (!actual) return 'CONFLICTO';
      if (escritura.precondicion.updateTime !== actual.updateTime) return 'CONFLICTO';
    }
    for (const escritura of escrituras) {
      const clave = `${escritura.coleccion}/${escritura.id}`;
      const actual = this.docs.get(clave);
      const siguientes = escritura.camposActualizar && actual
        ? { ...actual.datos }
        : { ...escritura.datos };
      if (escritura.camposActualizar) {
        for (const campo of escritura.camposActualizar) {
          siguientes[campo] = escritura.datos[campo];
        }
      }
      this.version += 1;
      this.docs.set(clave, {
        datos: structuredClone(siguientes),
        updateTime: `2026-10-20T01:00:${String(this.version).padStart(2, '0')}.000Z`,
      });
    }
    this.commits.push([...escrituras]);
    return 'COMMIT';
  }
}

function mundo() {
  const puerto = new PuertoFalso();

  puerto.poner('invitaciones/inv-1', {
    token: 'vst-token-123456',
    candidateId: 'cand-1',
    candidateNombre: 'Ana Sintética',
    candidateTelefono: '600000001',
    candidateEmail: 'ana@example.test',
    inmuebleId: 'inm-1',
    inmuebleNombre: 'Piso Ficticio',
    inmueblePrecio: 900,
    inmuebleCiudad: 'Alicante',
    status: 'ENVIADO',
    fechaPreseleccion: '2026-10-25',
    createdAt: '2026-10-18T10:00:00.000Z',
    // Campos internos que NUNCA deben salir por el portal.
    scoreSolvencia: 99,
    perfilOperativo: 81,
    solicitudEstado: 'CUESTIONARIO COMPLETADO',
  });
  puerto.poner('slots_visita/slot-1', {
    inmuebleId: 'inm-1', fecha: '2026-10-30', horaInicio: '10:00', horaFin: '10:30', disponible: true,
  });
  puerto.poner('slots_visita/slot-2', {
    inmuebleId: 'inm-1', fecha: '2026-10-29', horaInicio: '09:00', horaFin: '09:30', disponible: true,
    reservaCandidateId: 'cand-otro', reservaCandidateNombre: 'Otra Persona',
  });
  puerto.poner('slots_visita/slot-3', {
    inmuebleId: 'inm-1', fecha: '2026-10-31', horaInicio: '11:00', horaFin: '11:30', disponible: true,
    bloqueadoPorPropietario: true,
  });
  puerto.poner('slots_visita/slot-ajeno', {
    inmuebleId: 'inm-2', fecha: '2026-10-30', horaInicio: '12:00', horaFin: '12:30', disponible: true,
  });
  puerto.poner('fichas_publicas_inmueble/inm-1', {
    id: 'inm-1', inmuebleId: 'inm-1', direccion: 'Calle Ficticia 1', ciudad: 'Alicante',
  });
  // H-06 — documento PRIVADO del inmueble: sin `tokenSolicitud`, es decir, un
  // inmueble heredado al que aún se le acepta el enlace `sol-<id>`.
  puerto.poner('inmuebles/inm-1', { id: 'inm-1', direccion: 'Calle Ficticia 1' });
  puerto.poner('candidatos/cand-1', {
    nombre: 'Ana Sintética',
    telefono: '600000001',
    email: 'ana@example.test',
    inmuebleId: 'inm-1',
    inmuebleNombre: 'Piso Ficticio',
    numPersonas: 2,
    ingresosNetos: 2000,
    tipoEmpleo: 'cuenta_ajena',
    tipoContrato: 'indefinido',
    antiguedadLaboral: '2 años',
    otrosIngresos: 0,
    avalista: false,
    estado: 'preseleccionado',
    cuestionarioToken: 'q-token-123456',
    // Datos privados que el portal no debe devolver.
    notasPrivadas: [{ texto: 'no mostrar' }],
    documentosAnalizados: [{ nombre: 'privado' }],
    informesHistorico: [{ informe: 'privado' }],
    scoreEstimado: 88,
    ratioSolvencia: 30,
    observaciones: 'Texto del candidato',
    cuestionarioIncidencias: {
      completado: false,
      numRespuestas: 0,
      totalPreguntas: 12,
      respuestas: [],
      analisisIa: { observaciones: 'análisis privado' },
    },
  });
  puerto.poner('solicitudes_documentacion/sdoc-1', {
    token: 'doc-token-123456',
    candidatoId: 'cand-1',
    candidatoNombre: 'Ana Sintética',
    candidatoTelefono: '600000001',
    inmuebleId: 'inm-1',
    inmuebleNombre: 'Piso Ficticio',
    inmuebleCiudad: 'Alicante',
    fechaVisita: '30/10/2026 10:00',
    estado: 'SOLICITADA',
    mensajePropietario: 'Sube tu DNI y nóminas',
    notasPropietario: 'NOTA PRIVADA DEL PROPIETARIO',
    historial: [{ id: 'h-0', fecha: '2026-10-19', autor: 'propietario', accion: 'Solicitud creada' }],
    fechaCreacion: '2026-10-19T10:00:00.000Z',
    documentos: [
      {
        id: 'dni', tipo: 'dni_nie', nombre: 'DNI / NIE', obligatorio: true, estado: 'pendiente',
        archivos: [{ id: 'a-viejo', nombreArchivo: 'viejo.pdf', mimeType: 'application/pdf', base64Data: 'QUJD' }],
      },
      {
        id: 'nomina', tipo: 'nomina', nombre: 'Nóminas', obligatorio: true, estado: 'pendiente', archivos: [],
      },
    ],
  });

  return { puerto, servicio: crearServicioPortalPublico({ puerto, ahora: () => AHORA }) };
}

const ARCHIVO_VALIDO = {
  id: 'file-1',
  nombreArchivo: 'dni.pdf',
  mimeType: 'application/pdf',
  url: 'https://firebasestorage.googleapis.com/v0/b/demo/o/documentos_solicitados%2Fsdoc-1%2Fdni?alt=media&token=x',
  storagePath: 'documentos_solicitados/sdoc-1/dni_1700000000000_dni.pdf',
  tamañoBytes: 1234,
  fechaSubida: '2026-10-20',
};

async function esperarCodigo(promesa: Promise<unknown>, codigo: string): Promise<void> {
  await expect(promesa).rejects.toMatchObject({ codigo });
}

describe('AG-02 · visita pública por token', () => {
  it('resuelve la invitación, devuelve lista blanca y marca ABIERTO en el servidor', async () => {
    const { puerto, servicio } = mundo();
    const datos = await servicio.obtenerVisita('vst-token-123456');

    expect(datos.invitacion).toMatchObject({
      id: 'inv-1', candidateNombre: 'Ana Sintética', inmuebleId: 'inm-1', status: 'ABIERTO',
    });
    expect(datos.invitacion).not.toHaveProperty('scoreSolvencia');
    expect(datos.invitacion).not.toHaveProperty('perfilOperativo');
    expect(datos.invitacion).not.toHaveProperty('solicitudEstado');
    expect(puerto.docs.get('invitaciones/inv-1')?.datos.status).toBe('ABIERTO');

    // Solo los slots del inmueble de la invitación, sin identidad de otros.
    expect(datos.slots.map((s) => s.id)).toEqual(['slot-2', 'slot-1', 'slot-3']);
    expect(datos.slots.map((s) => s.id)).not.toContain('slot-ajeno');
    expect(datos.slots.find((s) => s.id === 'slot-2')).not.toHaveProperty('reservaCandidateId');
    expect(datos.slots.find((s) => s.id === 'slot-2')).not.toHaveProperty('reservaCandidateNombre');
    expect(datos.slots.find((s) => s.id === 'slot-3')?.disponible).toBe(false);
  });

  it('un token inexistente o mal formado termina en 404, sin leer nada más', async () => {
    const { servicio } = mundo();
    await esperarCodigo(servicio.obtenerVisita('vst-no-existe-999'), 'ENLACE_NO_VALIDO');
    await esperarCodigo(servicio.obtenerVisita('../etc/passwd'), 'ENLACE_NO_VALIDO');
  });

  it('reserva de forma atómica: slot, invitación y candidato', async () => {
    const { puerto, servicio } = mundo();
    const resultado = await servicio.reservarVisita('vst-token-123456', { slotId: 'slot-1', notas: 'Voy acompañada' });

    expect(resultado.slot?.disponible).toBe(false);
    expect(resultado.candidatoEstado).toBe('visita_reservada');
    expect(resultado.invitacion).toMatchObject({ status: 'HORARIO RESERVADO' });
    expect((resultado.invitacion.reserva as Record<string, unknown>).direccionCompleta).toBe('Calle Ficticia 1, Alicante');
    expect((resultado.invitacion.reserva as Record<string, unknown>).notasCandidato).toBe('Voy acompañada');

    expect(puerto.commits).toHaveLength(1);
    expect(puerto.commits[0]).toHaveLength(3);
    expect(puerto.docs.get('slots_visita/slot-1')?.datos).toMatchObject({
      disponible: false, reservaCandidateId: 'cand-1', reservaInvitationId: 'inv-1',
    });
    expect(puerto.docs.get('invitaciones/inv-1')?.datos.status).toBe('HORARIO RESERVADO');
    expect(puerto.docs.get('candidatos/cand-1')?.datos.estado).toBe('visita_reservada');
  });

  it('no reserva un slot ocupado, bloqueado o de otro inmueble (fallo cerrado)', async () => {
    const { puerto, servicio } = mundo();
    await esperarCodigo(servicio.reservarVisita('vst-token-123456', { slotId: 'slot-2' }), 'HORARIO_NO_DISPONIBLE');
    await esperarCodigo(servicio.reservarVisita('vst-token-123456', { slotId: 'slot-3' }), 'HORARIO_NO_DISPONIBLE');
    await esperarCodigo(servicio.reservarVisita('vst-token-123456', { slotId: 'slot-ajeno' }), 'HORARIO_NO_DISPONIBLE');
    expect(puerto.commits).toHaveLength(0);
  });

  it('un candidato inexistente no fabrica la reserva (no hay transaction.update posible)', async () => {
    const { puerto, servicio } = mundo();
    puerto.docs.delete('candidatos/cand-1');
    await esperarCodigo(servicio.reservarVisita('vst-token-123456', { slotId: 'slot-1' }), 'CANDIDATO_NO_ENCONTRADO');
    expect(puerto.commits).toHaveLength(0);
  });

  it('la carrera perdida devuelve error y nunca una confirmación falsa', async () => {
    const { puerto, servicio } = mundo();
    puerto.forzarConflicto = true;
    await esperarCodigo(servicio.reservarVisita('vst-token-123456', { slotId: 'slot-1' }), 'HORARIO_NO_DISPONIBLE');
    expect(puerto.docs.get('slots_visita/slot-1')?.datos.disponible).toBe(true);
  });

  it('reenviar el mismo enlace ya reservado es idempotente; otro slot se rechaza', async () => {
    const { puerto, servicio } = mundo();
    await servicio.reservarVisita('vst-token-123456', { slotId: 'slot-1' });
    const commitsAntes = puerto.commits.length;

    const repetido = await servicio.reservarVisita('vst-token-123456', { slotId: 'slot-1' });
    expect(repetido.invitacion.status).toBe('HORARIO RESERVADO');
    expect(puerto.commits).toHaveLength(commitsAntes);

    await esperarCodigo(servicio.reservarVisita('vst-token-123456', { slotId: 'slot-2' }), 'YA_RESERVADO');
  });

  it('cancelar libera el horario, deja la invitación ABIERTO y al candidato preseleccionado', async () => {
    const { puerto, servicio } = mundo();
    await servicio.reservarVisita('vst-token-123456', { slotId: 'slot-1' });
    const resultado = await servicio.cancelarVisita('vst-token-123456');

    expect(resultado.invitacion.status).toBe('ABIERTO');
    expect(puerto.docs.get('slots_visita/slot-1')?.datos).toMatchObject({
      disponible: true, reservaCandidateId: null, reservaInvitationId: null,
    });
    expect(puerto.docs.get('invitaciones/inv-1')?.datos.reserva).toBeNull();
    expect(puerto.docs.get('candidatos/cand-1')?.datos.estado).toBe('preseleccionado');
  });

  it('cancelar sin reserva es idempotente y no escribe', async () => {
    const { puerto, servicio } = mundo();
    const resultado = await servicio.cancelarVisita('vst-token-123456');
    expect(resultado.invitacion.status).toBe('ENVIADO');
    expect(puerto.commits).toHaveLength(0);
  });
});

describe('AG-02 · cuestionario público por token', () => {
  it('devuelve solo datos del candidato y ninguna nota, score ni análisis', async () => {
    const { servicio } = mundo();
    const { candidato } = await servicio.obtenerCuestionario('q-token-123456');

    expect(candidato).toMatchObject({ id: 'cand-1', nombre: 'Ana Sintética', inmuebleId: 'inm-1' });
    for (const privado of ['notasPrivadas', 'documentosAnalizados', 'informesHistorico', 'scoreEstimado', 'ratioSolvencia']) {
      expect(candidato, privado).not.toHaveProperty(privado);
    }
    expect((candidato.cuestionarioIncidencias as Record<string, unknown>).analisisIa).toBeUndefined();
  });

  it('persiste datos validados y respuestas; ignora campos internos e idempotencia el análisis', async () => {
    const { puerto, servicio } = mundo();
    const respuesta = await servicio.guardarCuestionario('q-token-123456', {
      datos: {
        nombre: 'Ana Sintética',
        telefono: '600000001',
        email: 'ana@example.test',
        numPersonas: 2,
        ingresosNetos: 2100,
        otrosIngresos: 100,
        tipoEmpleo: 'cuenta_ajena',
        tipoContrato: 'indefinido',
        antiguedadLaboral: '2 años',
        avalista: false,
        // Campos que el cliente no puede imponer:
        propietarioId: 'prop-victima',
        notasPrivadas: [{ texto: 'inyectado' }],
        scoreEstimado: 100,
        estado: 'formalizado',
      },
      respuestas: [
        { preguntaId: 'sit_1', preguntaTitulo: 'S1', preguntaTexto: '¿?', opcionSeleccionadaId: 'A', opcionSeleccionadaTexto: 'Sí' },
        { preguntaId: 'sit_12', preguntaTitulo: 'S12', preguntaTexto: 'Cuenta', respuestaTextoLibre: 'Todo bien', esAbierta: true },
      ],
      informacionAdicional: 'Sin incidencias',
    });

    const guardado = puerto.docs.get('candidatos/cand-1')?.datos as Record<string, unknown>;
    expect(guardado.estado).toBe('analizado');
    expect(guardado.propietarioId).toBeUndefined();
    expect(guardado.notasPrivadas).toEqual([{ texto: 'no mostrar' }]);
    expect(guardado.scoreEstimado).toBe(88);
    expect((guardado.cuestionarioIncidencias as Record<string, unknown>)).toMatchObject({
      completado: true,
      numRespuestas: 2,
      totalPreguntas: 12,
      informacionAdicional: 'Sin incidencias',
    });
    // El análisis previo no se destruye al reenviar el formulario.
    expect((guardado.cuestionarioIncidencias as Record<string, unknown>).analisisIa).toEqual({ observaciones: 'análisis privado' });
    expect(respuesta.candidato).not.toHaveProperty('notasPrivadas');
  });

  it('rechaza payloads inválidos sin escribir', async () => {
    const { puerto, servicio } = mundo();
    await esperarCodigo(
      servicio.guardarCuestionario('q-token-123456', {
        datos: { nombre: 'Ana', numPersonas: 0, ingresosNetos: 1, avalista: false },
        respuestas: [{ preguntaId: 'sit_1' }],
      }),
      'PETICION_INVALIDA'
    );
    await esperarCodigo(
      servicio.guardarCuestionario('q-token-123456', {
        datos: { nombre: 'Ana', numPersonas: 1, ingresosNetos: 1, avalista: false },
        respuestas: [],
      }),
      'PETICION_INVALIDA'
    );
    expect(puerto.commits).toHaveLength(0);
  });
});

describe('AG-02 · documentación pública por token', () => {
  it('devuelve la solicitud sin notas del propietario, historial ni base64', async () => {
    const { servicio } = mundo();
    const { solicitud } = await servicio.obtenerDocumentacion('doc-token-123456');

    expect(solicitud).toMatchObject({ id: 'sdoc-1', candidatoNombre: 'Ana Sintética', estado: 'SOLICITADA' });
    expect(solicitud).not.toHaveProperty('notasPropietario');
    expect(solicitud).not.toHaveProperty('historial');
    const documentos = solicitud.documentos as Array<Record<string, unknown>>;
    const archivos = documentos[0].archivos as Array<Record<string, unknown>>;
    expect(archivos[0].base64Data).toBeUndefined();
  });

  it('aporta un archivo validado y calcula el estado parcial', async () => {
    const { puerto, servicio } = mundo();
    const docs = [
      { id: 'dni', archivos: [ARCHIVO_VALIDO] },
      { id: 'nomina', archivos: [] },
    ];
    const { solicitud } = await servicio.actualizarDocumentacion('doc-token-123456', {
      documentos: docs,
      final: true,
    });

    expect(solicitud.estado).toBe('PARCIALMENTE_APORTADA');
    expect((solicitud as Record<string, unknown>).fechaEnvioCandidato).toBeDefined();
    const guardada = puerto.docs.get('solicitudes_documentacion/sdoc-1')?.datos as Record<string, unknown>;
    const documentos = guardada.documentos as Array<Record<string, unknown>>;
    expect((documentos[0].archivos as Array<Record<string, unknown>>)[0]).toMatchObject({
      nombreArchivo: 'dni.pdf', storagePath: ARCHIVO_VALIDO.storagePath,
    });
    const historial = guardada.historial as Array<Record<string, unknown>>;
    expect(historial[historial.length - 1]).toMatchObject({ autor: 'candidato', accion: 'Documentación enviada' });
    expect(guardada.notasPropietario).toBe('NOTA PRIVADA DEL PROPIETARIO');
  });

  it('con todos los obligatorios el estado final es COMPLETADA', async () => {
    const { servicio } = mundo();
    const { solicitud } = await servicio.actualizarDocumentacion('doc-token-123456', {
      documentos: [
        { id: 'dni', archivos: [ARCHIVO_VALIDO] },
        { id: 'nomina', archivos: [{ ...ARCHIVO_VALIDO, id: 'file-2', nombreArchivo: 'nomina.pdf' }] },
      ],
      final: true,
    });
    expect(solicitud.estado).toBe('COMPLETADA');
  });

  it('rechaza rutas fuera del prefijo, URLs ajenas y base64 sin escribir', async () => {
    const { puerto, servicio } = mundo();
    const casos = [
      { ...ARCHIVO_VALIDO, storagePath: 'documentos_solicitados/otra-solicitud/dni.pdf' },
      { ...ARCHIVO_VALIDO, storagePath: 'documentos_solicitados/sdoc-1/../secreto' },
      { ...ARCHIVO_VALIDO, url: 'https://example.test/documento.pdf' },
      { ...ARCHIVO_VALIDO, base64Data: 'QUJD' },
    ];
    for (const archivo of casos) {
      await esperarCodigo(
        servicio.actualizarDocumentacion('doc-token-123456', {
          documentos: [{ id: 'dni', archivos: [archivo] }],
          final: false,
        }),
        'PETICION_INVALIDA'
      );
    }
    expect(puerto.commits).toHaveLength(0);
  });

  it('ignora items que la solicitud no define (el candidato no inventa documentación)', async () => {
    const { puerto, servicio } = mundo();
    const { solicitud } = await servicio.actualizarDocumentacion('doc-token-123456', {
      documentos: [
        { id: 'dni', archivos: [ARCHIVO_VALIDO] },
        { id: 'inventado', archivos: [ARCHIVO_VALIDO] },
      ],
      final: false,
    });
    const documentos = solicitud.documentos as Array<Record<string, unknown>>;
    expect(documentos.map((d) => d.id)).toEqual(['dni', 'nomina']);
  });

  it('no permite reemplazar el nombre ni la obligatoriedad de un item existente', async () => {
    const { puerto, servicio } = mundo();
    await servicio.actualizarDocumentacion('doc-token-123456', {
      documentos: [{ id: 'dni', nombre: 'Manipulado', obligatorio: false, archivos: [ARCHIVO_VALIDO] }],
      final: false,
    });
    const guardada = puerto.docs.get('solicitudes_documentacion/sdoc-1')?.datos as Record<string, unknown>;
    const documentos = guardada.documentos as Array<Record<string, unknown>>;
    expect(documentos[0]).toMatchObject({ id: 'dni', nombre: 'DNI / NIE', obligatorio: true });
  });
});

describe('AG-02 · errores de servicio', () => {
  it('el error público no filtra detalles técnicos en su mensaje', () => {
    const error = new ErrorPortalPublico('ENLACE_NO_VALIDO', 404, 'TOKEN_INVALIDO');
    expect(error.message).toBe('ENLACE_NO_VALIDO');
    expect(error.codigo).toBe('ENLACE_NO_VALIDO');
    expect(error.status).toBe(404);
  });
});

describe('AG-02 · capacidad y carreras (endurecimiento)', () => {
  it('el id de un documento con token emitido NO sirve como token (no hay bypass)', async () => {
    const { servicio } = mundo();
    await esperarCodigo(servicio.obtenerVisita('inv-1'), 'ENLACE_NO_VALIDO');
    await esperarCodigo(servicio.obtenerCuestionario('cand-1'), 'ENLACE_NO_VALIDO');
    await esperarCodigo(servicio.obtenerDocumentacion('sdoc-1'), 'ENLACE_NO_VALIDO');
  });

  it('un documento heredado SIN token sigue resolviéndose por id (compatibilidad)', async () => {
    const { puerto, servicio } = mundo();
    puerto.poner('candidatos/cand-legacy', {
      nombre: 'Candidatura heredada',
      numPersonas: 1,
      ingresosNetos: 1000,
      tipoEmpleo: 'cuenta_ajena',
      tipoContrato: 'indefinido',
      avalista: false,
      estado: 'nuevo',
    });
    const { candidato } = await servicio.obtenerCuestionario('cand-legacy');
    expect(candidato).toMatchObject({ id: 'cand-legacy', nombre: 'Candidatura heredada' });
  });

  it('si el ABIERTO pierde la carrera no se anuncia un estado no persistido', async () => {
    const { puerto, servicio } = mundo();
    puerto.forzarConflicto = true;
    const datos = await servicio.obtenerVisita('vst-token-123456');
    expect(datos.invitacion.status).toBe('ENVIADO');
    expect(puerto.docs.get('invitaciones/inv-1')?.datos.status).toBe('ENVIADO');
    expect(puerto.commits).toHaveLength(0);
  });

  it('cancelar no libera un slot que ya se reasignó a otra invitación', async () => {
    const { puerto, servicio } = mundo();
    await servicio.reservarVisita('vst-token-123456', { slotId: 'slot-1' });
    const slot = puerto.docs.get('slots_visita/slot-1')!;
    slot.datos.reservaInvitationId = 'inv-otra';
    slot.datos.reservaCandidateId = 'cand-otro';
    slot.datos.reservaCandidateNombre = 'Otra Persona';

    const resultado = await servicio.cancelarVisita('vst-token-123456');
    expect(resultado.invitacion.status).toBe('ABIERTO');
    expect(puerto.docs.get('slots_visita/slot-1')?.datos).toMatchObject({
      disponible: false,
      reservaCandidateId: 'cand-otro',
      reservaInvitationId: 'inv-otra',
    });
  });
});

// ---------------------------------------------------------------------------
// H-06 — Capacidad del enlace de solicitud
// ---------------------------------------------------------------------------
// El alta pública no tenía NINGUNA prueba: el token era el id del inmueble y
// bastaba con que existiera la ficha. Estos casos fijan el contrato nuevo y,
// sobre todo, el cierre: sin secreto correcto no se crea nada.
describe('H-06 · el enlace de solicitud es una capacidad, no un id', () => {
  const SOLICITUD = {
    candidatoNombre: 'Ana Sintética',
    candidatoEmail: 'ana@example.test',
    candidatoTelefono: '600000001',
    consentimientoAceptado: true,
    importeMensual: 900,
  };
  const SECRETO = 'a'.repeat(32);

  function mundoConToken(): ReturnType<typeof mundo> & { puerto: PuertoFalso } {
    const base = mundo();
    base.puerto.poner('inmuebles/inm-2', {
      id: 'inm-2',
      direccion: 'Calle Nueva 2',
      tokenSolicitud: `sol-inm-2-t${SECRETO}`,
    });
    base.puerto.poner('fichas_publicas_inmueble/inm-2', {
      id: 'inm-2', inmuebleId: 'inm-2', direccion: 'Calle Nueva 2', ciudad: 'Alicante', estado: 'disponible',
    });
    return base;
  }

  it('acepta el token firmado y crea la solicitud en el inmueble correcto', async () => {
    const { puerto, servicio } = mundoConToken();
    const resultado = await servicio.crearSolicitud(`sol-inm-2-t${SECRETO}`, { solicitud: SOLICITUD });
    const solicitudId = String(resultado.solicitud.id);
    expect(solicitudId.startsWith('sol-')).toBe(true);
    expect(resultado.solicitud.inmuebleId).toBe('inm-2');
    const creada = puerto.docs.get(`solicitudes/${solicitudId}`);
    expect(creada?.datos.inmuebleId).toBe('inm-2');
  });

  it('rechaza el id del inmueble cuando la propiedad YA tiene token emitido', async () => {
    const { servicio } = mundoConToken();
    await esperarCodigo(servicio.crearSolicitud('sol-inm-2', { solicitud: SOLICITUD }), 'ENLACE_NO_VALIDO');
    await esperarCodigo(servicio.crearSolicitud('inm-2', { solicitud: SOLICITUD }), 'ENLACE_NO_VALIDO');
  });

  it('rechaza un secreto inventado, aunque el id sea correcto', async () => {
    const { servicio } = mundoConToken();
    await esperarCodigo(
      servicio.crearSolicitud(`sol-inm-2-t${'b'.repeat(32)}`, { solicitud: SOLICITUD }),
      'ENLACE_NO_VALIDO'
    );
  });

  it('un secreto de otra propiedad tampoco sirve (no hay tokens intercambiables)', async () => {
    const { servicio } = mundoConToken();
    await esperarCodigo(
      servicio.crearSolicitud(`sol-inm-1-t${SECRETO}`, { solicitud: SOLICITUD }),
      'ENLACE_NO_VALIDO'
    );
  });

  it('mantiene el enlace heredado sol-<id> mientras la propiedad no tenga token', async () => {
    const { servicio } = mundo();
    const resultado = await servicio.crearSolicitud('sol-inm-1', { solicitud: SOLICITUD });
    expect(String(resultado.solicitud.id).startsWith('sol-')).toBe(true);
    expect(resultado.solicitud.inmuebleId).toBe('inm-1');
  });

  it('el enlace heredado caduca: pasada la fecha de corte ya no vale', async () => {
    const { puerto } = mundo();
    const servicioTardio = crearServicioPortalPublico({
      puerto,
      ahora: () => new Date('2027-06-01T00:00:00.000Z'),
    });
    await esperarCodigo(
      servicioTardio.crearSolicitud('sol-inm-1', { solicitud: SOLICITUD }),
      'ENLACE_NO_VALIDO'
    );
  });

  it('sin inmueble legible no hay capacidad, aunque exista la ficha pública', async () => {
    const { puerto, servicio } = mundo();
    puerto.docs.delete('inmuebles/inm-1');
    await esperarCodigo(servicio.crearSolicitud('sol-inm-1', { solicitud: SOLICITUD }), 'ENLACE_NO_VALIDO');
  });
});
