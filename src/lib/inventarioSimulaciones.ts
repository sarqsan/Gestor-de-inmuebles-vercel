/**
 * P0.1.7 — Inventario de SIMULACIONES (hallazgo H-23, §2.10 de la auditoría).
 * ===========================================================================
 * Objetivo: que NINGÚN botón sugiera un resultado real donde no lo hay.
 * Cada entrada declara la superficie, el estado real, el mensaje que debe ver
 * la persona usuaria y CÓMO se etiqueta hoy:
 *
 *  · `insignia` → el componente monta `<EtiquetaSimulacion id=... />`, una
 *    etiqueta visible, consistente y con `data-testid`.
 *  · `texto`    → la superficie ya mostraba un aviso explícito en su propio
 *    marcado; `textoUI` es la cadena exacta que el test verifica.
 *  · `sin_ui`   → no existe superficie de usuario (solo un adaptador/canal
 *    interno); se documenta aquí y en el código para que nadie lo anuncie
 *    como funcionalidad operativa.
 *
 * Añadir una nueva simulación aquí es obligatorio antes de exponerla en la UI.
 * Este módulo es la fuente única del etiquetado: los tests comparan el
 * inventario con los componentes reales.
 */

export type EstadoSimulacion = 'SIMULACION' | 'PENDIENTE' | 'NO_IMPLEMENTADO';
export type ModoEtiquetado = 'insignia' | 'texto' | 'sin_ui';

export interface Simulacion {
  readonly id: string;
  readonly titulo: string;
  readonly superficie: string;
  readonly estado: EstadoSimulacion;
  readonly mensaje: string;
  readonly etiquetado: ModoEtiquetado;
  /** Fragmento verificable en la UI (para `texto`) o fichero del adaptador (`sin_ui`). */
  readonly textoUI: string;
}

export const SIMULACIONES: readonly Simulacion[] = Object.freeze([
  {
    id: 'verifactu',
    titulo: 'Remisión VERI*FACTU',
    superficie: 'src/components/sections/FacturacionSection.tsx',
    estado: 'PENDIENTE',
    mensaje: 'Preparación documental local. NO hay conexión real con la AEAT: ningún registro se remite ni se valida externamente.',
    etiquetado: 'insignia',
    textoUI: 'EtiquetaSimulacion id="verifactu"',
  },
  {
    id: 'b2b',
    titulo: 'Factura electrónica B2B',
    superficie: 'src/components/sections/FacturacionSection.tsx',
    estado: 'PENDIENTE',
    mensaje: 'Adaptadores B2B no disponibles: no se envía ninguna factura a la Solución Pública ni a plataformas privadas. Pendiente de dictamen normativo.',
    etiquetado: 'insignia',
    textoUI: 'EtiquetaSimulacion id="b2b"',
  },
  {
    id: 'sindicacion',
    titulo: 'Sindicación y publicación',
    superficie: 'src/components/PublicacionInmueblesPanel.tsx',
    estado: 'PENDIENTE',
    mensaje: 'Solo valida y exporta feeds (Kyero XML, JSON, JSON-LD). NO publica automáticamente en ningún portal: los adaptadores están sin conectar.',
    etiquetado: 'insignia',
    textoUI: 'EtiquetaSimulacion id="sindicacion"',
  },
  {
    id: 'respuestaAseguradora',
    titulo: 'Respuesta de aseguradora',
    superficie: 'src/components/DetalleSolicitudSeguroModal.tsx',
    estado: 'SIMULACION',
    mensaje: 'La lectura automática de respuesta es un TEXTO SIMULADO. No constituye una respuesta real de la aseguradora.',
    etiquetado: 'texto',
    textoUI: 'registrará una lectura automática de un texto simulado, no una respuesta real',
  },
  {
    id: 'extraccionPoliza',
    titulo: 'Extracción de datos de póliza',
    superficie: 'src/components/modals/DetallePolizaModal.tsx',
    estado: 'SIMULACION',
    mensaje: 'Extracción simulada: el documento no es accesible para la IA. Revisa y confirma manualmente cualquier dato.',
    etiquetado: 'texto',
    textoUI: 'Extracción simulada - documento no accesible para IA',
  },
  {
    id: 'asistenteIA',
    titulo: 'Asistente contextual IA',
    superficie: 'src/components/sections/DashboardEjecutivoSection.tsx',
    estado: 'NO_IMPLEMENTADO',
    mensaje: 'Hueco arquitectónico preparado. El asistente de IA NO está implementado y no ofrece ningún resultado.',
    etiquetado: 'insignia',
    textoUI: 'EtiquetaSimulacion id="asistenteIA"',
  },
  {
    id: 'administracionProximamente',
    titulo: 'Módulo de administración (sección huérfana)',
    superficie: 'src/components/sections/AdministracionSection.tsx',
    estado: 'NO_IMPLEMENTADO',
    mensaje: 'Sección no montada en la navegación. Las funciones marcadas «Próximamente» no están operativas.',
    etiquetado: 'texto',
    textoUI: 'Próximamente',
  },
  {
    id: 'canalesWhatsApp',
    titulo: 'Canal WhatsApp y otras entregas no operativas',
    superficie: 'src/notificaciones/canales.ts',
    estado: 'NO_IMPLEMENTADO',
    mensaje: 'WhatsApp está DESCARTADO como canal operativo. El modo seguro de correo tampoco entrega: nunca devuelve «enviado».',
    etiquetado: 'sin_ui',
    textoUI: 'WHATSAPP: descartado como canal operativo',
  },
  {
    id: 'entregaOtp',
    titulo: 'Entrega del código OTP de actas',
    superficie: 'src/components/sections/ActasSection.tsx',
    estado: 'PENDIENTE',
    mensaje: 'El código lo genera y valida el SERVIDOR (nunca el navegador), pero sin EMAIL_PROVEEDOR/SMTP_URL en el servidor no se entrega: entonces no se emite código utilizable y la firma no se acredita.',
    etiquetado: 'insignia',
    textoUI: 'EtiquetaSimulacion id="entregaOtp"',
  },
]);

export function simulacionPorId(id: string): Simulacion | undefined {
  return SIMULACIONES.find((s) => s.id === id);
}

/** Texto común que TODA insignia debe mostrar, para que el usuario lo identifique. */
export const TEXTO_INSIGNIA = 'SIMULACIÓN / NO OPERATIVO';
