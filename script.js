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

//Por enquanto o formulario de login só esconde a tela de login e mostra a tela de documentos, mas futuramente ele vai validar o login e senha
document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    document.getElementById("login-screen").hidden = true;
    document.getElementById("main-app").hidden = false;
});

document.getElementById("logout-btn").addEventListener("click", () => {
    document.getElementById("login-screen").hidden = false;
    document.getElementById("main-app").hidden = true;
});