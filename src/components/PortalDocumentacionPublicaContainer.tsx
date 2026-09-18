import React, { useState, useEffect } from 'react';
import { SolicitudDocumentacion, ItemDocumentoSolicitado, SolicitudDocPublicData } from '../types';
import { PortalDocumentacionPublicaView } from './PortalDocumentacionPublicaView';
import { Loader2 } from 'lucide-react';

interface Props {
  token: string;
  localSolicitud?: SolicitudDocumentacion;
  onSubmit: (updatedDocs: ItemDocumentoSolicitado[], isFinalSubmit: boolean) => Promise<void>;
}

export const PortalDocumentacionPublicaContainer: React.FC<Props> = ({
  token,
  localSolicitud,
  onSubmit,
}) => {
  const [remoteDoc, setRemoteDoc] = useState<SolicitudDocPublicData | null>(null);
  const [loading, setLoading] = useState<boolean>(!localSolicitud);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (localSolicitud) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/public/solicitud-documentacion/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Solicitud de documentación no encontrada o enlace caducado.');
        }
        return res.json();
      })
      .then((data: SolicitudDocPublicData) => {
        if (isMounted) {
          setRemoteDoc(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Solicitud de documentación no encontrada o enlace caducado.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token, localSolicitud]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 text-white p-8 rounded-2xl shadow-xl flex flex-col items-center space-y-3">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-sm text-slate-300">Cargando portal de documentación...</p>
        </div>
      </div>
    );
  }

  const effectiveSolicitud: SolicitudDocumentacion | SolicitudDocPublicData | null =
    localSolicitud || remoteDoc;

  if (error || !effectiveSolicitud) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 text-white p-6 rounded-2xl shadow-xl text-center space-y-3 max-w-md">
          <p className="text-base font-bold text-white">Solicitud de documentación no encontrada o enlace caducado</p>
          <p className="text-xs text-slate-400">
            El enlace no es válido o ha expirado. Por favor, contacta con la propiedad o agencia inmobiliaria para solicitar un nuevo acceso.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PortalDocumentacionPublicaView
      solicitud={effectiveSolicitud}
      onSubmit={async (updatedDocs, isFinalSubmit) => {
        await onSubmit(updatedDocs, isFinalSubmit);
        if (remoteDoc) {
          setRemoteDoc({
            ...remoteDoc,
            documentos: updatedDocs,
            estado: isFinalSubmit ? 'COMPLETADA' : 'PARCIALMENTE_APORTADA',
          });
        }
      }}
    />
  );
};
