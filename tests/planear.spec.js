// @ts-check
const { test, expect } = require('@playwright/test');

// ── HELPERS ────────────────────────────────────────────────────────────

async function login(page, password) {
  await page.goto('/');
  await page.waitForSelector('#login-screen', { state: 'visible' });
  await page.fill('#password-input', password);
  await page.click('button.btn-login');
  await page.waitForSelector('#app.visible', { timeout: 20000 });
  await page.waitForFunction(
    () => (document.getElementById('grid-notas')?.innerHTML || '').length > 10,
    { timeout: 25000 }
  );
}

async function openAsistente(page) {
  await page.click('[data-tab="utilidades"]');
  await page.click('.util-card:has-text("Asistente de Campaña")');
  await expect(page.locator('#chat-messages')).toBeVisible({ timeout: 5000 });
}

// ── FICHA EN UTILIDADES ───────────────────────────────────────────────

test.describe('Asistente de Campaña — Ficha en Utilidades', () => {
  test('ficha visible para DM en Utilidades', async ({ page }) => {
    await login(page, 'halo-dm');
    await page.click('[data-tab="utilidades"]');
    await expect(page.locator('.util-card:has-text("Asistente de Campaña")')).toBeVisible();
  });

  test('ficha no visible para jugadores (Utilidades es dm-only)', async ({ page }) => {
    await login(page, 'halo-players');
    await expect(page.locator('[data-tab="utilidades"]')).not.toBeVisible();
  });

  test('click en ficha abre el chat en util-workspace', async ({ page }) => {
    await login(page, 'halo-dm');
    await openAsistente(page);
    await expect(page.locator('#util-workspace')).toBeVisible();
    await expect(page.locator('.chat-panel')).toBeVisible();
    await expect(page.locator('#chat-input')).toBeVisible();
    await expect(page.locator('#chat-send')).toBeVisible();
  });
});

// ── UI DEL CHAT ───────────────────────────────────────────────────────

test.describe('Asistente de Campaña — Chat UI', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'halo-dm');
    await openAsistente(page);
  });

  test('mensaje de bienvenida visible al inicio', async ({ page }) => {
    await expect(page.locator('.chat-welcome')).toBeVisible();
    await expect(page.locator('.chat-welcome h3')).toContainText('Asistente de Campaña');
  });

  test('botones rápidos visibles', async ({ page }) => {
    const quickActions = page.locator('#chat-quick-actions');
    await expect(quickActions).toBeVisible();
    await expect(quickActions.locator('.btn-quick')).toHaveCount(4);
    await expect(quickActions.locator('.btn-quick').first()).toContainText('Preparar sesión');
  });

  test('textarea acepta texto', async ({ page }) => {
    const input = page.locator('#chat-input');
    await input.fill('Hola mundo');
    await expect(input).toHaveValue('Hola mundo');
  });

  test('header tiene título, Limpiar y Cerrar', async ({ page }) => {
    await expect(page.locator('.util-title')).toContainText('Asistente de Campaña');
    await expect(page.locator('.chat-header-actions .btn:has-text("Limpiar")')).toBeVisible();
    await expect(page.locator('.chat-header-actions .btn:has-text("Cerrar")')).toBeVisible();
  });

  test('botón Cerrar cierra el workspace', async ({ page }) => {
    await page.click('.chat-header-actions .btn:has-text("Cerrar")');
    await expect(page.locator('#util-workspace')).not.toBeVisible();
  });
});

// ── INTERACCIÓN LOCAL (sin API) ──────────────────────────────────────

