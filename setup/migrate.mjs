#!/usr/bin/env node
/**
 * migrate.mjs — Aplica migraciones pendientes a un proyecto Supabase.
 *
 * Uso:
 *   node setup/migrate.mjs \
 *     --url "https://XXXXX.supabase.co" \
 *     --key "SERVICE_ROLE_KEY"
 *
 * Lee sql/migraciones/ y aplica solo las que no estén en la tabla _migrations.
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : null;
}

const url = getArg('url');
const key = getArg('key');

if (!url || !key) {
  console.error(`
Uso: node setup/migrate.mjs \\
  --url "https://XXXXX.supabase.co" \\
  --key "SERVICE_ROLE_KEY"
`);
  process.exit(1);
}

async function runSQL(sql) {
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    // Fallback: try the management API
    const res2 = await fetch(`${url}/pg/query`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    if (!res2.ok) {
      const text = await res2.text();
      throw new Error(`SQL error: ${text}`);
    }
    return res2.json();
  }
  return res.json();
}

// Ensure _migrations table exists
await runSQL(`
  create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz default now()
  );
`);

// Get already-applied migrations
let applied = new Set();
try {
  const res = await fetch(`${url}/rest/v1/_migrations?select=name`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
  });
  if (res.ok) {
    const rows = await res.json();
    applied = new Set(rows.map(r => r.name));
  }
} catch { /* table might not exist yet */ }

// Read local migrations
const migrationsDir = join(ROOT, 'sql/migraciones');
let localMigrations = [];
try {
  localMigrations = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
} catch {
  console.log('No hay directorio sql/migraciones/');
  process.exit(0);
}

const pending = localMigrations.filter(m => !applied.has(m));

if (pending.length === 0) {
  console.log('✓ No hay migraciones pendientes.');
  process.exit(0);
}

console.log(`${pending.length} migración(es) pendiente(s):\n`);

for (const m of pending) {
  const sql = readFileSync(join(migrationsDir, m), 'utf-8');
  console.log(`  Aplicando: ${m}...`);
  try {
    await runSQL(sql);
    await runSQL(`insert into _migrations (name) values ('${m}') on conflict do nothing;`);
    console.log(`  ✓ ${m} aplicada.`);
  } catch (err) {
    console.error(`  ✗ Error en ${m}: ${err.message}`);
    console.error(`  Deteniendo. Corrige el error y vuelve a ejecutar.`);
    process.exit(1);
  }
}

console.log(`\n✓ Todas las migraciones aplicadas.`);
