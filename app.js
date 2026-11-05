// Banco de pruebas de almacenamiento local de Brotau (v3). Ver README.md.
const VERSION_BANCO = '3';
const MOTORES = {
  'pglite-idb':  { nombre: 'PGlite · IndexedDB', corto: 'PGlite IDB', dialecto: 'pg', nota: 'Control: la vía descartada en iPhone por el espacio.' },
  'pglite-opfs': { nombre: 'PGlite · OPFS', corto: 'PGlite OPFS', dialecto: 'pg', nota: 'PostgreSQL con almacenamiento OPFS (escribe en el sitio).' },
  'sqlite-opfs': { nombre: 'SQLite · OPFS', corto: 'SQLite OPFS', dialecto: 'sqlite', nota: 'Plan B del ADR: SQLite oficial con almacenamiento OPFS.' },
};
const N_UNO = 300, N_LOTE = 1000, N_CIERRE = 6000;
const CLAVE_RES = 'brotau-banco-resultados', CLAVE_BORRAR = 'brotau-banco-borrar', CLAVE_MOTOR = 'brotau-banco-motor';
const $ = id => document.getElementById(id);
const nf = new Intl.NumberFormat('es-ES');
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

const params = new URLSearchParams(location.search);
const motorId = MOTORES[params.get('motor')] ? params.get('motor') : (MOTORES[lsGet(CLAVE_MOTOR)] ? lsGet(CLAVE_MOTOR) : 'pglite-opfs');
lsSet(CLAVE_MOTOR, motorId);
const MOTOR = MOTORES[motorId];
const CLAVE_ANTES = 'brotau-banco-antes-' + motorId;
let db = null, dispositivo = null;

