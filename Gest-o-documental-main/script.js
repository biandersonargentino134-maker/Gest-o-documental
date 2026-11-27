// ---------- Etapa 8, commit 3: painel de administração ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  EmailAuthProvider, reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, deleteDoc, updateDoc, onSnapshot, query, where, serverTimestamp, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCWaD-kP_qBbKkvBvnt9oHMPOfv-mDCIm8",
  authDomain: "projeto-academico-docs.firebaseapp.com",
  projectId: "projeto-academico-docs",
  storageBucket: "projeto-academico-docs.firebasestorage.app",
  messagingSenderId: "810363195574",
  appId: "1:810363195574:web:691598d28e0abee306d617"
};

const GAS_URL = "https://script.google.com/macros/s/AKfycbzFYVYbzMp1sPTwt26BzPuhA9q9IgJ0EcevyboUsHgUcMQlxU4GlnFAf9BSupSij6bY/exec";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
const MAX_FILE_BYTES = 20 * 1024 * 1024;     // 20 MB por arquivo (limite prático do Apps Script)
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// "Memória" da página: cópia dos documentos que vêm do Firestore
let documentos = [];
let empresas = [];   // empresas cadastradas (coleção "empresas" do Firestore)
let currentViewedDocId = null; // documento aberto no visualizador agora
let userProfile = null;     // { email, isAdmin, empresas: [] } — permissões de quem está logado
let dataInitialized = false;
let unsubProfile = null, unsubEmpresas = null, unsubDocumentos = null, unsubUsuarios = null; // pra "desligar" os escutadores
let usuariosList = []; // todos os usuários que já entraram no site (só o admin enxerga)
let currentUser = null; // usuário logado (precisamos do e-mail dele pra conferir a senha)

// ---------- Funções utilitárias ----------
function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return gb.toFixed(2) + " GB";
  return (bytes / (1024 ** 2)).toFixed(1) + " MB";
}

// Espaço que um documento ocupa no Drive: o arquivo + o comprovante (se tiver)
function tamanhoTotal(d) {
  return (d.tamanho || 0) + (d.comprovante?.tamanho || 0);
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
  if (target === "admin") renderAdminUsersTable();
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
  const totalUsado = documentos.reduce((soma, d) => soma + tamanhoTotal(d), 0);
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

// ---------- Exclusão com confirmação de senha ----------
// Antes era só um "tem certeza?" (confirm). Agora a pessoa precisa digitar
// a senha da conta de novo — evita exclusão por engano ou por alguém que
// pegou o computador destravado.
let pendingDelete = null; // guarda o que está prestes a ser excluído
const deleteOverlay = document.getElementById("delete-modal-overlay");

// type: "documento" ou "comprovante" — a mesma janela de senha serve pros dois
function openDeleteModal({ type = "documento", docId, fileId, nome, comprovanteFileId = null }) {
  pendingDelete = { type, docId, fileId, nome, comprovanteFileId };
  document.getElementById("delete-modal-filename").textContent = nome;
  document.getElementById("delete-password").value = "";
  document.getElementById("delete-modal-error").textContent = "";
  document.getElementById("confirm-delete-btn").textContent =
    type === "comprovante" ? "Excluir comprovante" : "Excluir documento";
  deleteOverlay.hidden = false;
  document.getElementById("delete-password").focus();
}
function closeDeleteModal() {
  deleteOverlay.hidden = true;
  pendingDelete = null;
}
document.getElementById("cancel-delete-btn").addEventListener("click", closeDeleteModal);
deleteOverlay.addEventListener("click", (e) => { if (e.target === deleteOverlay) closeDeleteModal(); });

document.getElementById("delete-confirm-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!pendingDelete) return;
  const alvo = pendingDelete; // cópia local: pendingDelete é zerado quando a janela fecha
  const ehComprovante = alvo.type === "comprovante";
  const senha = document.getElementById("delete-password").value;
  const erro = document.getElementById("delete-modal-error");
  const btn = document.getElementById("confirm-delete-btn");
  erro.textContent = "";
  btn.disabled = true;
  btn.textContent = "Excluindo...";
  try {
    // 1) Confere a senha de verdade no Firebase (reautenticação)
    const credencial = EmailAuthProvider.credential(currentUser.email, senha);
    await reauthenticateWithCredential(currentUser, credencial);

    // 2) Senha certa: apaga
    if (ehComprovante) {
      // só o comprovante: some o arquivo do Drive e o campo do documento
      await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "delete", fileId: alvo.fileId }) });
      await updateDoc(doc(db, "documentos", alvo.docId), { comprovante: null });
    } else {
      if (alvo.fileId) {
        await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "delete", fileId: alvo.fileId }) });
      }
      // Se o documento tinha comprovante, apaga ele do Drive também (senão sobraria arquivo órfão)
      if (alvo.comprovanteFileId) {
        try {
          await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "delete", fileId: alvo.comprovanteFileId }) });
        } catch (_) { /* se falhar, não trava a exclusão do documento */ }
      }
      await deleteDoc(doc(db, "documentos", alvo.docId));
    }

    // Se estava vendo o documento que acabou de ser excluído, volta pra lista
    const noVisualizador = !ehComprovante && document.getElementById("view-visualizador").classList.contains("active");
    closeDeleteModal();
    if (noVisualizador) goToView(lastListView);
  } catch (err) {
    erro.textContent = (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential")
      ? "Senha incorreta."
      : "Erro ao excluir: " + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = ehComprovante ? "Excluir comprovante" : "Excluir documento";
  }
});

