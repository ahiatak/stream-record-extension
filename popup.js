/* popup.js */

// Sélection des éléments du popup
const popupStartStopButton = document.getElementById("popupStartStopButton");
const popupStartButton = document.getElementById("popupStartButton");
const popupStopButton = document.getElementById("popupStopButton");
const popupStatus = document.getElementById("popupStatus");

// Formulaire des options
const popupOptionsForm = document.getElementById("popup-options-form");

// Champs des options
const popupVideoSelectorInput = document.getElementById("popupVideoSelector");
const popupSegmentDurationInput = document.getElementById("popupSegmentDuration");
const popupRecordDurationInput = document.getElementById("popupRecordDuration");
const popupEnableLocalSaveCheckbox = document.getElementById("popupEnableLocalSave");
const popupEnableSegmentLocalSaveCheckbox = document.getElementById("popupEnableSegmentLocalSave");
const popupEnableTelegramSaveCheckbox = document.getElementById("popupEnableTelegramSave");
const popupEnableSegmentTelegramSaveCheckbox = document.getElementById("popupEnableSegmentTelegramSave");
const popupLocalServerUrlInput = document.getElementById("popupLocalServerUrl");
const popupTelegramBotTokenInput = document.getElementById("popupTelegramBotToken");
const popupTelegramChatIdInput = document.getElementById("popupTelegramChatId");

/**
 * Met à jour le texte du bouton start/stop en fonction de l'état de l'enregistrement.
 * @param {boolean} isRecording - L'état actuel de l'enregistrement.
 */
function updateButtonText(isRecording) {
    popupStartStopButton.textContent = isRecording ? "Arrêter l'Enregistrement" : "Démarrer l'Enregistrement";
}

/**
 * Envoie un message au content script de l'onglet actif.
 * @param {string} action - Action à envoyer ('contentStartRecording', 'contentStopRecording', 'getRecordingState').
 * @param {object|null} options - Données optionnelles à envoyer avec le message.
 * @param {function} callback - Fonction exécutée à la réception de la réponse.
 */
function sendMessageToActiveTab(action, options = null, callback = () => {}) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs.length) {
            console.error("Aucun onglet actif trouvé !");
            popupStatus.textContent = "Erreur : Aucun onglet actif.";
            return;
        }

        console.log("Envoi du message :", action, "auxcript de l'onglet", tabs[0].id);
        
        chrome.tabs.sendMessage(tabs[0].id, { action: action, options: options }, function (response) {
            if (chrome.runtime.lastError) {
                console.error("Erreur lors de l'envoi du message au content script :", chrome.runtime.lastError.message);
                popupStatus.textContent = "Erreur de communication.";
                return;
            }
            
            console.log("Réponse reçue :", response);
            if (callback) callback(response);
        });
    });
}

/**
 * Démarre ou arrête l'enregistrement selon l'état actuel.
 */
popupStartStopButton.addEventListener("click", function () {
    sendMessageToActiveTab("getRecordingState", null, function (response) {
        if (response && response.isRecording) {
            console.log("Arrêt de l'enregistrement...");
            sendMessageToActiveTab("contentStopRecording");
            updateButtonText(false);
            popupStatus.textContent = "Enregistrement arrêté.";
        } else {
            console.log("Démarrage de l'enregistrement...");
            sendEventToStartRecording();
        }
    });
});

/**
 * Démarre l'enregistrement avec les options du popup.
 */