// ---------- utilidades ----------
function uuidv7(){
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  let ts = Date.now();
  for (let i = 5; i >= 0; i--){ b[i] = ts % 256; ts = Math.floor(ts / 256); }
  b[6] = (b[6] & 0x0f) | 0x70; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function lsGet(k){ try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k,v){ try { localStorage.setItem(k,v); } catch {} }
function lsDel(k){ try { localStorage.removeItem(k); } catch {} }
const respirar = () => new Promise(r => setTimeout(r, 0));
function pill(id, estado, texto){ const el = $(id); el.className = 'pill ' + estado; el.textContent = texto; }
function setVal(id, texto, cls){ const el = $(id); el.textContent = texto; el.className = cls ? 'v-' + cls : ''; }
function barra(id, frac){ const el = $(id); el.hidden = false; el.firstElementChild.style.width = Math.min(100, frac*100).toFixed(1) + '%'; }
function ms(x){ return x < 1000 ? nf.format(Math.round(x)) + ' ms' : nf1.format(x/1000) + ' s'; }
function pct(arr, q){ const a = [...arr].sort((x,y)=>x-y); return a[Math.min(a.length-1, Math.floor(q*(a.length-1)))]; }
function sistema(){
  const ua = navigator.userAgent, app = / Claude\//.test(ua);
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS · ' + (app ? 'app Claude' : /CriOS/.test(ua) ? 'Chrome' : 'Safari');
  if (/Android/.test(ua)) return 'Android · ' + (app ? 'app Claude' : /Firefox/.test(ua) ? 'Firefox' : /SamsungBrowser/.test(ua) ? 'Samsung' : 'Chrome');
  if (/Mac OS X/.test(ua)) return 'macOS'; if (/Windows/.test(ua)) return 'Windows'; return 'Otro';
}
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function enMarco(){ try { return window.top !== window.self; } catch { return true; } }
let wakeLock = null;
async function mantenerPantalla(on){
  try { if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
        if (!on && wakeLock){ await wakeLock.release(); wakeLock = null; } } catch {}
}
const BOTONES = ['b-uno','b-lote','b-cadena','b-cierre','b-antes','b-despues'];
function bloquear(on){
  for (const id of BOTONES) $(id).disabled = on || !db;
  pill('st-pruebas', on ? 'run' : (db ? 'ok' : 'idle'), on ? 'Prueba en marcha' : (db ? 'Listo' : 'Esperando la base'));
}
async function entorno(){
  const e = { sistema: sistema(), navegador: navigator.userAgent, instalada: instalada(), en_marco: enMarco(), contexto_seguro: isSecureContext,
              nucleos: navigator.hardwareConcurrency || null, pglite: '0.5.10', sqlite: '3.53.4', motor: motorId, banco: VERSION_BANCO,
              persistente: null, uso_mb: null, cuota_mb: null, heap_js_mb: null };
  try { if (navigator.storage?.persisted) e.persistente = await navigator.storage.persisted(); } catch {}
  try { const est = await navigator.storage?.estimate?.(); if (est){ e.uso_mb = +(est.usage/1048576).toFixed(1); e.cuota_mb = Math.round(est.quota/1048576); } } catch {}
  if (performance.memory) e.heap_js_mb = +(performance.memory.usedJSHeapSize/1048576).toFixed(1);
  return e;
}
async function pintarEntorno(){
  const e = await entorno();
  setVal('e-sistema', e.sistema);
  setVal('e-instalada', e.instalada ? 'Sí' : 'No', e.instalada ? 'ok' : 'warn');
  $('aviso-instalar').hidden = e.instalada;
  setVal('e-persist', e.persistente === null ? 'No disponible' : e.persistente ? 'Concedido' : 'No concedido', e.persistente ? 'ok' : 'warn');
  const lleno = e.uso_mb !== null && e.cuota_mb ? e.uso_mb / e.cuota_mb : 0;
  setVal('e-espacio', e.uso_mb === null ? 'No disponible' : `${nf1.format(e.uso_mb)} MB / ${nf.format(e.cuota_mb)} MB (${Math.round(lleno*100)} %)`, lleno > .7 ? 'bad' : lleno > .4 ? 'warn' : '');
  setVal('e-mem', e.heap_js_mb === null ? 'No disponible' : `${nf1.format(e.heap_js_mb)} MB (JS)`);
  return e;
}

// ---------- motores ----------
class MotorPG {   // PGlite (hilo principal) o PGliteWorker (OPFS): misma interfaz
  constructor(pg){ this.pg = pg; this.dialecto = 'pg'; }
  query(sql, p){ return this.pg.query(sql, p); }
  exec(sql){ return this.pg.exec(sql); }
  transaction(fn){ return this.pg.transaction(fn); }
  async cerrar(){ try { await this.pg.close(); } catch {} }
}
class MotorSQ {   // SQLite en un worker, por mensajes
  constructor(w){ this.w = w; this.dialecto = 'sqlite'; this.n = 0; this.pend = new Map();
    w.onmessage = ev => { const { id, ok, res, error } = ev.data; const p = this.pend.get(id); if (!p) return; this.pend.delete(id); ok ? p.ok(res) : p.ko(new Error(error)); };
    w.onerror = ev => { for (const p of this.pend.values()) p.ko(new Error(ev.message || 'Fallo del worker de SQLite')); this.pend.clear(); };
  }
  rpc(op, extra = {}){ const id = ++this.n; return new Promise((ok, ko) => { this.pend.set(id, { ok, ko }); this.w.postMessage({ id, op, ...extra }); }); }
  async query(sql, params){ return { rows: await this.rpc('exec', { sql, params: params || [] }) }; }
  exec(sql){ return this.rpc('exec', { sql }); }
  async transaction(fn){
    await this.query('BEGIN IMMEDIATE'); let cerrada = false;
    const tx = { query: (s, p) => this.query(s, p), exec: s => this.exec(s), rollback: async () => { await this.query('ROLLBACK'); cerrada = true; } };
    try { const r = await fn(tx); if (!cerrada) await this.query('COMMIT'); return r; }
    catch (e) { if (!cerrada) { try { await this.query('ROLLBACK'); } catch {} } throw e; }
  }
  async cerrar(){ try { await this.rpc('cerrar'); } catch {} }
}
async function abrirMotor(){
  if (motorId === 'pglite-idb'){
    const mod = await import('./pglite/index.js');
    const r = await fetch('./pglite/pglite-datos.wasm'); if (!r.ok) throw new Error('No se pudo descargar el paquete de datos de PGlite (HTTP ' + r.status + ')');
    const fsBundle = await r.blob();
    return { motor: new MotorPG(await mod.PGlite.create('idb://brotau-banco', { fsBundle })), info: {} };
  }
  if (motorId === 'pglite-opfs'){
    if (!navigator.storage?.getDirectory) throw new Error('Este navegador no ofrece OPFS en esta página.');
    const { PGliteWorker } = await import('./pglite/worker/index.js');
    const w = new Worker(new URL('./motor-pglite.js', import.meta.url), { type: 'module' });
    const pg = await PGliteWorker.create(w, { dataDir: 'opfs-ahp://brotau-banco' });
    return { motor: new MotorPG(pg), info: {} };
  }
  if (!navigator.storage?.getDirectory) throw new Error('Este navegador no ofrece OPFS en esta página.');
  const w = new Worker(new URL('./motor-sqlite.js', import.meta.url), { type: 'module' });
  const m = new MotorSQ(w);
  const info = await m.rpc('abrir');
  return { motor: m, info };
}

// ---------- SQL por dialecto ----------
const SQL = {
  pg: {
    esquema: `
CREATE TABLE IF NOT EXISTS dispositivo (id text PRIMARY KEY, creado_en timestamptz NOT NULL DEFAULT now());
CREATE SEQUENCE IF NOT EXISTS codigo_seq;
CREATE TABLE IF NOT EXISTS op_log (
  op_id uuid PRIMARY KEY, entidad text NOT NULL, entidad_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('crear','actualizar','eliminar')),
  datos jsonb NOT NULL, dispositivo_id text NOT NULL, autor text NOT NULL,
  fecha timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE IF NOT EXISTS trasplante (
  id uuid PRIMARY KEY, codigo text NOT NULL UNIQUE, protocolo_version text NOT NULL,
  estado text NOT NULL, fecha date NOT NULL, profundidad_m numeric(5,2),
  lat_original double precision, lon_original double precision, precision_m real,
  geom jsonb, datos jsonb NOT NULL DEFAULT '{}', lote text,
  creado_en timestamptz NOT NULL DEFAULT clock_timestamp(), eliminado_en timestamptz);
CREATE INDEX IF NOT EXISTS trasplante_lote ON trasplante (lote);
CREATE TABLE IF NOT EXISTS auditoria (
  n bigserial PRIMARY KEY, tabla text NOT NULL, registro_id uuid NOT NULL, accion text NOT NULL,
  antes jsonb, despues jsonb, fecha timestamptz NOT NULL DEFAULT clock_timestamp(),
  hash_prev text NOT NULL, hash text NOT NULL);
CREATE TABLE IF NOT EXISTS prueba_cierre (
  lote text PRIMARY KEY, objetivo int NOT NULL, estado text NOT NULL,
  inicio timestamptz NOT NULL DEFAULT clock_timestamp(), fin timestamptz);
CREATE OR REPLACE FUNCTION auditar() RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE prev text; a jsonb; d jsonb; rid uuid;
BEGIN
  SELECT hash INTO prev FROM auditoria ORDER BY n DESC LIMIT 1;
  IF prev IS NULL THEN prev := repeat('0', 64); END IF;
  IF TG_OP = 'DELETE' THEN a := to_jsonb(OLD); d := NULL; rid := OLD.id;
  ELSIF TG_OP = 'UPDATE' THEN a := to_jsonb(OLD); d := to_jsonb(NEW); rid := NEW.id;
  ELSE a := NULL; d := to_jsonb(NEW); rid := NEW.id; END IF;
  INSERT INTO auditoria (tabla, registro_id, accion, antes, despues, hash_prev, hash)
  VALUES (TG_TABLE_NAME, rid, TG_OP, a, d, prev,
    encode(sha256(convert_to(prev || '|' || TG_TABLE_NAME || '|' || rid::text || '|' || TG_OP || '|' ||
      coalesce(a::text, '') || '|' || coalesce(d::text, ''), 'UTF8')), 'hex'));
  RETURN NULL;
END $f$;
CREATE OR REPLACE FUNCTION solo_anadir() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN RAISE EXCEPTION 'Tabla de solo añadir: % no permitido en %', TG_OP, TG_TABLE_NAME; END $f$;
CREATE OR REPLACE TRIGGER trasplante_auditoria AFTER INSERT OR UPDATE OR DELETE ON trasplante FOR EACH ROW EXECUTE FUNCTION auditar();
CREATE OR REPLACE TRIGGER auditoria_solo_anadir BEFORE UPDATE OR DELETE ON auditoria FOR EACH ROW EXECUTE FUNCTION solo_anadir();
CREATE OR REPLACE TRIGGER op_log_solo_anadir BEFORE UPDATE OR DELETE ON op_log FOR EACH ROW EXECUTE FUNCTION solo_anadir();`,
    verificar: `
WITH c AS (
  SELECT n, hash_prev, hash, lag(hash) OVER (ORDER BY n) AS prev_real,
    encode(sha256(convert_to(hash_prev || '|' || tabla || '|' || registro_id::text || '|' || accion || '|' ||
      coalesce(antes::text, '') || '|' || coalesce(despues::text, ''), 'UTF8')), 'hex') AS recalculado
  FROM auditoria)
SELECT count(*)::int AS total,
  count(*) FILTER (WHERE hash <> recalculado)::int AS huellas_malas,
  count(*) FILTER (WHERE prev_real IS NOT NULL AND hash_prev <> prev_real)::int AS enlaces_rotos,
  count(*) FILTER (WHERE prev_real IS NULL AND hash_prev <> repeat('0', 64))::int AS inicio_malo
FROM c`,
    contar: `SELECT (SELECT count(*) FROM trasplante)::int AS trasplantes, (SELECT count(*) FROM op_log)::int AS operaciones, (SELECT count(*) FROM auditoria)::int AS auditoria`,
    disp_leer: 'SELECT id FROM dispositivo LIMIT 1',
    disp_crear: 'INSERT INTO dispositivo (id) VALUES ($1)',
    cierre_iniciar: `INSERT INTO prueba_cierre (lote, objetivo, estado) VALUES ($1, $2, 'iniciada')`,
    cierre_pendientes: `SELECT lote, objetivo FROM prueba_cierre WHERE estado = 'iniciada'`,
    cierre_contar: 'SELECT count(*)::int AS n FROM trasplante WHERE lote = $1',
    cierre_marcar: `UPDATE prueba_cierre SET estado = $2, fin = clock_timestamp() WHERE lote = $1`,
    alterar_quitar: 'ALTER TABLE auditoria DISABLE TRIGGER auditoria_solo_anadir',
    alterar: `UPDATE auditoria SET despues = jsonb_set(despues, '{profundidad_m}', '99') WHERE n = (SELECT n FROM auditoria WHERE despues IS NOT NULL ORDER BY n OFFSET (SELECT count(*)/2 FROM auditoria) LIMIT 1)`,
    async insertar(q, d){
      await q.query(`INSERT INTO op_log (op_id, entidad, entidad_id, tipo, datos, dispositivo_id, autor) VALUES ($1, 'trasplante', $2, 'crear', $3::text::jsonb, $4, 'prueba')`,
        [d.op_id, d.id, d.op_datos, dispositivo]);
      const r = await q.query(`INSERT INTO trasplante (id, codigo, protocolo_version, estado, fecha, profundidad_m, lat_original, lon_original, precision_m, geom, datos, lote)
        VALUES ($1, 'TR-' || $2 || '-' || lpad(nextval('codigo_seq')::text, 6, '0'), 'posidonia-borrador-v0', 'vivo', current_date, $3, $4, $5, $6, $7::text::jsonb, $8::text::jsonb, $9) RETURNING codigo`,
        [d.id, dispositivo, d.prof, d.lat, d.lon, d.prec, d.geom, d.datos, d.lote]);
      return r.rows[0].codigo;
    },
  },
  sqlite: {
    esquema: `
CREATE TABLE IF NOT EXISTS dispositivo (id TEXT PRIMARY KEY, creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS contador (nombre TEXT PRIMARY KEY, valor INTEGER NOT NULL);
INSERT OR IGNORE INTO contador VALUES ('trasplante', 0);
CREATE TABLE IF NOT EXISTS op_log (
  op_id TEXT PRIMARY KEY, entidad TEXT NOT NULL, entidad_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('crear','actualizar','eliminar')),
  datos TEXT NOT NULL CHECK (json_valid(datos)), dispositivo_id TEXT NOT NULL, autor TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS trasplante (
  id TEXT PRIMARY KEY, codigo TEXT NOT NULL UNIQUE, protocolo_version TEXT NOT NULL,
  estado TEXT NOT NULL, fecha TEXT NOT NULL, profundidad_m REAL,
  lat_original REAL, lon_original REAL, precision_m REAL,
  geom TEXT CHECK (geom IS NULL OR json_valid(geom)), datos TEXT NOT NULL DEFAULT '{}', lote TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), eliminado_en TEXT);
CREATE INDEX IF NOT EXISTS trasplante_lote ON trasplante (lote);
CREATE TABLE IF NOT EXISTS auditoria (
  n INTEGER PRIMARY KEY AUTOINCREMENT, tabla TEXT NOT NULL, registro_id TEXT NOT NULL, accion TEXT NOT NULL,
  antes TEXT, despues TEXT, fecha TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  hash_prev TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS prueba_cierre (
  lote TEXT PRIMARY KEY, objetivo INTEGER NOT NULL, estado TEXT NOT NULL,
  inicio TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), fin TEXT);
CREATE TRIGGER IF NOT EXISTS trasplante_auditoria AFTER INSERT ON trasplante BEGIN
  INSERT INTO auditoria (tabla, registro_id, accion, antes, despues, hash_prev, hash)
  SELECT 'trasplante', NEW.id, 'INSERT', NULL, d.j, p.h, sha256(p.h || '|trasplante|' || NEW.id || '|INSERT||' || d.j)
  FROM (SELECT coalesce((SELECT hash FROM auditoria ORDER BY n DESC LIMIT 1), hex(zeroblob(32))) AS h) AS p,
       (SELECT json_object('id', NEW.id, 'codigo', NEW.codigo, 'protocolo_version', NEW.protocolo_version, 'estado', NEW.estado,
          'fecha', NEW.fecha, 'profundidad_m', NEW.profundidad_m, 'lat_original', NEW.lat_original, 'lon_original', NEW.lon_original,
          'precision_m', NEW.precision_m, 'geom', json(NEW.geom), 'datos', json(NEW.datos), 'lote', NEW.lote) AS j) AS d;
END;
CREATE TRIGGER IF NOT EXISTS auditoria_solo_anadir_u BEFORE UPDATE ON auditoria BEGIN SELECT RAISE(ABORT, 'Tabla de solo añadir'); END;
CREATE TRIGGER IF NOT EXISTS auditoria_solo_anadir_d BEFORE DELETE ON auditoria BEGIN SELECT RAISE(ABORT, 'Tabla de solo añadir'); END;
CREATE TRIGGER IF NOT EXISTS op_log_solo_anadir_u BEFORE UPDATE ON op_log BEGIN SELECT RAISE(ABORT, 'Tabla de solo añadir'); END;
CREATE TRIGGER IF NOT EXISTS op_log_solo_anadir_d BEFORE DELETE ON op_log BEGIN SELECT RAISE(ABORT, 'Tabla de solo añadir'); END;`,
    verificar: `
WITH c AS (
  SELECT n, hash_prev, hash, lag(hash) OVER (ORDER BY n) AS prev_real,
    sha256(hash_prev || '|' || tabla || '|' || registro_id || '|' || accion || '|' || coalesce(antes, '') || '|' || coalesce(despues, '')) AS recalculado
  FROM auditoria)
SELECT count(*) AS total,
  coalesce(sum(hash <> recalculado), 0) AS huellas_malas,
  coalesce(sum(prev_real IS NOT NULL AND hash_prev <> prev_real), 0) AS enlaces_rotos,
  coalesce(sum(prev_real IS NULL AND hash_prev <> hex(zeroblob(32))), 0) AS inicio_malo
FROM c`,
    contar: `SELECT (SELECT count(*) FROM trasplante) AS trasplantes, (SELECT count(*) FROM op_log) AS operaciones, (SELECT count(*) FROM auditoria) AS auditoria`,
    disp_leer: 'SELECT id FROM dispositivo LIMIT 1',
    disp_crear: 'INSERT INTO dispositivo (id) VALUES (?)',
    cierre_iniciar: `INSERT INTO prueba_cierre (lote, objetivo, estado) VALUES (?, ?, 'iniciada')`,
    cierre_pendientes: `SELECT lote, objetivo FROM prueba_cierre WHERE estado = 'iniciada'`,
    cierre_contar: 'SELECT count(*) AS n FROM trasplante WHERE lote = ?',
    cierre_marcar: `UPDATE prueba_cierre SET estado = ?2, fin = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lote = ?1`,
    alterar_quitar: 'DROP TRIGGER auditoria_solo_anadir_u',
    alterar: `UPDATE auditoria SET despues = json_set(despues, '$.profundidad_m', 99) WHERE n = (SELECT n FROM auditoria WHERE despues IS NOT NULL ORDER BY n LIMIT 1 OFFSET (SELECT count(*)/2 FROM auditoria))`,
    async insertar(q, d){
      await q.query(`INSERT INTO op_log (op_id, entidad, entidad_id, tipo, datos, dispositivo_id, autor) VALUES (?, 'trasplante', ?, 'crear', ?, ?, 'prueba')`,
        [d.op_id, d.id, d.op_datos, dispositivo]);
      const v = (await q.query(`UPDATE contador SET valor = valor + 1 WHERE nombre = 'trasplante' RETURNING valor`)).rows[0].valor;
      const r = await q.query(`INSERT INTO trasplante (id, codigo, protocolo_version, estado, fecha, profundidad_m, lat_original, lon_original, precision_m, geom, datos, lote)
        VALUES (?, 'TR-' || ? || '-' || printf('%06d', ?), 'posidonia-borrador-v0', 'vivo', date('now'), ?, ?, ?, ?, ?, ?, ?) RETURNING codigo`,
        [d.id, dispositivo, v, d.prof, d.lat, d.lon, d.prec, d.geom, d.datos, d.lote]);
      return r.rows[0].codigo;
    },
  },
};
const S = () => SQL[MOTOR.dialecto];

function datosPrueba(lote){
  const id = uuidv7();
  const lat = +(39.52 + Math.random()*0.05).toFixed(6), lon = +(2.55 + Math.random()*0.08).toFixed(6);
  const prof = +(5 + Math.random()*20).toFixed(2), prec = +(3 + Math.random()*12).toFixed(1);
  const geom = { type: 'Point', coordinates: [lon, lat] };
  const datos = { haces: 3 + Math.floor(Math.random()*8), fijacion: 'grapa_biodegradable', nota: 'dato de prueba' };
  return { id, op_id: uuidv7(), lat, lon, prof, prec, lote, geom: JSON.stringify(geom), datos: JSON.stringify(datos),
           op_datos: JSON.stringify({ profundidad_m: prof, lat, lon, precision_m: prec, geom, datos, lote }) };
}
const insertarTrasplante = (q, lote) => S().insertar(q, datosPrueba(lote));
async function verificar(q = db){
  const t = performance.now(); const r = (await q.query(S().verificar)).rows[0];
  const n = k => Number(r[k] || 0);
  const out = { total: n('total'), huellas_malas: n('huellas_malas'), enlaces_rotos: n('enlaces_rotos'), inicio_malo: n('inicio_malo') };
  return { ...out, ok: out.huellas_malas === 0 && out.enlaces_rotos === 0 && out.inicio_malo === 0, ms: performance.now() - t };
}
async function contar(){ const r = (await db.query(S().contar)).rows[0]; return { trasplantes: Number(r.trasplantes), operaciones: Number(r.operaciones), auditoria: Number(r.auditoria) }; }
async function idDispositivo(){
  const r = await db.query(S().disp_leer);
  if (r.rows.length) return r.rows[0].id;
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = new Uint8Array(3); crypto.getRandomValues(b);
  const id = Array.from(b, x => abc[x % abc.length]).join('');
  await db.query(S().disp_crear, [id]); return id;
}

// ---------- resultados (en este dispositivo) ----------
const ETIQUETA = { apertura:'Apertura', escritura_una_a_una:'Escritura una a una', escritura_lote:'Escritura en lote',
  cadena_huellas:'Cadena de huellas', cierre_forzado:'Cierre forzado', reinicio_antes:'Reinicio: antes', reinicio_despues:'Reinicio: después', apertura_fallida:'Apertura fallida' };
function leerResultados(){ try { return JSON.parse(lsGet(CLAVE_RES) || '[]'); } catch { return []; } }
function resumen(r){
  const m = r.metricas || {};
  switch (r.tipo){
    case 'apertura': return `arranque ${ms(m.arranque_ms)} · ${nf.format(m.trasplantes ?? 0)} trasplantes · cadena ${m.cadena_ok ? 'íntegra' : 'ROTA'}${m.base_vacia_inesperada ? ' · BASE VACÍA INESPERADA' : ''}`;
    case 'escritura_una_a_una': return `mediana ${nf1.format(m.p50_ms)} ms (${nf1.format(m.p50_primeros100_ms)} → ${nf1.format(m.p50_ultimos100_ms)}) · p95 ${nf1.format(m.p95_ms)} ms${m.kb_por_guardado != null ? ` · ${nf1.format(m.kb_por_guardado)} KB/guardado` : ''}`;
    case 'escritura_lote': return `${nf1.format(m.ops_por_s)} op/s · total ${ms(m.total_ms)}${m.mb_lote != null ? ` · ${nf1.format(m.mb_lote)} MB` : ''}`;
    case 'cadena_huellas': return `${nf.format(m.entradas)} entradas · ${m.cadena_ok ? 'íntegra' : 'ROTA'} · alteración ${m.alteracion_detectada ? 'detectada' : 'NO detectada'}`;
    case 'cierre_forzado': return `${m.clasificacion || m.error} · ${nf.format(m.filas ?? 0)} de ${nf.format(m.objetivo ?? N_CIERRE)} filas`;
    case 'reinicio_antes': return `${nf.format(m.trasplantes)} trasplantes anotados`;
    case 'reinicio_despues': return `${m.coincide ? 'coincide' : 'NO coincide'} · ${nf.format(m.trasplantes)} trasplantes · ${m.segundos_desde_antes ?? '?'} s después`;
    case 'apertura_fallida': return m.error || 'error al abrir';
    default: return '';
  }
}
function pintarResultados(){
  const lista = leerResultados().slice().sort((a,b) => (b.fecha||'').localeCompare(a.fecha||''));
  $('res-vacio').hidden = lista.length > 0;
  $('res-cuenta').textContent = lista.length ? `${lista.length} guardados en este móvil` : '';
  const cont = $('res-lista'); cont.replaceChildren();
  for (const r of lista.slice(0, 60)){
    const d = document.createElement('div'); d.className = 'res';
    const top = document.createElement('div'); top.className = 'res-top';
    const b = document.createElement('b'); b.textContent = `${ETIQUETA[r.tipo] || r.tipo} · ${MOTORES[r.motor]?.corto || r.motor}`;
    const p = document.createElement('span'); p.className = 'pill ' + (r.ok ? 'ok' : 'bad'); p.textContent = r.ok ? 'Correcto' : 'Problema';
    top.append(b, p);
    const s = document.createElement('span'); s.className = 'out'; s.textContent = resumen(r);
    const sm = document.createElement('small');
    sm.textContent = `${new Date(r.fecha).toLocaleString('es-ES')} · ${r.entorno?.sistema || ''}${r.entorno?.instalada ? ' · instalada' : ''} · ${r.dispositivo || ''}`;
    d.append(top, s, sm); cont.append(d);
  }
}
async function guardar(tipo, ok, metricas){
  if (db){ try { metricas = { ...metricas, trasplantes_tras: (await contar()).trasplantes }; } catch {} }
  const r = { id: uuidv7(), tipo, ok: !!ok, motor: motorId, fecha: new Date().toISOString(), dispositivo: dispositivo || 'desconocido', metricas, entorno: await entorno() };
  const lista = leerResultados(); lista.push(r); lsSet(CLAVE_RES, JSON.stringify(lista));
  pintarResultados(); return r;
}

// ---------- apertura ----------
async function abrir(){
  $('motor-nota').textContent = MOTOR.nota;
  const t0 = performance.now();
  let info;
  // Safari puede tardar en soltar los archivos de la carga anterior (InvalidStateError): reintentar antes de rendirse.
  let intentos = 0;
  for (;;){
    intentos++;
    try { const r = await abrirMotor(); db = r.motor; info = { ...r.info, intentos_apertura: intentos }; break; }
    catch (e) {
      const msg = String(e?.message || e);
      if (intentos < 6 && /invalid state|InvalidState|NoModificationAllowed|locked|access handle/i.test(msg)){ await new Promise(r => setTimeout(r, 500 * intentos)); continue; }
      return falloApertura('La base no se pudo abrir tras ' + intentos + ' intento(s): ' + msg);
    }
  }
  const tAbrir = performance.now() - t0;
  try { await db.exec(S().esquema); }
  catch (e) { return falloApertura('El esquema no se pudo crear: ' + (e?.message || e)); }
  dispositivo = await idDispositivo();
  $('chip-disp').textContent = 'dispositivo ' + dispositivo;
  const recurso = performance.getEntriesByType('resource').find(x => /pglite\.wasm|sqlite3\.wasm/.test(x.name));
  const descargado = recurso ? recurso.transferSize > 0 : null;
  setVal('r-arranque', `${ms(tAbrir)} (${descargado === true ? 'con descarga' : descargado === false ? 'desde caché' : 'caché desconocida'})`);
  const filas = await contar();
  setVal('r-filas', `${nf.format(filas.trasplantes)} trasplantes · ${nf.format(filas.auditoria)} auditoría`);
  // ¿Esperábamos datos y la base aparece vacía? (detecta borrados del navegador)
  const ultimo = leerResultados().filter(r => (r.motor === motorId && typeof r.metricas?.trasplantes_tras === 'number') || r.motor === 'todos').sort((a,b) => b.fecha.localeCompare(a.fecha))[0];
  const esperadas = ultimo && ultimo.motor !== 'todos' ? ultimo.metricas.trasplantes_tras : 0;
  const vaciaInesperada = esperadas > 0 && filas.trasplantes === 0;
  if (vaciaInesperada){ const el = $('err-abrir'); el.hidden = false; el.textContent = `La base de este motor está vacía, pero la última vez tenía ${nf.format(esperadas)} trasplantes. El navegador ha borrado los datos.`; }
  const v = await verificar();
  setVal('r-cadena', v.ok ? `Íntegra (${nf.format(v.total)})` : `ROTA: ${v.huellas_malas + v.enlaces_rotos + v.inicio_malo} fallos`, v.ok ? 'ok' : 'bad');
  const cierre = await revisarCierres(v);
  const bien = v.ok && cierre !== 'parcial' && !vaciaInesperada;
  pill('st-abrir', bien ? 'ok' : 'bad', bien ? 'Correcto' : 'Problema');
  bloquear(false);
  await guardar('apertura', bien, { arranque_ms: Math.round(tAbrir), desde_inicio_pagina_ms: Math.round(performance.now()), wasm_descargado: descargado,
    ...filas, esperadas, base_vacia_inesperada: vaciaInesperada, cadena_ok: v.ok, verificar_ms: Math.round(v.ms), ...info });
  pintarEntorno();
}
async function falloApertura(msg){
  pill('st-abrir', 'bad', 'Problema');
  const el = $('err-abrir'); el.hidden = false; el.textContent = msg;
  await guardar('apertura_fallida', false, { error: msg });
}
async function revisarCierres(v){
  const pend = (await db.query(S().cierre_pendientes)).rows;
  let peor = null;
  for (const p of pend){
    const n = Number((await db.query(S().cierre_contar, [p.lote])).rows[0].n), obj = Number(p.objetivo);
    const clas = n === 0 ? 'revertida' : n === obj ? 'completa' : 'parcial';
    await db.query(S().cierre_marcar, [p.lote, 'revisada_' + clas]);
    const texto = clas === 'revertida' ? 'Se deshizo entera' : clas === 'completa' ? 'Se completó antes del cierre' : 'QUEDÓ A MEDIAS';
    setVal('r-cierre', `${texto} (${nf.format(n)} de ${nf.format(obj)})`, clas === 'parcial' ? 'bad' : 'ok');
    const etiqueta = { revertida: 'Transacción revertida entera tras el cierre', completa: 'Transacción completada antes del cierre', parcial: 'Transacción a medias' }[clas];
    await guardar('cierre_forzado', clas !== 'parcial' && v.ok, { lote: p.lote, objetivo: obj, filas: n, clasificacion: etiqueta, cadena_ok: v.ok, interrumpida: true });
    if (clas === 'parcial') peor = 'parcial';
  }
  return peor;
}

// ---------- pruebas ----------
async function pruebaUnoAUno(){
  bloquear(true); await mantenerPantalla(true); $('o-uno').textContent = '';
  const lote = 'uno-' + uuidv7(), lat = []; let ultimo = '';
  const filasAntes = (await contar()).trasplantes, usoAntes = (await entorno()).uso_mb;
  const t0 = performance.now();
  try {
    for (let i = 0; i < N_UNO; i++){
      const t = performance.now();
      await db.transaction(async tx => { ultimo = await insertarTrasplante(tx, lote); });
      lat.push(performance.now() - t);
      if (i % 10 === 0){ barra('p-uno', (i+1)/N_UNO); const media = (performance.now()-t0)/(i+1); $('o-uno').textContent = `${nf.format(i+1)} de ${nf.format(N_UNO)} · quedan unos ${ms(media*(N_UNO-i-1))}`; await respirar(); }
    }
    barra('p-uno', 1);
    const total = performance.now() - t0, usoDespues = (await entorno()).uso_mb;
    const m = { n: N_UNO, total_ms: Math.round(total), ops_por_s: +(N_UNO / (total/1000)).toFixed(1),
      p50_ms: +pct(lat, .5).toFixed(1), p95_ms: +pct(lat, .95).toFixed(1), max_ms: +Math.max(...lat).toFixed(1),
      p50_primeros100_ms: +pct(lat.slice(0,100), .5).toFixed(1), p50_ultimos100_ms: +pct(lat.slice(-100), .5).toFixed(1),
      filas_previas: filasAntes, ultimo_codigo: ultimo, uso_antes_mb: usoAntes, uso_despues_mb: usoDespues,
      kb_por_guardado: usoAntes !== null && usoDespues !== null ? +(((usoDespues - usoAntes) * 1024) / N_UNO).toFixed(1) : null };
    $('o-uno').textContent = `Mediana ${nf1.format(m.p50_ms)} ms por guardado (primeros 100: ${nf1.format(m.p50_primeros100_ms)}, últimos 100: ${nf1.format(m.p50_ultimos100_ms)}) · p95 ${nf1.format(m.p95_ms)} ms · total ${ms(total)}${m.kb_por_guardado != null ? ` · espacio: ${nf1.format(m.kb_por_guardado)} KB por guardado` : ''} · último ${ultimo}`;
    await guardar('escritura_una_a_una', true, m);
  } catch (e) { $('o-uno').textContent = 'Error: ' + (e?.message || e); await guardar('escritura_una_a_una', false, { error: String(e?.message || e) }); }
  await mantenerPantalla(false); bloquear(false); actualizarFilas();
}
async function pruebaLote(){
  bloquear(true); await mantenerPantalla(true); $('o-lote').textContent = '';
  const lote = 'lote-' + uuidv7(); let ultimo = '';
  const usoAntes = (await entorno()).uso_mb, t0 = performance.now();
  try {
    await db.transaction(async tx => {
      for (let i = 0; i < N_LOTE; i++){ ultimo = await insertarTrasplante(tx, lote); if (i % 25 === 0){ barra('p-lote', (i+1)/N_LOTE); await respirar(); } }
    });
    barra('p-lote', 1);
    const total = performance.now() - t0, usoDespues = (await entorno()).uso_mb;
    const m = { n: N_LOTE, total_ms: Math.round(total), ops_por_s: +(N_LOTE / (total/1000)).toFixed(1), ultimo_codigo: ultimo,
      uso_antes_mb: usoAntes, uso_despues_mb: usoDespues, mb_lote: usoAntes !== null && usoDespues !== null ? +(usoDespues - usoAntes).toFixed(1) : null };
    $('o-lote').textContent = `${nf1.format(m.ops_por_s)} operaciones/s · total ${ms(total)}${m.mb_lote != null ? ` · espacio: ${nf1.format(m.mb_lote)} MB` : ''} · último ${ultimo}`;
    await guardar('escritura_lote', true, m);
  } catch (e) { $('o-lote').textContent = 'Error: ' + (e?.message || e); await guardar('escritura_lote', false, { error: String(e?.message || e) }); }
  await mantenerPantalla(false); bloquear(false); actualizarFilas();
}
async function pruebaCadena(){
  bloquear(true); $('o-cadena').textContent = 'Verificando…';
  try {
    const v = await verificar();
    let alterada = null;
    if (v.total > 0){
      await db.transaction(async tx => {
        await tx.exec(S().alterar_quitar);
        await tx.query(S().alterar);
        alterada = await verificar(tx);
        await tx.rollback();
      });
    }
    const despues = await verificar();
    const detectada = alterada ? !alterada.ok : null;
    const m = { entradas: v.total, cadena_ok: v.ok, verificar_ms: Math.round(v.ms), huellas_malas: v.huellas_malas, enlaces_rotos: v.enlaces_rotos,
      alteracion_detectada: detectada, restaurada_tras_deshacer: despues.ok };
    $('o-cadena').textContent = v.total === 0 ? 'Aún no hay entradas de auditoría: ejecuta antes una escritura.' :
      `${nf.format(v.total)} entradas en ${ms(v.ms)} · cadena ${v.ok ? 'íntegra' : 'ROTA'} · alteración ${detectada ? 'detectada' : 'NO detectada'} · tras deshacer: ${despues.ok ? 'íntegra' : 'ROTA'}`;
    await guardar('cadena_huellas', v.ok && detectada !== false && despues.ok, m);
  } catch (e) { $('o-cadena').textContent = 'Error: ' + (e?.message || e); await guardar('cadena_huellas', false, { error: String(e?.message || e) }); }
  bloquear(false);
}
async function pruebaCierre(){
  bloquear(true); await mantenerPantalla(true); $('o-cierre').textContent = '';
  const lote = 'cierre-' + uuidv7();
  try {
    await db.query(S().cierre_iniciar, [lote, N_CIERRE]);
    $('w-cierre').hidden = false;
    await db.transaction(async tx => {
      for (let i = 0; i < N_CIERRE; i++){ await insertarTrasplante(tx, lote); await new Promise(r => setTimeout(r, 6)); if (i % 20 === 0) $('c-cierre').textContent = nf.format(i); }
    });
    $('c-cierre').textContent = nf.format(N_CIERRE);
    await db.query(S().cierre_marcar, [lote, 'completada']);
    $('w-cierre').hidden = true;
    $('o-cierre').textContent = 'Terminó antes de que cerraras la app. Repite la prueba y ciérrala antes de que el contador llegue a 6.000.';
    await guardar('cierre_forzado', true, { lote, objetivo: N_CIERRE, filas: N_CIERRE, clasificacion: 'No interrumpida (repetir)', interrumpida: false });
  } catch (e) { $('w-cierre').hidden = true; $('o-cierre').textContent = 'Error: ' + (e?.message || e); await guardar('cierre_forzado', false, { error: String(e?.message || e) }); }
  await mantenerPantalla(false); bloquear(false); actualizarFilas();
}
async function reinicioAntes(){
  bloquear(true);
  const f = await contar(); const v = await verificar();
  lsSet(CLAVE_ANTES, JSON.stringify({ ...f, motor: motorId, fecha: new Date().toISOString(), carga: performance.timeOrigin }));
  $('o-reinicio').textContent = `Anotado: ${nf.format(f.trasplantes)} trasplantes. Ahora apaga y enciende el teléfono, vuelve a abrir la app y pulsa «Comprobar después».`;
  await guardar('reinicio_antes', v.ok, { ...f, cadena_ok: v.ok });
  bloquear(false);
}
async function reinicioDespues(){
  bloquear(true);
  let antes = null; try { antes = JSON.parse(lsGet(CLAVE_ANTES) || 'null'); } catch {}
  if (antes && antes.motor !== motorId) antes = null;
  if (antes && antes.carga === performance.timeOrigin){ $('o-reinicio').textContent = 'Todavía no has reiniciado: apaga y enciende el teléfono, vuelve a abrir la app y entonces pulsa «Comprobar después».'; bloquear(false); return; }
  if (!antes){ $('o-reinicio').textContent = 'No encuentro la anotación previa de este motor. Pulsa primero «Anotar antes».'; bloquear(false); return; }
  const f = await contar(); const v = await verificar();
  const segundos = Math.round((Date.now() - Date.parse(antes.fecha))/1000);
  const coincide = f.trasplantes === antes.trasplantes && f.auditoria === antes.auditoria;
  $('o-reinicio').textContent = `${coincide ? 'Coincide' : 'NO coincide'}: antes ${nf.format(antes.trasplantes)}, ahora ${nf.format(f.trasplantes)} trasplantes · cadena ${v.ok ? 'íntegra' : 'ROTA'}`;
  await guardar('reinicio_despues', coincide && v.ok, { ...f, antes_trasplantes: antes.trasplantes, coincide, cadena_ok: v.ok, segundos_desde_antes: segundos });
  lsDel(CLAVE_ANTES);
  bloquear(false);
}
async function actualizarFilas(){
  try { const f = await contar(); setVal('r-filas', `${nf.format(f.trasplantes)} trasplantes · ${nf.format(f.auditoria)} auditoría`); pintarEntorno(); } catch {}
}
async function pedirPersistencia(){
  try {
    if (!navigator.storage?.persist){ $('o-persist').textContent = 'Este navegador no permite pedirlo.'; return; }
    const ok = await navigator.storage.persist();
    $('o-persist').textContent = ok ? 'Concedido: el navegador no debería borrar estos datos por falta de espacio.' : 'No concedido. En iPhone suele concederse al instalar la app en la pantalla de inicio.';
    pintarEntorno();
  } catch (e) { $('o-persist').textContent = 'No se pudo pedir: ' + (e?.message || e); }
}
async function copiar(){
  const datos = JSON.stringify(leerResultados(), null, 1);
  try { await navigator.clipboard.writeText(datos); $('o-copiar').textContent = 'Resultados copiados. Pégalos en el chat con Claude.'; }
  catch { const t = $('t-copia'); t.hidden = false; t.value = datos; t.focus(); t.select(); $('o-copiar').textContent = 'Selecciona el texto y cópialo a mano.'; }
}
async function borrarBases(){
  $('w-borrar').hidden = true;
  lsSet(CLAVE_BORRAR, '1'); for (const id of Object.keys(MOTORES)) lsDel('brotau-banco-antes-' + id);
  try { await db?.cerrar(); } catch {}
  location.reload();
}
async function borrarPendiente(){
  if (lsGet(CLAVE_BORRAR) !== '1') return;
  lsDel(CLAVE_BORRAR);
  try {
    if (indexedDB.databases){ const dbs = await indexedDB.databases();
      await Promise.all(dbs.filter(d => d.name && d.name.includes('brotau')).map(d => new Promise(res => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); }))); }
  } catch {}
  try { const raiz = await navigator.storage.getDirectory(); for await (const [nombre] of raiz.entries()) { try { await raiz.removeEntry(nombre, { recursive: true }); } catch {} } } catch {}
  const lista = leerResultados(); lista.push({ id: uuidv7(), tipo: 'borrado', ok: true, motor: 'todos', fecha: new Date().toISOString(), dispositivo: '—', metricas: {}, entorno: await entorno() });
  lsSet(CLAVE_RES, JSON.stringify(lista));
}

