-- A clearer juicer photo (public/rewards/juicer-breville.jpg).
update public.rewards
   set image_url = '/rewards/juicer-breville.jpg'
 where image_url = '/rewards/juicer.jpg';
