-- =====================================================================
-- Head office details and the Terms & Conditions, as supplied by the office
-- (2026-09-28). The company's address and WhatsApp number now live with the
-- rest of its details in `public.brand` (Admin → Business Settings →
-- Company); the footer, Contact page, ID card and documents all read them
-- from there.
-- =====================================================================

update public.site_settings
   set value = value || jsonb_build_object(
         'legalName', 'ROYAL SYMO GREEN CITY PRIVATE LIMITED',
         'address',   'Office No. 325, 3rd Floor, Universal Trade Tower, Sector 49, Sohna Road, Gurgaon, Haryana',
         'whatsapp',  '9211809636',
         'phone',     '9211809636',
         'email',     'symocitydevelopers@gmail.com',
         'website',   'symocity.com',
         'websiteUrl','https://symocity.com'),
       updated_at = now()
 where key = 'public.brand';

-- The Contact page kept its own copy of the company, phone, email, address
-- and WhatsApp, which is how the old ILD Trade Centre address outlived the
-- rename. Those now come from `public.brand`; this row keeps only what is
-- the Contact page's own (its heading and branch list). The old branch list
-- belonged to the previous company.
update public.site_settings
   set value = (value - 'company' - 'phone' - 'email' - 'address' - 'whatsapp')
               || jsonb_build_object('branches', ''),
       updated_at = now()
 where key = 'public.contact';

update public.cms_pages
   set title = 'Terms & Conditions',
       body  = E'1. All payments will be made as per government rules.\n'
            || E'2. All payments are valid only with a company slip.\n'
            || E'3. No payment is valid without the company''s original slip.\n'
            || E'4. Only company projects are valid for sales.\n'
            || E'5. All projects are maintained on the website – www.SymoCity.com\n'
            || E'6. TDS of 5% is deducted on every payment transaction.\n'
            || E'7. An admin charge of 3% is deducted on every income transaction.\n'
            || E'8. Income will be credited to your account.\n'
            || E'9. If a plot is sold below the rate, the rank holder above AGM is responsible.\n'
            || E'10. The company''s decision is final.\n'
            || E'11. Booking amount: 35% after booking, with the ATS (Agreement to Sell) and CRM access — a system to manage and track all plot details; 70% at registry.\n'
            || E'12. The booking amount is non-refundable in any case. If for some reason an issue arises, you can adjust it against another customer or use it for a future purchase.',
       published = true,
       updated_at = now()
 where slug = 'terms';
