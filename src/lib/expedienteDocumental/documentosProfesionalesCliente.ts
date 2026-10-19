/**
 * P3 — Enlace del adaptador de documentos profesionales con las instancias de
 * la aplicación (Firestore, Storage, Auth) y con la auditoría canónica
 * `registrarAuditoriaFirestore` (audit_logs). Sin lógica propia.
 */
import { auth, db, registrarAuditoriaFirestore, storage } from '../firebase';
import { crearAdaptadorDocumentosProfesionales } from './documentosProfesionalesFirebase';

export const documentosProfesionales = crearAdaptadorDocumentosProfesionales({
  db,
  storage,
  auth,
  auditar: (payload) => registrarAuditoriaFirestore(payload),
});
