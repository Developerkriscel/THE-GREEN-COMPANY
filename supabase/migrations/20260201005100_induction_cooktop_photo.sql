-- The Induction reward is an induction cooktop: use the office's product
-- photo (public/rewards/induction-cooktop.jpg) in place of the seminar photo.
update public.rewards
   set image_url = '/rewards/induction-cooktop.jpg'
 where image_url = '/rewards/induction.jpg';
