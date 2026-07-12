select setval('cafes_id_seq', (select max(id) from public.cafes));