test.describe('Asistente de Campaña — Interacción local', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'halo-dm');
    await openAsistente(page);
  });

  test('escribir mensaje muestra burbuja del usuario', async ({ page }) => {
    await page.route('**/functions/v1/chat', route => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"content_block_delta","delta":{"text":"Respuesta de prueba"}}\n\ndata: [DONE]\n\n',
      });
    });

    await page.fill('#chat-input', 'Test message');
    await page.click('#chat-send');

    await expect(page.locator('.chat-user')).toBeVisible();
    await expect(page.locator('.chat-user')).toContainText('Test message');
  });

  test('bienvenida desaparece al enviar mensaje', async ({ page }) => {
    await page.route('**/functions/v1/chat', route => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"content_block_delta","delta":{"text":"OK"}}\n\ndata: [DONE]\n\n',
      });
    });

    await expect(page.locator('.chat-welcome')).toBeVisible();
    await page.fill('#chat-input', 'Hola');
    await page.click('#chat-send');
    await expect(page.locator('.chat-welcome')).not.toBeVisible();
  });

  test('botón Limpiar reinicia el chat', async ({ page }) => {
    await page.route('**/functions/v1/chat', route => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"content_block_delta","delta":{"text":"Hola"}}\n\ndata: [DONE]\n\n',
      });
    });

    await page.fill('#chat-input', 'Test');
    await page.click('#chat-send');
    await expect(page.locator('.chat-user')).toBeVisible();

    await page.click('.chat-header-actions .btn:has-text("Limpiar")');
    await expect(page.locator('.chat-user')).not.toBeVisible();
    await expect(page.locator('.chat-welcome')).toBeVisible();
  });

  test('respuesta del asistente aparece con streaming mock', async ({ page }) => {
    await page.route('**/functions/v1/chat', route => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"content_block_delta","delta":{"text":"Esta es una "}}\n\ndata: {"type":"content_block_delta","delta":{"text":"respuesta de prueba."}}\n\ndata: [DONE]\n\n',
      });
    });

    await page.fill('#chat-input', 'Prueba');
    await page.click('#chat-send');

    await expect(page.locator('.chat-assistant').last()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.chat-assistant').last()).toContainText('respuesta de prueba');
  });

  test('botón guardar como nota aparece en respuestas', async ({ page }) => {
    await page.route('**/functions/v1/chat', route => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"content_block_delta","delta":{"text":"Contenido de prueba"}}\n\ndata: [DONE]\n\n',
      });
    });

    await page.fill('#chat-input', 'Test');
    await page.click('#chat-send');

    await expect(page.locator('.btn-save-note').last()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.btn-save-note').last()).toContainText('Guardar como Nota DM');
  });

  test('error de API muestra burbuja de error', async ({ page }) => {
    await page.route('**/functions/v1/chat', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Test error' }),
      });
    });

    await page.fill('#chat-input', 'Error test');
    await page.click('#chat-send');

    await expect(page.locator('.chat-error')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.chat-error')).toContainText('Test error');
  });
});

// ── LOCALSTORAGE ─────────────────────────────────────────────────────

test.describe('Asistente de Campaña — localStorage', () => {
  test('historial persiste al reabrir el asistente', async ({ page }) => {
    await login(page, 'halo-dm');

    await page.evaluate(() => {
      const history = [
        { role: 'user', content: 'Mensaje guardado' },
        { role: 'assistant', content: 'Respuesta guardada' },
      ];
      localStorage.setItem('halo-chat-history', JSON.stringify(history));
    });

    await openAsistente(page);

    await expect(page.locator('.chat-user')).toContainText('Mensaje guardado');
    await expect(page.locator('.chat-assistant').first()).toContainText('Respuesta guardada');
  });

  test('limpiar borra localStorage', async ({ page }) => {
    await login(page, 'halo-dm');

    await page.evaluate(() => {
      localStorage.setItem('halo-chat-history', JSON.stringify([
        { role: 'user', content: 'Mensaje viejo' },
      ]));
    });

    await openAsistente(page);
    await page.click('.chat-header-actions .btn:has-text("Limpiar")');

    const stored = await page.evaluate(() => localStorage.getItem('halo-chat-history'));
    expect(stored).toBeNull();
  });
});

// ── CAMBIOS BD (halo-changes) ────────────────────────────────────────