// ---------- Visualizador de documento (abre o arquivo sem sair do site) ----------
let lastListView = "documentos"; // de qual página o usuário veio (pro botão "Voltar")

// Descobre qual página está visível agora
function getCurrentActiveView() {
  const ativa = document.querySelector(".view.active");
  return ativa ? ativa.id.replace("view-", "") : "inicio";
}

// Mostra o documento dentro do site, usando o modo de pré-visualização do Drive
function openViewer(docId) {
  const d = documentos.find(x => x.id === docId);
  if (!d) return;
  if (!d.fileId) { alert("Esse documento não tem arquivo no Drive para visualizar."); return; }
  lastListView = getCurrentActiveView();
  currentViewedDocId = docId;

  document.getElementById("viewer-filename").textContent = d.nomeArquivo;
  document.getElementById("viewer-meta").innerHTML =
    `<span class="pill">${escapeHtml(d.tipoImposto)}</span> ${escapeHtml(d.empresa)} · ${escapeHtml(d.mes)}/${d.ano} · ${formatBytes(d.tamanho)}`;
  document.getElementById("viewer-iframe").src = `https://drive.google.com/file/d/${d.fileId}/preview`;

  // Baixa o arquivo direto, sem passar pela tela do Drive
  document.getElementById("viewer-download-btn").onclick = () => {
    window.open(`https://drive.google.com/uc?export=download&id=${d.fileId}`, "_blank");
  };

  // Excluir direto da página do documento (também pede a senha)
  document.getElementById("viewer-delete-btn").onclick = () => openDeleteModal({
    type: "documento", docId: d.id, fileId: d.fileId, nome: d.nomeArquivo,
    comprovanteFileId: d.comprovante?.fileId || null
  });

  // Botão que leva pra página do comprovante
  setComprovanteButtonLabel(d);
  document.getElementById("viewer-comprovante-btn").onclick = () => {
    renderComprovantePage(d);
    goToView("comprovante");
  };

  goToView("visualizador");
}

document.getElementById("viewer-back-btn").addEventListener("click", () => {
  document.getElementById("viewer-iframe").src = ""; // para de carregar o arquivo
  goToView(lastListView);
});

// ---------- Comprovante de pagamento (página própria) ----------
// O comprovante fica guardado como um "campo extra" (comprovante) dentro do
// próprio documento no Firestore, e o arquivo dele vai pra mesma pasta da
// empresa no Drive. Se não tem comprovante, o campo fica vazio (null).

// Troca o texto do botão na página do documento: "Ver" se já existe, "Adicionar" se não
function setComprovanteButtonLabel(d) {
  document.getElementById("viewer-comprovante-btn").textContent =
    d.comprovante ? "📎 Ver comprovante de pagamento" : "📎 Adicionar comprovante de pagamento";
}

