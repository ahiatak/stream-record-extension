/* background.js */

// --- Variable globale pour stocker les options d'enregistrement ---
let currentRecordingOptions = null;

/**
 * Envoie un message au script de contenu pour démarrer l'enregistrement.
 */
function startContentRecording(options) {
    chrome.runtime.sendMessage({ action: "contentStartRecording", options: options })
        .then(response => {
            console.log("Message de démarrage d'enregistrement envoyé au script de contenu:", response);
        })
        .catch(error => {
            console.error("Erreur lors de l'envoi du message de démarrage d'enregistrement :", error);
        });
}

/**
 * Envoie un message au script de contenu pour arrêter l'enregistrement.
 */
function stopContentRecording() {
    chrome.runtime.sendMessage({ action: "contentStopRecording" })
        .then(response => {
            console.log("Message d'arrêt d'enregistrement envoyé au script de contenu:", response);
        })
        .catch(error => {
            console.error("Erreur lors de l'envoi du message d'arrêt d'enregistrement :", error);
        });
}

// --- Gestion des messages reçus dans le background ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message reçu dans le background script:", message, sender);

    if (message.action === "startRecording") {
        currentRecordingOptions = message.options; // Stocker les options

        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs.length === 0) {
                console.warn("Aucun onglet actif trouvé pour démarrer l'enregistrement.");
                sendResponse({ status: "noActiveTab" });
                return;
            }

            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: startContentRecording,
                args: [currentRecordingOptions]
            }).then(() => {
                console.log("startContentRecording injecté avec succès.");
                sendResponse({ status: "starting" });
            }).catch(error => {
                console.error("Erreur lors de l'injection de startContentRecording:", error);
                sendResponse({ status: "error", message: error.message });
            });
        });

        return true; // Nécessaire pour signaler une réponse asynchrone

    } else if (message.action === "stopRecording") {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs.length === 0) {
                console.warn("Aucun onglet actif trouvé pour arrêter l'enregistrement.");
                sendResponse({ status: "noActiveTab" });
                return;
            }

            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: stopContentRecording
            }).then(() => {
                console.log("stopContentRecording injecté avec succès.");
                sendResponse({ status: "stopping" });
            }).catch(error => {
                console.error("Erreur lors de l'injection de stopContentRecording:", error);
                sendResponse({ status: "error", message: error.message });
            });
        });

        return true; // Nécessaire pour signaler une réponse asynchrone

    } else if (message.action === "contentRecordingStarted") {
        console.log("Message 'contentRecordingStarted' reçu du script de contenu !");
        sendResponse({ status: "received" });
        return true;
    }

    return false; // Indique que `sendResponse` n'est pas utilisé ailleurs
});
