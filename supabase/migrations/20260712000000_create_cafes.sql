create table if not exists public.cafes (
  id bigserial primary key,
  name text not null,
  address text not null,
  location text not null,
  tel text,
  business_area text not null,
  type text not null,
  tags text[] default '{}',
  rating numeric(3,2) not null,
  cost numeric(10,2) not null,
  image_url text,
  adcode text,
  pcode text,
  cityname text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable Row Level Security (RLS) but allow public read; service role writes bypass RLS
alter table public.cafes enable row level security;

create policy "Allow public read" on public.cafes
  for select using (true);

-- Optional: create an updated_at trigger
-- create extension if not exists moddatetime schema extensions;
-- create trigger cafes_updated_at before update on public.cafes
--   for each row execute procedure extensions.moddatetime(updated_at);