// Desenha a página: com comprovante mostra o arquivo (Baixar/Excluir);
// sem comprovante mostra o estado vazio com o botão de adicionar.
function renderComprovantePage(d) {
  const c = d.comprovante;
  document.getElementById("comprovante-subtitle").textContent =
    `Referente a: ${d.nomeArquivo} · ${d.empresa} · ${d.mes}/${d.ano}`;
  document.getElementById("comprovante-actions").hidden = !c;
  document.getElementById("comprovante-frame-wrap").hidden = !c;
  document.getElementById("comprovante-empty").hidden = !!c;

  if (c) {
    document.getElementById("comprovante-iframe").src = `https://drive.google.com/file/d/${c.fileId}/preview`;
    document.getElementById("comprovante-download-btn").onclick = () => {
      window.open(`https://drive.google.com/uc?export=download&id=${c.fileId}`, "_blank");
    };
    document.getElementById("comprovante-delete-btn").onclick = () =>
      openDeleteModal({ type: "comprovante", docId: d.id, fileId: c.fileId, nome: c.nomeArquivo });
  } else {
    document.getElementById("comprovante-iframe").src = "";
  }
}

document.getElementById("comprovante-back-btn").addEventListener("click", () => {
  document.getElementById("comprovante-iframe").src = "";
  goToView("visualizador");
});

document.getElementById("comprovante-add-btn").addEventListener("click", () => {
  document.getElementById("comprovante-file-input").click();
});

// Quando um arquivo de comprovante é escolhido: sobe pro Drive e guarda no documento
document.getElementById("comprovante-file-input").addEventListener("change", async () => {
  const input = document.getElementById("comprovante-file-input");
  const file = input.files[0];
  const d = documentos.find(x => x.id === currentViewedDocId);
  if (!file || !d) return;

  if (file.size > MAX_FILE_BYTES) {
    alert("Arquivo maior que 20 MB. Escolha um arquivo menor.");
    input.value = "";
    return;
  }
  const totalUsado = documentos.reduce((soma, x) => soma + tamanhoTotal(x), 0);
  if (totalUsado + file.size > QUOTA_BYTES) {
    alert("Espaço insuficiente. O limite é de 10 GB.");
    input.value = "";
    return;
  }

  const btn = document.getElementById("comprovante-add-btn");
  btn.disabled = true;
  btn.textContent = "Enviando...";
  try {
    const fileData = await fileToBase64(file);
    const response = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "upload",
        empresa: d.empresa,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileData
      })
    });
    const result = await response.json();
    if (result.error) throw new Error(result.error);

    await updateDoc(doc(db, "documentos", d.id), {
      comprovante: {
        fileId: result.fileId,
        url: result.url,
        nomeArquivo: file.name,
        tamanho: file.size,
        uploadedAtLabel: new Date().toLocaleDateString("pt-BR")
      }
    });
  } catch (err) {
    alert("Erro ao enviar comprovante: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "+ Adicionar comprovante";
    input.value = "";
  }
});

// ---------- Cadastro de empresas ----------
// Antes, o nome da empresa era digitado a mão em cada upload e a página
// Empresas só mostrava as que já tinham documento. Agora existe um cadastro
// de verdade, numa coleção "empresas" do Firestore.

// Escuta as empresas cadastradas em tempo real
function listenEmpresas() {
  if (unsubEmpresas) unsubEmpresas();
  unsubEmpresas = onSnapshot(query(collection(db, "empresas")), (snap) => {
    empresas = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    refreshEmpresaSelect();
    renderEmpresas();
    if (document.getElementById("view-admin").classList.contains("active")) renderAdminUsersTable();
  });
}

// Preenche o select de empresa da página de Upload
function refreshEmpresaSelect() {
  const select = document.getElementById("up-empresa");
  const valorAtual = select.value;
  const lista = getVisibleEmpresas();
  select.innerHTML = "";
  if (lista.length === 0) {
    const opt = document.createElement("option");
    opt.value = ""; opt.textContent = "Nenhuma empresa cadastrada"; opt.disabled = true; opt.selected = true;
    select.appendChild(opt);
    return;
  }
  lista.forEach(e => {
    const opt = document.createElement("option");
    opt.value = e.nome; opt.textContent = e.nome;
    select.appendChild(opt);
  });
  if (lista.some(e => e.nome === valorAtual)) select.value = valorAtual;
}

