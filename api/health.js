export default function handler(req, res) {
  res.status(200).json({ code: 0, msg: 'ok', env: process.env.SUPABASE_URL ? 'has-url' : 'no-url' });
}
