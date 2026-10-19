// Migrasi skema (idempoten). Dijalankan otomatis pada permintaan pertama setelah cold start.
export const MIGRATIONS = [
  {
    version: 1,
    name: 'orders, stops, items, audit',
    statements: [
      `CREATE TABLE IF NOT EXISTS orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        do_no text NOT NULL,
        customer text NOT NULL,
        order_date date NOT NULL,
        priority text NOT NULL DEFAULT 'normal',
        status text NOT NULL DEFAULT 'draft',
        notes text NOT NULL DEFAULT '',
        summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        version int NOT NULL DEFAULT 1,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS orders_do_no_uq ON orders (lower(do_no))`,
      `CREATE INDEX IF NOT EXISTS orders_date_idx ON orders (order_date DESC, created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS stops (
        id uuid PRIMARY KEY,
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        seq int NOT NULL,
        type text NOT NULL,
        name text NOT NULL,
        address text NOT NULL DEFAULT '',
        lat double precision,
        lng double precision,
        radius_m int NOT NULL DEFAULT 150,
        window_start timestamptz,
        window_end timestamptz,
        contact_name text NOT NULL DEFAULT '',
        contact_phone text NOT NULL DEFAULT '',
        instructions text NOT NULL DEFAULT ''
      )`,
      `CREATE INDEX IF NOT EXISTS stops_order_idx ON stops (order_id, seq)`,
      `CREATE TABLE IF NOT EXISTS items (
        id uuid PRIMARY KEY,
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        stop_id uuid NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
        ord int NOT NULL DEFAULT 0,
        description text NOT NULL,
        sku text NOT NULL DEFAULT '',
        qty numeric NOT NULL,
        unit text NOT NULL DEFAULT 'pcs',
        weight_kg numeric,
        volume_m3 numeric,
        pallets numeric,
        colli numeric,
        length_cm numeric,
        width_cm numeric,
        height_cm numeric,
        category text NOT NULL DEFAULT 'general',
        temp_min numeric,
        temp_max numeric,
        hazardous boolean NOT NULL DEFAULT false,
        stackable boolean NOT NULL DEFAULT true
      )`,
      `CREATE INDEX IF NOT EXISTS items_order_idx ON items (order_id)`,
      `CREATE TABLE IF NOT EXISTS audit_log (
        id bigserial PRIMARY KEY,
        at timestamptz NOT NULL DEFAULT now(),
        actor text,
        action text NOT NULL,
        entity text NOT NULL,
        entity_id text,
        data jsonb
      )`,
    ],
  },
];

const done = new WeakSet();

export async function ensureSchema(db) {
  if (done.has(db)) return;
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, name text, at timestamptz NOT NULL DEFAULT now())');
  const have = new Set((await db.query('SELECT version FROM schema_migrations')).map((r) => Number(r.version)));
  for (const m of MIGRATIONS) {
    if (have.has(m.version)) continue;
    for (const sql of m.statements) await db.query(sql);
    await db.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [m.version, m.name]);
  }
  done.add(db);
}
