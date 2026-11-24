// ---------- Etapa 3, commit 3: upload e exclusão via Google Drive (Apps Script) ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, deleteDoc, onSnapshot, query, serverTimestamp
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
const MAX_FILE_BYTES = 20 * 1024 * 1024;     // 20 MB por arquivo (limite prático do Apps Script)
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

// Preenche um <select> com os 12 meses (recebe o id do select)
function populateMonthSelect(selectId) {
  const select = document.getElementById(selectId);
  select.innerHTML = "";
  MESES.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m; opt.textContent = m;
    select.appendChild(opt);
  });
}

// ---------- Envio de documento (lógica compartilhada) ----------
// Toda a parte "pesada" do envio fica aqui, separada da tela.
async function enviarDocumento({ file, empresa, tipoImposto, mes, ano }, onProgress = () => {}) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Arquivo maior que 20 MB. Escolha um arquivo menor.");
  }
  const totalUsado = documentos.reduce((soma, d) => soma + (d.tamanho || 0), 0);
  if (totalUsado + file.size > QUOTA_BYTES) {
    throw new Error("Espaço insuficiente. O limite é de 10 GB.");
  }

  onProgress(40);
  const fileData = await fileToBase64(file);
  onProgress(70);
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
  onProgress(100);

  const agora = new Date();
  await addDoc(collection(db, "documentos"), {
    nomeArquivo: file.name,
    empresa, tipoImposto, mes, ano: Number(ano),
    tamanho: file.size,
    url: result.url,
    fileId: result.fileId,
    uploadedAtLabel: agora.toLocaleDateString("pt-BR"),
    uploadedAtMs: agora.getTime(),
    uploadedAt: serverTimestamp(),
  });
}

// ---------- Página de Upload ----------
let selectedFile = null; // arquivo escolhido, esperando o clique em "Salvar"

const dropzone = document.getElementById("dropzone");
const upFileInput = document.getElementById("up-file");
const upSubmit = document.getElementById("up-submit");

// Clicar na área (ou no botão) abre o seletor de arquivos
document.getElementById("select-file-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  upFileInput.click();
});
dropzone.addEventListener("click", () => upFileInput.click());
upFileInput.addEventListener("change", () => {
  if (upFileInput.files[0]) setSelectedFile(upFileInput.files[0]);
});

// Arrastar e soltar: destaca a área enquanto o arquivo está por cima
["dragenter", "dragover"].forEach(evt => {
  dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
});
["dragleave", "drop"].forEach(evt => {
  dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("drag-over"); });
});
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) setSelectedFile(file);
});

// Guarda o arquivo escolhido, mostra o nome na área e libera o botão
function setSelectedFile(file) {
  selectedFile = file;
  document.getElementById("dropzone-title").textContent = "Arquivo selecionado:";
  let nome = dropzone.querySelector(".dropzone-filename");
  if (!nome) {
    nome = document.createElement("div");
    nome.className = "dropzone-filename";
    dropzone.appendChild(nome);
  }
  nome.textContent = file.name;
  updateSaveState();
}

// O botão "Salvar documento" só fica liberado depois de escolher um arquivo
function updateSaveState() {
  upSubmit.disabled = !selectedFile;
  document.getElementById("up-hint").textContent =
    selectedFile ? "" : "Selecione um arquivo para habilitar o salvamento.";
}

// Desenha as 3 tags automáticas (categoria, mês e ano), que acompanham
// o que foi escolhido nos campos ao lado
function renderUploadTags() {
  const wrap = document.getElementById("up-tags-row");
  const baseTags = [
    document.getElementById("up-tipo").value.trim(),
    document.getElementById("up-mes").value,
    document.getElementById("up-ano").value
  ].filter(Boolean);

  wrap.innerHTML = baseTags.map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("");
}
["up-tipo", "up-mes", "up-ano"].forEach(id => {
  document.getElementById(id).addEventListener("input", renderUploadTags);
  document.getElementById(id).addEventListener("change", renderUploadTags);
});

// Limpa o arquivo escolhido depois de um envio
function resetUploadPage() {
  selectedFile = null;
  upFileInput.value = "";
  document.getElementById("dropzone-title").textContent = "Arraste seu arquivo aqui";
  const nome = dropzone.querySelector(".dropzone-filename");
  if (nome) nome.remove();
  document.getElementById("up-progress-wrap").style.display = "none";
  document.getElementById("up-progress-bar").style.width = "0%";
  renderUploadTags();
  updateSaveState();
}

// Valores iniciais: ano atual e mês atual já preenchidos
function iniciarPaginaUpload() {
  const hoje = new Date();
  document.getElementById("up-ano").value = hoje.getFullYear();
  document.getElementById("up-mes").value = MESES[hoje.getMonth()];
  renderUploadTags();
  updateSaveState();
}

// Clique em "Salvar documento"
upSubmit.addEventListener("click", async () => {
  const empresa = document.getElementById("up-empresa").value.trim();
  const tipoImposto = document.getElementById("up-tipo").value.trim();
  const mes = document.getElementById("up-mes").value;
  const ano = document.getElementById("up-ano").value;

  // As 4 tags são obrigatórias
  if (!selectedFile || !empresa || !tipoImposto || !mes || !ano) {
    alert("Preencha empresa, ano, mês e categoria antes de salvar.");
    return;
  }

  upSubmit.disabled = true;
  upSubmit.textContent = "Enviando...";
  document.getElementById("up-progress-wrap").style.display = "block";
  try {
    await enviarDocumento(
      { file: selectedFile, empresa, tipoImposto, mes, ano },
      (pct) => { document.getElementById("up-progress-bar").style.width = pct + "%"; }
    );
    resetUploadPage();
  } catch (err) {
    alert("Erro ao enviar: " + err.message);
  } finally {
    upSubmit.textContent = "Salvar documento";
    updateSaveState();
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

  // Tabela "enviados recentemente" da página Upload: só os 5 mais novos
  const upBody = document.getElementById("upload-recent-body");
  const ultimos = documentos.slice(0, 5);
  upBody.innerHTML = ultimos.length
    ? ultimos.map(d => docRow(d)).join("")
    : '<tr class="empty-row"><td colspan="5">Nenhum documento enviado ainda.</td></tr>';
  bindDeleteButtons(upBody);

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

    populateMonthSelect("up-mes");
    iniciarPaginaUpload();
    listenDocumentos();
  } else {
    document.getElementById("login-screen").hidden = false;
    document.getElementById("main-app").hidden = true;
  }
});