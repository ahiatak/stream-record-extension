/* options.js */

// --- Constants for form element IDs ---
const videoSelectorInput = document.getElementById('videoSelector');
const segmentDurationInput = document.getElementById('segmentDuration');
const recordDurationInput = document.getElementById('recordDuration');
const enableLocalSaveCheckbox = document.getElementById('enableLocalSave');
const enableSegmentLocalSaveCheckbox = document.getElementById('enableSegmentLocalSave');
const enableTelegramSaveCheckbox = document.getElementById('enableTelegramSave');
const enableSegmentTelegramSaveCheckbox = document.getElementById('enableSegmentTelegramSave');
const localServerUrlInput = document.getElementById('localServerUrl');
const telegramBotTokenInput = document.getElementById('telegramBotToken');
const telegramChatIdInput = document.getElementById('telegramChatId');
const startStopButton = document.getElementById('startStopButton');
const optionsForm = document.getElementById('options-form'); // Form element

// --- Functions ---

/**
 * Loads options from chrome.storage.sync and populates the form fields.
 */
function loadOptions() {
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
        videoSelectorInput.value = items.videoSelector;
        segmentDurationInput.value = items.segmentDuration;
        recordDurationInput.value = items.recordDuration;
        enableLocalSaveCheckbox.checked = items.enableLocalSave;
        enableSegmentLocalSaveCheckbox.checked = items.enableSegmentLocalSave;
        enableTelegramSaveCheckbox.checked = items.enableTelegramSave;
        enableSegmentTelegramSaveCheckbox.checked = items.enableSegmentTelegramSave;
        localServerUrlInput.value = items.localServerUrl;
        telegramBotTokenInput.value = items.telegramBotToken;
        telegramChatIdInput.value = items.telegramChatId;
    });
}

/**
 * Saves options to chrome.storage.sync.
 */
function saveOptions() {
    chrome.storage.sync.set({
        videoSelector: videoSelectorInput.value,
        segmentDuration: parseInt(segmentDurationInput.value, 10),
        recordDuration: parseInt(recordDurationInput.value, 10),
        enableLocalSave: enableLocalSaveCheckbox.checked,
        enableSegmentLocalSave: enableSegmentLocalSaveCheckbox.checked,
        enableTelegramSave: enableTelegramSaveCheckbox.checked,
        enableSegmentTelegramSave: enableSegmentTelegramSaveCheckbox.checked,
        localServerUrl: localServerUrlInput.value,
        telegramBotToken: telegramBotTokenInput.value,
        telegramChatId: telegramChatIdInput.value
    }, function() {
        // Optional: You can add a status message to indicate options saved successfully.
        // For simplicity, we'll skip it in this example.
        console.log('Options sauvegardées.');
    });
}

/**
 * Sends a message to the background script.
 * @param {string} action - The action to send (e.g., 'startRecording', 'stopRecording').
 * @param {object} options - Optional data to send with the message.
 */
function sendMessageToBackground(action, options) {
    chrome.runtime.sendMessage({ action: action, options: options }, function(response) {
        if (chrome.runtime.lastError) {
            console.error("Erreur lors de l'envoi du message au background script:", chrome.runtime.lastError);
        } else {
            console.log("Message envoyé au background script:", action, response ? response : '');
            // Handle response from background script if needed
        }
    });
}

// --- Event Listeners ---

// When the options page is loaded, load saved options.
document.addEventListener('DOMContentLoaded', loadOptions);

// Save options when any input value changes (you can optimize this to save on form submit if needed)
videoSelectorInput.addEventListener('change', saveOptions);
segmentDurationInput.addEventListener('change', saveOptions);
recordDurationInput.addEventListener('change', saveOptions);
enableLocalSaveCheckbox.addEventListener('change', saveOptions);
enableSegmentLocalSaveCheckbox.addEventListener('change', saveOptions);
enableTelegramSaveCheckbox.addEventListener('change', saveOptions);
enableSegmentTelegramSaveCheckbox.addEventListener('change', saveOptions);
localServerUrlInput.addEventListener('change', saveOptions);
telegramBotTokenInput.addEventListener('change', saveOptions);
telegramChatIdInput.addEventListener('change', saveOptions);


// --- Button Logic and Event Listener ---
let isRecording = false; // Keep track of recording state in options page (can be synced with background if needed for more robust state management)

function updateButtonText() {
    startStopButton.textContent = isRecording ? 'Arrêter l\'Enregistrement' : 'Démarrer l\'Enregistrement';
}

startStopButton.addEventListener('click', function() {
    if (!isRecording) {
        // Start recording
        const options = { // Gather options from the form to send to content script via background
            videoSelector: videoSelectorInput.value,
            segmentDuration: parseInt(segmentDurationInput.value, 10) * 60 * 1000, // Convert minutes to milliseconds
            recordDuration: parseInt(recordDurationInput.value, 10) * 60 * 60 * 1000, // Convert hours to milliseconds
            enableSendLocal: enableLocalSaveCheckbox.checked,
            enableSendSegmentLocal: enableSegmentLocalSaveCheckbox.checked,
            enableTelegramSave: enableTelegramSaveCheckbox.checked,
            enableSendSegmentTelegram: enableSegmentTelegramSaveCheckbox.checked,
            localServerUrl: localServerUrlInput.value,
            telegramBotToken: telegramBotTokenInput.value,
            telegramChatId: telegramChatIdInput.value
        };
        sendMessageToBackground('startRecording', options);
        isRecording = true;
    } else {
        // Stop recording
        sendMessageToBackground('stopRecording');
        isRecording = false;
    }
    updateButtonText();
});

// Initialize button text on page load
updateButtonText();