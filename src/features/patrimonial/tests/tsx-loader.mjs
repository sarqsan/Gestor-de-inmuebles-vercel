// Solo para pruebas de componentes, usando TypeScript ya declarado por el proyecto.
// No descarga ni instala paquetes; se registra únicamente si las dependencias existen.
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.css')) {
    return { format: 'module', source: 'export default {};', shortCircuit: true };
  }
  if (url.startsWith('file:') && /\.tsx?$/.test(url)) {
    const source = await readFile(new URL(url), 'utf8');
    const result = ts.transpileModule(source, {
      fileName: new URL(url).pathname,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      reportDiagnostics: true,
    });
    const errores = result.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error) ?? [];
    if (errores.length) throw new Error(errores.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
    return { format: 'module', source: result.outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