// ---------- arranque ----------
function pintarMotores(){
  const cont = $('motores'); cont.replaceChildren();
  for (const [id, m] of Object.entries(MOTORES)){
    const a = document.createElement('a'); a.href = '?motor=' + id; a.textContent = m.nombre;
    a.className = 'motor' + (id === motorId ? ' activo' : ''); if (id === motorId) a.setAttribute('aria-current', 'page');
    cont.append(a);
  }
}
$('b-uno').addEventListener('click', pruebaUnoAUno);
$('b-lote').addEventListener('click', pruebaLote);
$('b-cadena').addEventListener('click', pruebaCadena);
$('b-cierre').addEventListener('click', pruebaCierre);
$('b-antes').addEventListener('click', reinicioAntes);
$('b-despues').addEventListener('click', reinicioDespues);
$('b-persist').addEventListener('click', pedirPersistencia);
$('b-copiar').addEventListener('click', copiar);
$('b-borrar').addEventListener('click', () => { $('w-borrar').hidden = false; });
$('b-borrar-no').addEventListener('click', () => { $('w-borrar').hidden = true; });
$('b-borrar-si').addEventListener('click', borrarBases);
$('b-borrar-res').addEventListener('click', () => { if ($('b-borrar-res').dataset.confirmar){ lsDel(CLAVE_RES); delete $('b-borrar-res').dataset.confirmar; $('b-borrar-res').textContent = 'Vaciar resultados'; pintarResultados(); } else { $('b-borrar-res').dataset.confirmar = '1'; $('b-borrar-res').textContent = 'Pulsa otra vez para vaciar'; } });

pintarMotores(); bloquear(true); pill('st-pruebas', 'idle', 'Esperando la base');
pintarResultados(); pintarEntorno();
borrarPendiente().then(abrir).catch(e => falloApertura('Error inesperado al abrir: ' + (e?.message || e)));
