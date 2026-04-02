-- Migración: Mejora narrativa establecimientos y NPCs
-- Fecha: 2026-03-25
-- Descripción: Separa descripciones en exterior/interior (establecimientos)
--              y primera_impresion/notas_roleplay + edad (NPCs)

-- ============================================
-- ESTABLECIMIENTOS
-- ============================================

-- Renombrar descripcion → descripcion_interior
ALTER TABLE establecimientos
  RENAME COLUMN descripcion TO descripcion_interior;

-- Agregar campo para descripción exterior
ALTER TABLE establecimientos
  ADD COLUMN descripcion_exterior text;

-- ============================================
-- NPCs
-- ============================================

-- Renombrar descripcion → primera_impresion
ALTER TABLE npcs
  RENAME COLUMN descripcion TO primera_impresion;

-- Agregar campo para notas de roleplay (solo DM)
ALTER TABLE npcs
  ADD COLUMN notas_roleplay text;

-- Agregar campo para edad del NPC
ALTER TABLE npcs
  ADD COLUMN edad integer;
