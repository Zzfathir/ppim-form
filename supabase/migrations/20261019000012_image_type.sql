-- Image blocks: an "image" item shows a picture (with an optional title) between questions.
-- Kept in its own migration: a new enum value can't be used in the transaction that adds it.
alter type public.question_type add value if not exists 'image';
