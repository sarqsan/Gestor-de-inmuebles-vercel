/**
 * AG-02 — Portal público del CUESTIONARIO servido por token.
 *
 * Antes, la App buscaba el candidato en el estado alimentado por
 * `subscribeCandidatos` (solo autenticado) y el envío escribía en Firestore
 * desde el anónimo: ambas cosas están denegadas por las reglas. El servidor
 * resuelve el token, devuelve una lista blanca del candidato y persiste las
 * respuestas con la credencial de servicio.
 */
import React, { useEffect, useState } from 'react';
import type { Candidato, Inmueble, RespuestaIncidencia } from '../../types';
import {
  cargarCuestionarioPublico,
  enviarCuestionarioPublico,
} from '../../lib/portalPublico';
import { adaptarFichaAInmuebleVista, getFichaPublicaInmueble } from '../../lib/fichaPublicaInmueble';
import { mensajeDeErrorUsuario } from '../../feedback/mensajes';
import { CuestionarioPublicoView } from '../CuestionarioPublicoView';
import { PantallaCargandoPortal, PantallaErrorPortal } from './EstadoPortalPublico';

export const CuestionarioPublicoServidor: React.FC<{ token: string }> = ({ token }) => {
  const [candidato, setCandidato] = useState<Candidato | null>(null);
  const [inmueble, setInmueble] = useState<Inmueble | undefined>(undefined);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError('');
    setCandidato(null);
    setInmueble(undefined);

    (async () => {
      try {
        const respuesta = await cargarCuestionarioPublico(token);
        if (!vivo) return;
        setCandidato(respuesta.candidato);
        if (respuesta.candidato?.inmuebleId) {
          try {
            const ficha = await getFichaPublicaInmueble(respuesta.candidato.inmuebleId);
            if (vivo && ficha) setInmueble(adaptarFichaAInmuebleVista(ficha));
          } catch {
            // La ficha es informativa; el cuestionario sigue disponible.
          }
        }
      } catch (err) {
        if (vivo) {
          setError(
            mensajeDeErrorUsuario(
              err,
              'El enlace del cuestionario no es válido o ha caducado. Contacta con la propiedad para solicitar uno nuevo.'
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

  if (cargando) return <PantallaCargandoPortal mensaje="Abriendo tu cuestionario…" />;
  if (error || !candidato) {
    return (
      <PantallaErrorPortal
        mensaje={error || 'El enlace del cuestionario no es válido o ha caducado.'}
        onReintentar={() => setIntento((n) => n + 1)}
      />
    );
  }

  return (
    <CuestionarioPublicoView
      candidato={candidato}
      inmueble={inmueble}
      onSubmit={async (
        _datos: Partial<Candidato>,
        respuestas: RespuestaIncidencia[],
        informacionAdicional: string
      ) => {
        // La vista conserva el formulario hasta que esta promesa resuelve.
        const actualizado = await enviarCuestionarioPublico(
          token,
          _datos,
          respuestas,
          informacionAdicional
        );
        setCandidato(actualizado.candidato);
      }}
    />
  );
};
