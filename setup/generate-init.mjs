#!/usr/bin/env node
/**
 * generate-init.mjs — Genera un SQL consolidado para inicializar una campaña nueva.
 *
 * Uso:
 *   node setup/generate-init.mjs \
 *     --slug "mi-campana" \
 *     --dm-password "clave-dm" \
 *     --player-password "clave-players"
 *
 * Produce: setup/output/init-{slug}.sql
 * Ese archivo se pega en Supabase Dashboard → SQL Editor y se ejecuta.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Parse args ──────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : null;
}

const slug = getArg('slug');
const dmPassword = getArg('dm-password');
const playerPassword = getArg('player-password');

if (!slug || !dmPassword || !playerPassword) {
  console.error(`
Uso: node setup/generate-init.mjs \\
  --slug "mi-campana" \\
  --dm-password "clave-dm" \\
  --player-password "clave-players"
`);
  process.exit(1);
}

// ── Read SQL files ─────────��────────────────────────────────
function readSQL(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf-8');
}

const sqlParts = [];

sqlParts.push(`-- =============================================================`);
sqlParts.push(`-- INIT SCRIPT — Campaña: ${slug}`);
sqlParts.push(`-- Generado: ${new Date().toISOString()}`);
sqlParts.push(`-- Ejecutar en: Supabase Dashboard → SQL Editor`);
sqlParts.push(`-- =============================================================\n`);

// 1. Schema principal
sqlParts.push(`-- ── SCHEMA PRINCIPAL ──────────────────────────────────────────\n`);
sqlParts.push(readSQL('sql/schema.sql'));

// 2. Migraciones (en orden cronológico)
sqlParts.push(`\n-- ── MIGRACIONES ────────────────────────────��─────────────────\n`);
const migrationsDir = join(ROOT, 'sql/migraciones');
try {
  const migrations = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  for (const m of migrations) {
    sqlParts.push(`-- migración: ${m}`);
    sqlParts.push(readFileSync(join(migrationsDir, m), 'utf-8'));
    sqlParts.push('');
  }
} catch {
  sqlParts.push('-- (sin migraciones pendientes)');
}

// 3. Tabla de tracking de migraciones
sqlParts.push(`\n-- ── TRACKING DE MIGRACIONES ��─────────────────────────────────\n`);
sqlParts.push(`create table if not exists _migrations (
  name text primary key,
  applied_at timestamptz default now()
);\n`);

// Registrar todas las migraciones como ya aplicadas
try {
  const migrations = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  for (const m of migrations) {
    sqlParts.push(`insert into _migrations (name) values ('${m}') on conflict do nothing;`);
  }
} catch { /* no migrations */ }

// 4. Schemas adicionales (catálogos)
sqlParts.push(`\n\n-- ── CATÁLOGOS ──────���───────────────────────────────��─────────\n`);
sqlParts.push(readSQL('sql/items-catalog-schema.sql'));
sqlParts.push('');
sqlParts.push(readSQL('sql/monstruos-schema.sql'));
sqlParts.push('');
sqlParts.push(readSQL('sql/session-plans-schema.sql'));

// 5. RLS
sqlParts.push(`\n\n-- ── RLS (Row Level Security) ────────��────────────────────────\n`);
sqlParts.push(readSQL('sql/rls.sql'));

// 6. Crear usuarios de auth (instrucciones manuales — no se puede via SQL)
const emailDM = `dm@${slug}.local`;
const emailPlayer = `player@${slug}.local`;

sqlParts.push(`\n\n-- =============================================================`);
sqlParts.push(`-- USUARIOS DE AUTH`);
sqlParts.push(`-- =============================================================`);
sqlParts.push(`-- Los usuarios NO se crean por SQL — se crean via API.`);
sqlParts.push(`-- Ejecuta este comando en tu terminal después del SQL:`);
sqlParts.push(`--`);
sqlParts.push(`--   node setup/create-users.mjs \\`);
sqlParts.push(`--     --url "TU_SUPABASE_URL" \\`);
sqlParts.push(`--     --key "TU_SERVICE_ROLE_KEY" \\`);
sqlParts.push(`--     --slug "${slug}" \\`);
sqlParts.push(`--     --dm-password "${dmPassword}" \\`);
sqlParts.push(`--     --player-password "${playerPassword}"`);
sqlParts.push(`--`);
sqlParts.push(`-- Esto creará:`);
sqlParts.push(`--   DM:     ${emailDM} / ${dmPassword}`);
sqlParts.push(`--   Player: ${emailPlayer} / ${playerPassword}`);

// ── Write output ────────────────────────────────────────────
const outputDir = join(__dirname, 'output');
mkdirSync(outputDir, { recursive: true });

const outputPath = join(outputDir, `init-${slug}.sql`);
writeFileSync(outputPath, sqlParts.join('\n'), 'utf-8');

console.log(`✓ SQL generado: ${outputPath}`);
console.log(`  Pega el contenido en Supabase Dashboard → SQL Editor y ejecuta.`);
console.log(`  Después ejecuta create-users.mjs para crear los usuarios de auth.`);
