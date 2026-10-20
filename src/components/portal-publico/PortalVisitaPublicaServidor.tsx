/**
 * AG-02 — Portal público de VISITA servido por token.
 *
 * Sustituye la rama anónima anterior, que dependía de `subscribeInvitaciones`
 * y `subscribeVisitSlots` (denegados por las reglas) y de
 * `bookSlotTransaction` desde el navegador. Aquí la lectura y la reserva van al
 * servidor; la vista existente solo presenta los datos y actualiza su estado
 * local con lo que el servidor confirma.
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { Inmueble, InvitacionVisita, VisitSlot } from '../../types';
import {
  cargarVisitaPublica,
  cancelarVisitaPublica,
  reservarVisitaPublica,
  type DatosVisitaPublica,
} from '../../lib/portalPublico';
import { adaptarFichaAInmuebleVista, getFichaPublicaInmueble } from '../../lib/fichaPublicaInmueble';
import { mensajeDeErrorUsuario } from '../../feedback/mensajes';
import { PortalVisitaPublicaView } from '../PortalVisitaPublicaView';
import { PantallaCargandoPortal, PantallaErrorPortal } from './EstadoPortalPublico';

function reemplazarSlot(slots: VisitSlot[], actualizado: VisitSlot | null): VisitSlot[] {
  if (!actualizado) return slots;
  return slots.map((slot) => (slot.id === actualizado.id ? actualizado : slot));
}

export const PortalVisitaPublicaServidor: React.FC<{ token: string }> = ({ token }) => {
  const [datos, setDatos] = useState<DatosVisitaPublica | null>(null);
  const [inmueble, setInmueble] = useState<Inmueble | undefined>(undefined);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError('');
    setDatos(null);
    setInmueble(undefined);

    (async () => {
      try {
        const respuesta = await cargarVisitaPublica(token);
        if (!vivo) return;
        setDatos(respuesta);
        if (respuesta.inmuebleId) {
          try {
            const ficha = await getFichaPublicaInmueble(respuesta.inmuebleId);
            if (vivo && ficha) setInmueble(adaptarFichaAInmuebleVista(ficha));
          } catch {
            // La galería es prescindible: el enlace sigue siendo válido.
          }
        }
      } catch (err) {
        if (vivo) {
          setError(
            mensajeDeErrorUsuario(
              err,
              'El enlace de visita no es válido o ha caducado. Contacta con la propiedad para solicitar uno nuevo.'
            )
          );
        }
      } finally {
        if (vivo) setCargando(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [token, intento]);

  const reservarRemoto = useCallback(
    async (slot: VisitSlot, _invitacion: InvitacionVisita, _direccion: string, notas: string) => {
      const respuesta = await reservarVisitaPublica(token, slot.id, notas);
      setDatos((prev) =>
        prev
          ? {
              ...prev,
              invitacion: respuesta.invitacion,
              slots: reemplazarSlot(prev.slots, respuesta.slot),
            }
          : prev
      );
    },
    [token]
  );

  const cancelarRemoto = useCallback(async () => {
    const respuesta = await cancelarVisitaPublica(token);
    setDatos((prev) =>
      prev
        ? {
            ...prev,
            invitacion: respuesta.invitacion,
            slots: reemplazarSlot(prev.slots, respuesta.slot),
          }
        : prev
    );
  }, [token]);

  if (cargando) return <PantallaCargandoPortal mensaje="Abriendo tu invitación…" />;
  if (error || !datos) {
    return (
      <PantallaErrorPortal
        mensaje={error || 'El enlace de visita no es válido o ha caducado.'}
        onReintentar={() => setIntento((n) => n + 1)}
      />
    );
  }

  return (
    <PortalVisitaPublicaView
      token={token}
      invitaciones={[datos.invitacion]}
      slots={datos.slots}
      inmuebles={inmueble ? [inmueble] : []}
      onUpdateInvitacion={(invitacion) =>
        setDatos((prev) => (prev ? { ...prev, invitacion } : prev))
      }
      onUpdateSlot={(slot) =>
        setDatos((prev) => (prev ? { ...prev, slots: reemplazarSlot(prev.slots, slot) } : prev))
      }
      reservarRemoto={reservarRemoto}
      cancelarRemoto={cancelarRemoto}
    />
  );
};
