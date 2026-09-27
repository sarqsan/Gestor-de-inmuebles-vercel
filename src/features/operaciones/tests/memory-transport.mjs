// DOBLE EN MEMORIA, no Firestore ni emulador. Solo se importa desde tests.
import { CONTEXTO_FICTICIO } from '../demo/fixtures.ts';
import { crearEstadoOperaciones } from '../service.ts';
import { proyectarIdentidad } from '../persistence/authorization.ts';
export function transporteMemoria() {
  const libros=new Map(), auditoria=new Map(), titulares=new Map([['inm-demo-1',['prop-demo-a']],['inm-demo-2',['prop-demo-a']],['inm-demo-3',['prop-demo-b']]]);
  let sesion=proyectarIdentidad('actor-ficticio',{usuarioId:'user-actor-ficticio',tipoPerfil:'PROPIETARIO',estado:'ACTIVO',propietarioId:'prop-demo-a'},{nombre:'Ficticio'}), fallo='', cola=Promise.resolve(), antesTx=null;
  const vacio=()=>({estado:crearEstadoOperaciones(),cabecera:null});
  const t={
    libros,auditoria,titulares,
    get fallo(){return fallo;},set fallo(v){fallo=v;},
    set sesion(v){sesion=v;},get sesion(){return sesion;},
    set antesTx(fn){antesTx=fn;},
    identidad:async()=>structuredClone(sesion),
    leer:async(p)=>structuredClone(libros.get(p)??vacio()),
    contexto:async(ambito)=>({...structuredClone(CONTEXTO_FICTICIO),ambito:structuredClone(ambito),ambitosPermitidos:[structuredClone(ambito)]}),
    async transaccion(p,fn){
      const previo=cola; let soltar;cola=new Promise((r)=>{soltar=r;});await previo;
      try{
        if(antesTx){const hook=antesTx;antesTx=null;hook();}
        const libro=structuredClone(libros.get(p)??vacio()), audit=structuredClone(auditoria);
        const romper=(punto)=>{if(fallo===punto)throw new Error(`Fallo simulado: ${punto}`);};
        const resultado=await fn({
          leerCabecera:async()=>structuredClone(libros.get(p)?.cabecera??null),
          comprobarInmuebleActual:async(a)=>{if(!titulares.get(a.inmuebleId)?.includes(a.propietarioId))throw new Error('Sin titularidad actual');},
          guardarEntidad(evento,id){romper('entidad');const e=evento.despues;libro.estado.historial.push(structuredClone(evento));const i=libro.estado.entidades.findIndex((r)=>r.tipo===e.tipo&&r.id===e.id);if(i<0)libro.estado.entidades.push(structuredClone(e));else libro.estado.entidades[i]=structuredClone(e);},
          crearAuditoria(id,registro){romper('auditoria');if(audit.has(id))throw new Error('Auditoría ya existe; no sobrescribir');audit.set(id,structuredClone(registro));},
          guardarCabecera(h){romper('cabecera');libro.cabecera=structuredClone(h);libro.estado.revision=h.revision;},
        });
        romper('commit');libros.set(p,libro);auditoria.clear();for(const [id,a]of audit)auditoria.set(id,a);return resultado;
      }finally{soltar();}
    },
  };return t;
}
