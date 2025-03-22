/* background.js */

// --- Global variable to store recording options ---
// This is used to pass options from the options page to the content script when starting recording.
let currentRecordingOptions = null;

/**
 * Function to be injected into the content script to start recording.
 * It will forward the 'startRecording' action and options to the content script itself.
 *
 * IMPORTANT: This function runs in the content script's scope, not in background.js!
 * Therefore, it cannot directly access background.js variables.
 */
function startContentRecording(options) {
    chrome.runtime.sendMessage({ action: "contentStartRecording", options: options }, function(response) {
        if (chrome.runtime.lastError) {
            console.error("Erreur lors de l'envoi du message de démarrage d'enregistrement au script de contenu:", chrome.runtime.lastError);
        } else {
            console.log("Message de démarrage d'enregistrement envoyé au script de contenu:", response ? response : '');
        }
    });
}

/**
 * Function to be injected into the content script to stop recording.
 * It will forward the 'stopRecording' action to the content script itself.
 *
 * IMPORTANT: This function runs in the content script's scope, not in background.js!
 * Therefore, it cannot directly access background.js variables.
 */
function stopContentRecording() {
    chrome.runtime.sendMessage({ action: "contentStopRecording" }, function(response) {
        if (chrome.runtime.lastError) {
            console.error("Erreur lors de l'envoi du message d'arrêt d'enregistrement au script de contenu:", chrome.runtime.lastError);
        } else {
            console.log("Message d'arrêt d'enregistrement envoyé au script de contenu:", response ? response : '');
        }
    });
}


// --- Message Listener ---
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    console.log("Message reçu dans le background script:", message, sender);

    if (message.action === "startRecording") {
        // 1. Retrieve options from the message
        currentRecordingOptions = message.options; // Store options globally in background script

        // 2. Inject function 'startContentRecording' into the active tab's content script
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs && tabs.length > 0) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    function: startContentRecording, // Function to inject (defined above)
                    args: [currentRecordingOptions] // Arguments to pass to the function
                }, function() {
                    if (chrome.runtime.lastError) {
                        console.error("Erreur lors de l'injection de startContentRecording:", chrome.runtime.lastError);
                    } else {
                        console.log("Fonction startContentRecording injectée et exécutée dans le script de contenu.");
                    }
                });
            } else {
                console.warn("Aucun onglet actif trouvé pour démarrer l'enregistrement.");
            }
        });
        sendResponse({status: 'starting'}); // Send response back to options page (optional feedback)
        return true; // Indicate that sendResponse will be used asynchronously (important for service workers)


    } else if (message.action === "stopRecording") {
        // 1. Inject function 'stopContentRecording' into the active tab's content script
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs && tabs.length > 0) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    function: stopContentRecording // Function to inject (defined above)
                }, function() {
                    if (chrome.runtime.lastError) {
                        console.error("Erreur lors de l'injection de stopContentRecording:", chrome.runtime.lastError);
                    } else {
                        console.log("Fonction stopContentRecording injectée et exécutée dans le script de contenu.");
                    }
                });
            } else {
                console.warn("Aucun onglet actif trouvé pour arrêter l'enregistrement.");
            }
        });
        sendResponse({status: 'stopping'}); // Send response back to options page (optional feedback)
        return true; // Indicate that sendResponse will be used asynchronously (important for service workers)

    }

    // --- Example of handling other messages (if needed later) ---
    // else if (message.action === "someOtherAction") {
    //     // Handle some other action
    //     sendResponse({status: 'handledOtherAction'});
    //     return true;
    // }

    if (message.action === "contentRecordingStarted") {
        console.log("Message 'contentRecordingStarted' reçu du script de contenu!"); // <-- Log dans background.js
    }

    return false; // Indicate that sendResponse will not be used (for messages not expecting a response)
});