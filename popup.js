/* popup.js */

const popupStartStopButton = document.getElementById('popupStartStopButton');
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


let isRecording = false; // Track recording state in popup

function updateButtonText() {
    popupStartStopButton.textContent = isRecording ? 'Arrêter l\'Enregistrement' : 'Démarrer l\'Enregistrement';
}

/*popupStartStopButton.addEventListener('click', function() {
    if (!isRecording) {
        // Start recording
        const options = { // Gather ALL options from the popup form
            videoSelector: popupVideoSelectorInput.value,
            segmentDuration: parseInt(popupSegmentDurationInput.value, 10) * 60 * 1000, // Convert minutes to milliseconds
            recordDuration: parseInt(popupRecordDurationInput.value, 10) * 60 * 60 * 1000, // Convert hours to milliseconds
            enableSendLocal: popupEnableLocalSaveCheckbox.checked,
            enableSendSegmentLocal: popupEnableSegmentLocalSaveCheckbox.checked,
            enableTelegramSave: popupEnableTelegramSaveCheckbox.checked,
            enableSendSegmentTelegram: popupEnableSegmentTelegramSaveCheckbox.checked,
            localServerUrl: popupLocalServerUrlInput.value,
            telegramBotToken: popupTelegramBotTokenInput.value,
            telegramChatId: popupTelegramChatIdInput.value
        };
        sendMessageToBackground('startRecording', options);
        isRecording = true;
        popupStatus.textContent = 'Enregistrement en cours...'; // Optional status update
    } else {
        // Stop recording
        sendMessageToBackground('stopRecording');
        isRecording = false;
        popupStatus.textContent = ''; // Clear status on stop
    }
    updateButtonText();
});*/

popupStartStopButton.addEventListener('click', function() {
    if (!isRecording) {
        // Start recording
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) { // Get active tab
            if (tabs && tabs.length > 0) {
                const activeTab = tabs[0];

                const options = { // Gather ALL options from the popup form
                    videoSelector: popupVideoSelectorInput.value,
                    segmentDuration: parseInt(popupSegmentDurationInput.value, 10) * 60 * 1000, // Convert minutes to milliseconds
                    recordDuration: parseInt(popupRecordDurationInput.value, 10) * 60 * 60 * 1000, // Convert hours to milliseconds
                    enableSendLocal: popupEnableLocalSaveCheckbox.checked,
                    enableSendSegmentLocal: popupEnableSegmentLocalSaveCheckbox.checked,
                    enableTelegramSave: popupEnableTelegramSaveCheckbox.checked,
                    enableSendSegmentTelegram: popupEnableSegmentTelegramSaveCheckbox.checked,
                    localServerUrl: popupLocalServerUrlInput.value,
                    telegramBotToken: popupTelegramBotTokenInput.value,
                    telegramChatId: popupTelegramChatIdInput.value,
                    tabId: activeTab.id // Send tabId to background script
                };
                sendMessageToBackground('startRecording', options);
                // isRecording state is updated by background script via updatePopupDisplay message

                popupStatus.textContent = 'Enregistrement en cours...'; // Optional status update
                updateButtonText();
            } else {
                console.warn("Aucun onglet actif trouvé pour démarrer l'enregistrement.");
                popupStatus.textContent = 'Erreur: Aucun onglet actif.';
            }
        });

    } else {
        // Stop recording
        sendMessageToBackground('stopRecording');
        // isRecording state is updated by background script via updatePopupDisplay message
        popupStatus.textContent = ''; // Clear status on stop
        updateButtonText();
    }
});

/**
 * Sends a message to the background script.
 * @param {string} action - The action to send (e.g., 'startRecording', 'stopRecording').
 * @param {object} options - Optional data to send with the message (for startRecording with popup options).
 */
function sendMessageToBackground(action, options) {
    chrome.runtime.sendMessage({ action: action, options: options }, function(response) {
        if (chrome.runtime.lastError) {
            console.error("Erreur lors de l'envoi du message au background script:", chrome.runtime.lastError);
            popupStatus.textContent = 'Erreur de communication.'; // Update status on error
        } else {
            console.log("Message envoyé au background script:", action, response ? response : '', response);
            // Handle response from background script if needed
        }
    });
}


/**
 * Loads options from chrome.storage.sync and populates the popup form fields.
 */
function loadPopupOptions() {
    chrome.storage.sync.get({ // Get ALL options, same as in options.js
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
 * Saves popup options to chrome.storage.sync.
 */
function savePopupOptions() {
    chrome.storage.sync.set({ // Save ALL options, same as in options.js
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
    loadPopupOptions(); // Load options when popup is opened

    // Request recording state from background script on popup load
    chrome.runtime.sendMessage({ action: "getRecordingState" }, function(response) {
        if (response && response.isRecording !== undefined) {
            isRecording = response.isRecording; // Update popup's isRecording from background state
            updateButtonText(); // Update button text based on background recording state
            if (isRecording) { // Restore status text if recording was ongoing
                popupStatus.textContent = 'Enregistrement en cours...';
            }
        }
    });
});

// Save options when any input value changes in the popup form
popupOptionsForm.addEventListener('change', savePopupOptions); // Save all options on form change

// Save options when any input value changes in the popup form
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


// Initialize button text on popup load
updateButtonText();


/**
 * Function called by background script to update the popup display based on recording state.
 * This function is called from background.js's updatePopupUI function.
 * @param {boolean} recordingActive - The current recording state from background script.
 */
function updatePopupDisplay(recordingActive) {
    isRecording = recordingActive; // Update popup's local isRecording to match background state
    updateButtonText(); // Update button text to reflect new state
    if (isRecording) {
        popupStatus.textContent = 'Enregistrement en cours...'; // Restore status text if recording started elsewhere
    } else {
        popupStatus.textContent = ''; // Clear status text if recording stopped elsewhere
    }
}