test.describe('Asistente de Campaña — Cambios BD', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'halo-dm');
    await openAsistente(page);
  });

  test('respuesta con halo-changes muestra tarjetas de cambios', async ({ page }) => {
    const changesJson = JSON.stringify([
      {"table": "npcs", "name": "TestNPC", "action": "update", "fields": {"conocido_jugadores": true}, "label": "TestNPC → conocido"}
    ]);
    const mdResponse = `Aquí van los cambios:\n\n\`\`\`halo-changes\n${changesJson}\n\`\`\``;
    const escaped = mdResponse.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

    await page.route('**/functions/v1/chat', route => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: {"type":"content_block_delta","delta":{"text":"${escaped}"}}\n\ndata: [DONE]\n\n`,
      });
    });

    await page.fill('#chat-input', 'Actualiza');
    await page.click('#chat-send');

    // Verificar que aparecen las tarjetas de cambios
    await expect(page.locator('.changes-container')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.change-card')).toHaveCount(1);
    await expect(page.locator('.change-label')).toContainText('TestNPC → conocido');
    await expect(page.locator('.change-table')).toContainText('npcs');
  });

  test('botón Aplicar todos visible cuando hay cambios', async ({ page }) => {
    const changesJson = JSON.stringify([
      {"table": "npcs", "name": "A", "action": "update", "fields": {"estado": "Muerto"}, "label": "A → Muerto"},
      {"table": "npcs", "name": "B", "action": "update", "fields": {"estado": "Vivo"}, "label": "B → Vivo"}
    ]);
    const mdResponse = `Cambios:\n\n\`\`\`halo-changes\n${changesJson}\n\`\`\``;
    const escaped = mdResponse.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

    await page.route('**/functions/v1/chat', route => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: {"type":"content_block_delta","delta":{"text":"${escaped}"}}\n\ndata: [DONE]\n\n`,
      });
    });

    await page.fill('#chat-input', 'Test');
    await page.click('#chat-send');

    await expect(page.locator('.change-card')).toHaveCount(2, { timeout: 5000 });
    await expect(page.locator('.btn-apply-all')).toBeVisible();
    await expect(page.locator('.btn-apply-all')).toContainText('Aplicar todos');
  });

  test('respuesta sin halo-changes no muestra tarjetas', async ({ page }) => {
    await page.route('**/functions/v1/chat', route => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"content_block_delta","delta":{"text":"Respuesta normal sin cambios"}}\n\ndata: [DONE]\n\n',
      });
    });

    await page.fill('#chat-input', 'Hola');
    await page.click('#chat-send');

    await expect(page.locator('.chat-assistant').last()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.changes-container')).not.toBeVisible();
  });
});

// ── CONTEXTO ENRIQUECIDO ─────────────────────────────────────────────

test.describe('Asistente de Campaña — Contexto enriquecido', () => {
  test('buildCampaignContext incluye contenido_html de notas', async ({ page }) => {
    await login(page, 'halo-dm');

    const context = await page.evaluate(() => {
      return buildCampaignContext();
    });

    // Debe incluir sección de últimas sesiones con detalle
    expect(context).toContain('Últimas sesiones (detalle completo)');
    // Debe incluir contenido de al menos una nota (si hay notas con contenido)
    const hasContent = context.includes('**Contenido:**') || context.includes('sin fecha');
    expect(hasContent).toBe(true);
  });

  test('buildCampaignContext incluye quests con detalles', async ({ page }) => {
    await login(page, 'halo-dm');

    const context = await page.evaluate(() => {
      return buildCampaignContext();
    });

    expect(context).toContain('## Quests');
    // Si hay quests activas, deben tener resumen
    if (context.includes('Activa')) {
      expect(context).toMatch(/\[Activa\]/);
    }
  });

  test('buildCampaignContext incluye party con stats', async ({ page }) => {
    await login(page, 'halo-dm');

    const context = await page.evaluate(() => {
      return buildCampaignContext();
    });

    expect(context).toContain('## Party');
    // Debe tener al menos un jugador
    expect(context).toMatch(/Jugador:/);
  });

  test('buildCampaignContext incluye NPCs con descripción', async ({ page }) => {
    await login(page, 'halo-dm');

    const context = await page.evaluate(() => {
      return buildCampaignContext();
    });

    expect(context).toContain('## NPCs');
    // Debe incluir marcadores de visibilidad
    expect(context).toMatch(/\[(conocido|desconocido)\]/);
  });

  test('buildCampaignContext incluye ciudades, establecimientos e items', async ({ page }) => {
    await login(page, 'halo-dm');

    const context = await page.evaluate(() => {
      return buildCampaignContext();
    });

    expect(context).toContain('## Ciudades');
    expect(context).toContain('## Establecimientos');
    expect(context).toContain('## Items mágicos');
    // Lugares puede estar vacío si no hay registros
  });

  test('contexto se envía en el body del fetch', async ({ page }) => {
    await login(page, 'halo-dm');
    await openAsistente(page);

    let capturedBody = null;
    await page.route('**/functions/v1/chat', route => {
      capturedBody = JSON.parse(route.request().postData());
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"content_block_delta","delta":{"text":"OK"}}\n\ndata: [DONE]\n\n',
      });
    });

    await page.fill('#chat-input', 'Test');
    await page.click('#chat-send');
    await expect(page.locator('.chat-assistant').last()).toBeVisible({ timeout: 5000 });

    expect(capturedBody).not.toBeNull();
    expect(capturedBody.campaignContext).toContain('## Party');
    expect(capturedBody.campaignContext).toContain('Últimas sesiones');
    expect(capturedBody.messages).toHaveLength(1);
    expect(capturedBody.messages[0].content).toBe('Test');
  });
});

// ── ESCENARIOS EDGE ──────────────────────────────────────────────────

test.describe('Asistente de Campaña — Escenarios edge', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'halo-dm');
    await openAsistente(page);
  });

  test('halo-changes con JSON malformado no rompe la UI', async ({ page }) => {
    const mdResponse = 'Texto normal\n\n```halo-changes\nesto no es json valido\n```';
    const escaped = mdResponse.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

    await page.route('**/functions/v1/chat', route => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: {"type":"content_block_delta","delta":{"text":"${escaped}"}}\n\ndata: [DONE]\n\n`,
      });
    });

    await page.fill('#chat-input', 'Test');
    await page.click('#chat-send');

    // No debe explotar, la burbuja debe ser visible
    await expect(page.locator('.chat-assistant').last()).toBeVisible({ timeout: 5000 });
    // No debe haber tarjetas de cambios (JSON inválido)
    await expect(page.locator('.changes-container')).not.toBeVisible();
  });

  test('halo-changes con array vacío no muestra tarjetas', async ({ page }) => {
    const mdResponse = 'Sin cambios\n\n```halo-changes\n[]\n```';
    const escaped = mdResponse.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

    await page.route('**/functions/v1/chat', route => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: {"type":"content_block_delta","delta":{"text":"${escaped}"}}\n\ndata: [DONE]\n\n`,
      });
    });

    await page.fill('#chat-input', 'Test');
    await page.click('#chat-send');

    await expect(page.locator('.chat-assistant').last()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.changes-container')).not.toBeVisible();
  });

  test('aplicar cambio de NPC inexistente muestra error', async ({ page }) => {
    const changesJson = JSON.stringify([
      {"table": "npcs", "name": "NPC_QUE_NO_EXISTE_12345", "action": "update", "fields": {"estado": "Muerto"}, "label": "NPC inexistente → Muerto"}
    ]);
    const mdResponse = `Cambios:\n\n\`\`\`halo-changes\n${changesJson}\n\`\`\``;
    const escaped = mdResponse.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

    await page.route('**/functions/v1/chat', route => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: {"type":"content_block_delta","delta":{"text":"${escaped}"}}\n\ndata: [DONE]\n\n`,
      });
    });

    await page.fill('#chat-input', 'Test');
    await page.click('#chat-send');

    await expect(page.locator('.change-card')).toBeVisible({ timeout: 5000 });
    // Click en Aplicar
    await page.click('.change-card .btn-success');
    // Debe mostrar error
    await expect(page.locator('.change-status.error')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.change-status.error')).toContainText('No se encontró');
  });

  test('input vacío no envía mensaje', async ({ page }) => {
    await page.route('**/functions/v1/chat', route => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"content_block_delta","delta":{"text":"No debería llegar"}}\n\ndata: [DONE]\n\n',
      });
    });

    await page.click('#chat-send');
    // No debe haber burbuja del usuario
    await expect(page.locator('.chat-user')).not.toBeVisible();
  });

  test('botón Enviar se deshabilita durante streaming', async ({ page }) => {
    // Respuesta lenta
    await page.route('**/functions/v1/chat', async route => {
      await new Promise(r => setTimeout(r, 1000));
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"content_block_delta","delta":{"text":"OK"}}\n\ndata: [DONE]\n\n',
      });
    });

    await page.fill('#chat-input', 'Test');
    await page.click('#chat-send');

    // Debe estar deshabilitado durante el streaming
    await expect(page.locator('#chat-send')).toBeDisabled();
    // Esperar a que termine
    await expect(page.locator('#chat-send')).toBeEnabled({ timeout: 5000 });
  });
});
