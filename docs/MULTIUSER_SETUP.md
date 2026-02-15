oke # Multi-User Setup (Supabase)

Website ini sudah support mode multi-user via Supabase.

## 1. Buat project Supabase
1. Login ke https://supabase.com
2. Buat project baru
3. Ambil:
- `Project URL`
- `anon public key`

## 2. Buat tabel `secret_messages`
Jalankan SQL berikut di Supabase SQL Editor:

```sql
create extension if not exists pgcrypto;

create table if not exists public.secret_messages (
  id uuid primary key default gen_random_uuid(),
  to_name text not null,
  title text not null,
  from_name text,
  music_url text,
  message_text text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '3 months')
);
```

Jika tabel sudah terlanjur dibuat sebelumnya, jalankan ini:

```sql
alter table public.secret_messages
add column if not exists expires_at timestamptz;

update public.secret_messages
set expires_at = coalesce(expires_at, created_at + interval '3 months');

alter table public.secret_messages
alter column expires_at set not null;
```

## 3. Aktifkan RLS dan policy
Jalankan SQL ini:

```sql
alter table public.secret_messages enable row level security;

create policy "allow public read"
on public.secret_messages
for select
to anon
using (true);

create policy "allow public insert"
on public.secret_messages
for insert
to anon
with check (true);

create policy "allow public delete expired"
on public.secret_messages
for delete
to anon
using (expires_at < now());
```

## 4. Isi config di project
Edit file `supabase-config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://fivyhrcnauclncaklrps.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpdnlocmNuYXVjbG5jYWtscnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTgxOTMsImV4cCI6MjA4NjUzNDE5M30.YyLFERLMrKAUh3xpaGh4xwkqRs62jpIgGeUt7odaepY"
};
```

## 5. Hasil
- Semua user yang membuka `secret-message.html` akan baca/tulis ke data cloud yang sama.
- Pencarian nama/judul otomatis lintas user.

## 6. Tabel komentar memorial (index modal)
Jalankan SQL ini untuk komentar per memorial:

```sql
create table if not exists public.memorial_comments (
  id uuid primary key default gen_random_uuid(),
  memorial_key text not null,
  content text not null,
  user_id uuid,
  user_name text,
  created_at timestamptz not null default now()
);

alter table public.memorial_comments enable row level security;

drop policy if exists "allow comments read" on public.memorial_comments;
drop policy if exists "allow comments insert auth" on public.memorial_comments;

create policy "allow comments read"
on public.memorial_comments
for select
to anon, authenticated
using (true);

create policy "allow comments insert auth"
on public.memorial_comments
for insert
to authenticated
with check (true);
```

## 7. Login Google (Supabase Auth)
1. Di Supabase Dashboard buka `Authentication` -> `Providers`.
2. Aktifkan provider `Google`.
3. Isi `Client ID` dan `Client Secret` Google OAuth.
4. Tambahkan redirect URL:
- `http://localhost:5500/login.html` (dev lokal)
- URL production kamu jika sudah deploy.
