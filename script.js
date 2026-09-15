// Removendo o Firebase Storage
// Na hora de ativar o Firebase Storage, o Google passou a pedir cartão de crédito
//cadastrado  (mudança de politica deles), mesmo pra uso dentro da cota gratuita.
// Como eu não queria depender de cartão, tirei o Storage daqui - o Upload Através do Google Drive 
// (não exige cartão e tem um armazenamento maior gratuito).

// Conectando o login ao firebase de verdade
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import{
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore, collection, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCWaD-kP_qBbKkvBvnt9oHMPOfv-mDCIm8",
    authDomain: "projeto-academico-docs.firebaseapp.com",
    projectId: "projeto-academico-docs",
    storageBucket: "projeto-academico-docs.firebasestorage.app",
    messagingSenderId: "810363195574",
    appId: "1:810363195574:web:691598d28e0abee306d617",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // <- conexão com o banco de dados

    const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// - Transforma um numero de bytes num texto legível (ex: "2.3 MB")

function formatBytes(bytes) {
    if (!bytes) return "0 MB";
    const mb = bytes / (1024 ** 2);
    if (mb >= 1024) return (mb / 1024).toFixed(2) + " GB";
    return mb.toFixed(1) + " MB";
}

// - navegação entre as Abas
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

//Login de verdade (e-mail e senha) com firebase
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.textContent = ""; // Limpa mensagens de erro anteriores
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    try {
        await signInWithEmailAndPassword(auth, email, password);

        //o onAuthStateChanged vai cuidar de mostrar a tela de documentos e esconder a tela de login
        //percebe o login sozinho e libera a tela
    } catch (err) {
        loginError.textContent = "E-mail ou senha incorretos.";
    }
});
 
document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

// Preenche o select de mês com os 12 meses do ano
function populateMonthSelect() {
    const select = document.getElementById("upload-mes");
    MESES.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m; opt.textContent = m;
        select.appendChild(opt);
    });
}
// LEMBRETE: nesse commit especifico, o upload salva os DADOS do documento no Firestone,
// mas o ARQUIVO em si ainda nao vai pra lugar nenhum (retirei o Storage, então nao onde guardar ele ainda)
// Isso é só um estado de transição - por enquanto
// Envio de documentos (Upload)
document.getElementById("upload-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = document.getElementById("upload-file").files[0];
    const empresa = document.getElementById("upload-empresa").value.trim();
    const tipoImposto = document.getElementById("upload-tipo").value.trim();
    const mes = document.getElementById("upload-mes").value;
    const ano = document.getElementById("upload-ano").value;

    // As 4 tags obrigatórias - o "required" no html já ajuda, confirmando aqui por segurança
    if (!file || !empresa || !tipoImposto || !mes || !ano) {
        alert("Preencha todos os campos antes de enviar.");
        return;
    }

    // Salvando os dados (metadados) do documento no Firestone
    await addDoc(collection(db, "documentos"), {
        nomeArquivo: file.name,
        empresa, tipoImposto, mes, ano: Number(ano),
        tamanho: file.size,
        url:"", // sem link por enquanto
        uploadedAt: serverTimestamp(),
    });

    e.target.reset();
});

//-- Lista de documentos + medidor de espaço
// Toda vez que a lista de documentos muda, além de redesenhar a
// lista a gente também SOMA o tamanho de todos os arquivos e atualiza
// o cartão "de espaço usado" no Inicio.
function listenDocumentos(){
    const q = query(collection(db, "documentos"), orderBy("nomeArquivo"));
    onSnapshot(q, (snap) => {
        const list = document.getElementById("doc-list");
        if (snap.empty) {
            list.innerHTML = "<li> Nenhum documento ainda.</li>";
        } else {
            list.innerHTML = snap.docs.map(d => {
            const doc = d.data();
        return `<li>${doc.nomeArquivo} — ${doc.empresa} · ${doc.tipoImposto} · ${doc.mes}/${doc.ano}</li>`;
    }).join("");
    }

// Soma o tamanho de todos os documentos para o medidor de espaço 
    const totalBytes = snap.docs.reduce((soma, d) => soma + (d.data().tamanho || 0), 0);
    document.getElementById("stat-space-used").textContent = formatBytes(totalBytes);
});
}

//Roda automaticamente sempre que o estado de login muda (entrou, saiu,
//ou ja estava logado de antes e a pagina foi recarregada)
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById("login-screen").hidden = true;
        document.getElementById("main-app").hidden = false;
        document.getElementById("user-email").textContent = user.email;
        populateMonthSelect();
        listenDocumentos(); // <- começa a escutar o banco assim que loga
    } else {
        document.getElementById("login-screen").hidden = false;
        document.getElementById("main-app").hidden = true;
    }
});

