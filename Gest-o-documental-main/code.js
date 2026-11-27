// ---------- Backend no Google Apps Script ----------
// Esse arquivo roda dentro do Google Apps Script (script.google.com), não no
// navegador. Recebe os pedidos do site e guarda/apaga arquivos no Google Drive.

// A mesma "apiKey" do firebaseConfig do site (ela é pública por natureza).
var FIREBASE_API_KEY = "AIzaSyCWaD-kP_qBbKkvBvnt9oHMPOfv-mDCIm8";

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // Toda ação exige um usuário de verdade, logado no site, com token válido.
    var auth = verifyIdToken(body.idToken);
    if (auth.error) {
      return jsonResponse({ error: "Não autorizado: " + auth.error });
    }

    var action = body.action;
    if (action === "upload") {
      return handleUpload(body);
    } else if (action === "delete") {
      return handleDelete(body);
    }
    return jsonResponse({ error: "Ação inválida" });
  } catch (err) {
    return jsonResponse({ error: "Erro no servidor: " + err.message });
  }
}

// Pergunta pro Firebase se esse token pertence a um login válido e ativo.
// Devolve { email } se for válido, ou { error } explicando o motivo.
function verifyIdToken(idToken) {
  if (!idToken) return { error: "token ausente — atualize a página e faça login de novo." };
  try {
    var url = "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY;
    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ idToken: idToken }),
      muteHttpExceptions: true
    });
    var result = JSON.parse(response.getContentText());
    if (result.users && result.users.length > 0) {
      return { email: result.users[0].email };
    }
    var motivo = (result.error && result.error.message) ? result.error.message : "motivo desconhecido";
    return { error: "token inválido ou expirado (" + motivo + ")" };
  } catch (err) {
    return { error: "falha ao verificar o login (falta autorizar a permissão de acesso externo?). Detalhe: " + err.message };
  }
}

// Recebe o arquivo em base64, transforma de volta em arquivo e salva dentro
// de uma pasta com o nome da empresa.
function handleUpload(body) {
  var folder = getOrCreateFolder(body.empresa);
  var bytes = Utilities.base64Decode(body.fileData);
  var blob = Utilities.newBlob(bytes, body.mimeType, body.fileName);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return jsonResponse({
    fileId: file.getId(),
    url: file.getUrl(),
    size: file.getSize()
  });
}

// Manda o arquivo pra lixeira do Drive (recuperável por 30 dias).
function handleDelete(body) {
  var file = DriveApp.getFileById(body.fileId);
  file.setTrashed(true);
  return jsonResponse({ success: true });
}

function getOrCreateFolder(nomeEmpresa) {
  var root = getRootFolder();
  var folders = root.getFoldersByName(nomeEmpresa);
  if (folders.hasNext()) {
    return folders.next();
  }
  return root.createFolder(nomeEmpresa);
}

function getRootFolder() {
  var folders = DriveApp.getFoldersByName("GuardarArquivos");
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder("GuardarArquivos");
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Só serve pra forçar a tela de autorização da permissão nova (UrlFetchApp).
// Rode UMA vez pelo editor (botão Executar) depois de colar esse código.
function autorizarPermissoes() {
  UrlFetchApp.fetch("https://www.google.com");
  Logger.log("Permissões OK");
}