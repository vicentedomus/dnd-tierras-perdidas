/**
 * auth.js — Autenticación multi-campaña.
 * Usa la tabla public.campaign_members para determinar el rol del usuario
 * en la campaña actual (definida por CONFIG.SLUG).
 */

/** Consulta campaign_members vía REST (schema public) para obtener el rol en esta campaña */
async function fetchMembership(userId, accessToken) {
  const res = await fetch(
    `${CONFIG.SUPABASE_URL}/rest/v1/campaign_members?user_id=eq.${userId}&campaign=eq.${CONFIG.SLUG}&select=role,username`,
    {
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );
  const rows = await res.json();
  return rows.length ? rows[0] : null;
}

/** Restaura la sesión de Supabase al sessionStorage (para getters sincrónicos) */
async function initAuth() {
  const { data: { session } } = await sbClient.auth.getSession();
  if (session && session.user) {
    const meta = session.user.user_metadata || {};
    if (meta.mustChangePassword) {
      showChangePasswordScreen();
      return;
    }
    const membership = await fetchMembership(session.user.id, session.access_token);
    if (!membership) {
      await sbClient.auth.signOut();
      sessionStorage.clear();
      return;
    }
    sessionStorage.setItem('role', membership.role);
    sessionStorage.setItem('username', membership.username || meta.username || '');
    sessionStorage.setItem('loggedIn', 'true');
  }
}

/**
 * Login con username + password.
 * El username se convierte a email: {username}@dnd.local
 * Después del login, verifica membresía en esta campaña via campaign_members.
 */
async function login(username, password) {
  const email = `${username.toLowerCase()}@dnd.local`;
  const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;

  const meta = data.user.user_metadata || {};

  // Forzar cambio de contraseña en primer login
  if (meta.mustChangePassword) {
    showChangePasswordScreen();
    return 'must_change';
  }

  // Verificar membresía en esta campaña
  const membership = await fetchMembership(data.user.id, data.session.access_token);
  if (!membership) {
    await sbClient.auth.signOut();
    return 'no_access';
  }

  const role = membership.role;
  sessionStorage.setItem('role', role);
  sessionStorage.setItem('username', membership.username || username);
  sessionStorage.setItem('loggedIn', 'true');
  if (role === 'dm') sessionStorage.setItem('dm_password', password);
  return role;
}

/** Cambia la contraseña del usuario logueado y quita el flag mustChangePassword */
async function changePassword(newPassword) {
  const { error } = await sbClient.auth.updateUser({
    password: newPassword,
    data: { mustChangePassword: false },
  });
  if (error) return error.message;

  // Restaurar sesión con la nueva contraseña
  const { data: { session } } = await sbClient.auth.getSession();
  if (session && session.user) {
    const membership = await fetchMembership(session.user.id, session.access_token);
    const role = membership ? membership.role : 'player';
    sessionStorage.setItem('role', role);
    sessionStorage.setItem('username', membership?.username || '');
    sessionStorage.setItem('loggedIn', 'true');
    if (role === 'dm') sessionStorage.setItem('dm_password', newPassword);
  }
  return null;
}

/** Muestra la pantalla de cambio de contraseña obligatorio */
function showChangePasswordScreen() {
  document.getElementById('login-screen').innerHTML = `
    <div class="stone-wall"></div>
    <div class="frame-outer">
      <div class="parchment">
        <div class="login-logo" style="font-size:2rem;margin-bottom:4px">&#9876;</div>
        <div class="login-subtitle" style="margin-bottom:12px">Elige tu contraseña</div>
        <div class="login-divider"></div>
        <p style="color:var(--on-surface-variant);font-size:.85rem;margin-bottom:20px">
          Es tu primer inicio de sesión.<br>Elige una contraseña personal.
        </p>
        <form id="change-pw-form" autocomplete="off">
          <input type="password" id="new-pw-input" placeholder="Nueva contraseña" minlength="6" autofocus>
          <input type="password" id="confirm-pw-input" placeholder="Confirmar contraseña">
          <button type="submit" class="btn-login">Guardar contraseña</button>
        </form>
        <div class="login-error" id="change-pw-error"></div>
      </div>
    </div>
  `;
  document.getElementById('change-pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPw = document.getElementById('new-pw-input').value;
    const confirmPw = document.getElementById('confirm-pw-input').value;
    const errEl = document.getElementById('change-pw-error');

    if (newPw.length < 6) {
      errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }
    if (newPw !== confirmPw) {
      errEl.textContent = 'Las contraseñas no coinciden.';
      return;
    }

    errEl.textContent = 'Guardando...';
    const err = await changePassword(newPw);
    if (err) {
      errEl.textContent = err;
    } else {
      window.location.reload();
    }
  });
}

function getRole()     { return sessionStorage.getItem('role'); }
function getUsername()  { return sessionStorage.getItem('username'); }
function isLoggedIn()  { return sessionStorage.getItem('loggedIn') === 'true'; }
function isDM()        { return getRole() === 'dm'; }

async function logout() {
  await sbClient.auth.signOut();
  sessionStorage.clear();
  window.location.reload();
}
