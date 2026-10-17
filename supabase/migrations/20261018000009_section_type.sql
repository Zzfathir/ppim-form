-- Multi-page forms: a "section" item starts a new page (title + optional description).
-- Kept in its own migration: a new enum value can't be used in the transaction that adds it.
alter type public.question_type add value if not exists 'section';
