/* background.js */

// Dictionnaires pour stocker l'état et les options d'enregistrement par onglet
const recordingStates = {};  // { [tabId]: boolean }
const recordingOptions = {}; // { [tabId]: options }

/**
 * Envoie un message au content script de l'onglet spécifié pour démarrer l'enregistrement.
 * @param {number} tabId - L'identifiant de l'onglet.
 * @param {object} options - Les options d'enregistrement.
 */
function startContentRecording(tabId, options) {
    chrome.tabs.sendMessage(tabId, { action: "contentStartRecording", options: options })
        .then(response => {
            console.log("Message de démarrage envoyé au content script pour l'onglet", tabId, ":", response);
        })
        .catch(error => {
            console.error("Erreur lors de l'envoi du message à content.js pour l'onglet", tabId, ":", error);
        });
}

/**
 * Envoie un message au content script de l'onglet spécifié pour arrêter l'enregistrement.
 * @param {number} tabId - L'identifiant de l'onglet.
 */
function stopContentRecording(tabId) {
    chrome.tabs.sendMessage(tabId, { action: "contentStopRecording" })
        .then(response => {
            console.log("Message d'arrêt envoyé au content script pour l'onglet", tabId, ":", response);
        })
        .catch(error => {
            console.error("Erreur lors de l'envoi du message à content.js pour l'onglet", tabId, ":", error);
        });
}

// --- Gestion des messages reçus dans le background ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message reçu dans background.js :", message, sender);

    // Récupérer l'ID de l'onglet si disponible
    const tabId = sender.tab ? sender.tab.id : null;

    // Mise à jour de l'état d'enregistrement depuis le content script
    if (message.action === "contentRecordingStarted") {
        if (tabId !== null) {
            console.log("Enregistrement démarré dans le content script pour l'onglet", tabId);
            recordingStates[tabId] = true;
            sendResponse({ status: "recordingStarted" });
        }
        return true;
    }

    if (message.action === "contentRecordingStopped") {
        if (tabId !== null) {
            console.log("Enregistrement arrêté dans le content script pour l'onglet", tabId);
            recordingStates[tabId] = false;
            sendResponse({ status: "recordingStopped" });
        }
        return true;
    }

    // Permettre au popup de récupérer l'état d'enregistrement de l'onglet actif
    if (message.action === "getRecordingState") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length) {
                const activeTabId = tabs[0].id;
                sendResponse({ isRecording: !!recordingStates[activeTabId] });
                console.log("État d'enregistrement pour l'onglet", activeTabId, ":", !!recordingStates[activeTabId]);
            } else {
                sendResponse({ isRecording: false });
            }
        });
        return true; // Réponse asynchrone
    }

    // Démarrage de l'enregistrement
    if (message.action === "startRecording") {
        // Si le message provient d'un content script ou du popup, on récupère l'onglet actif
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) {
                console.warn("Aucun onglet actif trouvé.");
                sendResponse({ status: "noActiveTab" });
                return;
            }
            const activeTabId = tabs[0].id;
            // Stocker les options pour cet onglet
            recordingOptions[activeTabId] = message.options;
            startContentRecording(activeTabId, message.options);
            // L'état sera mis à jour par le content script via "contentRecordingStarted"
            sendResponse({ status: "starting" });
        });
        return true; // Réponse asynchrone

    } else if (message.action === "stopRecording") {
        // Arrêter l'enregistrement dans l'onglet actif
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) {
                console.warn("Aucun onglet actif trouvé.");
                sendResponse({ status: "noActiveTab" });
                return;
            }
            const activeTabId = tabs[0].id;
            console.log("Demande d'arrêt de l'enregistrement pour l'onglet", activeTabId, ":", !!recordingStates[activeTabId]);
            if (recordingStates[activeTabId]) {
                stopContentRecording(activeTabId);
                // L'état sera mis à jour par le content script via "contentRecordingStopped"
                sendResponse({ status: "stopping" });
            } else {
                console.log("Aucun enregistrement en cours à arrêter pour l'onglet", activeTabId);
                sendResponse({ status: "notRecording" });
            }
        });
        return true;
    }

    return false; // Aucun sendResponse pour les autres messages
});
