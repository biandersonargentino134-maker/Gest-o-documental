// ---------- Etapa 3, commit 3: upload e exclusão via Google Drive (Apps Script) ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCWaD-kP_qBbKkvBvnt9oHMPOfv-mDCIm8",
  authDomain: "projeto-academico-docs.firebaseapp.com",
  projectId: "projeto-academico-docs",
  storageBucket: "projeto-academico-docs.firebasestorage.app",
  messagingSenderId: "810363195574",
  appId: "1:810363195574:web:691598d28e0abee306d617"
};

// Cole aqui a URL que o Apps Script te deu quando você implantou o Code.gs
// como "App da Web" (termina em /exec).
const GAS_URL = "https://script.google.com/macros/s/AKfycbzFYVYbzMp1sPTwt26BzPuhA9q9IgJ0EcevyboUsHgUcMQlxU4GlnFAf9BSupSij6bY/exec";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 ** 2);
  if (mb >= 1024) return (mb / 1024).toFixed(2) + " GB";
  return mb.toFixed(1) + " MB";
}

// Converte o arquivo escolhido em texto (base64) — é assim que ele
// consegue viajar dentro de um JSON até o Apps Script.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Navegação entre as abas ----------
document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    const target = item.dataset.view;
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById("view-" + target).classList.add("active");
  });
});

// ---------- Login ----------
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginError.textContent = "E-mail ou senha incorretos.";
  }
});

document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

function populateMonthSelect() {
  const select = document.getElementById("upload-mes");
  MESES.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m; opt.textContent = m;
    select.appendChild(opt);
  });
}

// ---------- Upload: agora manda o arquivo de verdade pro Apps Script ----------
document.getElementById("upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector("button[type=submit]");
  const file = document.getElementById("upload-file").files[0];
  const empresa = document.getElementById("upload-empresa").value.trim();
  const tipoImposto = document.getElementById("upload-tipo").value.trim();
  const mes = document.getElementById("upload-mes").value;
  const ano = document.getElementById("upload-ano").value;

  if (!file || !empresa || !tipoImposto || !mes || !ano) {
    alert("Preencha todos os campos antes de enviar.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando...";
  try {
    const fileData = await fileToBase64(file);

    const response = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "upload",
        empresa,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileData
      })
    });
    const result = await response.json();
    if (result.error) throw new Error(result.error);

    await addDoc(collection(db, "documentos"), {
      nomeArquivo: file.name,
      empresa, tipoImposto, mes, ano: Number(ano),
      tamanho: file.size,
      url: result.url,
      fileId: result.fileId, // <- guardamos o id do Drive, precisamos dele pra excluir depois
      uploadedAt: serverTimestamp(),
    });

    e.target.reset();
  } catch (err) {
    alert("Erro ao enviar: " + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Enviar documento";
  }
});

// ---------- Exclusão: apaga do Drive (via Apps Script) e do Firestore ----------
async function excluirDocumento(docId, fileId, nome) {
  if (!confirm(`Excluir "${nome}"? Essa ação não pode ser desfeita.`)) return;
  try {
    await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({ action: "delete", fileId })
    });
    await deleteDoc(doc(db, "documentos", docId));
  } catch (err) {
    alert("Erro ao excluir: " + err.message);
  }
}

// ---------- Lista de documentos ----------
function listenDocumentos() {
  const q = query(collection(db, "documentos"), orderBy("nomeArquivo"));
  onSnapshot(q, (snap) => {
    const list = document.getElementById("doc-list");
    if (snap.empty) {
      list.innerHTML = "<li>Nenhum documento ainda.</li>";
    } else {
      list.innerHTML = snap.docs.map(d => {
        const doc = d.data();
        return `
          <li>
            <span>${doc.nomeArquivo} — ${doc.empresa} · ${doc.tipoImposto} · ${doc.mes}/${doc.ano}</span>
            <button class="btn-excluir" data-id="${d.id}" data-fileid="${doc.fileId}" data-nome="${doc.nomeArquivo}">Excluir</button>
          </li>`;
      }).join("");

      // Liga o clique de cada botão "Excluir" recém-criado
      list.querySelectorAll(".btn-excluir").forEach(btn => {
        btn.addEventListener("click", () => {
          excluirDocumento(btn.dataset.id, btn.dataset.fileid, btn.dataset.nome);
        });
      });
    }

    const totalBytes = snap.docs.reduce((soma, d) => soma + (d.data().tamanho || 0), 0);
    document.getElementById("stat-space-used").textContent = formatBytes(totalBytes);
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById("login-screen").hidden = true;
    document.getElementById("main-app").hidden = false;
    document.getElementById("user-email").textContent = user.email;
    populateMonthSelect();
    listenDocumentos();
  } else {
    document.getElementById("login-screen").hidden = false;
    document.getElementById("main-app").hidden = true;
  }
});