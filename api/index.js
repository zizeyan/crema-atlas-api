const express = require('express');
const cors = require('cors');
const serverless = require('serverless-http');
const { supabase } = require('../lib/supabase');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

function envelope(code = 0, msg = 'ok', data = null) {
  return { code, msg, data };
}

function error(msg, code = 50000) {
  return envelope(code, msg, null);
}

function validateCafe(body, requireId = false) {
  const errors = [];
  if (requireId && body.id == null) errors.push('id is required');
  if (body.name == null || body.name === '') errors.push('name is required');
  if (body.address == null || body.address === '') errors.push('address is required');
  if (body.location == null || body.location === '') errors.push('location is required');
  if (body.business_area == null || body.business_area === '') errors.push('business_area is required');
  if (body.type == null || body.type === '') errors.push('type is required');
  if (body.rating == null || body.rating === '') errors.push('rating is required');
  if (body.cost == null || body.cost === '') errors.push('cost is required');
  if (body.cityname == null || body.cityname === '') errors.push('cityname is required');
  return errors;
}

function parseNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildQuery(opts) {
  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const size = Math.max(1, Math.min(100, parseInt(opts.size, 10) || 20));
  const from = (page - 1) * size;
  const to = from + size - 1;

  let query = supabase.from('cafes').select('*', { count: 'exact' });

  if (opts.area) {
    query = query.eq('business_area', opts.area);
  }

  if (opts.q) {
    const q = `%${opts.q}%`;
    query = query.or(`name.ilike.${q},address.ilike.${q},tags.cs.{${opts.q}}`);
  }

  switch (opts.sort) {
    case 'rating_desc':
      query = query.order('rating', { ascending: false });
      break;
    case 'cost_asc':
      query = query.order('cost', { ascending: true });
      break;
    case 'cost_desc':
      query = query.order('cost', { ascending: false });
      break;
    case 'id_asc':
    default:
      query = query.order('id', { ascending: true });
      break;
  }

  return { query, page, size, from, to };
}

// 4.1 / 4.3 list & create
app.route('/api/cafes')
  .get(async (req, res) => {
    try {
      const { query, page, size, from, to } = buildQuery(req.query);
      const { data, error: err, count } = await query.range(from, to);
      if (err) throw err;
      res.json(envelope(0, 'ok', { list: data || [], page, size, total: count || 0 }));
    } catch (e) {
      res.status(500).json(error(e.message || 'Server error'));
    }
  })
  .post(async (req, res) => {
    try {
      const errors = validateCafe(req.body);
      if (errors.length) return res.status(400).json(error(errors.join('; '), 40001));

      const body = { ...req.body };
      if (body.id != null) delete body.id;
      body.rating = parseNum(body.rating) ?? body.rating;
      body.cost = parseNum(body.cost) ?? body.cost;
      body.tags = Array.isArray(body.tags) ? body.tags : [];

      const { data, error: err } = await supabase.from('cafes').insert(body).select().single();
      if (err) throw err;
      res.status(201).json(envelope(0, 'ok', data));
    } catch (e) {
      res.status(500).json(error(e.message || 'Server error'));
    }
  });

// 4.2 / 4.4 / 4.5 detail / update / delete
app.route('/api/cafes/:id')
  .get(async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json(error('id must be number', 40001));
      const { data, error: err } = await supabase.from('cafes').select('*').eq('id', id).single();
      if (err && err.code === 'PGRST116') return res.status(404).json(error('Not found', 40401));
      if (err) throw err;
      res.json(envelope(0, 'ok', data));
    } catch (e) {
      res.status(500).json(error(e.message || 'Server error'));
    }
  })
  .put(async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json(error('id must be number', 40001));

      const body = { ...req.body };
      delete body.id;
      if (body.rating != null) body.rating = parseNum(body.rating) ?? body.rating;
      if (body.cost != null) body.cost = parseNum(body.cost) ?? body.cost;
      if (body.tags != null) body.tags = Array.isArray(body.tags) ? body.tags : [];

      const { data, error: err } = await supabase.from('cafes').update(body).eq('id', id).select().single();
      if (err && err.code === 'PGRST116') return res.status(404).json(error('Not found', 40401));
      if (err) throw err;
      res.json(envelope(0, 'ok', data));
    } catch (e) {
      res.status(500).json(error(e.message || 'Server error'));
    }
  })
  .delete(async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json(error('id must be number', 40001));
      const { error: err } = await supabase.from('cafes').delete().eq('id', id);
      if (err) throw err;
      res.json(envelope(0, 'ok', { id }));
    } catch (e) {
      res.status(500).json(error(e.message || 'Server error'));
    }
  });

// 4.6 batch import
app.post('/api/cafes/batch', async (req, res) => {
  try {
    const list = req.body;
    if (!Array.isArray(list)) return res.status(400).json(error('body must be an array', 40001));
    if (!list.length) return res.json(envelope(0, 'ok', { created: 0 }));

    const rows = list.map(item => {
      const row = { ...item };
      if (row.rating != null) row.rating = parseNum(row.rating) ?? row.rating;
      if (row.cost != null) row.cost = parseNum(row.cost) ?? row.cost;
      row.tags = Array.isArray(row.tags) ? row.tags : [];
      return row;
    });

    const { data, error: err } = await supabase.from('cafes').insert(rows).select();
    if (err) {
      if (err.code === '23505') return res.status(409).json(error('Conflict: duplicate id', 40901));
      throw err;
    }
    res.json(envelope(0, 'ok', { created: data ? data.length : 0 }));
  } catch (e) {
    res.status(500).json(error(e.message || 'Server error'));
  }
});

module.exports = serverless(app);
