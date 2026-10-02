# Hauling Guard

Dashboard monitoring pekerjaan perawatan hauling road dalam masa garansi/retensi (WRO, Rekap Pekerjaan, Database, BAST dengan koreksi luasan retensi otomatis).

Stack: **Next.js 14 (App Router) + TypeScript + Tailwind CSS + Supabase (Auth + Postgres)**, siap deploy ke **Netlify**.

---

## 0. PENTING: Migrasi setelah update ini

Kalau project Supabase Anda sudah pernah dijalankan `schema.sql` versi sebelumnya, **jalankan ulang seluruh `schema.sql` sekali lagi** di SQL Editor sebelum deploy kode baru ini. File ini idempotent (aman dijalankan ulang) dan sekarang menambahkan:
- Kolom baru di `work_records`: `lebar`, `panjang_override`, `volume_kg`, `in_database`, `opname_catatan`.
- Nilai baru `'Tambalan'` di tipe `work_item_type`.

Tanpa migrasi ini, form Rekap Pekerjaan/Database yang baru akan gagal menyimpan data.

**Perubahan penting cara pakai:**
- **Periode sekarang tanggal 26 s.d 25** (bukan tanggal 1 s.d akhir bulan kalender). Semua filter "Periode" di WRO/Rekap Pekerjaan/Database/BAST sekarang berupa pemilih tanggal — pilih tanggal apa saja, aplikasi otomatis menampilkan rentang periode (26–25) yang memuat tanggal itu.
- **Rekap Pekerjaan dan Database sekarang benar-benar terpisah.** Data yang diinput di Rekap Pekerjaan hanya muncul di Rekap Pekerjaan. Untuk masuk ke Database (basis koreksi retensi), Admin harus menambahkannya secara manual lewat halaman Database.

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
- **Recycling** → otomatis membuat 2 baris: `heavy_patches_recycling` (Luas = Panjang×Lebar sesuai KM asli) dan `double_coat` (KM Start mundur 1m, KM Finish maju 1m — overlap Double Coat).
- **Upgrading** → sama seperti Recycling, tapi kategori heavy patches-nya `heavy_patches_upgrading`.
- **Reseal 2 Coat** dan **Reseal Selected** → 1 baris kategori `double_coat`, tanpa overlap tambahan.
- **Reseal 1 Coat** → 1 baris kategori `reseal_1_coat`.
- **Tambalan** → 1 baris kategori `tambalan`, KM titik tunggal, dengan Panjang, Lebar, dan Volume (kg) sendiri.
- **Temuan Opname** → catatan teks manual (bukan angka), menempel di baris pertama sebagai informasi tambahan.

**Rekap Pekerjaan vs Database (terpisah, bukan otomatis):**
- Baris dari Rekap Pekerjaan disimpan dengan `in_database = false` — hanya tampil di Rekap Pekerjaan.
- Baris dari Database (input admin) disimpan dengan `in_database = true` — basis koreksi retensi di BAST.
- BAST membandingkan: pekerjaan baru = `in_database=false` pada periode terpilih, vs basis retensi = `in_database=true` beberapa periode ke belakang.

**Koreksi Retensi** (`src/lib/retention.ts`) — sebuah pekerjaan baru dianggap "mengenai area garansi" kalau, dibandingkan satu baris Database, **semua syarat berikut sama**: Keterangan, Area, dan Line, DAN rentang KM-nya beririsan, DAN pekerjaan Database itu masih dalam masa retensi (default 6 bulan) dihitung dari tanggal pekerjaan baru. Kalau semua syarat terpenuhi, `Luas Dikoreksi = panjang overlap × lebar`, dan `Luas Dapat Dibayar = Luas Sebelum − Luas Dikoreksi`. Beririsan dengan beberapa baris Database sekaligus di-union dulu supaya tidak double counting.

**Periode fiskal 26-25** (`src/lib/period.ts`): 1 "bulan" = tanggal 26 s.d tanggal 25 bulan berikutnya. Semua halaman pakai date-picker; pilih tanggal apa saja dan aplikasi otomatis menghitung rentang periodenya.

**Summary BAST** (6 baris):
- **Double Coat** = baris `double_coat` yang berasal dari Recycling atau Upgrading.
- **Reseal 1 Coat** = baris `reseal_1_coat`.
- **Reseal 2 Coat** = baris `double_coat` dari Work Item "Reseal 2 Coat".
- **Reseal Selected** = baris `double_coat` dari Work Item "Reseal Selected".
- **Heavy Patches Upgrading** = baris `heavy_patches_upgrading` (porsi CAPEX).
- **Heavy Patches Recycling** = baris `heavy_patches_recycling`.
- `tambalan` tidak dibayar lewat BAST ini (titik tunggal, bukan volume rentang jalan) — beri tahu saya kalau ternyata perlu ditambahkan.

Semua aturan di atas sudah diverifikasi dengan test otomatis, termasuk mereproduksi persis contoh perhitungan manual Anda (overlap 152m → terkoreksi 912 m² → dapat dibayar 600 m²).

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
    workGeneration.ts          # Auto-generate baris Heavy Patches + Double Coat
    period.ts                   # Periode fiskal 26-25
    chainage.ts                  # Parsing format KM XX+XXX
    types.ts                      # Tipe data, WORK_ITEMS, AREA_OPTIONS, dll
supabase/schema.sql           # Skema database + RLS
```

## 8. Keterbatasan versi ini (transparansi)

- Manajemen user baru (membuat akun) dilakukan lewat Supabase Dashboard, bukan dari dalam aplikasi — membuat user Auth baru butuh **service role key** yang tidak aman dipanggil dari browser. Admin hanya mengatur *role* & *akses mitra* dari dalam aplikasi.
- Login memakai email Supabase Auth, bukan username custom.
- Tambalan tidak dibayar lewat BAST (titik tunggal, bukan volume rentang jalan) — beri tahu saya kalau ternyata perlu ditambahkan skema pembayarannya.
- Export PDF menggunakan layout tabel sederhana (bukan template BAST resmi bermeterai) — bisa dikembangkan lebih lanjut sesuai kop surat perusahaan.
