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

const QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// "Memória" da página: cópia dos documentos que vêm do Firestore
let documentos = [];

// ---------- Funções utilitárias ----------
function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return gb.toFixed(2) + " GB";
  return (bytes / (1024 ** 2)).toFixed(1) + " MB";
}

// Evita que nomes com símbolos (< > etc.) bagunçem o HTML da página
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Navegação entre as páginas ----------
// É um site de página única: as "páginas" são seções que ficam
// escondidas, e essa função mostra só a que foi pedida.
function goToView(target) {
  document.querySelectorAll(".nav-item").forEach(i => i.classList.toggle("active", i.dataset.view === target));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + target).classList.add("active");
}
document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", (e) => { e.preventDefault(); goToView(item.dataset.view); });
});
// Botões e links "de atalho" (ex: "Enviar documento" no Início)
document.querySelectorAll("[data-goto]").forEach(el => {
  el.addEventListener("click", (e) => { e.preventDefault(); goToView(el.dataset.goto); });
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
  select.innerHTML = "";
  MESES.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m; opt.textContent = m;
    select.appendChild(opt);
  });
}

// ---------- Upload ----------
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

  const totalUsado = documentos.reduce((soma, d) => soma + (d.tamanho || 0), 0);
  if (totalUsado + file.size > QUOTA_BYTES) {
    alert("Espaço insuficiente. O limite é de 10 GB.");
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

    const agora = new Date();
    await addDoc(collection(db, "documentos"), {
      nomeArquivo: file.name,
      empresa, tipoImposto, mes, ano: Number(ano),
      tamanho: file.size,
      url: result.url,
      fileId: result.fileId,
      uploadedAtLabel: agora.toLocaleDateString("pt-BR"), // texto da data, pra mostrar na tabela
      uploadedAtMs: agora.getTime(),                       // número, pra ordenar do mais novo pro mais velho
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

// ---------- Exclusão ----------
async function excluirDocumento(docId, fileId, nome) {
  if (!confirm(`Excluir "${nome}"? Essa ação não pode ser desfeita.`)) return;
  try {
    if (fileId) {
      await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "delete", fileId }) });
    }
    await deleteDoc(doc(db, "documentos", docId));
  } catch (err) {
    alert("Erro ao excluir: " + err.message);
  }
}

// ---------- Desenho das tabelas ----------

// Monta o HTML de UMA linha de tabela. Serve para as duas tabelas
// (Início e Documentos) — "completa" mostra período e tamanho a mais.
function docRow(d, { completa = false } = {}) {
  return `
    <tr>
      <td>
        <div class="doc-name-cell">
          <span class="doc-file-icon">📄</span>
          <div>
            <div class="doc-name-main">${escapeHtml(d.nomeArquivo)}</div>
            <div class="doc-name-sub">${escapeHtml(d.mes)}/${d.ano}</div>
          </div>
        </div>
      </td>
      <td>${escapeHtml(d.empresa)}</td>
      <td><span class="pill">${escapeHtml(d.tipoImposto)}</span></td>
      ${completa
        ? `<td>${escapeHtml(d.mes)}/${d.ano}</td><td>${formatBytes(d.tamanho)}</td>`
        : `<td>${escapeHtml(d.uploadedAtLabel || "")}</td>`}
      <td>
        <div class="doc-actions-cell">
          ${d.url ? `<a class="action-link" href="${escapeHtml(d.url)}" target="_blank" rel="noopener">Abrir</a>` : ""}
          <button class="btn-text-danger" data-id="${d.id}" data-fileid="${escapeHtml(d.fileId || "")}" data-nome="${escapeHtml(d.nomeArquivo)}">Excluir</button>
        </div>
      </td>
    </tr>`;
}

// Liga o clique dos botões "Excluir" depois que uma tabela é desenhada
function bindDeleteButtons(container) {
  container.querySelectorAll(".btn-text-danger").forEach(btn => {
    btn.addEventListener("click", () => {
      excluirDocumento(btn.dataset.id, btn.dataset.fileid, btn.dataset.nome);
    });
  });
}

function renderTabelas() {
  // Tabela de documentos recentes (Início): só os 6 mais novos
  const recentBody = document.getElementById("recent-table-body");
  const recentes = documentos.slice(0, 6);
  recentBody.innerHTML = recentes.length
    ? recentes.map(d => docRow(d)).join("")
    : '<tr class="empty-row"><td colspan="5">Nenhum documento enviado ainda.</td></tr>';
  bindDeleteButtons(recentBody);

  // Tabela completa (página Documentos)
  const docBody = document.getElementById("doc-table-body");
  docBody.innerHTML = documentos.length
    ? documentos.map(d => docRow(d, { completa: true })).join("")
    : '<tr class="empty-row"><td colspan="6">Nenhum documento enviado ainda.</td></tr>';
  bindDeleteButtons(docBody);
}

// Página Empresas: ainda não existe um cadastro de empresas, então a lista
// é montada a partir dos documentos (cada empresa que já tem documento).
function renderEmpresas() {
  const grid = document.getElementById("empresas-grid");
  const porEmpresa = {};
  documentos.forEach(d => {
    if (!porEmpresa[d.empresa]) porEmpresa[d.empresa] = { qtd: 0, bytes: 0 };
    porEmpresa[d.empresa].qtd += 1;
    porEmpresa[d.empresa].bytes += d.tamanho || 0;
  });
  const nomes = Object.keys(porEmpresa).sort();

  document.getElementById("stat-total-empresas").textContent = nomes.length;

  if (nomes.length === 0) {
    grid.innerHTML = '<div class="empty-row" style="grid-column:1/-1;padding:34px;">Nenhuma empresa ainda — elas aparecem aqui depois do primeiro documento enviado.</div>';
    return;
  }
  grid.innerHTML = nomes.map(nome => `
    <div class="empresa-card">
      <div class="stat-icon">🏢</div>
      <div class="empresa-name">${escapeHtml(nome)}</div>
      <div class="empresa-meta"><b>${porEmpresa[nome].qtd}</b> documento(s) · <b>${formatBytes(porEmpresa[nome].bytes)}</b></div>
    </div>`).join("");
}

// Cartões de estatística do Início
function renderEstatisticas() {
  const totalBytes = documentos.reduce((soma, d) => soma + (d.tamanho || 0), 0);
  const pct = Math.min(100, (totalBytes / QUOTA_BYTES) * 100);
  document.getElementById("stat-total-docs").textContent = documentos.length;
  document.getElementById("stat-space-used").textContent = formatBytes(totalBytes);
  document.getElementById("mini-progress-bar").style.width = pct + "%";
}

// Escuta os documentos em tempo real e redesenha tudo quando algo muda
function listenDocumentos() {
  onSnapshot(query(collection(db, "documentos")), (snap) => {
    documentos = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.uploadedAtMs || 0) - (a.uploadedAtMs || 0)); // mais novos primeiro
    renderEstatisticas();
    renderTabelas();
    renderEmpresas();
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById("login-screen").hidden = true;
    document.getElementById("main-app").hidden = false;
    document.getElementById("user-email").textContent = user.email;

    // Saudação: "Olá, Nome 👋" usando a parte do e-mail antes do @
    const nome = user.email.split("@")[0];
    document.getElementById("greeting-title").textContent =
      `Olá, ${nome.charAt(0).toUpperCase() + nome.slice(1)} 👋`;

    populateMonthSelect();
    listenDocumentos();
  } else {
    document.getElementById("login-screen").hidden = false;
    document.getElementById("main-app").hidden = true;
  }
});
