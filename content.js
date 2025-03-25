/* content.js */

// --- Global variables (configurables via options) ---
let videoSelector = 'video'; // Sélecteur vidéo par défaut, modifiable via options
let SEGMENT_DURATION = 5 * 60 * 1000; // 5 minutes par segment, en millisecondes
let RECORD_DURATION = 5 * 60 * 60 * 1000; // 5 heures d'enregistrement total, en millisecondes
let ENABLE_SEND_LOCAL = false; // Par défaut, modifiable via options
let ENABLE_SEND_SEGMENT_LOCAL = false;
let ENABLE_SEND_TELEGRAM = false;
let ENABLE_SEND_SEGMENT_TELEGRAM = false;
let LOCAL_SERVER_URL = "http://localhost:3000/upload.php";
let TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN";
let TELEGRAM_CHAT_ID = "YOUR_TELEGRAM_CHAT_ID";

// --- Global variables (état interne) ---
let videoElement = null; // Définie par findVideoElement
let mediaRecorder;
let isRecording = false;
let expectedStop = false;
let fileWriter = null;
let fileSystemRejected = false;
let db;
let useIndexedDB = false;
let collectedSegments = [];

/**
 * Recherche l'élément vidéo en fonction du sélecteur configuré.
 * @returns {HTMLVideoElement|null} L'élément vidéo ou null si non trouvé.
 */
function findVideoElement() {
    return document.querySelector(videoSelector);
}

/**
 * Autorise les iframes présentes dans le document.
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
 * Remplace les iframes par des versions personnalisées pour forcer leur rechargement.
 */
function replaceIframesWithCustom() {
    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((oldIframe) => {
        const newIframe = document.createElement("iframe");
        newIframe.src = oldIframe.src;
        if (oldIframe.id) newIframe.id = oldIframe.id;
        if (oldIframe.className) newIframe.className = oldIframe.className;
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
 * Initialise le système d'écriture de fichier via File System Access API.
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
 * Initialise ou ouvre IndexedDB.
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
 * Ajoute un segment dans IndexedDB.
 * @param {Blob} blob - Le segment à ajouter.
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
 * Récupère tous les segments depuis IndexedDB.
 * @returns {Promise<Blob[]>} Une promesse résolvant avec un tableau de blobs.
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
 * Efface tous les segments stockés dans IndexedDB.
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
 * Envoie un segment vidéo au serveur local.
 * @param {Blob} blob - Le segment à envoyer.
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
 * Envoie un segment vidéo via l'API Telegram Bot.
 * @param {Blob} blob - Le segment à envoyer.
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
 * Démarre l'enregistrement vidéo en découpant le flux en segments.
 */
async function startRecordingFunction() {
    videoElement = findVideoElement(); // Recherche à chaque démarrage pour gérer les pages dynamiques
    if (!videoElement) {
        console.error("Aucun élément vidéo trouvé avec le sélecteur :", videoSelector);
        return;
    }
    if (!videoElement.captureStream) {
        console.error("La capture du flux vidéo n'est pas supportée par cet élément.");
        return;
    }

    // Si un enregistrement est déjà en cours, ne pas redémarrer
    if (isRecording) {
        console.warn("Un enregistrement est déjà en cours dans cet onglet.");
        return;
    }

    expectedStop = false;
    await initFileWriter();
    collectedSegments = []; // Réinitialise les segments à chaque démarrage

    try {
        const stream = videoElement.captureStream();
        mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm; codecs=vp9" });
        isRecording = true;
        console.log("Enregistrement démarré...");
        // Informer le background (si besoin) que l'enregistrement a démarré
        chrome.runtime.sendMessage({ action: "contentRecordingStarted" });

        mediaRecorder.ondataavailable = async (event) => {
            if (event.data && event.data.size > 0) {
                collectedSegments.push(event.data); // Stocke le segment pour reconstitution ultérieure
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
                    console.warn("Enregistrement arrêté de manière inattendue, redémarrage...");
                    restartRecordingFunction();
                }
            }
            chrome.runtime.sendMessage({ action: "contentRecordingStopped" });
        };

        mediaRecorder.start(SEGMENT_DURATION);
    } catch (error) {
        console.error("Erreur lors du démarrage de l'enregistrement :", error);
        isRecording = false;
    }
}

/**
 * Redémarre l'enregistrement après un délai court.
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
 * Arrête l'enregistrement de manière contrôlée.
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
 * Combine les segments en un blob et déclenche le téléchargement.
 * @param {Blob[]} segments - Tableau de blobs segmentés.
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
 * Crée et affiche une barre de progression pour l'upload.
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
 * Surveille l'état de la vidéo et du document pour assurer la continuité de l'enregistrement.
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
        console.warn("Problème de connexion détecté. Tentative de reprise de la lecture...");
        videoElement.play().catch((err) => console.error("Erreur lors de la reprise après 'stalled' :", err));
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
            console.log("Onglet visible et vidéo en lecture. Vérification de l'enregistrement...");
            startRecordingFunction();
        }
    });
    window.addEventListener("online", () => {
        console.log("Connexion rétablie. Vérification du redémarrage de l'enregistrement...");
        if (!isRecording && !videoElement.paused) startRecordingFunction();
    });
}

/**
 * Démarre l'enregistrement dans le content script, appelé depuis le background.
 * @param {object} options - Options d'enregistrement passées depuis le background.
 */
function contentStartRecording(options) {
    console.log("contentStartRecording appelée avec les options:", options);
    // Configurer les variables globales avec les options reçues
    videoSelector = options.videoSelector;
    SEGMENT_DURATION = options.segmentDuration;
    RECORD_DURATION = options.recordDuration;
    ENABLE_SEND_LOCAL = options.enableSendLocal;
    ENABLE_SEND_SEGMENT_LOCAL = options.enableSegmentLocal;
    ENABLE_SEND_TELEGRAM = options.enableTelegramSave;
    ENABLE_SEND_SEGMENT_TELEGRAM = options.enableSegmentTelegram;
    LOCAL_SERVER_URL = options.localServerUrl;
    TELEGRAM_BOT_TOKEN = options.telegramBotToken;
    TELEGRAM_CHAT_ID = options.telegramChatId;

    // Recherche l'élément vidéo et tente de le démarrer pour la capture
    videoElement = findVideoElement();
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

    // Arrêter l'enregistrement après RECORD_DURATION
    setTimeout(() => {
        contentStopRecording();
    }, RECORD_DURATION);
}

/**
 * Arrête l'enregistrement dans le content script, appelé depuis le background.
 */
function contentStopRecording() {
    console.log("contentStopRecording appelée");
    stopRecordingFunction();
}

// --- Écouteur de messages dans content.js ---
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    console.log("Message reçu dans content.js :", message, sender);
    if (message.action === "contentStartRecording") {
        contentStartRecording(message.options);
        sendResponse({ success: true, isRecording });
    } else if (message.action === "contentStopRecording") {
        contentStopRecording();
        sendResponse({ success: true, isRecording });
    } else if (message.action === "getRecordingState") {
        sendResponse({ isRecording });
    } else {
        // Pour toute action non reconnue, on renvoie une réponse vide
        sendResponse({});
    }
    // Comme aucune opération asynchrone n'est attendue ici, retourner false
    return false;
});

console.log("Script de contenu content.js chargé.");
