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

async function goToMap(page) {
  await page.click('[data-tab="mapa"]');
  await page.waitForSelector('#section-mapa.active', { state: 'visible' });
  // Esperar que el SVG se cargue
  await page.waitForSelector('#map-viewport svg', { timeout: 15000 });
}

// ── MAP TESTS ─────────────────────────────────────────────────────────

test.describe('Mapa — desktop', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'halo-dm');
    await goToMap(page);
  });

  test('viewport background coincide con color del océano SVG', async ({ page }) => {
    // El fondo del viewport debe ser el mismo que el oceanBase del SVG (#466eab)
    const vpBg = await page.evaluate(() => {
      const vp = document.getElementById('map-viewport');
      return window.getComputedStyle(vp).backgroundColor;
    });

    const oceanColor = await page.evaluate(() => {
      const rect = document.querySelector('#oceanBase');
      return rect ? rect.getAttribute('fill') : null;
    });

    // Convertir el color CSS rgb a hex para comparar
    const rgbMatch = vpBg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const vpHex = '#' + [rgbMatch[1], rgbMatch[2], rgbMatch[3]]
        .map(n => parseInt(n).toString(16).padStart(2, '0'))
        .join('');
      expect(vpHex.toLowerCase()).toBe(oceanColor?.toLowerCase());
    }
  });

  test('sin artefactos visuales tras zoom in', async ({ page }) => {
    // Tomar screenshot del mapa antes del zoom
    const vpLocator = page.locator('#map-viewport');

    // Zoom in 3 veces usando el botón
    for (let i = 0; i < 3; i++) {
      await page.click('.map-zoom-btn:first-child');
      await page.waitForTimeout(200);
    }

    // Verificar que el SVG sigue cubriendo el viewport (viewBox válido)
    const viewBox = await page.evaluate(() => {
      const svg = document.querySelector('#map-viewport svg');
      return svg ? svg.getAttribute('viewBox') : null;
    });
    expect(viewBox).not.toBeNull();

    // Verificar que las dimensiones del SVG coinciden con el viewport
    const covers = await page.evaluate(() => {
      const vp = document.getElementById('map-viewport');
      const svg = vp?.querySelector('svg');
      if (!vp || !svg) return false;
      const vpRect = vp.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      // SVG debe cubrir el viewport completamente (con tolerancia de 1px)
      return svgRect.width >= vpRect.width - 1 && svgRect.height >= vpRect.height - 1;
    });
    expect(covers).toBe(true);
  });

  test('sin artefactos visuales tras zoom out máximo', async ({ page }) => {
    // Zoom out al máximo
    for (let i = 0; i < 8; i++) {
      await page.click('.map-zoom-btn:nth-child(3)');
      await page.waitForTimeout(150);
    }

    // El viewport background debe coincidir con el océano para que no se vea diferencia
    const colorsMatch = await page.evaluate(() => {
      const vp = document.getElementById('map-viewport');
      const oceanBase = document.querySelector('#oceanBase');
      if (!vp || !oceanBase) return false;

      const vpBg = window.getComputedStyle(vp).backgroundColor;
      const oceanFill = oceanBase.getAttribute('fill');

      // Convertir rgb() a hex
      const m = vpBg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!m) return false;
      const vpHex = '#' + [m[1], m[2], m[3]]
        .map(n => parseInt(n).toString(16).padStart(2, '0'))
        .join('');

      return vpHex.toLowerCase() === oceanFill?.toLowerCase();
    });
    expect(colorsMatch).toBe(true);
  });

  test('controles de zoom no se sobrelapan con la leyenda', async ({ page }) => {
    // Verificar que zoom controls y la leyenda no se sobrelapan
    const overlap = await page.evaluate(() => {
      const zoomControls = document.querySelector('.map-zoom-controls');
      const legend = document.querySelector('.map-legend');
      if (!zoomControls || !legend) return false;

      const zoomRect = zoomControls.getBoundingClientRect();
      const legendRect = legend.getBoundingClientRect();

      // Chequear overlap: si el zoom está a la derecha y la leyenda a la izquierda, no debería haber overlap
      return !(zoomRect.right < legendRect.left ||
               zoomRect.left > legendRect.right ||
               zoomRect.bottom < legendRect.top ||
               zoomRect.top > legendRect.bottom);
    });
    // No debe haber overlap
    expect(overlap).toBe(false);
  });
});

test.describe('Mapa — mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await login(page, 'halo-dm');
    // En mobile el sidebar está oculto, navegar al mapa vía JS
    await page.evaluate(() => switchTab('mapa'));
    await page.waitForSelector('#section-mapa.active', { state: 'visible' });
    await page.waitForSelector('#map-viewport svg', { timeout: 15000 });
  });

  test('viewport background coincide con océano en mobile', async ({ page }) => {
    const colorsMatch = await page.evaluate(() => {
      const vp = document.getElementById('map-viewport');
      const oceanBase = document.querySelector('#oceanBase');
      if (!vp || !oceanBase) return false;

      const vpBg = window.getComputedStyle(vp).backgroundColor;
      const oceanFill = oceanBase.getAttribute('fill');

      const m = vpBg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!m) return false;
      const vpHex = '#' + [m[1], m[2], m[3]]
        .map(n => parseInt(n).toString(16).padStart(2, '0'))
        .join('');

      return vpHex.toLowerCase() === oceanFill?.toLowerCase();
    });
    expect(colorsMatch).toBe(true);
  });

  test('mapa se renderiza correctamente en viewport mobile', async ({ page }) => {
    const svgLoaded = await page.evaluate(() => {
      const svg = document.querySelector('#map-viewport svg');
      return svg !== null && svg.getAttribute('viewBox') !== null;
    });
    expect(svgLoaded).toBe(true);
  });

  test('controles y leyenda visibles sin overlap en mobile', async ({ page }) => {
    const result = await page.evaluate(() => {
      const zoom = document.querySelector('.map-zoom-controls');
      const legend = document.querySelector('.map-legend');
      if (!zoom || !legend) return { zoomVisible: !!zoom, legendVisible: !!legend, overlap: false };

      const zr = zoom.getBoundingClientRect();
      const lr = legend.getBoundingClientRect();

      const overlap = !(zr.right < lr.left || zr.left > lr.right ||
                        zr.bottom < lr.top || zr.top > lr.bottom);

      return { zoomVisible: zr.width > 0, legendVisible: lr.width > 0, overlap };
    });
    expect(result.zoomVisible).toBe(true);
    expect(result.legendVisible).toBe(true);
    expect(result.overlap).toBe(false);
  });
});