function sendEventToStartRecording() {
    const options = {
        videoSelector: popupVideoSelectorInput.value,
        segmentDuration: parseInt(popupSegmentDurationInput.value, 10) * 60 * 1000, // minutes -> millisecondes
        recordDuration: parseInt(popupRecordDurationInput.value, 10) * 60 * 60 * 1000, // heures -> millisecondes
        enableSendLocal: popupEnableLocalSaveCheckbox.checked,
        enableSendSegmentLocal: popupEnableSegmentLocalSaveCheckbox.checked,
        enableTelegramSave: popupEnableTelegramSaveCheckbox.checked,
        enableSendSegmentTelegram: popupEnableSegmentTelegramSaveCheckbox.checked,
        localServerUrl: popupLocalServerUrlInput.value,
        telegramBotToken: popupTelegramBotTokenInput.value,
        telegramChatId: popupTelegramChatIdInput.value,
    };

    console.log("Envoi des options d'enregistrement :", options);

    sendMessageToActiveTab("contentStartRecording", options, function (response) {
        if (response && response.success) {
            updateButtonText(true);
            popupStatus.textContent = "Enregistrement en cours...";
        } else {
            console.error("Échec du démarrage de l'enregistrement !");
            popupStatus.textContent = "Erreur de démarrage.";
        }
    });
}

// Boutons individuels pour démarrer et arrêter l'enregistrement
popupStartButton.addEventListener("click", function () {
    console.log("Bouton Démarrer cliqué.");
    sendEventToStartRecording();
});

popupStopButton.addEventListener("click", function () {
    console.log("Bouton Arrêter cliqué.");
    sendMessageToActiveTab("contentStopRecording");
    updateButtonText(false);
    popupStatus.textContent = "Enregistrement arrêté.";
});

/**
 * Charge les options depuis chrome.storage.sync et met à jour les champs du popup.
 */
function loadPopupOptions() {
    chrome.storage.sync.get({
        videoSelector: "video",
        segmentDuration: 5,
        recordDuration: 5,
        enableLocalSave: false,
        enableSegmentLocalSave: false,
        enableTelegramSave: false,
        enableSegmentTelegramSave: false,
        localServerUrl: "http://localhost:3000/upload.php",
        telegramBotToken: "",
        telegramChatId: "",
    }, function (items) {
        popupVideoSelectorInput.value = items.videoSelector;
        popupSegmentDurationInput.value = items.segmentDuration;
        popupRecordDurationInput.value = items.recordDuration;
        popupEnableLocalSaveCheckbox.checked = items.enableLocalSave;
        popupEnableSegmentLocalSaveCheckbox.checked = items.enableSegmentLocalSave;
        popupEnableTelegramSaveCheckbox.checked = items.enableTelegramSave;
        popupEnableSegmentTelegramSaveCheckbox.checked = items.enableSegmentTelegramSave;
        popupLocalServerUrlInput.value = items.localServerUrl;
        popupTelegramBotTokenInput.value = items.telegramBotToken;
        popupTelegramChatIdInput.value = items.telegramChatId;
    });
}

/**
 * Sauvegarde les options du popup dans chrome.storage.sync.
 */
function savePopupOptions() {
    chrome.storage.sync.set({
        videoSelector: popupVideoSelectorInput.value,
        segmentDuration: parseInt(popupSegmentDurationInput.value, 10),
        recordDuration: parseInt(popupRecordDurationInput.value, 10),
        enableLocalSave: popupEnableLocalSaveCheckbox.checked,
        enableSegmentLocalSave: popupEnableSegmentLocalSaveCheckbox.checked,
        enableTelegramSave: popupEnableTelegramSaveCheckbox.checked,
        enableSegmentTelegramSave: popupEnableSegmentTelegramSaveCheckbox.checked,
        localServerUrl: popupLocalServerUrlInput.value,
        telegramBotToken: popupTelegramBotTokenInput.value,
        telegramChatId: popupTelegramChatIdInput.value,
    }, function () {
        console.log("Options du popup sauvegardées.");
    });
}

// --- Événements ---
document.addEventListener("DOMContentLoaded", function () {
    loadPopupOptions();
    sendMessageToActiveTab("getRecordingState", null, function (response) {
        console.log("getRecordingState");
        updateButtonText(response && response.isRecording);
    });
});

// Sauvegarde automatique des options lorsqu'un champ change
document.querySelectorAll("input, select").forEach(element => {
    element.addEventListener("change", savePopupOptions);
});
