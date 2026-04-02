-- Notas de jugadores por entidad (compartidas entre todos los jugadores)
create table entity_notes (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null,       -- 'npcs', 'ciudades', 'establecimientos', 'lugares', 'items'
  entity_id    uuid not null,       -- _sbid de la entidad
  contenido    text not null default '',
  updated_at   timestamptz default now(),
  unique(entity_type, entity_id)
);

alter table entity_notes enable row level security;

create policy "entity_notes_select" on entity_notes for select using (auth.role() = 'authenticated');
create policy "entity_notes_insert" on entity_notes for insert with check (auth.role() = 'authenticated');
create policy "entity_notes_update" on entity_notes for update using (auth.role() = 'authenticated');
