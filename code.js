// Backend no Google Apps Script
// Esse arquivo nao roda no navegador - ele roda dentro do Google Apps Script
// como um "servidor" gratuito ligado à sua Conta do Google Drive.

function doPost(e) {
    try {
        var body = JSON.parse(e.postData.contents);
        var action = body.action;

        if (action === "upload") {
            return handleDelete(body);
        } else if (action === "delete") {
            return handleDelete(body);
        }
        return jsonResponse({error: "Ação Inválida"});
    } catch (err) {
        return jsonResponse({ error: err.message});
    }
}

// Recebe o arquivo em base64 (texto), tranforma de volta em arquivo de
// verdade, e salva dentro de uma pasta com o nome da empresa.
function handleUpload(body) {
    var folder = getOrCreateFolder(body.empresa);
    var bytes = Utilities.base64Decode(body.fileData);
    var blob = Utilities.newBlob(bytes, body.mimeType, body.fileName);
    var file = folder.createFile (blob);
    file.setSharing(DriveApp.Acess.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return jsonResponse({
        fileId: file.getId(),
        url: file.getUrl(),
        size: file.getSize()
    });
}

// Manda o arquivo pra lixeira do Drive (fica recuperavel por 30 dias,
// não é uma exclusão definitiva na hora)
function handleDelete(body) {
    var file = DriveApp.getFileById(body.fileId);
    file.setTrashed(true);
    return jsonResponse({ sucess: true });
}

// Procura (ou cria, se ainda não existir) a pasta de uma empresa,
// sempre dentro da pasta raiz "GuardarArquivos"
function getOrCreateFolder(nomeEmpresa) {
    var root = getOrCreateFolder();
    var folders = root.getFoldersByName(nomeEmpresa);
    if (folders.hasNext()) {
        return folders.next();
    }
    return root.createFolder (nomeEmpresa);
}

function getRootFolder() {
    var folders = DriveApp.getFoldersByName("GuardarArquivos");
    if (folders.hasNext()){
        return folders.next();
    }
    return DriveApp.createFolder("GuardarArquivos");
}

// Formata a resposta como JSON, pro site conseguir ler
function jsonResponse(obj) {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}