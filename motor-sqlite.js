// Worker de SQLite (build oficial) con almacenamiento OPFS «SAH pool»: no necesita cabeceras COOP/COEP.
import sqlite3InitModule from './sqlite/index.mjs';
import { sha256hex } from './sha256.js';
let db = null, pool = null;
async function abrir() {
  const sqlite3 = await sqlite3InitModule();
  pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'brotau-sahpool' });
  db = new pool.OpfsSAHPoolDb('/brotau-banco.sqlite3');
  db.createFunction({ name: 'sha256', xFunc: (_ctx, s) => sha256hex(String(s ?? '')), arity: 1, deterministic: true });
  db.exec('PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL;');
  return { version: sqlite3.version.libVersion, vfs: 'opfs-sahpool', journal: db.selectValue('PRAGMA journal_mode') };
}
self.onmessage = async (ev) => {
  const { id, op, sql, params } = ev.data;
  try {
    let res;
    if (op === 'abrir') res = await abrir();
    else if (op === 'exec') {
      res = params && params.length
        ? db.exec({ sql, bind: params, rowMode: 'object', returnValue: 'resultRows' })
        : db.exec({ sql, rowMode: 'object', returnValue: 'resultRows' });
    } else if (op === 'cerrar') { db?.close(); db = null; res = true; }
    self.postMessage({ id, ok: true, res });
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message || e) });
  }
};
