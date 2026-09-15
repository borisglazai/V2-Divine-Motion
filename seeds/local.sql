-- ============================================================================
-- Divine Motion V2 — local/staging seed (Implementation Brief 010)
-- ============================================================================
-- Non-destructive by intent: written to run ONCE against a freshly-migrated,
-- EMPTY local or staging D1 (right after `npm run db:migrate:local` /
-- `db:migrate:staging`). It only INSERTs — it never DELETEs or DROPs
-- anything, and it does not touch production (no production binding exists
-- in wrangler.toml — see docs/DEPLOYMENT.md).
--
-- Purpose: enough realistic content to exercise the future CMS/admin
-- (Brief 011+) without inventing real client data. Inspired by the
-- already-approved frontend mock copy (src/data/mock/*.ts) but this seed
-- does NOT replace those mocks — the public frontend still reads from them
-- until a later migration phase (see docs/DATA_ARCHITECTURE.md §35 /
-- Brief 010 §18). No real personal data anywhere below: media are
-- metadata-only placeholder rows (no files actually exist at these
-- storage_keys), and the two testimonials are clearly fictional.
-- ============================================================================

INSERT INTO site_settings (
  id, brand_name, contact_email, instagram_url, instagram_handle_label,
  default_seo_title_fr, default_seo_title_en,
  default_seo_description_fr, default_seo_description_en,
  updated_at
) VALUES (
  1, 'Divine Motion', 'bonjour@divinemotion.ca', 'https://instagram.com', 'Instagram',
  'Divine Motion — Photographie et vidéographie',
  'Divine Motion — Photography and videography',
  'Studio visuel spécialisé en mariages, portraits et événements.',
  'Visual studio specializing in weddings, portraits and events.',
  strftime('%s','now') * 1000
);

-- ----------------------------------------------------------------------------
-- MEDIA — metadata-only placeholder rows. No real files exist at these R2
-- keys; they exist so work_items/services/page content have something
-- real to reference while testing the schema and, later, the CMS.
-- ----------------------------------------------------------------------------
INSERT INTO media (storage_key, original_filename, mime_type, size_bytes, width, height, alt_fr, alt_en, processing_status, publication_rights_confirmed, publication_rights_confirmed_at, uploaded_at, created_at, updated_at)
VALUES
  ('media/seed-a.jpg', 'seed-a.jpg', 'image/jpeg', 2400000, 4000, 3000, 'Portrait signature en lumière naturelle — placeholder de seed', 'Signature portrait in natural light — seed placeholder', 'ready', 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('media/seed-b.jpg', 'seed-b.jpg', 'image/jpeg', 2100000, 3600, 4500, 'Portrait en extérieur — placeholder de seed', 'Outdoor portrait — seed placeholder', 'ready', 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('media/seed-c.jpg', 'seed-c.jpg', 'image/jpeg', 1800000, 3000, 3000, 'Détail de mariage — placeholder de seed', 'Wedding detail — seed placeholder', 'ready', 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('media/seed-d.jpg', 'seed-d.jpg', 'image/jpeg', 2600000, 3600, 4500, 'Portrait de couple — placeholder de seed', 'Couple portrait — seed placeholder', 'ready', 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('media/seed-e.jpg', 'seed-e.jpg', 'image/jpeg', 3100000, 5000, 2143, 'Séance urbaine — placeholder de seed', 'Urban session — seed placeholder', 'ready', 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000);

-- ----------------------------------------------------------------------------
-- SERVICES — the 3 fixed MVP services. `layout` is intentionally absent
-- (ADR-014): the frontend maps `slug` -> layout in code.
-- ----------------------------------------------------------------------------
INSERT INTO services (slug, title_fr, title_en, description_fr, description_en, media_id, ratio, image_alt_fr, image_alt_en, cta_label_fr, cta_label_en, position, is_active, fr_status, en_status, fr_published_at, en_published_at, created_at, updated_at)
VALUES
  ('weddings', 'Mariages', 'Weddings',
   'Couverture photo et vidéo pensée pour raconter la journée avec naturel, élégance et attention aux détails.',
   'Photo and video coverage designed to tell your day''s story with warmth, elegance and an eye for detail.',
   (SELECT id FROM media WHERE storage_key='media/seed-e.jpg'), '16/9',
   'Mariage, ambiance de réception — placeholder de seed', 'Wedding, reception ambiance — seed placeholder',
   'Parler de votre mariage', 'Talk about your wedding',
   1, 1, 'published', 'published', strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('portraits', 'Portraits & Lifestyle', 'Portraits & Lifestyle',
   'Séances individuelles, en couple ou en famille — en studio ou en extérieur, pour des images qui vous ressemblent vraiment.',
   'Solo, couple or family sessions — in studio or outdoors, for images that actually look like you.',
   (SELECT id FROM media WHERE storage_key='media/seed-b.jpg'), '4/5',
   'Portrait en lumière naturelle — placeholder de seed', 'Portrait in natural light — seed placeholder',
   'Organiser une séance', 'Book a session',
   2, 1, 'published', 'published', strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('events', 'Événements', 'Events',
   'Une présence discrète pour couvrir vos événements privés ou professionnels, du premier instant au dernier.',
   'A discreet presence covering your private or professional events, from the first moment to the last.',
   (SELECT id FROM media WHERE storage_key='media/seed-d.jpg'), '21/9',
   'Événement, ambiance de salle — placeholder de seed', 'Event, room ambiance — seed placeholder',
   'Parler de votre événement', 'Talk about your event',
   3, 1, 'published', 'published', strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000);

INSERT INTO service_features (service_id, position, text_fr, text_en)
VALUES
  ((SELECT id FROM services WHERE slug='weddings'), 1, 'Couverture personnalisée', 'Personalized coverage'),
  ((SELECT id FROM services WHERE slug='weddings'), 2, 'Photo et/ou vidéo', 'Photo and/or video'),
  ((SELECT id FROM services WHERE slug='weddings'), 3, 'Accompagnement avant le jour J', 'Support before the big day'),
  ((SELECT id FROM services WHERE slug='portraits'), 1, 'Portraits individuels', 'Individual portraits'),
  ((SELECT id FROM services WHERE slug='portraits'), 2, 'Couples & familles', 'Couples & families'),
  ((SELECT id FROM services WHERE slug='portraits'), 3, 'Séances urbaines & lifestyle', 'Urban & lifestyle sessions'),
  ((SELECT id FROM services WHERE slug='events'), 1, 'Anniversaires & célébrations', 'Birthdays & celebrations'),
  ((SELECT id FROM services WHERE slug='events'), 2, 'Événements privés', 'Private events'),
  ((SELECT id FROM services WHERE slug='events'), 3, 'Événements professionnels', 'Professional events');

-- ----------------------------------------------------------------------------
-- WORK ITEMS — curated sequence for Travail. No `layout`/`category` forced
-- choices beyond what the conceptual model allows; composition stays a
-- frontend concern (ADR-014).
-- ----------------------------------------------------------------------------
INSERT INTO work_items (media_id, category, position, ratio, caption_fr, caption_en, alt_fr, alt_en, is_visible, featured_on_home, fr_status, en_status, fr_published_at, en_published_at, created_at, updated_at)
VALUES
  ((SELECT id FROM media WHERE storage_key='media/seed-a.jpg'), 'wedding', 1, '21/9', NULL, NULL, 'Paysage large en fin de journée — placeholder de seed', 'Wide landscape at dusk — seed placeholder', 1, 1, 'published', 'published', strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ((SELECT id FROM media WHERE storage_key='media/seed-b.jpg'), 'portrait', 2, '4/5', NULL, NULL, 'Portrait naturel en lumière douce — placeholder de seed', 'Natural portrait in soft light — seed placeholder', 1, 1, 'published', 'published', strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ((SELECT id FROM media WHERE storage_key='media/seed-c.jpg'), 'wedding', 3, '3/2', NULL, NULL, 'Rue animée, ambiance urbaine — placeholder de seed', 'Busy street, urban mood — seed placeholder', 1, 0, 'published', 'published', strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ((SELECT id FROM media WHERE storage_key='media/seed-d.jpg'), 'portrait', 4, '4/5', NULL, NULL, 'Portrait signature en grand format — placeholder de seed', 'Signature portrait, large format — seed placeholder', 1, 1, 'published', 'published', strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ((SELECT id FROM media WHERE storage_key='media/seed-e.jpg'), 'event', 5, '16/9', NULL, NULL, 'Réception, vue d''ensemble — placeholder de seed', 'Reception, wide view — seed placeholder', 1, 0, 'published', 'published', strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ((SELECT id FROM media WHERE storage_key='media/seed-a.jpg'), 'event', 6, '3/2', 'Réception de mariage', 'Wedding reception', 'Réception de mariage — placeholder de seed', 'Wedding reception — seed placeholder', 1, 1, 'published', 'published', strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000);

-- ----------------------------------------------------------------------------
-- PAGE CONTENT — one published singleton row per page (Accueil, Travail,
-- Services, À propos, Contact). Confidentialité stays out of D1 (ADR
-- decision, docs/DATA_ARCHITECTURE.md §9/§11) — seeded nowhere here.
-- ----------------------------------------------------------------------------
INSERT INTO home_content (
  hero_headline_fr, hero_headline_en, hero_subline_fr, hero_subline_en, hero_media_id, hero_image_alt_fr, hero_image_alt_en,
  work_preview_label_fr, work_preview_label_en, work_preview_link_label_fr, work_preview_link_label_en,
  brand_statement_fr, brand_statement_en,
  services_preview_label_fr, services_preview_label_en,
  editorial_media_id, editorial_image_alt_fr, editorial_image_alt_en,
  about_preview_label_fr, about_preview_label_en, about_preview_text_fr, about_preview_text_en, about_preview_media_id, about_preview_image_alt_fr, about_preview_image_alt_en,
  final_cta_headline_fr, final_cta_headline_en,
  fr_status, en_status, fr_published_at, en_published_at, created_at, updated_at
) VALUES (
  'Des images qui restent en mouvement.', 'Images that stay in motion.',
  'Photographie et vidéographie pour les mariages, les portraits et les moments qui comptent.',
  'Photography and videography for weddings, portraits and the moments that matter.',
  (SELECT id FROM media WHERE storage_key='media/seed-a.jpg'), 'Portrait signature en lumière naturelle — placeholder de seed', 'Signature portrait in natural light — seed placeholder',
  'Travail', 'Work', 'Voir notre travail', 'See our work',
  'Nous photographions les personnes et les moments tels qu''ils méritent d''être ressentis.', 'We photograph people and moments the way they deserve to be felt.',
  'Services', 'Services',
  (SELECT id FROM media WHERE storage_key='media/seed-e.jpg'), 'Photographie éditoriale de respiration — placeholder de seed', 'Editorial breathing-room photograph — seed placeholder',
  'À propos', 'About', 'Un studio visuel qui met la qualité du regard au service de vos moments les plus importants.', 'A visual studio that puts a distinctive eye at the service of your most important moments.',
  (SELECT id FROM media WHERE storage_key='media/seed-d.jpg'), 'Portrait en coulisses de Divine Motion — placeholder de seed', 'Behind-the-scenes portrait of Divine Motion — seed placeholder',
  'Parlons de ce que vous voulez raconter.', 'Let''s talk about what you want to tell.',
  'published', 'published', strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000
);

INSERT INTO work_page_content (title_fr, title_en, intro_fr, intro_en, cta_headline_fr, cta_headline_en, fr_status, en_status, fr_published_at, en_published_at, created_at, updated_at)
VALUES ('Travail', 'Work', 'Une sélection de notre regard.', 'A glimpse into how we see.', 'Vous avez quelque chose à raconter ?', 'Have a story to tell?', 'published', 'published', strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000);

INSERT INTO services_page_content (title_fr, title_en, intro_fr, intro_en, approach_label_fr, approach_label_en, cta_headline_fr, cta_headline_en, fr_status, en_status, fr_published_at, en_published_at, created_at, updated_at)
VALUES ('Services', 'Services', 'Des images pensées pour les moments qui comptent.', 'Images made for the moments that matter.', 'Approche', 'How it works', 'Votre projet ne rentre pas exactement dans une case ? Parlons-en.', 'Doesn''t quite fit a box? Let''s talk about it.', 'published', 'published', strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000);

INSERT INTO services_approach_steps (services_page_id, position, title_fr, title_en, text_fr, text_en)
VALUES
  ((SELECT id FROM services_page_content), 1, 'Échange', 'Conversation', 'On comprend votre besoin, votre date et votre intention.', 'We get to know your need, your date and your intention.'),
  ((SELECT id FROM services_page_content), 2, 'Préparation', 'Preparation', 'On définit ensemble l''approche et les détails essentiels.', 'We map out the approach and the details that matter.'),
  ((SELECT id FROM services_page_content), 3, 'Création', 'Creation', 'On capture votre moment avec une direction claire et naturelle.', 'We capture your moment with a clear, natural direction.');

INSERT INTO about_content (
  hero_title_fr, hero_title_en, hero_intro_fr, hero_intro_en, hero_media_id, hero_ratio, hero_image_alt_fr, hero_image_alt_en,
  story_label_fr, story_label_en, approach_label_fr, approach_label_en,
  breathing_media_id, breathing_ratio, breathing_image_alt_fr, breathing_image_alt_en,
  human_note_text_fr, human_note_text_en, human_note_media_id, human_note_ratio, human_note_image_alt_fr, human_note_image_alt_en,
  final_cta_headline_fr, final_cta_headline_en,
  fr_status, en_status, fr_published_at, en_published_at, created_at, updated_at
) VALUES (
  'Une approche sensible de l''image.', 'A thoughtful way of seeing.',
  'Derrière Divine Motion, une manière simple de raconter ce qui est vrai.', 'Behind Divine Motion, a simple way of telling what''s true.',
  (SELECT id FROM media WHERE storage_key='media/seed-b.jpg'), '16/9', 'Portrait de Divine Motion en situation de travail — placeholder de seed', 'Portrait of Divine Motion at work — seed placeholder',
  'Qui sommes-nous', 'About us', 'Approche', 'Approach',
  (SELECT id FROM media WHERE storage_key='media/seed-d.jpg'), '21/9', 'Photographie éditoriale de respiration — placeholder de seed', 'Editorial breathing-room photograph — seed placeholder',
  'On sait que se retrouver devant un objectif n''est pas toujours confortable. Notre travail commence là : mettre les gens à l''aise, pour que ce qui reste soit simplement vrai.',
  'We know that standing in front of a camera isn''t always easy. That''s where the work really begins — putting people at ease, so what''s left is simply true.',
  (SELECT id FROM media WHERE storage_key='media/seed-c.jpg'), '4/5', 'Séance photo en cours, ambiance de travail — placeholder de seed', 'Photo session in progress, working atmosphere — seed placeholder',
  'Votre histoire mérite d''être racontée avec justesse.', 'Your story deserves to be told honestly.',
  'published', 'published', strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000
);

INSERT INTO about_story_paragraphs (about_id, position, text_fr, text_en)
VALUES
  ((SELECT id FROM about_content), 1, 'Divine Motion est né d''une passion simple : capturer les gens tels qu''ils sont, dans les moments qui comptent vraiment.', 'Divine Motion started with a simple idea: capture people as they really are, in the moments that matter most.'),
  ((SELECT id FROM about_content), 2, 'Le studio photographie et filme les mariages, les portraits et les événements avec une attention particulière portée à la lumière, aux détails et aux émotions réelles.', 'The studio photographs and films weddings, portraits and events with close attention to light, detail and real emotion.'),
  ((SELECT id FROM about_content), 3, 'Chaque séance commence par une conversation, pas par une liste de poses — pour que les images restent naturelles et sincères.', 'Every session starts with a conversation, not a list of poses — so the images stay natural and honest.');

INSERT INTO about_approach_items (about_id, position, word_fr, word_en, text_fr, text_en)
VALUES
  ((SELECT id FROM about_content), 1, 'Lumière', 'Light', 'Chercher la lumière qui raconte quelque chose de vrai.', 'Looking for light that says something true.'),
  ((SELECT id FROM about_content), 2, 'Émotion', 'Emotion', 'Capturer ce qui se passe vraiment, pas ce qui est posé.', 'Capturing what''s really happening, not what''s posed.'),
  ((SELECT id FROM about_content), 3, 'Simplicité', 'Simplicity', 'Aller à l''essentiel, sans artifice inutile.', 'Getting to what matters, without unnecessary artifice.');

INSERT INTO contact_content (hero_title_fr, hero_title_en, hero_subtext_fr, hero_subtext_en, details_label_fr, details_label_en, closing_note_fr, closing_note_en, fr_status, en_status, fr_published_at, en_published_at, created_at, updated_at)
VALUES ('Parlons de votre projet.', 'Let''s talk about your project.', 'Quelques détails suffisent pour commencer la conversation.', 'A few details are enough to start the conversation.', 'Coordonnées', 'Get in touch', 'Chaque projet commence par une conversation.', 'Every project starts with a conversation.', 'published', 'published', strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000);

-- ----------------------------------------------------------------------------
-- SEO — one row per known public page, Confidentialité included (SEO
-- metadata is markup, not legal content).
-- ----------------------------------------------------------------------------
INSERT INTO page_seo (page_key, title_fr, title_en, description_fr, description_en, updated_at)
VALUES
  ('home', 'Accueil', 'Home', 'Photographie et vidéographie pour les mariages, les portraits et les moments qui comptent.', 'Photography and videography for weddings, portraits and the moments that matter.', strftime('%s','now') * 1000),
  ('work', 'Travail', 'Work', 'Une sélection curatée du travail de Divine Motion.', 'A curated selection of Divine Motion''s work.', strftime('%s','now') * 1000),
  ('services', 'Services', 'Services', 'Des images pensées pour les moments qui comptent.', 'Images made for the moments that matter.', strftime('%s','now') * 1000),
  ('about', 'Une approche sensible de l''image.', 'A thoughtful way of seeing.', 'Derrière Divine Motion, une manière simple de raconter ce qui est vrai.', 'Behind Divine Motion, a simple way of telling what''s true.', strftime('%s','now') * 1000),
  ('contact', 'Parlons de votre projet.', 'Let''s talk about your project.', 'Quelques détails suffisent pour commencer la conversation.', 'A few details are enough to start the conversation.', strftime('%s','now') * 1000),
  ('privacy', 'Confidentialité', 'Privacy', 'Comment Divine Motion traite les renseignements transmis via le site.', 'How Divine Motion handles information shared through the site.', strftime('%s','now') * 1000);

-- ----------------------------------------------------------------------------
-- TESTIMONIALS — clearly fictional placeholder content, no real clients.
-- ----------------------------------------------------------------------------
INSERT INTO testimonials (author_name, quote_fr, quote_en, role_context_fr, role_context_en, position, is_visible, fr_status, en_status, fr_published_at, en_published_at, created_at, updated_at)
VALUES
  ('Exemple de témoignage A', 'Un exemple de témoignage à remplacer par un vrai retour client.', 'A placeholder testimonial, to be replaced with a real client quote.', 'Mariage (exemple)', 'Wedding (example)', 1, 1, 'published', 'published', strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('Exemple de témoignage B', 'Un second exemple, texte à remplacer avant mise en production.', 'A second placeholder, text to replace before production.', 'Portrait (exemple)', 'Portrait (example)', 2, 1, 'published', 'published', strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000);
