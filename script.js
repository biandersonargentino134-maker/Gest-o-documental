// Conectando o login ao firebase de verdade
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import{
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

// Etapa 1 - navegação visual entre "Inicio" e "Documentos" (por enquanto)

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

//Roda automaticamente sempre que o estado de login muda (entrou, saiu,
//ou ja estava logado de antes e a pagina foi recarregada)
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById("login-screen").hidden = true;
        document.getElementById("main-app").hidden = false;
        document.getElementById("user-email").textContent = user.email;
    } else {
        document.getElementById("login-screen").hidden = false;
        document.getElementById("main-app").hidden = true;
    }
});

