# E-Voting MPK — Firebase + Netlify

Aplikasi pemilihan Ketua MPK dengan login NIS/NIM + password, upload foto calon, satu akun satu suara, dan hasil hanya untuk admin.

## Isi proyek
- `src/`: aplikasi web Vite + Firebase Authentication, Firestore, Storage, Cloud Functions.
- `functions/`: Cloud Function `castVote` untuk mencatat surat suara secara atomik.
- `firestore.rules` dan `storage.rules`: aturan keamanan.
- `scripts/`: provisioning akun pemilih dan admin melalui Firebase Admin SDK.
- `netlify.toml`: konfigurasi build Netlify.

## Prasyarat
- Node.js 20 atau lebih baru.
- Akun Google/Firebase.
- Firebase project dengan paket **Blaze** untuk deploy Cloud Functions (billing aktif; penggunaan kecil biasanya tetap dalam kuota gratis, tetapi biaya dapat berlaku).
- Netlify dan GitHub (untuk deployment yang mudah).
- Firebase CLI: `npm install -g firebase-tools`.

## 1. Buat dan siapkan Firebase
1. Buat project di https://console.firebase.google.com/.
2. Tambahkan aplikasi Web (ikon `</>`) dan salin konfigurasi Firebase.
3. Authentication → Sign-in method → aktifkan **Email/Password**.
4. Firestore Database → Create database.
5. Storage → Get started.
6. Untuk Cloud Functions, ubah project ke paket Blaze dan siapkan billing account.
7. Di pengaturan project, daftarkan domain Netlify pada Authentication → Settings → Authorized domains setelah deploy.

## 2. Isi konfigurasi lokal
Salin `.env.example` menjadi `.env`, lalu isi nilai dari Firebase Web App:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Web app menggunakan format login internal `NIS@pemilih.e-voting.invalid`. Pemilih tetap memasukkan NIS saja di halaman login. Domain `.invalid` adalah alamat internal untuk identitas Firebase Auth, bukan alamat email untuk menerima email.

## 3. Pasang dependency dan login Firebase CLI
```bash
npm install
cd functions && npm install && cd ..
firebase login
firebase use --add
```
Pilih project Firebase yang sudah dibuat. Pastikan project alias yang dipilih benar.

## 4. Buat akun administrator
1. Firebase Console → Authentication → Add user.
2. Masukkan email admin dan password yang kuat.
3. Unduh service account key dari Project settings → Service accounts → Generate new private key.
4. Simpan file sebagai `serviceAccountKey.json` di root proyek. Jangan pernah commit atau mengirim file ini ke Netlify.
5. Jalankan:
```bash
npm run set:admin -- admin@sekolah.sch.id
```
Logout dan login lagi agar custom claim admin terbaca.

## 5. Siapkan akun pemilih
1. Salin `voters.example.json` menjadi `voters.json`.
2. Ganti contoh dengan NIS, nama, dan password masing-masing pemilih. Gunakan password unik minimal 8 karakter.
3. Jalankan:
```bash
npm run provision:voters -- voters.json
```
4. Bagikan NIS dan password secara pribadi kepada masing-masing pemilih. Simpan file daftar kredensial secara aman lalu hapus dari komputer setelah distribusi sesuai kebijakan sekolah.

Akun yang sudah dibuat tidak dibuat ulang oleh skrip; jika terjadi duplikasi, skrip menampilkan pesan error. Untuk reset password, gunakan Firebase Console → Authentication.

## 6. Deploy aturan dan Cloud Function
Dari root proyek:
```bash
firebase deploy --only firestore:rules,storage,functions
```
Pastikan Cloud Function `castVote` berhasil ter-deploy di region `asia-southeast2`.

## 7. Tambahkan kandidat
1. Jalankan aplikasi lokal dengan `npm run dev`.
2. Login menggunakan akun admin.
3. Tambahkan nama, kelas, visi/misi, dan foto kandidat dari dashboard.
4. Foto diunggah ke Firebase Storage; ukuran maksimum 5 MB, format JPG/PNG/WEBP.
5. Pastikan semua kandidat sudah benar sebelum membuka voting.

## 8. Jalankan lokal
```bash
npm run dev
```
Buka URL lokal yang ditampilkan Vite. Uji login admin dan pemilih menggunakan akun uji, pastikan satu akun hanya dapat memilih sekali, dan akun pemilih tidak dapat membaca hasil.

## 9. Deploy ke Netlify
1. Push folder proyek ke repository GitHub (pastikan `.env`, `voters.json`, dan `serviceAccountKey.json` tidak ikut).
2. Netlify → Add new site → Import an existing project → pilih repository.
3. Build command: `npm run build`; Publish directory: `dist`.
4. Site configuration → Environment variables: masukkan keenam variabel `VITE_FIREBASE_*` dari `.env`.
5. Deploy site.
6. Tambahkan domain Netlify (mis. `nama-situs.netlify.app`) ke Firebase Authentication → Authorized domains.
7. Redeploy bila variabel environment diubah.

## Alur kerja admin
- Login menggunakan email admin yang dibuat di Firebase Console.
- Tambahkan kandidat dan foto.
- Buka voting ketika siap.
- Tutup voting ketika periode selesai.
- Hasil hanya bisa dibaca oleh akun dengan custom claim `admin: true`.

## Catatan keamanan penting
- Cloud Function membuat dokumen status hak pilih dan surat suara dalam satu transaksi. Dokumen surat suara tidak menyimpan UID pemilih; status hak pilih disimpan di koleksi terpisah.
- Firestore Rules menolak penulisan langsung ke `ballots` dan `voterStatus`; hanya Admin SDK di Cloud Function yang dapat menulis.
- Hasil suara dilindungi oleh Firestore Rules dan hanya dapat dibaca admin. Jangan pernah menaruh service account key di frontend, GitHub, atau Netlify.
- Foto kandidat boleh dibaca pengguna yang sudah login; hanya admin yang dapat mengunggah.
- Batasi akses service account, aktifkan MFA untuk admin, gunakan password sementara yang diganti saat pertama kali login, dan siapkan prosedur verifikasi daftar pemilih.
- Firebase Admin SDK dalam skrip provisioning memiliki hak istimewa tinggi. Jalankan hanya di komputer tepercaya dan hapus key dari mesin setelah selesai.
- Untuk pemilihan yang menentukan keputusan penting, lakukan uji penetrasi/audit independen dan siapkan proses audit serta pemungutan suara alternatif. Sistem ini adalah starter project, bukan sertifikasi sistem pemilu.
