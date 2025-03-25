/* background.js */

// --- Variable globale pour stocker les options d'enregistrement ---
let currentRecordingOptions = null;
let isRecording = false; // Etat global de l'enregistrement

// Sauvegarder l'état dans chrome.storage.local pour le rendre persistant
function updateRecordingState(state) {
    isRecording = state;
    chrome.storage.local.set({ isRecording: state });
}

/**
 * Envoie un message au script de contenu pour démarrer l'enregistrement.
 */
function startContentRecording(tabId, options) {
    chrome.tabs.sendMessage(tabId, { action: "contentStartRecording", options: options })
        .then(response => {
            console.log("Message de démarrage envoyé au content script:", response);
        })
        .catch(error => {
            console.error("Erreur lors de l'envoi du message à content.js:", error);
        });
}

/**
 * Envoie un message au script de contenu pour arrêter l'enregistrement.
 */
function stopContentRecording(tabId) {
    chrome.tabs.sendMessage(tabId, { action: "contentStopRecording" })
        .then(response => {
            console.log("Message d'arrêt envoyé au content script:", response);
        })
        .catch(error => {
            console.error("Erreur lors de l'envoi du message à content.js:", error);
        });
}

// --- Gestion des messages reçus dans le background ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message reçu dans background.js :", message, sender);

    // Mise à jour de l'état d'enregistrement depuis content.js
    if (message.action === "contentRecordingStarted") {
        console.log("Enregistrement démarré dans le content script.");
        isRecording = true;
        updateRecordingState(isRecording);
        sendResponse({ status: "recordingStarted" });
        return true;
    }

    if (message.action === "contentRecordingStopped") {
        console.log("Enregistrement arrêté dans le content script.");
        isRecording = false;
        updateRecordingState(isRecording);
        sendResponse({ status: "recordingStopped" });
        return true;
    }

    // Permettre au popup de récupérer l'état d'enregistrement actuel
    if (message.action === "getRecordingState") {
        chrome.storage.local.get("isRecording", (result) => {
            sendResponse({ isRecording: result.isRecording || false });
            isRecording = result.isRecording || false; // Mettre à jour l'état global
            console.log("isRecording:", isRecording);
        });
        return true; // Réponse asynchrone
    }

    if (message.action === "startRecording") {
        currentRecordingOptions = message.options; // Stocker les options

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) {
                console.warn("Aucun onglet actif trouvé.");
                sendResponse({ status: "noActiveTab" });
                return;
            }

            startContentRecording(tabs[0].id, currentRecordingOptions);
            // On attend la confirmation du content script via message "contentRecordingStarted"
            sendResponse({ status: "starting" });
        });
        return true; // Réponse asynchrone

    } else if (message.action === "stopRecording") {
        // Ici, on peut arrêter l'enregistrement même si le popup est fermé en se basant sur l'état global.
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) {
                console.warn("Aucun onglet actif trouvé.");
                sendResponse({ status: "noActiveTab" });
                return;
            }
            console.log("Arrêt de l'enregistrement en cours...", tabs[0].id, isRecording);
            // Si l'enregistrement est en cours, on envoie la commande d'arrêt
            if (isRecording) {
                stopContentRecording(tabs[0].id);
                // Le content script mettra à jour l'état via "contentRecordingStopped"
                sendResponse({ status: "stopping" });
            } else {
                console.log("Aucun enregistrement en cours à arrêter.");
                sendResponse({ status: "notRecording" });
            }
        });
        return true;
    }

    return false; // Aucun sendResponse pour les autres messages
});