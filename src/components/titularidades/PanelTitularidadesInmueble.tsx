/**
 * TITULARIDADES DE UN INMUEBLE — CONTENEDOR CON DATOS PROPIOS
 * ===========================================================
 * Monta el `TitularidadesPanel` sobre UN inmueble concreto y resuelve su
 * información con el MISMO contrato que el Portal del Propietario:
 *
 *  · lectura por claves DETERMINISTAS (`inmuebles.titularesIds[]` →
 *    `titularidades/{inmuebleId}__{propietarioId}`), nunca por `list` ni con
 *    claves hipotéticas;
 *  · el alta/cierre/porcentaje se persiste con el veredicto REAL de la capa de
 *    datos (`ejecutarMutacion`): no se muestra éxito sin persistencia;
 *  · la búsqueda de titulares que ya existen se hace en SERVIDOR (F3).
 *
 * Se usa en la edición del inmueble (administración/gestión) y en cualquier
 * pantalla que necesite gestionar la relación de titulares sin duplicar lógica.
 * NO crea personas: sólo relaciones con fichas existentes.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { CandidatoTitular, Inmueble, MotivoCierreTitularidad, Propietario, Titularidad } from '../../types';
import { TitularidadesPanel } from './TitularidadesPanel';
import {
  actualizarPorcentajeTitularidad,
  cerrarTitularidad,
  guardarTitularidad,
  marcarTitularPrincipal,
  subscribeTitularidadesEscopo,
} from '../../lib/titularidadesFirestore';
import { buscarTitularesEnServidor } from '../../lib/busquedaTitularesServidor';
import { ejecutarMutacion } from '../../utils/mutacionFirestore';

export interface PanelTitularidadesInmuebleProps {
  inmueble: Inmueble;
  /** Titulares conocidos por el host (para nombres y fichas). */
  titulares?: readonly Propietario[];
  /** ¿Puede LEER las titularidades de este inmueble? (espejo de las Rules). */
  puedeLeer?: boolean;
  /** ¿Puede AÑADIR/CERRAR/MODIFICAR relaciones de este inmueble? */
  puedeGestionar?: boolean;
  /** ¿Puede declarar el titular fiscal principal? (por defecto, `puedeGestionar`). */
  puedeCambiarPrincipal?: boolean;
  /** Actor que firma la operación (trazabilidad). */
  actor?: { id?: string; nombre?: string };
}

