export interface OpcionPregunta {
  id: 'A' | 'B' | 'C' | 'D';
  texto: string;
}

export interface PreguntaIncidenciaDef {
  id: string;
  numero: number;
  titulo: string;
  pregunta: string;
  esAbierta?: boolean;
  opciones?: OpcionPregunta[];
  placeholder?: string;
}

export const INTRO_CUESTIONARIO_TEXT = 
  "Queremos conocerte un poco mejor como futuro inquilino. Este cuestionario incluye algunas situaciones habituales que pueden ocurrir en una vivienda. No existen respuestas correctas o incorrectas. Lo importante es que respondas según lo que harías realmente.";

export const PREGUNTAS_INCIDENCIAS: PreguntaIncidenciaDef[] = [
  {
    id: 'sit_1',
    numero: 1,
    titulo: 'SITUACIÓN 1 — SE VA LA LUZ',
    pregunta: 'Estás en casa y de repente se va la electricidad. ¿Qué harías primero?',
    opciones: [
      { id: 'A', texto: 'Llamaría directamente al propietario.' },
      { id: 'B', texto: 'Comprobaría si el problema afecta solo a mi vivienda y revisaría el cuadro eléctrico.' },
      { id: 'C', texto: 'Esperaría un rato para ver si vuelve.' },
      { id: 'D', texto: 'Intentaría reparar la instalación eléctrica.' },
    ],
  },
  {
    id: 'sit_2',
    numero: 2,
    titulo: 'SITUACIÓN 2 — EL DIFERENCIAL VUELVE A SALTAR',
    pregunta: 'Has comprobado el cuadro eléctrico y el diferencial ha saltado. Lo vuelves a conectar y vuelve a saltar inmediatamente. ¿Qué harías?',
    opciones: [
      { id: 'A', texto: 'Lo intentaría conectar repetidamente.' },
      { id: 'B', texto: 'Desconectaría los aparatos que estuvieran funcionando y avisaría si el problema continúa.' },
      { id: 'C', texto: 'Intentaría desmontar el cuadro eléctrico.' },
      { id: 'D', texto: 'Llamaría inmediatamente al propietario sin realizar ninguna comprobación.' },
    ],
  },
  {
    id: 'sit_3',
    numero: 3,
    titulo: 'SITUACIÓN 3 — DESAGÜE LENTO',
    pregunta: 'El fregadero empieza a desaguar lentamente. ¿Qué harías?',
    opciones: [
      { id: 'A', texto: 'Avisaría inmediatamente al propietario.' },
      { id: 'B', texto: 'Intentaría comprobar si existe una obstrucción sencilla y utilizaría un método doméstico adecuado.' },
      { id: 'C', texto: 'Desmontaría las tuberías aunque no supiera hacerlo.' },
      { id: 'D', texto: 'No haría nada hasta que el fregadero dejara de funcionar.' },
    ],
  },
  {
    id: 'sit_4',
    numero: 4,
    titulo: 'SITUACIÓN 4 — AIRE ACONDICIONADO',
    pregunta: 'El aire acondicionado deja de funcionar. ¿Qué harías?',
    opciones: [
      { id: 'A', texto: 'Comprobaría alimentación eléctrica, mando y configuraciones básicas.' },
      { id: 'B', texto: 'Avisaría directamente al propietario.' },
      { id: 'C', texto: 'Intentaría desmontar el aparato para repararlo.' },
      { id: 'D', texto: 'Esperaría varios días antes de comunicarlo.' },
    ],
  },
  {
    id: 'sit_5',
    numero: 5,
    titulo: 'SITUACIÓN 5 — PERSIANA',
    pregunta: 'Una persiana empieza a atascarse. ¿Qué harías?',
    opciones: [
      { id: 'A', texto: 'Forzaría la persiana hasta conseguir bajarla.' },
      { id: 'B', texto: 'Comprobaría si existe algo visible que esté impidiendo su funcionamiento y, si no puedo solucionarlo, avisaría.' },
      { id: 'C', texto: 'Desmontaría el mecanismo.' },
      { id: 'D', texto: 'Avisaría inmediatamente sin realizar ninguna comprobación.' },
    ],
  },
  {
    id: 'sit_6',
    numero: 6,
    titulo: 'SITUACIÓN 6 — GRIFO QUE GOTEA',
    pregunta: 'Un grifo empieza a gotear ligeramente. ¿Qué harías?',
    opciones: [
      { id: 'A', texto: 'Avisaría al propietario.' },
      { id: 'B', texto: 'Intentaría identificar de dónde procede la fuga y comprobaría si existe una solución sencilla.' },
      { id: 'C', texto: 'Desmontaría completamente el grifo.' },
      { id: 'D', texto: 'Ignoraría el problema mientras siga funcionando.' },
    ],
  },
  {
    id: 'sit_7',
    numero: 7,
    titulo: 'SITUACIÓN 7 — PEQUEÑA HUMEDAD',
    pregunta: 'Observas una pequeña mancha de humedad en una pared. ¿Qué harías?',
    opciones: [
      { id: 'A', texto: 'No haría nada mientras no aumente.' },
      { id: 'B', texto: 'Intentaría localizar el origen y comunicaría la incidencia al propietario aportando fotografías.' },
      { id: 'C', texto: 'Pintaría encima de la mancha.' },
      { id: 'D', texto: 'Intentaría abrir la pared para buscar la fuga.' },
    ],
  },
  {
    id: 'sit_8',
    numero: 8,
    titulo: 'SITUACIÓN 8 — LLAVES',
    pregunta: 'Has perdido las llaves de la vivienda. ¿Qué harías?',
    opciones: [
      { id: 'A', texto: 'Intentaría abrir la puerta por mis propios medios.' },
      { id: 'B', texto: 'Avisaría al propietario y buscaría una solución adecuada.' },
      { id: 'C', texto: 'Esperaría a que alguien saliera del edificio.' },
      { id: 'D', texto: 'Llamaría directamente a un cerrajero y posteriormente informaría.' },
    ],
  },
  {
    id: 'sit_9',
    numero: 9,
    titulo: 'SITUACIÓN 9 — ELECTRODOMÉSTICO',
    pregunta: 'La lavadora deja de funcionar y muestra un código de error. ¿Qué harías?',
    opciones: [
      { id: 'A', texto: 'Buscaría el significado del código y comprobaría las indicaciones básicas del fabricante.' },
      { id: 'B', texto: 'Llamaría inmediatamente al propietario.' },
      { id: 'C', texto: 'Desmontaría la lavadora.' },
      { id: 'D', texto: 'Seguiría utilizándola aunque el problema persista.' },
    ],
  },
  {
    id: 'sit_10',
    numero: 10,
    titulo: 'SITUACIÓN 10 — PROBLEMA URGENTE',
    pregunta: 'Detectas una fuga importante de agua y el agua está llegando al suelo. ¿Qué harías primero?',
    opciones: [
      { id: 'A', texto: 'Intentaría localizar y cerrar la llave de paso si es posible y avisaría inmediatamente.' },
      { id: 'B', texto: 'Esperaría para comprobar si deja de salir agua.' },
      { id: 'C', texto: 'Llamaría primero al propietario y no haría nada mientras espero.' },
      { id: 'D', texto: 'Intentaría reparar la tubería.' },
    ],
  },
  {
    id: 'sit_11',
    numero: 11,
    titulo: 'SITUACIÓN 11 — INFORMACIÓN',
    pregunta: 'Te encuentras con un problema en la vivienda que no sabes solucionar. ¿Qué sueles hacer?',
    opciones: [
      { id: 'A', texto: 'Busco información fiable para entender el problema y comprobar si puedo resolverlo.' },
      { id: 'B', texto: 'Aviso directamente al propietario.' },
      { id: 'C', texto: 'Pregunto a familiares o amigos.' },
      { id: 'D', texto: 'Intento solucionarlo por mi cuenta aunque no tenga información suficiente.' },
    ],
  },
  {
    id: 'sit_12',
    numero: 12,
    titulo: 'SITUACIÓN 12 — RESPUESTA ABIERTA',
    pregunta: 'Imagina que un sábado por la tarde detectas que el aire acondicionado no enfría correctamente. Explícanos qué harías desde que detectas el problema hasta que queda solucionado.',
    esAbierta: true,
    placeholder: 'Explícanos los pasos que darías...',
  },
];

export const PREGUNTA_INFORMACION_ADICIONAL = {
  titulo: 'INFORMACIÓN ADICIONAL',
  pregunta: '¿Hay algún aspecto relacionado con el mantenimiento de una vivienda que consideres importante que conozcamos?',
  placeholder: 'Indica cualquier observación o aspecto relevante...',
};
