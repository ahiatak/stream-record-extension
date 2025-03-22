/* content.js */

// --- Global variables (configurable via options) ---
let videoSelector = 'video'; // Default video selector, configurable via options
let SEGMENT_DURATION = 5 * 60 * 1000; // 5 minutes per segment (default), configurable in milliseconds
let RECORD_DURATION = 5 * 60 * 60 * 1000; // 5 hours total record time (default), configurable in milliseconds
let ENABLE_SEND_LOCAL = false; // Default, configurable via options
let ENABLE_SEND_SEGMENT_LOCAL = false; // Default, configurable via options
let ENABLE_SEND_TELEGRAM = false; // Default, configurable via options
let ENABLE_SEND_SEGMENT_TELEGRAM = false; // Default, configurable via options
let LOCAL_SERVER_URL = "http://localhost:3000/upload.php"; // Default, configurable via options
let TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN"; // Default, configurable via options
let TELEGRAM_CHAT_ID = "YOUR_TELEGRAM_CHAT_ID"; // Default, configurable via options

// --- Global variables (internal state) ---
let videoElement = null; // Will be set by `findVideoElement`
let mediaRecorder;
let isRecording = false;
let expectedStop = false;
let fileWriter = null;
let fileSystemRejected = false;
let db;
let useIndexedDB = false;
let collectedSegments = [];

/**
 * [Module 4 Étape 4.1 - Modularization]
 * Function to find the video element based on the configured selector.
 * @returns {HTMLVideoElement|null} The video element or null if not found.
 */
function findVideoElement() {
    return document.querySelector(videoSelector);
}

/**
 * [Module 4 Étape 4.1 - Modularization]
 * Authorizes iframes within the document.
 */
function authorizeIframes() {
    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
        iframe.setAttribute(
            "sandbox",
            "allow-same-origin allow-scripts allow-popups allow-forms allow-downloads allow-pointer-lock allow-top-navigation"
        );
        iframe.setAttribute(
            "allow",
            [
                "accelerometer",
                "autoplay",
                "clipboard-write",
                "encrypted-media",
                "gyroscope",
                "picture-in-picture",
                "web-share",
            ].join("; ")
        );
    });
    console.log("Toutes les iframes ont été autorisées avec les permissions maximales.");
}

/**
 * [Module 4 Étape 4.1 - Modularization]
 * Replaces iframes with custom versions to force reload.
 */
function replaceIframesWithCustom() {
    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((oldIframe) => {
        const newIframe = document.createElement("iframe");
        newIframe.src = oldIframe.src;
        if (oldIframe.id) {
            newIframe.id = oldIframe.id;
        }
        if (oldIframe.className) {
            newIframe.className = oldIframe.className;
        }
        newIframe.setAttribute(
            "sandbox",
            "allow-same-origin allow-scripts allow-popups allow-forms allow-downloads allow-pointer-lock allow-top-navigation"
        );
        newIframe.setAttribute(
            "allow",
            [
                "accelerometer",
                "autoplay",
                "clipboard-write",
                "encrypted-media",
                "gyroscope",
                "picture-in-picture",
                "web-share",
            ].join("; ")
        );
        oldIframe.parentNode.insertBefore(newIframe, oldIframe.nextSibling);
        setTimeout(() => {
            newIframe.src = newIframe.src;
        }, 100);
    });
    console.log("Toutes les iframes ont été remplacées et rechargées.");
}

/**
 * [Module 4 Étape 4.1 - Modularization]
 * Initializes file writer using File System Access API.
 */
async function initFileWriter() {
    if (fileWriter || fileSystemRejected) {
        return;
    }
    if ("showSaveFilePicker" in window) {
        const opts = {
            types: [
                {
                    description: "Enregistrement vidéo",
                    accept: { "video/webm": [".webm"] },
                },
            ],
        };
        try {
            const handle = await window.showSaveFilePicker(opts);
            fileWriter = await handle.createWritable();
            console.log("Fichier ouvert pour écriture via File System Access.");
        } catch (error) {
            console.error("Erreur lors de l'ouverture du fichier avec File System Access :", error);
            console.warn("Basculement sur IndexedDB pour stocker les segments.");
            fileSystemRejected = true;
            await initDB();
            useIndexedDB = true;
        }
    } else {
        console.warn("File System Access API non supportée. Utilisation d'IndexedDB.");
        await initDB();
        useIndexedDB = true;
    }
}

/**
 * [Module 4 Étape 4.1 - Modularization]
 * Initializes or opens IndexedDB.
 */
function initDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve();
            return;
        }
        const request = indexedDB.open("videoRecordingDB", 1);
        request.onerror = (event) => {
            console.error("Erreur lors de l'ouverture d'IndexedDB :", event);
            reject(`IndexedDB error: ${event.target.error}`);
        };
        request.onsuccess = (event) => {
            db = event.target.result;
            console.log("IndexedDB initialisée.");
            resolve();
        };
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains("segments")) {
                db.createObjectStore("segments", { autoIncrement: true });
            }
        };
    });
}

/**
 * [Module 4 Étape 4.1 - Modularization]
 * Adds a segment to IndexedDB.
 * @param {Blob} blob - The segment blob to add.
 */
function addSegment(blob) {
    if (!db) {
        console.error("Base de données IndexedDB non initialisée.");
        return;
    }
    const transaction = db.transaction(["segments"], "readwrite");
    const store = transaction.objectStore("segments");
    store.add(blob);
}

/**
 * [Module 4 Étape 4.1 - Modularization]
 * Retrieves all segments from IndexedDB.
 * @returns {Promise<Blob[]>} A promise that resolves with an array of segment blobs.
 */
function getAllSegments() {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject("Base de données IndexedDB non initialisée.");
            return;
        }
        const transaction = db.transaction(["segments"], "readonly");
        const store = transaction.objectStore("segments");
        const request = store.getAll();
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(`Erreur lors de la récupération des segments IndexedDB: ${event.target.error}`);
    });
}

/**
 * [Module 4 Étape 4.1 - Modularization]
 * Clears all segments from IndexedDB.
 */
function clearSegments() {
    if (!db) {
        console.warn("Base de données IndexedDB non initialisée, l'effacement est ignoré.");
        return;
    }
    const transaction = db.transaction(["segments"], "readwrite");
    const store = transaction.objectStore("segments");
    store.clear();
}

/**
 * [Module 4 Étape 4.1 - Modularization]
 * Sends a video segment to the local server.
 * @param {Blob} blob - The segment blob to send.
 */
async function sendToLocalServer(blob) {
    if (!ENABLE_SEND_LOCAL && !ENABLE_SEND_SEGMENT_LOCAL) return;

    createUploadProgressBar();
    const formData = new FormData();
    formData.append("video", blob, "segment.webm");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", LOCAL_SERVER_URL, true);

    xhr.upload.onprogress = function (event) {
        if (event.lengthComputable) {
            let percentComplete = (event.loaded / event.total) * 100;
            document.getElementById("uploadProgress").value = percentComplete;
            document.getElementById("uploadPercentage").innerText = Math.round(percentComplete) + "%";
        }
    };

    xhr.onload = function () {
        if (xhr.status === 200) {
            console.log("Segment envoyé avec succès au serveur local !");
            document.getElementById("uploadProgress").value = 100;
            document.getElementById("uploadPercentage").innerText = "Terminé !";
            setTimeout(() => {
                document.getElementById("uploadProgressContainer")?.remove();
            }, 3000);
        } else {
            console.error("Erreur d'envoi au serveur local:", xhr.status, xhr.statusText);
        }
    };

    xhr.onerror = function () {
        console.error("Erreur réseau lors de l'envoi du fichier au serveur local.");
    };

    try {
        xhr.send(formData);
    } catch (error) {
        console.error("Erreur lors de l'envoi XHR au serveur local :", error);
        document.getElementById("uploadPercentage").innerText = "Erreur d'envoi";
    }
}

/**
 * [Module 4 Étape 4.1 - Modularization]
 * Sends a video segment via Telegram Bot API.
 * @param {Blob} blob - The segment blob to send.
 */
