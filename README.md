# Banco Brotau

Banco de pruebas de **almacenamiento local** para Brotau, una app de restauración marina (Posidonia)
que debe funcionar en el móvil del técnico sin cobertura. Compara, en el propio teléfono, tres motores
de base de datos en el navegador:

| Motor | Almacenamiento | Papel |
|-------|----------------|-------|
| PGlite 0.5.10 (PostgreSQL en WebAssembly) | IndexedDB | Control: descartado en iPhone por el espacio que consume |
| PGlite 0.5.10 | OPFS (`opfs-ahp`, en un worker) | Candidato principal |
| SQLite 3.53.4 (build oficial) | OPFS (`opfs-sahpool`, en un worker) | Plan B |

Mide: arranque, tiempo y **espacio por guardado**, escritura en lote, cadena de huellas SHA-256 de la
auditoría (y que detecta alteraciones), recuperación tras **cierre forzado** a mitad de transacción y
persistencia tras **reinicio** del móvil. Avisa si el navegador borra la base por su cuenta.

**Solo datos ficticios.** La página no envía nada a ningún sitio: todo queda en el dispositivo.

Publicada con GitHub Pages: https://teleoenbarza-sudo.github.io/brotau-banco-pruebas/
Para probarla como app: en Safari, *Compartir → Añadir a pantalla de inicio*.

## Licencias de terceros
- `pglite/`: PGlite, de ElectricSQL — Apache-2.0 (`pglite/LICENSE`). `pglite-datos.wasm` es el
  `pglite.data` del paquete, con otro nombre (mismos bytes).
- `sqlite/`: SQLite — dominio público (sqlite.org/copyright.html); envoltorio `@sqlite.org/sqlite-wasm`.
