-- Real photos for the twelve deck rewards (public/rewards/*.jpg, served with
-- the site). Freely licensed from Wikimedia Commons; the credits are on the
-- Rewards page (src/lib/reward-photos.ts). Only rows without a photo of their
-- own are touched, so a photo the office uploads in Website CMS stays.
update public.rewards w
   set image_url = v.img
  from (values
    ('Channel Partner',    '/rewards/induction.jpg'),
    ('Team Coordinator',   '/rewards/juicer.jpg'),
    ('Manager',            '/rewards/mixer.jpg'),
    ('Deputy Manager',     '/rewards/phone-10k-a.jpg'),
    ('AGM',                '/rewards/phone-10k-b.jpg'),
    ('DGM',                '/rewards/phone-15k.jpg'),
    ('GM',                 '/rewards/phone-20k.jpg'),
    ('Vice President',     '/rewards/laptop.jpg'),
    ('Core Manager',       '/rewards/car-5l.jpg'),
    ('Sales Country Head', '/rewards/car-7l.jpg'),
    ('Diamond',            '/rewards/car-10l.jpg'),
    ('Crown',              '/rewards/car-12l.jpg')
  ) as v(rank, img)
 where w.joining = v.rank and coalesce(w.image_url, '') = '';