async function sendToTelegram(blob) {
    if (!ENABLE_SEND_TELEGRAM && !ENABLE_SEND_SEGMENT_TELEGRAM) return;
    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === "YOUR_TELEGRAM_BOT_TOKEN" || !TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID === "YOUR_TELEGRAM_CHAT_ID") {
        console.warn("Token Telegram ou Chat ID non configuré. Envoi Telegram ignoré.");
        return;
    }

    createUploadProgressBar();
    const formData = new FormData();
    formData.append("chat_id", TELEGRAM_CHAT_ID);
    formData.append("document", blob, "segment.webm");

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, true);

        xhr.upload.onprogress = function (event) {
            if (event.lengthComputable) {
                let percentComplete = (event.loaded / event.total) * 100;
                document.getElementById("uploadProgress").value = percentComplete;
                document.getElementById("uploadPercentage").innerText = Math.round(percentComplete) + "%";
            }
        };

        xhr.onload = function () {
            if (xhr.status === 200) {
                console.log("Segment envoyé vers Telegram.", JSON.parse(xhr.responseText));
                document.getElementById("uploadProgress").value = 100;
                document.getElementById("uploadPercentage").innerText = "Terminé !";
                setTimeout(() => document.getElementById("uploadProgressContainer")?.remove(), 3000);
                resolve(JSON.parse(xhr.responseText));
            } else {
                console.error("Erreur d'envoi Telegram:", xhr.status, xhr.statusText, xhr.responseText);
                document.getElementById("uploadPercentage").innerText = "Erreur d'envoi";
                reject(`Telegram send error: ${xhr.status} ${xhr.statusText}`);
            }
        };

        xhr.onerror = function () {
            console.error("Erreur réseau lors de l'envoi du fichier vers Telegram.");
            document.getElementById("uploadPercentage").innerText = "Erreur réseau";
            reject("Erreur réseau Telegram");
        };

        try {
            xhr.send(formData);
        } catch (error) {
            console.error("Erreur lors de l'envoi XHR vers Telegram :", error);
            document.getElementById("uploadPercentage").innerText = "Erreur d'envoi";
            reject(`XHR Error Telegram: ${error}`);
        }
    });
}

/**
 * [Module 4 Étape 4.1 - Modularization]
 * Starts the video recording, segmenting the stream.
 */
async function startRecordingFunction() {
    videoElement = findVideoElement(); // Find video element each time to account for dynamic pages
    if (!videoElement) {
        console.error("Aucun élément vidéo trouvé avec le sélecteur :", videoSelector);
        return;
    }
    if (!videoElement.captureStream) {
        console.error("La capture du flux vidéo n'est pas supportée par cet élément vidéo.");
        return;
    }

    expectedStop = false;
    await initFileWriter();
    collectedSegments = []; // Reset segments array on each start

    try {
        const stream = videoElement.captureStream();
        mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm; codecs=vp9" });
        isRecording = true;
        console.log("Enregistrement démarré...");

        mediaRecorder.ondataavailable = async (event) => {
            if (event.data && event.data.size > 0) {
                collectedSegments.push(event.data); // Store segment for full blob reconstruction
                if (fileWriter && !useIndexedDB) {
                    try {
                        await fileWriter.write(event.data);
                        console.log("Segment écrit sur disque via File System Access.");
                    } catch (err) {
                        console.error("Erreur d'écriture avec File System Access :", err);
                        await initDB();
                        useIndexedDB = true;
                        addSegment(event.data);
                        console.log("Segment stocké dans IndexedDB (fallback).");
                    }
                } else if (useIndexedDB) {
                    addSegment(event.data);
                    console.log("Segment stocké dans IndexedDB.");
                } else {
                    console.warn("Aucun système de sauvegarde configuré (File System Access ou IndexedDB). Segment perdu.");
                }

                if (ENABLE_SEND_SEGMENT_LOCAL) {
                    sendToLocalServer(event.data);
                }
                if (ENABLE_SEND_SEGMENT_TELEGRAM) {
                    sendToTelegram(event.data);
                }
            }
        };

        mediaRecorder.onerror = (error) => {
            console.error("Erreur MediaRecorder :", error);
            isRecording = false;
            if (!expectedStop) {
                console.warn("Redémarrage de l'enregistrement après erreur MediaRecorder...");
                restartRecordingFunction();
            }
        };

        mediaRecorder.onstop = async () => {
            console.log("MediaRecorder a stoppé.");
            isRecording = false;
            if (expectedStop) {
                if (fileWriter && !useIndexedDB) {
                    try {
                        await fileWriter.close();
                        console.log("Fichier fermé après arrêt volontaire.");
                        if (collectedSegments.length > 0) {
                            const fullBlob = new Blob(collectedSegments, { type: "video/webm" });
                            if (ENABLE_SEND_LOCAL) {
                                console.log("Envoi du fichier complet vers le serveur local...");
                                await sendToLocalServer(fullBlob);
                            }
                            if (ENABLE_SEND_TELEGRAM) {
                                console.log("Envoi du fichier complet vers Telegram...");
                                await sendToTelegram(fullBlob);
                            }
                        } else {
                            console.warn("Aucun segment enregistré pour créer le fichier complet.");
                        }
                    } catch (err) {
                        console.error("Erreur lors de la fermeture du fichier :", err);
                    }
                } else if (useIndexedDB) {
                    try {
                        const segments = await getAllSegments();
                        if (segments && segments.length > 0) {
                            const fullBlob = new Blob(segments, { type: "video/webm" });
                            downloadRecording(segments);
                            if (ENABLE_SEND_LOCAL) {
                                console.log("Envoi de la vidéo complète vers le serveur local...");
                                await sendToLocalServer(fullBlob);
                            }
                            if (ENABLE_SEND_TELEGRAM) {
                                console.log("Envoi de la vidéo complète vers Telegram...");
                                await sendToTelegram(fullBlob);
                            }
                        } else {
                            console.warn("Aucun segment récupéré d'IndexedDB pour créer le fichier complet.");
                        }
                        clearSegments();
                    } catch (err) {
                        console.error("Erreur lors de la récupération des segments d'IndexedDB :", err);
                    }
                }
            } else {
                if (!expectedStop) {
                    console.warn("Enregistrement arrêté de manière inattendue (onstop non volontaire), redémarrage...");
                    restartRecordingFunction();
                }
            }
        };

        mediaRecorder.start(SEGMENT_DURATION);

    } catch (error) {
        console.error("Erreur lors du démarrage de l'enregistrement :", error);
        isRecording = false;
    }
}