// Botão "+ Nova empresa"
document.getElementById("add-empresa-btn").addEventListener("click", async () => {
  const nome = window.prompt("Nome da nova empresa:");
  if (!nome || !nome.trim()) return;
  const nomeLimpo = nome.trim();
  if (empresas.some(e => e.nome.toLowerCase() === nomeLimpo.toLowerCase())) {
    alert("Essa empresa já está cadastrada.");
    return;
  }
  try {
    await addDoc(collection(db, "empresas"), { nome: nomeLimpo });
  } catch (err) {
    alert("Erro ao cadastrar empresa: " + err.message);
  }
});

// ---------- Administração: usuários e permissões (só pra administrador) ----------

// Só o admin precisa ler a lista de usuários — então o escutador só liga
// pra quem é admin (e desliga se a pessoa deixar de ser).
function atualizarEscutasAdmin() {
  if (isAdminUser() && !unsubUsuarios) listenUsuarios();
  if (!isAdminUser() && unsubUsuarios) { unsubUsuarios(); unsubUsuarios = null; usuariosList = []; }
}

// Todo mundo que já logou alguma vez no site aparece aqui (cada um tem um perfil)
function listenUsuarios() {
  unsubUsuarios = onSnapshot(collection(db, "usuarios"), (snap) => {
    usuariosList = snap.docs
      .map(d => ({ uid: d.id, ...d.data() }))
      .sort((a, b) => (a.email || "").localeCompare(b.email || ""));
    if (document.getElementById("view-admin").classList.contains("active")) renderAdminUsersTable();
  }, (err) => console.error("Sem permissão para listar usuários:", err));
}

