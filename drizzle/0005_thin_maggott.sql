ALTER TABLE `users` ADD `campus_verified` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `users` SET `campus_verified` = 1
WHERE lower(`email`) LIKE '%@omu.edu.tr' OR lower(`email`) LIKE '%.omu.edu.tr';--> statement-breakpoint
UPDATE `users` SET `public_id` = lower(
  substr(hex(randomblob(4)), 1, 8) || '-' ||
  substr(hex(randomblob(2)), 1, 4) || '-4' ||
  substr(hex(randomblob(2)), 2, 3) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) ||
  substr(hex(randomblob(2)), 2, 3) || '-' ||
  substr(hex(randomblob(6)), 1, 12)
) WHERE `public_id` IS NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `universities` (`id`, `name`, `short_name`, `city`)
VALUES ('omu', 'Ondokuz Mayıs Üniversitesi', 'OMÜ', 'Samsun');--> statement-breakpoint
INSERT OR IGNORE INTO `faculties` (`id`, `university_id`, `name`, `short_name`) VALUES
  ('muhendislik', 'omu', 'Mühendislik Fakültesi', 'MÜH'),
  ('iibf', 'omu', 'İktisadi ve İdari Bilimler Fakültesi', 'İİBF'),
  ('egitim', 'omu', 'Eğitim Fakültesi', 'EĞT'),
  ('tip', 'omu', 'Tıp Fakültesi', 'TIP'),
  ('hukuk', 'omu', 'Ali Fuad Başgil Hukuk Fakültesi', 'HUK');--> statement-breakpoint
UPDATE `departments` SET `faculty_id` = 'muhendislik'
WHERE `faculty_id` IS NULL AND `id` IN ('bilgisayar', 'elektrik-elektronik', 'makine');--> statement-breakpoint
UPDATE `departments` SET `faculty_id` = 'iibf'
WHERE `faculty_id` IS NULL AND `id` IN ('iktisat', 'isletme', 'siyaset-kamu', 'uluslararasi-ticaret');--> statement-breakpoint
UPDATE `departments` SET `faculty_id` = 'egitim'
WHERE `faculty_id` IS NULL AND `id` IN ('pdr', 'sinif-ogretmenligi', 'matematik-ogretmenligi', 'turkce-ogretmenligi');--> statement-breakpoint
UPDATE `departments` SET `faculty_id` = 'tip'
WHERE `faculty_id` IS NULL AND `id` = 'tip-programi';--> statement-breakpoint
UPDATE `departments` SET `faculty_id` = 'hukuk'
WHERE `faculty_id` IS NULL AND `id` = 'hukuk-programi';
