# Ruang Hari

Kanban pribadi berbahasa Indonesia, dipasang sebagai PWA di HP dan dibuka sebagai web di laptop. GitHub Pages melayani aplikasi statis; Supabase menyediakan login tautan email, database per akun, dan pembaruan Realtime.

## Jalankan lokal

Node.js 22 atau lebih baru:

```sh
npm ci
npm test
npm run build
npm run dev
```

Buka `http://127.0.0.1:5188`. Build tanpa konfigurasi Supabase menutup akses papan dan menampilkan informasi layanan akun belum tersedia. Untuk mode akun, isi variabel lingkungan `SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY` sebelum build. `.env.example` adalah referensi; build membaca environment, bukan mengunggah file `.env`.

## Supabase

1. Buat project di akun sendiri dan simpan password databasenya secara pribadi.
2. Jalankan `supabase/migrations/202611040001_personal_boards.sql` satu kali di SQL Editor.
3. Di Authentication → URL Configuration, atur Site URL ke alamat GitHub Pages. Tambahkan alamat yang sama (dengan slash akhir) pada Redirect URLs. Untuk pengembangan boleh tambahkan `http://127.0.0.1:5188/`.
4. Email provider harus aktif. Supabase Free memakai template tautan bawaan; aplikasi juga dapat menerima tautan yang ditempel langsung ke PWA. Jika nantinya memakai SMTP sendiri dan template kode `{{ .Token }}`, kode email juga didukung. Email bawaan Supabase hanya melayani alamat anggota project. Sebelum membuka pendaftaran umum, atur custom SMTP dan uji pengiriman ke alamat di luar anggota project. Jangan mematikan konfirmasi email sebagai pengganti konfigurasi pengiriman. Izin pendaftaran akun baru harus aktif.
5. Gunakan URL project dan **publishable key** (atau legacy anon key). Jangan gunakan `service_role`, secret key, password database, atau access token di aplikasi browser maupun repo.

Database mengaktifkan RLS; akun hanya boleh membaca barisnya sendiri. Penyimpanan dilakukan lewat RPC yang mengambil identitas dari `auth.uid()`, memeriksa revisi, memvalidasi dokumen, dan menolak overwrite dengan revisi lama. Klien tidak diberi izin menulis tabel secara langsung.

## GitHub Pages

1. Push ke branch `main`.
2. Settings → Pages → Source: **GitHub Actions**.
3. Settings → Secrets and variables → Actions → Variables: tambahkan `SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY`. Keduanya konfigurasi browser publik, bukan kredensial administrator.
4. Jalankan workflow **Publish Ruang Hari**, atau push commit baru. Workflow menguji, membangun, dan men-deploy `dist/`.

Seluruh path manifest, ikon, worker, dan aset relatif, sehingga berjalan di subpath project Pages maupun domain sendiri.

## Pasang di HP

- Android/Chrome: buka alamat web → menu ⋮ → Instal aplikasi / Tambahkan ke layar utama.
- iPhone/Safari: Bagikan → Tambah ke Layar Utama.
- Masuk memakai email yang sama di HP dan laptop. Buka tautan masuk dari email. Di PWA yang terpasang, salin alamat tombol masuk dari email lalu tempel di form aplikasi agar sesi tetap berada di PWA.

## Data, offline, dan konflik

Pengguna wajib masuk sebelum melihat atau mengubah papan. Halaman Daftar membuat akun email/password (minimal 8 karakter) dan meminta konfirmasi email. Halaman Masuk mendukung password dan tautan email untuk akun lama. Lupa Password mengirim tautan pemulihan; sesi pemulihan hanya menampilkan formulir password baru sampai selesai.

Sesi disimpan dengan nama yang sama seperti versi sebelumnya sehingga akun yang sudah masuk tetap dapat digunakan. Tidak ada data tugas tamu baru yang dibuat. Tugas lokal dari versi lama tetap dipertahankan dan bisa digabungkan sesudah login lewat **Gabungkan tugas lokal ke akun**, atau impor cadangan JSON. Tugas contoh tidak ikut digabungkan.

Setelah akun pernah dimuat, salinan tugas dan antrean perubahan disimpan per akun di perangkat. Saat offline, perubahan menunggu koneksi. Ketika kembali online, aplikasi mencoba mengirimnya. Realtime, refresh saat kembali ke aplikasi, dan refresh berkala memperbarui perangkat lain.

Jika dua perangkat mengubah papan sebelum saling menerima perubahan, aplikasi **menghentikan penyimpanan dan meminta pilihan versi seluruh papan**. Unduh cadangan sebelum memilih bila kedua versi penting. Ini tidak menggabungkan konflik secara otomatis per kartu.

Keluar dari akun menyembunyikan tugas akun dari papan. Cache dan perubahan yang belum terkirim masih tersimpan secara lokal agar dapat dilanjutkan saat masuk ke akun yang sama. Gunakan perangkat pribadi untuk data pribadi dan unduh cadangan berkala.

Untuk pindah dari versi Sites lama, ekspor JSON di versi lama lalu impor di alamat GitHub Pages setelah masuk. Penyimpanan browser terpisah per alamat situs.

## Verifikasi

`npm test` menguji antrean offline, konflik dua perangkat, response yang hilang, edit saat request berjalan, perpindahan akun, kegagalan penyimpanan, dan isolasi data antar akun di PostgreSQL lokal PGlite. Pengujian layanan Supabase asli dan pemasangan perangkat fisik dilakukan terpisah.

## Pengiriman email saat ini

Gmail SMTP dipilih pemilik untuk tahap awal, memakai host `smtp.gmail.com`, port SSL `465`, username dan sender email akun Gmail pemilik, serta sender name `Ruang Hari`. App Password dibuat dan dimasukkan langsung oleh pemilik ke Supabase, tidak disimpan di repo atau build web. Pengiriman tetap mengikuti batas Google dan rate limit Supabase; untuk penggunaan publik yang tumbuh, pindahkan ke penyedia email transaksional dengan domain terverifikasi.