// Desenha a tabela de usuários e permissões
function renderAdminUsersTable() {
  if (!isAdminUser()) return;
  const body = document.getElementById("admin-users-body");
  if (usuariosList.length === 0) {
    body.innerHTML = '<tr class="empty-row"><td colspan="4">Nenhum usuário entrou no site ainda.</td></tr>';
    return;
  }
  body.innerHTML = usuariosList.map(u => {
    const checks = empresas.map(emp => {
      const marcado = (u.empresas || []).includes(emp.nome);
      return `<label class="admin-check-pill ${marcado ? "checked" : ""}">
        <input type="checkbox" data-empresa="${escapeHtml(emp.nome)}" ${marcado ? "checked" : ""}>
        ${escapeHtml(emp.nome)}
      </label>`;
    }).join("");
    return `
      <tr>
        <td>
          <div class="doc-name-main">${escapeHtml(u.email)}</div>
          <div class="doc-name-sub">${u.uid === currentUser.uid ? "(você)" : ""}</div>
        </td>
        <td>
          <label class="admin-toggle">
            <input type="checkbox" data-admin-toggle ${u.isAdmin ? "checked" : ""}>
            <span class="pill ${u.isAdmin ? "pill-admin" : "pill-comum"}">${u.isAdmin ? "Administrador" : "Usuário comum"}</span>
          </label>
        </td>
        <td><div class="admin-empresas-checks">${checks || '<span class="doc-name-sub">Nenhuma empresa cadastrada</span>'}</div></td>
        <td><button class="btn-ghost btn-sm-admin" data-save-uid="${u.uid}">Salvar</button></td>
      </tr>`;
  }).join("");

  // Marca/desmarca o visual da pílula ao clicar na caixinha
  body.querySelectorAll("input[data-empresa]").forEach(cb => {
    cb.addEventListener("change", () => cb.closest(".admin-check-pill").classList.toggle("checked", cb.checked));
  });

  // Salva as permissões da linha
  body.querySelectorAll("[data-save-uid]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const marcadas = [...row.querySelectorAll("input[data-empresa]:checked")].map(cb => cb.dataset.empresa);
      const adminMarcado = row.querySelector("[data-admin-toggle]").checked;
      btn.disabled = true;
      btn.textContent = "Salvando...";
      try {
        await updateDoc(doc(db, "usuarios", btn.dataset.saveUid), { isAdmin: adminMarcado, empresas: marcadas });
      } catch (err) {
        alert("Erro ao salvar: " + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "Salvar";
      }
    });
  });
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
          ${d.fileId ? `<button type="button" class="action-link" data-action="view" data-id="${d.id}">Abrir</button>` : ""}
          <button class="btn-text-danger" data-id="${d.id}" data-fileid="${escapeHtml(d.fileId || "")}" data-nome="${escapeHtml(d.nomeArquivo)}">Excluir</button>
        </div>
      </td>
    </tr>`;
}

// Liga os cliques dos botões "Abrir" e "Excluir" depois que uma tabela é desenhada
function bindRowActions(container) {
  container.querySelectorAll('[data-action="view"]').forEach(btn => {
    btn.addEventListener("click", () => openViewer(btn.dataset.id));
  });
  container.querySelectorAll(".btn-text-danger").forEach(btn => {
    btn.addEventListener("click", () => {
      const d = documentos.find(x => x.id === btn.dataset.id);
      openDeleteModal({
        type: "documento", docId: btn.dataset.id, fileId: btn.dataset.fileid, nome: btn.dataset.nome,
        comprovanteFileId: d?.comprovante?.fileId || null
      });
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
  bindRowActions(recentBody);

  // Tabela "enviados recentemente" da página Upload: só os 5 mais novos
  const upBody = document.getElementById("upload-recent-body");
  const ultimos = documentos.slice(0, 5);
  upBody.innerHTML = ultimos.length
    ? ultimos.map(d => docRow(d)).join("")
    : '<tr class="empty-row"><td colspan="5">Nenhum documento enviado ainda.</td></tr>';
  bindRowActions(upBody);

  // Tabela completa (página Documentos)
  const docBody = document.getElementById("doc-table-body");
  docBody.innerHTML = documentos.length
    ? documentos.map(d => docRow(d, { completa: true })).join("")
    : '<tr class="empty-row"><td colspan="6">Nenhum documento enviado ainda.</td></tr>';
  bindRowActions(docBody);
}

// Página Empresas: um cartão por empresa cadastrada, com a quantidade de
// documentos e o espaço que ela ocupa.
function renderEmpresas() {
  const grid = document.getElementById("empresas-grid");
  const lista = getVisibleEmpresas();

  document.getElementById("stat-total-empresas").textContent = lista.length;

  if (lista.length === 0) {
    const vazio = isAdminUser()
      ? 'Nenhuma empresa cadastrada ainda. Clique em "+ Nova empresa".'
      : "Nenhuma empresa liberada pro seu usuário ainda. Fale com o administrador.";
    grid.innerHTML = `<div class="empty-row" style="grid-column:1/-1;padding:34px;">${vazio}</div>`;
    return;
  }
  grid.innerHTML = lista.map(emp => {
    const docs = documentos.filter(d => d.empresa === emp.nome);
    const bytes = docs.reduce((soma, d) => soma + tamanhoTotal(d), 0);
    return `
      <div class="empresa-card">
        <div class="stat-icon">🏢</div>
        <div class="empresa-name">${escapeHtml(emp.nome)}</div>
        <div class="empresa-meta"><b>${docs.length}</b> documento(s) · <b>${formatBytes(bytes)}</b></div>
      </div>`;
  }).join("");
}

// Cartões de estatística do Início
function renderEstatisticas() {
  const totalBytes = documentos.reduce((soma, d) => soma + tamanhoTotal(d), 0);
  const pct = Math.min(100, (totalBytes / QUOTA_BYTES) * 100);
  document.getElementById("stat-total-docs").textContent = documentos.length;
  document.getElementById("stat-space-used").textContent = formatBytes(totalBytes);
  document.getElementById("mini-progress-bar").style.width = pct + "%";
}

// Escuta os documentos em tempo real e redesenha tudo quando algo muda
function listenDocumentos() {
  if (unsubDocumentos) { unsubDocumentos(); unsubDocumentos = null; }

  const admin = isAdminUser();
  const permitidas = (userProfile && userProfile.empresas) || [];

  // Sem nenhuma empresa liberada: o cofre fica vazio e nem consultamos o banco
  if (!admin && permitidas.length === 0) {
    documentos = [];
    renderAllDocumentViews();
    return;
  }

  // Administrador lê tudo; usuário comum só lê as empresas liberadas pra ele.
  // (O Firestore também exige isso nas regras — veja o arquivo firestore.rules.)
  const q = admin
    ? query(collection(db, "documentos"))
    : query(collection(db, "documentos"), where("empresa", "in", permitidas.slice(0, 10)));

  unsubDocumentos = onSnapshot(q, (snap) => {
    documentos = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.uploadedAtMs || 0) - (a.uploadedAtMs || 0)); // mais novos primeiro
    renderAllDocumentViews();
  }, (err) => console.error("Erro ao ler os documentos:", err));
}

// Redesenha tudo que depende da lista de documentos
function renderAllDocumentViews() {
  renderEstatisticas();
  renderTabelas();
  renderEmpresas();

  // Se tem um documento aberto, mantém o botão e a página de comprovante atualizados
  const atual = documentos.find(x => x.id === currentViewedDocId);
  if (atual) {
    setComprovanteButtonLabel(atual);
    if (document.getElementById("view-comprovante").classList.contains("active")) {
      renderComprovantePage(atual);
    }
  }
}

// ---------- Permissões do usuário ----------
// Cada usuário tem um "perfil" na coleção "usuarios" do Firestore, guardando
// se ele é administrador e quais empresas pode acessar. Todo usuário novo
// nasce BLOQUEADO (isAdmin: false e nenhuma empresa) até um admin liberar.

function isAdminUser() {
  return !!(userProfile && userProfile.isAdmin);
}

// Empresas que o usuário atual pode ver: administrador vê todas
function getVisibleEmpresas() {
  if (isAdminUser()) return empresas;
  const permitidas = (userProfile && userProfile.empresas) || [];
  return empresas.filter(e => permitidas.includes(e.nome));
}

// Ajusta a tela conforme as permissões
function applyProfileToUI() {
  document.getElementById("add-empresa-btn").hidden = !isAdminUser();
  document.getElementById("nav-admin-item").hidden = !isAdminUser();
  const semAcesso = !isAdminUser() && ((userProfile && userProfile.empresas) || []).length === 0;
  document.getElementById("sem-acesso-aviso").hidden = !semAcesso;
}

// Depois do login: garante que o perfil existe (cria bloqueado no primeiro
// login) e fica escutando em tempo real — se um admin mudar as permissões
// enquanto a pessoa usa o site, a tela se atualiza sozinha.
async function initUserProfileThenData(user) {
  const ref = doc(db, "usuarios", user.uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { email: user.email, isAdmin: false, empresas: [] });
    }
  } catch (err) {
    console.error("Erro ao ler/criar o perfil:", err);
  }

  if (unsubProfile) unsubProfile();
  unsubProfile = onSnapshot(ref, (docSnap) => {
    userProfile = docSnap.exists() ? docSnap.data() : { email: user.email, isAdmin: false, empresas: [] };
    applyProfileToUI();
    atualizarEscutasAdmin();
    if (!dataInitialized) {
      dataInitialized = true;
      listenEmpresas();
    }
    listenDocumentos(); // reassina com as permissões atuais
    renderEmpresas();
    refreshEmpresaSelect();
  });
}

// Ao sair: desliga os escutadores e limpa tudo que era do usuário anterior
function limparSessao() {
  [unsubProfile, unsubEmpresas, unsubDocumentos, unsubUsuarios].forEach(fn => { if (fn) fn(); });
  unsubProfile = unsubEmpresas = unsubDocumentos = unsubUsuarios = null;
  usuariosList = [];
  userProfile = null;
  dataInitialized = false;
  documentos = [];
  empresas = [];
  renderAllDocumentViews();
  goToView("inicio");
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
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
    initUserProfileThenData(user);
  } else {
    document.getElementById("login-screen").hidden = false;
    document.getElementById("main-app").hidden = true;
    limparSessao();
  }
});