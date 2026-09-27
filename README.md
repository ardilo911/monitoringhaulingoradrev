# Hauling Guard

Dashboard monitoring pekerjaan perawatan hauling road dalam masa garansi/retensi (WRO, Rekap Pekerjaan, Database, BAST dengan koreksi luasan retensi otomatis).

Stack: **Next.js 14 (App Router) + TypeScript + Tailwind CSS + Supabase (Auth + Postgres)**, siap deploy ke **Netlify**.

---

## 0. PENTING: Migrasi setelah update ini

Kalau project Supabase Anda sudah pernah dijalankan `schema.sql` versi sebelumnya, **jalankan ulang seluruh `schema.sql` sekali lagi** di SQL Editor sebelum deploy kode baru ini. File ini sudah idempotent (aman dijalankan ulang) dan sekarang menambahkan:
- Kolom baru di `work_records`: `lebar`, `panjang_override`, `volume_kg`.
- Nilai baru `'Tambalan'` di tipe `work_item_type`.

Tanpa migrasi ini, form Rekap Pekerjaan/Database yang baru akan gagal menyimpan data (kolom/nilai belum ada di database).

## 1. Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com).
2. Buka **SQL Editor**, tempel seluruh isi file `supabase/schema.sql`, lalu jalankan (Run). File ini aman dijalankan berkali-kali (idempotent) — membuat semua tabel, tipe data, trigger profile otomatis, dan Row Level Security untuk 2 tingkat akses: **admin** (semua mitra) dan **user mitra** (satu perusahaan saja).
3. Buka **Authentication → Users → Add user**, buat akun-akun yang dibutuhkan, misalnya:
   - `admin@perusahaan.com` → nanti jadi Admin, akses semua mitra.
   - `pic.wasco@perusahaan.com` → nanti jadi User Mitra, hanya Wasco.
   - `pic.khs@perusahaan.com` → nanti jadi User Mitra, hanya KHS.
   - Baris di tabel `profiles` untuk tiap akun akan otomatis terbuat oleh trigger.
4. Atur role & akses mitra tiap akun. Blok siap-pakai sudah ada di bagian paling bawah `schema.sql` (tinggal ganti alamat email sesuai yang Anda daftarkan), contoh:
   ```sql
   update profiles set role = 'admin', akses_mitra = '{wasco,khs}'
     where email = 'admin@perusahaan.com';
   update profiles set role = 'user', akses_mitra = '{wasco}'
     where email = 'pic.wasco@perusahaan.com';
   ```
5. Buka **Project Settings → API**, salin **Project URL** dan **anon public key** — dipakai di langkah berikut.

> Catatan: aplikasi ini login menggunakan **email** Supabase Auth. Kolom `username` di tabel `profiles` hanya untuk tampilan; saat login isi kolom "Email" dengan email lengkap yang didaftarkan.

---

## 2. Jalankan secara lokal (opsional, untuk cek dulu)

```bash
npm install
cp .env.example .env.local
# isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di .env.local
npm run dev
```

Buka `http://localhost:3000`.

---

## 3. Push ke GitHub

```bash
cd hauling-guard
git init
git add .
git commit -m "Initial commit: Hauling Guard dashboard"
git branch -M main
git remote add origin https://github.com/USERNAME_ANDA/hauling-guard.git
git push -u origin main
```

Ganti `USERNAME_ANDA` dan buat repository kosong terlebih dahulu di GitHub (jangan centang "initialize with README").

---

## 4. Deploy ke Netlify

