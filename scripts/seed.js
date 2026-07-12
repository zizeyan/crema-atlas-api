const { createClient } = require('@supabase/supabase-js');
const seed = require('../public/data/cafes.json');

const url = 'https://nqwkoggzmcbkpfrhrgrn.supabase.co';
const key = process.argv[2] || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.error('Usage: node seed.js <service-role-key>');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const rows = seed.map(c => ({
    ...c,
    rating: Number(c.rating),
    cost: Number(c.cost),
    tags: Array.isArray(c.tags) ? c.tags : []
  }));
  const { data, error } = await supabase.from('cafes').upsert(rows, { onConflict: 'id' }).select();
  if (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
  console.log(`Seeded ${data.length} cafes`);
}

main();
