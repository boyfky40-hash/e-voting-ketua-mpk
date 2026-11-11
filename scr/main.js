import "./style.css";
import {
  signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "firebase/auth";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp
} from "firebase/firestore";
import {
  ref, uploadBytes, getDownloadURL, deleteObject
} from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { auth, db, storage, functions } from "./firebase.js";

const app = document.querySelector("#app");
const emailForNis = (nis) => { const value = String(nis).trim().toLowerCase(); return value.includes("@") ? value : `${value.replace(/[^a-z0-9._-]/g, "")}@pemilih.e-voting.invalid`; };
const castVote = httpsCallable(functions, "castVote");
let currentUser = null;
let isAdmin = false;
let candidatesCache = [];

const escapeHtml = (s = "") => String(s).replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

function notice(message, type = "info") {
  const el = document.querySelector("#notice");
  if (!el) return;
  el.textContent = message;
  el.className = `notice ${type}`;
  el.hidden = false;
  window.setTimeout(() => { if (el) el.hidden = true; }, 5000);
}

function shell(content) {
  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#"><span class="brand-mark">EV</span><span>E-Voting <small>PEMILIHAN MPK</small></span></a>
      <div id="user-area"></div>
    </header>
    <main>${content}</main>
    <div id="notice" class="notice" hidden></div>
    <footer>© ${new Date().getFullYear()} E-Voting MPK · Suara Anda berarti.</footer>`;
}

function renderLogin() {
  shell(`
    <section class="login-layout">
      <div class="intro">
        <div class="eyebrow">PEMILIHAN KETUA MPK</div>
        <h1>Satu suara untuk<br><em>masa depan.</em></h1>
        <p>Selamat datang di sistem pemilihan Ketua MPK. Gunakan NIS dan kata sandi yang diberikan panitia untuk masuk dan memberikan suara.</p>
        <div class="intro-note"><span>●</span> Pemilihan digital · Aman · Mudah</div>
      </div>
      <form id="login-form" class="panel login-card">
        <div class="panel-kicker">AREA PEMILIH</div>
        <h2>Masuk ke akun</h2>
        <p class="muted">Masukkan data akun pemilih Anda.</p>
        <label for="nis">NIS</label>
        <input id="nis" name="nis" autocomplete="username" required placeholder="Contoh: 20261001" />
        <label for="password">Kata sandi</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Masukkan kata sandi" />
        <button class="btn primary full" type="submit">Masuk <span>→</span></button>
        <p class="tiny muted">Kesulitan masuk? Hubungi panitia pemilihan.</p>
      </form>
    </section>`);
  document.querySelector("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nis = document.querySelector("#nis").value.trim();
    const password = document.querySelector("#password").value;
    const btn = e.submitter;
    btn.disabled = true; btn.textContent = "Memeriksa...";
    try {
      await signInWithEmailAndPassword(auth, emailForNis(nis), password);
    } catch (err) {
      notice("NIS atau kata sandi tidak sesuai. Periksa kembali atau hubungi panitia.", "error");
      btn.disabled = false; btn.innerHTML = 'Masuk <span>→</span>';
    }
  });
}

async function getElection() {
  const snap = await getDoc(doc(db, "settings", "election"));
  return snap.exists() ? snap.data() : { title: "Pemilihan Ketua MPK", status: "closed" };
}
async function getCandidates() {
  const snap = await getDocs(query(collection(db, "candidates"), orderBy("createdAt", "asc")));
  candidatesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return candidatesCache;
}

function headerUser() {
  const area = document.querySelector("#user-area");
  if (!area) return;
  area.innerHTML = `<span class="user-label">${isAdmin ? "ADMINISTRATOR" : "PEMILIH"}</span>
    <button id="logout" class="btn subtle small">Keluar</button>`;
  document.querySelector("#logout").onclick = () => signOut(auth);
}

async function renderVoter() {
  const [election, candidates] = await Promise.all([getElection(), getCandidates()]);
  const statusSnap = await getDoc(doc(db, "voterStatus", currentUser.uid));
  const hasVoted = statusSnap.exists() && statusSnap.data().hasVoted === true;
  const isOpen = election.status === "open";
  shell(`
    <section class="page-head">
      <div class="eyebrow">RUANG PEMILIH</div>
      <h1>${escapeHtml(election.title || "Pemilihan Ketua MPK")}</h1>
      <p class="muted">Pilih satu calon yang menurut Anda paling tepat memimpin organisasi.</p>
      <div class="status-line"><span class="status-dot ${isOpen ? "green" : "gray"}"></span>${isOpen ? "Pemungutan suara dibuka" : "Pemungutan suara ditutup"}</div>
    </section>
    ${hasVoted ? `<section class="panel success-panel"><div class="success-icon">✓</div><div><h2>Suara berhasil direkam</h2><p>Terima kasih telah berpartisipasi. Akun ini sudah menggunakan hak pilihnya.</p></div></section>` :
      !isOpen ? `<section class="panel"><h2>Voting belum dibuka</h2><p class="muted">Silakan kembali saat panitia telah membuka pemungutan suara.</p></section>` :
      `<div class="candidate-grid">${candidates.map((c, i) => `
        <article class="candidate-card">
          <div class="candidate-photo">${c.photoURL ? `<img src="${escapeHtml(c.photoURL)}" alt="Foto ${escapeHtml(c.name)}">` : `<div class="photo-placeholder">FOTO<br>CALON</div>`}</div>
          <div class="candidate-info"><span class="candidate-number">CALON ${String(i+1).padStart(2,"0")}</span>
            <h2>${escapeHtml(c.name)}</h2><p>${escapeHtml(c.className || "")}</p>
            <div class="vision">${escapeHtml(c.vision || "Belum ada deskripsi visi dan misi.")}</div>
            <button class="btn primary full vote-btn" data-id="${c.id}" ${candidates.length ? "" : "disabled"}>Pilih calon ini</button>
          </div>
        </article>`).join("")}</div>`}
    <p class="privacy-note">Hasil perolehan suara hanya dapat dilihat oleh administrator setelah masuk ke dashboard admin.</p>`);
  headerUser();
  document.querySelectorAll(".vote-btn").forEach(btn => btn.addEventListener("click", async () => {
    const candidate = candidates.find(c => c.id === btn.dataset.id);
    if (!candidate || !confirm(`Anda akan memilih ${candidate.name}. Suara tidak dapat diubah setelah dikirim. Lanjutkan?`)) return;
    btn.disabled = true; btn.textContent = "Mengirim suara...";
    try {
      await castVote({ candidateId: candidate.id });
      notice("Suara berhasil direkam. Terima kasih!", "success");
      await renderVoter();
    } catch (err) {
      console.error(err);
      notice(err.message || "Suara gagal dikirim. Silakan coba lagi.", "error");
      btn.disabled = false; btn.textContent = "Pilih calon ini";
    }
  }));
}

async function renderAdmin() {
  const [election, candidates, ballotSnap] = await Promise.all([
    getElection(), getCandidates(), getDocs(collection(db, "ballots"))
  ]);
  const total = ballotSnap.size;
  const counts = {};
  ballotSnap.forEach(d => { const id = d.data().candidateId; counts[id] = (counts[id] || 0) + 1; });
  shell(`
    <section class="page-head admin-head">
      <div><div class="eyebrow">PANEL ADMINISTRATOR</div><h1>Dashboard pemilihan</h1><p class="muted">Kelola kandidat, status pemilihan, dan pantau hasil suara.</p></div>
      <div class="admin-stats"><div class="stat"><strong>${total}</strong><span>Total suara masuk</span></div><div class="stat"><strong>${candidates.length}</strong><span>Jumlah calon</span></div></div>
    </section>
    <section class="panel election-control">
      <div><span class="panel-kicker">STATUS PEMILIHAN</span><h2>${escapeHtml(election.title || "Pemilihan Ketua MPK")}</h2><p class="muted">Status saat ini: <b>${election.status === "open" ? "DIBUKA" : "DITUTUP"}</b></p></div>
      <button id="toggle-election" class="btn ${election.status === "open" ? "danger" : "primary"}">${election.status === "open" ? "Tutup voting" : "Buka voting"}</button>
    </section>
    <section class="admin-columns">
      <div class="panel">
        <div class="section-title"><div><span class="panel-kicker">DATA KANDIDAT</span><h2>Kelola calon</h2></div></div>
        <form id="candidate-form" class="candidate-form">
          <input name="name" required placeholder="Nama lengkap calon">
          <input name="className" placeholder="Kelas / tingkat">
          <textarea name="vision" rows="3" placeholder="Visi, misi, atau deskripsi singkat"></textarea>
          <label class="upload-label">Foto calon (JPG / PNG)<input name="photo" type="file" accept="image/png,image/jpeg,image/webp"></label>
          <button class="btn primary" type="submit">Tambah calon</button>
        </form>
        <div id="candidate-list" class="candidate-list">${candidates.map(c => `
          <div class="candidate-row"><div class="mini-photo">${c.photoURL ? `<img src="${escapeHtml(c.photoURL)}" alt="">` : "—"}</div>
            <div class="candidate-row-info"><b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.className || "")}</small></div>
            <button class="btn text danger-text delete-candidate" data-id="${c.id}" title="Hapus calon">Hapus</button></div>`).join("") || '<p class="muted tiny">Belum ada kandidat.</p>'}</div>
      </div>
      <div class="panel results-panel">
        <div class="section-title"><div><span class="panel-kicker">HASIL PEMILIHAN</span><h2>Perolehan suara</h2></div><span class="result-lock">ADMIN</span></div>
        ${candidates.map(c => {
          const count = counts[c.id] || 0;
          const pct = total ? Math.round(count / total * 100) : 0;
          return `<div class="result-item"><div class="result-label"><b>${escapeHtml(c.name)}</b><span>${count} suara · ${pct}%</span></div><div class="bar"><span style="width:${pct}%"></span></div></div>`;
        }).join("") || '<p class="muted tiny">Tambahkan kandidat untuk melihat hasil.</p>'}
        <div class="total-row"><span>Total suara</span><strong>${total}</strong></div>
        <p class="tiny muted">Data hasil hanya ditampilkan pada akun admin. Hindari membagikan tangkapan layar hasil sebelum pengumuman resmi.</p>
      </div>
    </section>`);
  headerUser();

  document.querySelector("#toggle-election").onclick = async () => {
    const next = election.status === "open" ? "closed" : "open";
    if (!confirm(`${next === "open" ? "Buka" : "Tutup"} pemungutan suara?`)) return;
    try {
      await updateDoc(doc(db, "settings", "election"), { status: next, updatedAt: serverTimestamp() });
      await renderAdmin();
    } catch (e) { notice("Tidak dapat mengubah status pemilihan: " + e.message, "error"); }
  };

  document.querySelector("#candidate-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name")).trim();
    const photo = data.get("photo");
    if (photo?.size > 5 * 1024 * 1024) return notice("Ukuran foto maksimal 5 MB.", "error");
    try {
      let photoURL = "";
      const candidateRef = doc(collection(db, "candidates"));
      if (photo && photo.size) {
        const path = `candidate-photos/${candidateRef.id}/${Date.now()}-${photo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, photo);
        photoURL = await getDownloadURL(fileRef);
      }
      await import("firebase/firestore").then(({ setDoc }) => setDoc(candidateRef, {
        name, className: String(data.get("className") || "").trim(),
        vision: String(data.get("vision") || "").trim(), photoURL,
        photoPath: photo && photo.size ? `candidate-photos/${candidateRef.id}` : "",
        createdAt: serverTimestamp()
      }));
      notice("Kandidat berhasil ditambahkan.", "success");
      await renderAdmin();
    } catch (err) { notice("Gagal menambahkan kandidat: " + err.message, "error"); }
  };

  document.querySelectorAll(".delete-candidate").forEach(btn => btn.onclick = async () => {
    if (!confirm("Hapus kandidat ini? Jangan hapus kandidat setelah voting dimulai.")) return;
    const candidate = candidates.find(c => c.id === btn.dataset.id);
    try {
      await deleteDoc(doc(db, "candidates", candidate.id));
      notice("Kandidat dihapus.", "success");
      await renderAdmin();
    } catch (err) { notice("Gagal menghapus: " + err.message, "error"); }
  });
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) { isAdmin = false; renderLogin(); return; }
  try {
    await user.getIdToken(true);
    isAdmin = user.getIdTokenResult ? (await user.getIdTokenResult()).claims.admin === true : false;
    if (isAdmin) await renderAdmin(); else await renderVoter();
  } catch (err) {
    console.error(err);
    notice("Tidak dapat memuat akun. Hubungi administrator.", "error");
  }
});
    notice("Tidak dapat memuat akun. Hubungi administrator.", "error");
  }
});