/**
 * [Module 4 Étape 4.1 - Modularization]
 * Restarts recording after a short delay.
 */
function restartRecordingFunction() {
    setTimeout(() => {
        if (videoElement && !videoElement.paused) {
            startRecordingFunction();
        } else {
            console.warn("La vidéo n'est plus en lecture, redémarrage différé...");
            videoElement.play().catch((err) => console.error("Impossible de démarrer la vidéo pour redémarrage :", err));
            if (!videoElement.paused) {
                startRecordingFunction();
            } else {
                videoElement.addEventListener("playing", function onPlayingRestart() {
                    if (!isRecording) startRecordingFunction();
                    videoElement.removeEventListener("playing", onPlayingRestart);
                });
            }
        }
    }, 1000);
}

/**
 * [Module 4 Étape 4.1 - Modularization]
 * Stops the recording in a controlled manner.
 */
async function stopRecordingFunction() {
    if (mediaRecorder && isRecording) {
        expectedStop = true;
        try {
            mediaRecorder.stop();
            console.log("Enregistrement arrêté volontairement.");
        } catch (error) {
            console.error("Erreur lors de l'arrêt de MediaRecorder :", error);
            isRecording = false;
        } finally {
            isRecording = false;
        }
    } else {
        console.warn("stopRecording appelé alors qu'aucun enregistrement n'est en cours ou MediaRecorder non initialisé.");
    }
}

/**
 * [Module 4 Étape 4.1 - Modularization]
 * Combines segments into a blob and triggers download.
 * @param {Blob[]} segments - Array of segment blobs.
 */
function downloadRecording(segments) {
    if (!segments || segments.length === 0) {
        console.warn("Aucun segment à télécharger.");
        return;
    }
    console.log("Combinaison des segments et préparation du téléchargement...");
    const blob = new Blob(segments, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "block";
    a.href = url;
    a.textContent = "Télécharger l'enregistrement";
    a.download = "video_recording.webm";
    document.body.prepend(a);
    a.click();
    URL.revokeObjectURL(url);
    console.log("Téléchargement lancé.");
}

/**
 * [Module 4 Étape 4.1 - Modularization]
 * Creates and displays an upload progress bar.
 */
function createUploadProgressBar() {
    if (document.getElementById("uploadProgressContainer")) return;
    const container = document.createElement("div");
    container.id = "uploadProgressContainer";
    container.style.position = "fixed";
    container.style.bottom = "10px";
    container.style.left = "50%";
    container.style.transform = "translateX(-50%)";
    container.style.width = "300px";
    container.style.padding = "10px";
    container.style.background = "rgba(0, 0, 0, 0.7)";
    container.style.color = "white";
    container.style.borderRadius = "5px";
    container.style.textAlign = "center";
    container.style.boxShadow = "0px 0px 10px rgba(0, 0, 0, 0.3)";

    const percentageText = document.createElement("span");
    percentageText.id = "uploadPercentage";
    percentageText.innerText = "0%";
    percentageText.style.display = "block";
    percentageText.style.marginBottom = "5px";

    const progressBar = document.createElement("progress");
    progressBar.id = "uploadProgress";
    progressBar.value = 0;
    progressBar.max = 100;
    progressBar.style.width = "100%";

    container.appendChild(percentageText);
    container.appendChild(progressBar);
    videoElement.parentNode.insertBefore(container, videoElement.nextSibling);
}

/**
 * [Module 4 Étape 4.1 - Modularization]
 * Monitors video and window events to ensure recording continuity.
 */
function monitorVideoState() {
    if (!videoElement) {
        console.error("Élément vidéo non disponible pour la surveillance d'état.");
        return;
    }
    videoElement.addEventListener("pause", () => {
        console.warn("Vidéo mise en pause. L'enregistrement continue en arrière-plan...");
    });
    videoElement.addEventListener("ended", () => {
        console.warn("Vidéo terminée. L'enregistrement continue si le flux est actif...");
    });
    videoElement.addEventListener("stalled", () => {
        console.warn("Problème de connexion détecté. Tentative de reprise de la lecture vidéo...");
        videoElement.play().catch((err) => console.error("Impossible de relancer la vidéo après un 'stalled' :", err));
    });
    videoElement.addEventListener("playing", function onPlayingMonitor() {
        if (!isRecording) {
            console.log("Vidéo en lecture. Démarrage de l'enregistrement depuis le monitor...");
            startRecordingFunction();
        }
        videoElement.removeEventListener("playing", onPlayingMonitor);
    });
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && !isRecording && !videoElement.paused) {
            console.log("Onglet visible et vidéo en lecture. Vérification de l'enregistrement depuis visibilitychange...");
            startRecordingFunction();
        }
    });
    window.addEventListener("online", () => {
        console.log("Connexion rétablie. Vérification du redémarrage de l'enregistrement...");
        if (!isRecording && !videoElement.paused) startRecordingFunction();
    });
}

