/**
 * AG-02 — Portal público de DOCUMENTACIÓN POST-VISITA servido por token.
 *
 * La lectura anterior recorría `solicitudes_documentacion` desde el estado
 * (vacío para un anónimo, porque `subscribeSolicitudesDoc` solo se monta con
 * sesión) y el envío se descartaba en silencio cuando no encontraba el
 * documento. Aquí la solicitud se resuelve en el servidor por token y cada
 * aportación se persiste con una lista blanca de archivos.
 *
 * La subida del binario ya usa `/api/documentos/publico/*` (AG-03.2), que
 * valida el mismo token contra la base con nombre.
 */
import React, { useEffect, useState } from 'react';
import type { ItemDocumentoSolicitado, SolicitudDocPublicData } from '../../types';
import {
  actualizarDocumentacionPublica,
  cargarDocumentacionPublica,
} from '../../lib/portalPublico';
import { mensajeDeErrorUsuario } from '../../feedback/mensajes';
import { PortalDocumentacionPublicaView } from '../PortalDocumentacionPublicaView';
import { PantallaCargandoPortal, PantallaErrorPortal } from './EstadoPortalPublico';

export const PortalDocumentacionPublicaServidor: React.FC<{ token: string }> = ({ token }) => {
  const [solicitud, setSolicitud] = useState<SolicitudDocPublicData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError('');
    setSolicitud(null);

    cargarDocumentacionPublica(token)
      .then((respuesta) => {
        if (vivo) setSolicitud(respuesta.solicitud);
      })
      .catch((err) => {
        if (vivo) {
          setError(
            mensajeDeErrorUsuario(
              err,
              'El enlace de documentación no es válido o ha caducado. Contacta con la propiedad para solicitar uno nuevo.'
            )
          );
        }
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });

    return () => {
      vivo = false;
    };
  }, [token, intento]);

  if (cargando) return <PantallaCargandoPortal mensaje="Abriendo tu solicitud de documentación…" />;
  if (error || !solicitud) {
    return (
      <PantallaErrorPortal
        mensaje={error || 'El enlace de documentación no es válido o ha caducado.'}
        onReintentar={() => setIntento((n) => n + 1)}
      />
    );
  }

  return (
    <PortalDocumentacionPublicaView
      solicitud={solicitud}
      onSubmit={async (documentos: ItemDocumentoSolicitado[], final: boolean) => {
        const respuesta = await actualizarDocumentacionPublica(token, documentos, final);
        setSolicitud(respuesta.solicitud);
      }}
    />
  );
};
