#!/usr/bin/env node
/**
 * create-users.mjs — Crea los usuarios DM y Player en Supabase Auth.
 *
 * Uso:
 *   node setup/create-users.mjs \
 *     --url "https://XXXXX.supabase.co" \
 *     --key "SERVICE_ROLE_KEY" \
 *     --slug "mi-campana" \
 *     --dm-password "clave-dm" \
 *     --player-password "clave-players"
 */

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : null;
}

const url = getArg('url');
const key = getArg('key');
const slug = getArg('slug');
const dmPassword = getArg('dm-password');
const playerPassword = getArg('player-password');

if (!url || !key || !slug || !dmPassword || !playerPassword) {
  console.error(`
Uso: node setup/create-users.mjs \\
  --url "https://XXXXX.supabase.co" \\
  --key "SERVICE_ROLE_KEY" \\
  --slug "mi-campana" \\
  --dm-password "clave-dm" \\
  --player-password "clave-players"
`);
  process.exit(1);
}

const users = [
  { email: `dm@${slug}.local`,     password: dmPassword,     role: 'dm' },
  { email: `player@${slug}.local`, password: playerPassword, role: 'player' },
];

for (const u of users) {
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      email:          u.email,
      password:       u.password,
      email_confirm:  true,
      user_metadata:  { role: u.role },
    }),
  });

  const data = await res.json();
  if (data.id) {
    console.log(`✓ ${u.role.toUpperCase()} creado → ${u.email} (${data.id})`);
  } else {
    console.log(`✗ Error ${u.role}: ${JSON.stringify(data)}`);
  }
}