/**
 * [Module 4 Étape 4.1 - Modularization & Export for Background Script]
 * --- Functions Exported for Background Script ---
 * These functions are called by the background script using chrome.scripting.executeScript.
 */

/**
 * [Module 4 Étape 4.1 - Export for Background Script]
 * Function to start content recording, called from background script.
 * @param {object} options - Recording options passed from background script.
 */
function contentStartRecording(options) {
    try {
        console.log("contentStartRecording CALLED"); // <-- Log très simple
        chrome.runtime.sendMessage({action: "contentRecordingStarted"}, function(response) { // <-- Réponse basique
            console.log("Response sent from contentStartRecording", response);
        });
        
        console.log("contentStartRecording appelée avec les options:", options);
        // 1. Configure global variables using options received from background script
        videoSelector = options.videoSelector;
        SEGMENT_DURATION = options.segmentDuration;
        RECORD_DURATION = options.recordDuration;
        ENABLE_SEND_LOCAL = options.enableSendLocal;
        ENABLE_SEND_SEGMENT_LOCAL = options.enableSendSegmentLocal;
        ENABLE_SEND_TELEGRAM = options.enableTelegramSave;
        ENABLE_SEND_SEGMENT_TELEGRAM = options.enableSendSegmentTelegram;
        LOCAL_SERVER_URL = options.localServerUrl;
        TELEGRAM_BOT_TOKEN = options.telegramBotToken;
        TELEGRAM_CHAT_ID = options.telegramChatId;

        // 2. Start the recording process
        videoElement = findVideoElement(); // Find video element based on selector
        if (!videoElement) {
            console.error("Élément vidéo non trouvé avec le sélecteur :", videoSelector);
            return;
        }
        videoElement.play().catch(err => console.error("Impossible de démarrer la vidéo au lancement :", err));
        if (!videoElement.paused) {
            startRecordingFunction();
        } else {
            videoElement.addEventListener("playing", function onPlayingMain() {
                if (!isRecording) startRecordingFunction();
                videoElement.removeEventListener("playing", onPlayingMain);
            });
        }
        monitorVideoState();
        setTimeout(() => {
            stopRecordingFunction();
        }, RECORD_DURATION);
    } catch (error) {
        console.error("Erreur dans contentStartRecording:", error);
        // Vous pourriez éventuellement envoyer un message d'erreur au background script ici
    }
}

/**
 * [Module 4 Étape 4.1 - Export for Background Script]
 * Function to stop content recording, called from background script.
 */
function contentStopRecording() {
    console.log("contentStopRecording appelée");
    stopRecordingFunction();
}


// --- Message Listener in content.js ---
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    console.log("Message reçu dans le script de contenu:", message, sender);

    if (message.action === "contentStartRecording") {
        // Call the internal start recording function (already configured options via contentStartRecording)
        contentStartRecording(message.options); // Forward options again just to be sure, although options are already set globally in contentStartRecording

    } else if (message.action === "contentStopRecording") {
        // Call the internal stop recording function
        contentStopRecording();

    }
    // No response needed for these actions in this example
    return false;
});


console.log("Script de contenu content.js chargé."); // Confirmation message when content script loads.