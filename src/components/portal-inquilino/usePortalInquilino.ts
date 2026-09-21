/**
 * BLOQUE E — Hook de datos del Portal del Inquilino.
 *
 * El inquilino NO lista colecciones (reglas deny list): todo se lee por
 * get() directo siguiendo contrato → índices de capacidad → documentos hijo.
 * Única excepción reconciliada: las actas D se consultan con query acotada por
 * igualdad en `contractId` (lista demostrable, sin enumeración posible).
 * Suscripción en vivo a los contratos (cambios de índices y estado) para
 * actualización inmediata cuando gestión vincula contenido.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  getCambiosByIds,
  getContratoById,
  getIncidenciasByIds,
  getInmuebleById,
  getLecturasByIds,
  getMensajesByIds,
  getSuministrosByIds,
} from '../../lib/suministrosFirestore';
import { getActasByContrato, type ActaInquilinoVM } from '../../inquilino/actasAdapter';
import type {
  CambioTitularSuministro,
  ContratoFormalizacion,
  Incidencia,
  Inmueble,
  LecturaSuministro,
  MensajePortal,
  Suministro,
  UsuarioApp,
} from '../../types';

export interface DatosPortalInquilino {
  contratos: ContratoFormalizacion[];
  inmuebles: Inmueble[];
  incidencias: Incidencia[];
  mensajes: MensajePortal[];
  suministros: Suministro[];
  lecturas: LecturaSuministro[];
  cambios: CambioTitularSuministro[];
  actas: ActaInquilinoVM[];
  loading: boolean;
  error: string | null;
  recargar: () => Promise<void>;
}

const ESTADO_INICIAL: Omit<DatosPortalInquilino, 'loading' | 'error' | 'recargar'> = {
  contratos: [],
  inmuebles: [],
  incidencias: [],
  mensajes: [],
  suministros: [],
  lecturas: [],
  cambios: [],
  actas: [],
};

export function usePortalInquilino(usuario: UsuarioApp): DatosPortalInquilino {
  const [datos, setDatos] = useState(ESTADO_INICIAL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recargaRef = useRef(0);

  const cargar = useCallback(async () => {
    const marca = ++recargaRef.current;
    const contratoIds = usuario.contratoIds || [];
    if (contratoIds.length === 0) {
      if (recargaRef.current === marca) {
        setDatos(ESTADO_INICIAL);
        setError('Tu cuenta no tiene contratos vinculados. Contacta con gestión.');
        setLoading(false);
      }
      return;
    }
    try {
      const contratos = (
        await Promise.all(contratoIds.map((id) => getContratoById(id)))
      ).filter((c): c is ContratoFormalizacion => c !== null);
      if (recargaRef.current !== marca) return;
      if (contratos.length === 0) {
        setDatos(ESTADO_INICIAL);
        setError('No se han podido cargar tus contratos. Revisa tu conexión e inténtalo de nuevo.');
        setLoading(false);
        return;
      }
      const inmuebleIds = Array.from(new Set(contratos.map((c) => c.inmuebleId).filter(Boolean)));
      const inmuebles = (
        await Promise.all(inmuebleIds.map((id) => getInmuebleById(id)))
      ).filter((v): v is Inmueble => v !== null);
      if (recargaRef.current !== marca) return;

      const incidenciaIds = contratos.flatMap((c) => c.incidenciaIds || []);
      const mensajeIds = contratos.flatMap((c) => c.mensajeIds || []);
      const suministroIds = inmuebles.flatMap((v) => v.suministroIds || []);
      const [incidencias, mensajes, suministros] = await Promise.all([
        getIncidenciasByIds(incidenciaIds),
        getMensajesByIds(mensajeIds),
        getSuministrosByIds(suministroIds),
      ]);
      if (recargaRef.current !== marca) return;

      const lecturaIds = suministros.flatMap((s) => s.lecturaIds || []);
      const cambioIds = suministros.flatMap((s) => s.cambioTitularIds || []);
      const [lecturas, cambios] = await Promise.all([
        getLecturasByIds(lecturaIds),
        getCambiosByIds(cambioIds),
      ]);
      if (recargaRef.current !== marca) return;

      const actas = (
        await Promise.all(contratos.map((c) => getActasByContrato(c.id)))
      ).flat();
      if (recargaRef.current !== marca) return;

      incidencias.sort((a, b) => (a.fechaCreacion < b.fechaCreacion ? 1 : -1));
      mensajes.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
      lecturas.sort((a, b) => (a.fechaLectura < b.fechaLectura ? 1 : -1));
      actas.sort((a, b) => (a.fechaActo < b.fechaActo ? 1 : -1));

      setDatos({ contratos, inmuebles, incidencias, mensajes, suministros, lecturas, cambios, actas });
      setError(null);
    } catch (e) {
      if (recargaRef.current !== marca) return;
      setError('No se han podido cargar los datos del portal. Inténtalo de nuevo.');
    } finally {
      if (recargaRef.current === marca) setLoading(false);
    }
  }, [usuario.contratoIds?.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true);
    cargar();
  }, [cargar]);

  // En vivo: si gestión actualiza un contrato (índices, estado, cobros), recargar.
  useEffect(() => {
    const ids = usuario.contratoIds || [];
    if (ids.length === 0) return;
    const desuscribir = ids.map((id) =>
      onSnapshot(
        doc(db, 'contratos_formalizacion', id),
        () => cargar(),
        () => undefined
      )
    );
    return () => desuscribir.forEach((u) => u());
  }, [usuario.contratoIds?.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const recargar = useCallback(async () => {
    setLoading(true);
    await cargar();
  }, [cargar]);

  return { ...datos, loading, error, recargar };
}
