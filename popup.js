/* popup.js */

// Sélection des éléments du popup
const popupStartStopButton = document.getElementById('popupStartStopButton');
const popupStartButton = document.getElementById('popupStartButton');
const popupStopButton = document.getElementById('popupStopButton');
const popupStatus = document.getElementById('popupStatus');
const popupOptionsForm = document.getElementById('popup-options-form'); // Form element

// Input elements for all options
const popupVideoSelectorInput = document.getElementById('popupVideoSelector');
const popupSegmentDurationInput = document.getElementById('popupSegmentDuration');
const popupRecordDurationInput = document.getElementById('popupRecordDuration');
const popupEnableLocalSaveCheckbox = document.getElementById('popupEnableLocalSave');
const popupEnableSegmentLocalSaveCheckbox = document.getElementById('popupEnableSegmentLocalSave');
const popupEnableTelegramSaveCheckbox = document.getElementById('popupEnableTelegramSave');
const popupEnableSegmentTelegramSaveCheckbox = document.getElementById('popupEnableSegmentTelegramSave');
const popupLocalServerUrlInput = document.getElementById('popupLocalServerUrl');
const popupTelegramBotTokenInput = document.getElementById('popupTelegramBotToken');
const popupTelegramChatIdInput = document.getElementById('popupTelegramChatId');

/**
 * Met à jour le texte du bouton en fonction de l'état de l'enregistrement.
 * @param {boolean} isRecording - L'état d'enregistrement actuel.
 */
function updateButtonText(isRecording) {
    popupStartStopButton.textContent = isRecording ? 'Arrêter l\'Enregistrement' : 'Démarrer l\'Enregistrement';
}

/**
 * Envoie un message au content script de l'onglet actif.
 * @param {string} action - L'action à envoyer ('startRecording', 'stopRecording', 'getRecordingState').
 * @param {object} options - Données optionnelles à envoyer avec le message.
 * @param {function} callback - Fonction à exécuter à la réception de la réponse.
 */
function sendMessageToActiveTab(action, options, callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs.length) {
            chrome.tabs.sendMessage(tabs[0].id, { action: action, options: options }, function(response) {
                if (chrome.runtime.lastError) {
                    console.error("Erreur lors de l'envoi du message au content script:", chrome.runtime.lastError);
                    popupStatus.textContent = 'Erreur de communication.';
                } else {
                    console.log("Message envoyé:", action, response);
                    if (callback) callback(response);
                }
            });
        }
    });
}

// Gestion du clic sur le bouton start/stop
popupStartStopButton.addEventListener('click', function() {
    // Demande l'état actuel de l'enregistrement dans l'onglet actif
    sendMessageToActiveTab("getRecordingState", null, function(response) {
        if (response && response.isRecording) {
            // Si enregistrement en cours, envoyer la commande d'arrêt
            sendMessageToActiveTab('stopRecording');
            updateButtonText(false);
            popupStatus.textContent = '';
        } else {
            // Sinon, démarrer l'enregistrement
            startRecording();
        }
    });
});

popupStartButton.addEventListener('click', function() {
    startRecording();
});

popupStopButton.addEventListener('click', function() {
    sendMessageToActiveTab('stopRecording');
    console.log('Arrêt de l\'enregistrement');
    updateButtonText(false);
});

/**
 * Démarre l'enregistrement en récupérant les options depuis le popup.
 */
function startRecording() {
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
        telegramChatId: popupTelegramChatIdInput.value
    };
    sendMessageToActiveTab('startRecording', options, function(response) {
        updateButtonText(true);
        popupStatus.textContent = 'Enregistrement en cours...';
    });
}

/**
 * Charge les options depuis chrome.storage.sync et les affecte aux champs du popup.
 */
function loadPopupOptions() {
    chrome.storage.sync.get({
        videoSelector: 'video',
        segmentDuration: 5,
        recordDuration: 5,
        enableLocalSave: false,
        enableSegmentLocalSave: false,
        enableTelegramSave: false,
        enableSegmentTelegramSave: false,
        localServerUrl: 'http://localhost:3000/upload.php',
        telegramBotToken: '',
        telegramChatId: ''
    }, function(items) {
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
        telegramChatId: popupTelegramChatIdInput.value
    }, function() {
        console.log('Options du popup sauvegardées.');
    });
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', function() {
    loadPopupOptions();
    // Vérifie l'état de l'enregistrement dans l'onglet actif dès l'ouverture du popup
    sendMessageToActiveTab("getRecordingState", null, function(response) {
        updateButtonText(response && response.isRecording);
    });
});

// Sauvegarder les options dès qu'un champ est modifié
popupVideoSelectorInput.addEventListener('change', savePopupOptions);
popupSegmentDurationInput.addEventListener('change', savePopupOptions);
popupRecordDurationInput.addEventListener('change', savePopupOptions);
popupEnableLocalSaveCheckbox.addEventListener('change', savePopupOptions);
popupEnableSegmentLocalSaveCheckbox.addEventListener('change', savePopupOptions);
popupEnableTelegramSaveCheckbox.addEventListener('change', savePopupOptions);
popupEnableSegmentTelegramSaveCheckbox.addEventListener('change', savePopupOptions);
popupLocalServerUrlInput.addEventListener('change', savePopupOptions);
popupTelegramBotTokenInput.addEventListener('change', savePopupOptions);
popupTelegramChatIdInput.addEventListener('change', savePopupOptions);