export const PanelTitularidadesInmueble: React.FC<PanelTitularidadesInmuebleProps> = ({
  inmueble,
  titulares = [],
  puedeLeer = false,
  puedeGestionar = false,
  puedeCambiarPrincipal,
  actor,
}) => {
  // Claves deterministas a escuchar. Se mantienen en local para que añadir/cerrar
  // una titularidad actualice la lectura aunque el padre tarde en refrescar.
  const clavesIniciales = useMemo(
    () => (inmueble.titularesIds || []).map((pid) => ({ inmuebleId: inmueble.id, propietarioId: pid })),
    [inmueble.id, inmueble.titularesIds],
  );
  const [claves, setClaves] = useState(clavesIniciales);
  const [inmuebleLocal, setInmuebleLocal] = useState<Inmueble>(inmueble);
  const [titularidades, setTitularidades] = useState<Titularidad[]>([]);

  // Cambio de inmueble (o de su índice por una edición externa): se re-sincroniza.
  const firma = `${inmueble.id}|${(inmueble.titularesIds || []).join(',')}`;
  const firmaRef = React.useRef(firma);
  useEffect(() => {
    if (firmaRef.current === firma) return;
    firmaRef.current = firma;
    setClaves(clavesIniciales);
    setInmuebleLocal(inmueble);
  }, [firma, clavesIniciales, inmueble]);

  useEffect(() => {
    if (!puedeLeer) {
      setTitularidades([]);
      return;
    }
    return subscribeTitularidadesEscopo(
      { inmuebles: [{ id: inmueble.id, titularesIds: claves.map((c) => c.propietarioId) }] },
      setTitularidades,
    );
    // La firma del índice es la dependencia real de la escucha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeLeer, firma, claves.map((c) => c.propietarioId).join(',')]);

  const nombresPropietarios = useMemo(() => {
    const mapa: Record<string, string> = {};
    for (const t of titulares || []) mapa[t.id] = t.nombre;
    for (const t of titularidades || []) if (t.propietarioNombre) mapa[t.propietarioId] = mapa[t.propietarioId] || t.propietarioNombre;
    return mapa;
  }, [titulares, titularidades]);

  if (!puedeLeer) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600" data-testid="titularidades-sin-lectura">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <p className="text-xs">
          No tienes alcance para consultar las titularidades de este inmueble. No se ha solicitado ninguna lectura.
        </p>
      </div>
    );
  }

  const anadirTitular = async (inmuebleId: string, propietarioId: string, porcentaje: number | null) => {
    const nombre = nombresPropietarios[propietarioId];
    const resultado = await ejecutarMutacion({
      accion: () =>
        guardarTitularidad({
          inmuebleId,
          propietarioId,
          propietarioNombre: nombre,
          porcentaje,
          actor,
        }),
      mensajeExito: 'Titular añadido correctamente.',
      mensajeError: 'No se ha podido añadir el titular.',
      origenesDatos: ['titularidades'],
    });
    if (resultado.ok) {
      setClaves((previas) =>
        previas.some((c) => c.propietarioId === propietarioId)
          ? previas
          : [...previas, { inmuebleId, propietarioId }],
      );
      setInmuebleLocal((previo) => ({
        ...previo,
        titularesIds: Array.from(new Set([...(previo.titularesIds || []), propietarioId])),
      }));
    }
  };

  const cerrar = async (titularidadId: string, motivo: MotivoCierreTitularidad, detalle?: string) => {
    const titularidad = titularidades.find((t) => t.id === titularidadId);
    if (!titularidad) return;
    await ejecutarMutacion({
      accion: () => cerrarTitularidad({ titularidad, motivo, detalle, actor }),
      mensajeExito: 'Titularidad cerrada. Sigue disponible en el histórico patrimonial.',
      mensajeError: 'No se ha podido cerrar la titularidad.',
      origenesDatos: ['titularidades'],
    });
  };

  const actualizarPorcentaje = async (titularidadId: string, porcentaje: number | null) => {
    const titularidad = titularidades.find((t) => t.id === titularidadId);
    if (!titularidad) return;
    await ejecutarMutacion({
      accion: () => actualizarPorcentajeTitularidad(titularidad, porcentaje),
      mensajeExito:
        porcentaje === null
          ? 'Porcentaje marcado como pendiente (no se asume ningún reparto).'
          : `Porcentaje actualizado al ${porcentaje} %.`,
      mensajeError: 'No se ha podido actualizar el porcentaje.',
      origenesDatos: ['titularidades'],
    });
  };

  const cambiarPrincipal = async (inmuebleId: string, propietarioId: string) => {
    const resultado = await ejecutarMutacion({
      accion: () => marcarTitularPrincipal(inmuebleId, propietarioId),
      mensajeExito: 'Titular principal actualizado.',
      mensajeError: 'No se ha podido cambiar el titular principal.',
      origenesDatos: ['titularidades'],
    });
    if (resultado.ok) {
      setInmuebleLocal((previo) => ({ ...previo, propietarioPrincipalId: propietarioId }));
    }
  };

  return (
    <TitularidadesPanel
      inmueble={inmuebleLocal}
      titularidades={titularidades}
      nombresPropietarios={nombresPropietarios}
      puedeGestionar={puedeGestionar}
      puedeCambiarPrincipal={puedeCambiarPrincipal}
      onAnadirTitular={anadirTitular}
      onCerrarTitularidad={cerrar}
      onActualizarPorcentaje={actualizarPorcentaje}
      onCambiarPrincipal={cambiarPrincipal}
      onBuscarTitulares={(_inmuebleId: string, termino: string): Promise<CandidatoTitular[]> =>
        buscarTitularesEnServidor(inmueble.id, termino)
      }
    />
  );
};