**Lewat UI (paling mudah):**
1. Login ke [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**.
2. Pilih repo GitHub `hauling-guard` yang baru di-push.
3. Netlify akan otomatis mendeteksi `netlify.toml` (build command `npm run build`, plugin `@netlify/plugin-nextjs`).
4. Sebelum deploy, buka **Site settings → Environment variables**, tambahkan:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Klik **Deploy site**.

**Lewat CLI (alternatif):**
```bash
npm install -g netlify-cli
netlify login
netlify init
netlify env:set NEXT_PUBLIC_SUPABASE_URL "https://xxxx.supabase.co"
netlify env:set NEXT_PUBLIC_SUPABASE_ANON_KEY "eyJhbGci..."
netlify deploy --prod
```

---

## 5. Menambah user baru (setelah live)

1. Supabase Dashboard → Authentication → Users → Add user (isi email & password).
2. Login sebagai admin ke aplikasi → menu **Manajemen User** → atur Role dan centang mitra yang boleh diakses user tersebut.

---

## 6. Logika Bisnis: Jenis Pekerjaan, Koreksi Retensi, dan BAST

**Auto-generate baris dari 1 input pekerjaan** (`src/lib/workGeneration.ts`):
- **Recycling** → otomatis membuat 2 baris: `heavy_patches_recycling` (Luas = Panjang×Lebar sesuai KM) dan `double_coat` (KM Finish otomatis +2 m, jadi Luas-nya lebih besar — merepresentasikan overlap Double Coat).
- **Upgrading** → sama seperti Recycling, tapi kategori heavy patches-nya `heavy_patches_upgrading`.
- **Reseal 2 Coat** dan **Reseal Selected** → 1 baris kategori `double_coat`, tanpa overlap tambahan.
- **Reseal 1 Coat** → 1 baris kategori `reseal_1_coat`.
- **Tambalan** → 1 baris kategori `tambalan`, KM berupa titik tunggal (bukan rentang), dengan field Panjang, Lebar, dan Volume (kg) tersendiri.
- **Temuan Opname** → field opsional (Panjang/Lebar) yang menempel di baris pertama sebagai catatan tambahan, tidak membuat baris/kategori baru.

Konstanta overlap Double Coat (`DOUBLE_COAT_OVERLAP_M = 2`) bisa diubah di `src/lib/workGeneration.ts` kalau nilainya berbeda di lapangan.

**Koreksi Retensi** (`src/lib/retention.ts`) tidak berubah aturannya (lihat bagian 6 versi sebelumnya di bawah), hanya sekarang setiap baris `work_records` punya `lebar` asli sendiri (tidak perlu lagi didekati dari total luas ÷ panjang). Kategori `tambalan` dikecualikan dari koreksi retensi (titik tunggal, bukan rentang jalan).

**Summary BAST** (5 baris, sesuai permintaan terakhir):
- **Double Coat** = baris `double_coat` yang berasal dari Recycling atau Upgrading.
- **Reseal 1 Coat** = baris `reseal_1_coat`.
- **Reseal 2 Coat** = baris `double_coat` yang berasal dari Work Item "Reseal 2 Coat".
- **Reseal Selected** = baris `double_coat` yang berasal dari Work Item "Reseal Selected".
- **Upgrading** = baris `heavy_patches_upgrading` (porsi CAPEX-nya).
- `heavy_patches_recycling` dan `tambalan` **tidak** ikut dibayar lewat BAST (hanya tercatat di Database/Rekap Pekerjaan) — beri tahu saya kalau ternyata ini juga perlu dibayarkan lewat mekanisme lain, supaya saya tambahkan.

Test case wajib dari PRD asli (retensi 600→300 m²) dan 4 skenario baru (Recycling/Upgrading 2-baris, Reseal 2 Coat 1-baris, Tambalan titik tunggal) sudah diverifikasi lulus.

---

## 7. Struktur proyek

```
src/
  app/
    login/page.tsx            # Halaman login
    mitra/page.tsx             # Pilihan mitra (Wasco/KHS)
    dashboard/[mitra]/
      layout.tsx                # Guard akses + sidebar/topbar
      wro/page.tsx               # Work Request Order
      rekap/page.tsx             # Rekap Pekerjaan (per kategori)
      database/page.tsx          # Riwayat 6 bulan (basis retensi)
      bast/page.tsx               # BAST + koreksi retensi + drill-down
      users/page.tsx              # Admin: manajemen user
      settings/page.tsx           # Admin: durasi retensi
  components/                # Sidebar, Topbar, ExportButtons, UI primitives
  lib/
    retention.ts              # Engine koreksi retensi (inti bisnis)
    chainage.ts                # Parsing format KM XX+XXX
    types.ts                    # Tipe data & mapping kategori→work item
supabase/schema.sql           # Skema database + RLS
```

## 8. Keterbatasan versi ini (transparansi)

- Manajemen user baru (membuat akun) dilakukan lewat Supabase Dashboard, bukan dari dalam aplikasi — membuat user Auth baru butuh **service role key** yang tidak aman dipanggil dari browser. Admin hanya mengatur *role* & *akses mitra* dari dalam aplikasi.
- Login memakai email Supabase Auth, bukan username custom.
- Heavy Patches Recycling dan Tambalan tidak dibayar lewat BAST (lihat bagian 6) — kalau ternyata perlu, beri tahu saya skema pembayarannya.
- Export PDF menggunakan layout tabel sederhana (bukan template BAST resmi bermeterai) — bisa dikembangkan lebih lanjut sesuai kop surat perusahaan.
