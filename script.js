// Conectando o login ao firebase de verdade
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import{
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore, collection, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

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
const storage = getStorage(app); // conexão com o armazenamento de arquivo

    const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

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

    // Subindo o arquivo para o Firebase Storage
    const storageRef = ref(storage, `documentos/${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    // Salvando os dados (metadados) do documento no Firestone
    await addDoc(collection(db, "documentos"), {
        nomeArquivo: file.name,
        empresa, tipoImposto, mes, ano: Number(ano),
        tamanho: file.size,
        url,
        uploadedAt: serverTimestamp(),
    });

    e.target.reset();
});

//-- Lista de documentos
function listenDocumentos(){
    const q = query(collection(db, "documentos"), orderBy("nomeArquivo"));
    onSnapshot(q, (snap) => {
        const list = document.getElementById("doc-list");
        if (snap.empty) {
            list.innerHTML = "<li> Nenhum documento ainda.</li>";
            return;
        }
        list.innerHTML = snap.docs.map(d => {
            const doc = d.data();
        return `<li>${doc.nomeArquivo} — ${doc.empresa} · ${doc.tipoImposto} · ${doc.mes}/${doc.ano}</li>`;
    }).join("");
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

