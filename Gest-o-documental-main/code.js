// ---------- Etapa 3, commit 2: backend no Google Apps Script ----------
// Esse arquivo NÃO roda no navegador — ele roda dentro do Google Apps
// Script (script.google.com), como um "servidor" gratuito ligado à sua
// conta do Google Drive. O site (script.js) chama esse backend por HTTP
// pra pedir "salva esse arquivo" ou "apaga esse arquivo".
// Esse commit só cria o backend — 

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    if (action === "upload") {
      return handleUpload(body);
    } else if (action === "delete") {
      return handleDelete(body);
    }
    return jsonResponse({ error: "Ação inválida" });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// Recebe o arquivo em base64 (texto), transforma de volta em arquivo de
// verdade, e salva dentro de uma pasta com o nome da empresa.
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

// Manda o arquivo pra lixeira do Drive (fica recuperável por 30 dias,
// não é uma exclusão definitiva na hora).
function handleDelete(body) {
  var file = DriveApp.getFileById(body.fileId);
  file.setTrashed(true);
  return jsonResponse({ success: true });
}

// Procura (ou cria, se ainda não existir) a pasta de uma empresa,
// sempre dentro da pasta raiz "GuardarArquivos".
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

// Formata a resposta como JSON, pro site conseguir ler.
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
