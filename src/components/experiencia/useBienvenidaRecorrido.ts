/**
 * UX-1B · Lee el progreso existente y decide si la tarjeta debe verse.
 * «Ver recorrido» delega en el host (el mismo `iniciarTutorial` de siempre).
 * «Ahora no» no marca el tutorial como completado.
 */
import { useEffect, useMemo, useState } from 'react';
import type { UsuarioApp } from '../../types';
import type { HostExperiencia, ServicioProgresoTutoriales, Tutorial, TutorialProgress } from '../../experiencia';
import {
  contextoDesdeUsuario,
  estadoRecorrido,
  hostDeTutorial,
  modoBienvenida,
  sesionDescartada,
  tutorialDeBienvenida,
  type ModoBienvenida,
} from '../../experiencia';

interface Opciones {
  usuario?: Pick<UsuarioApp, 'id' | 'tipoPerfil' | 'roles' | 'permisos'> | null;
  host?: HostExperiencia;
  servicio: ServicioProgresoTutoriales;
  reproductorAbierto: boolean;
  /** El inquilino sin contrato no tiene recorrido que pueda seguir. */
  habilitada?: boolean;
  onIniciar: (tutorialId: string) => void;
}

export function useBienvenidaRecorrido({
  usuario,
  host = 'ERP',
  servicio,
  reproductorAbierto,
  habilitada = true,
  onIniciar,
}: Opciones): {
  tutorial: Tutorial | null;
  modo: ModoBienvenida | null;
  empezar: () => void;
  ahoraNo: () => void;
} {
  const ctx = useMemo(
    () => contextoDesdeUsuario(usuario, host === 'PORTAL_INQUILINO' ? 'inicio' : undefined, { host }),
    [usuario, host]
  );
  const tutorial = useMemo(() => (habilitada ? tutorialDeBienvenida(ctx) : null), [ctx, habilitada]);
  const [progreso, setProgreso] = useState<TutorialProgress | null | undefined>(undefined);
  const [consultaFallida, setConsultaFallida] = useState(false);
  const [ocultoEnSesion, setOcultoEnSesion] = useState(false);
  const clave = `${usuario?.id ?? ''}|${usuario?.tipoPerfil ?? ''}|${host}|${habilitada ? 1 : 0}|${tutorial?.id ?? ''}`;

  useEffect(() => {
    setOcultoEnSesion(false);
    setConsultaFallida(false);
    if (!tutorial) {
      setProgreso(null);
      return;
    }
    let vivo = true;
    setProgreso(undefined);
    servicio.getTutorialProgress(tutorial.id, hostDeTutorial(tutorial)).then((r) => {
      if (!vivo) return;
      if (!r.ok) {
        setConsultaFallida(true);
        setProgreso(null);
        return;
      }
      setProgreso(r.data);
    }).catch(() => {
      if (!vivo) return;
      setConsultaFallida(true);
      setProgreso(null);
    });
    return () => {
      vivo = false;
    };
    // El servicio es estable (objeto de módulo o mock de test). La clave cubre usuario y tutorial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const estado = tutorial && progreso !== undefined && !consultaFallida ? estadoRecorrido(progreso, tutorial) : null;
  const modo =
    tutorial && estado
      ? modoBienvenida(estado, { ocultoEnSesion, reproductorAbierto })
      : null;

  const empezar = () => {
    if (!tutorial) return;
    setOcultoEnSesion(true);
    onIniciar(tutorial.id);
  };

  const ahoraNo = () => {
    setOcultoEnSesion(true);
    if (!tutorial || estado !== 'NO_INICIADO') return;
    void servicio.saveTutorialProgress(sesionDescartada(tutorial), tutorial);
  };

  return { tutorial, modo, empezar, ahoraNo };
}
