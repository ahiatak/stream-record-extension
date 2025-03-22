/* background.js */

// --- Variable globale pour stocker les options d'enregistrement ---
let currentRecordingOptions = null;

// --- Global Recording State Management in Background Script ---
let isBackgroundRecordingActive = false; // Track if recording is active globally in background
let activeRecordingTabId = null;       // Track the tab ID where recording is active (if needed)


/**
 * Function to set and persist the background recording state.
 * @param {boolean} recordingState - The new recording state (true for active, false for inactive).
 * @param {number|null} tabId - The tab ID where recording is active, or null if inactive.
 */
function setBackgroundRecordingState(recordingState, tabId) {
    isBackgroundRecordingActive = recordingState;
    activeRecordingTabId = tabId;
    chrome.storage.sync.set({ // Persist recording state in storage
        backgroundIsRecordingActive: isBackgroundRecordingActive,
        backgroundRecordingTabId: activeRecordingTabId
    }, function() {
        console.log('État de l\'enregistrement en background sauvegardé:', isBackgroundRecordingActive, activeRecordingTabId);
    });
    updatePopupUI(); // Update popup UI to reflect state change
}


/**
 * Function to get the persisted background recording state from storage and initialize background state.
 */
function loadBackgroundRecordingState() {
    chrome.storage.sync.get({
        backgroundIsRecordingActive: false,
        backgroundRecordingTabId: null
    }, function(items) {
        isBackgroundRecordingActive = items.backgroundIsRecordingActive;
        activeRecordingTabId = items.backgroundRecordingTabId;
        console.log('État de l\'enregistrement en background chargé depuis le storage:', isBackgroundRecordingActive, activeRecordingTabId);
        updatePopupUI(); // Update popup UI on load to reflect persisted state
    });
}


/**
 * Function to update the popup UI to reflect the current background recording state.
 * Sends a message to all connected popups to update their button text and status.
 */
function updatePopupUI() {
    chrome.runtime.getViews({type: "popup"}).forEach(popup => {
        popup.updatePopupDisplay(isBackgroundRecordingActive); // Call function in popup.js to update UI
    });
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
    console.log("Message reçu dans background.js :", message);

    if (message.action === "startRecording") {
        currentRecordingOptions = message.options;

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) {
                console.warn("Aucun onglet actif trouvé.");
                sendResponse({ status: "noActiveTab" });
                return;
            }

            startContentRecording(tabs[0].id, currentRecordingOptions);
            sendResponse({ status: "starting" });
        });

        return true;  // Indique une réponse asynchrone

    } else if (message.action === "stopRecording") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) {
                console.warn("Aucun onglet actif trouvé.");
                sendResponse({ status: "noActiveTab" });
                return;
            }

            stopContentRecording(tabs[0].id);
            sendResponse({ status: "stopping" });
        });

        return true;  // Indique une réponse asynchrone

    } else if (message.action === "contentRecordingStarted") {
        console.log("Le content script a confirmé le démarrage.");
        sendResponse({ status: "received" });
        return true;
    }

    return false;
});



// --- Extension Startup Logic ---
chrome.runtime.onStartup.addListener(() => {
    loadBackgroundRecordingState(); // Load persisted state on extension startup
    console.log("Extension démarrée, logique de fond initialisée.");
});

chrome.runtime.onInstalled.addListener(() => { // Also load on install/update
    loadBackgroundRecordingState();
    console.log("Extension installée ou mise à jour, logique de fond initialisée.");
});