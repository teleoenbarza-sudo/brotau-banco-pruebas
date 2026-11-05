// Worker de PGlite con almacenamiento OPFS (opfs-ahp). OPFS con acceso síncrono solo funciona dentro de un worker.
import { PGlite } from './pglite/index.js';
import { worker } from './pglite/worker/index.js';
worker({
  async init(options) {
    const r = await fetch(new URL('./pglite/pglite-datos.wasm', import.meta.url));
    if (!r.ok) throw new Error('No se pudo descargar el paquete de datos de PGlite (HTTP ' + r.status + ')');
    const fsBundle = await r.blob();
    return PGlite.create({ dataDir: options.dataDir, fsBundle });
  }
});
