const apiKeyInput = document.getElementById("apiKeyInput");
const joinButton = document.getElementById("joinButton");
const toggleRecordingButton = document.getElementById("toggleRecordingButton");
const errorMessage = document.getElementById("errorMessage");
const recordingLink = document.getElementById("recordingLink");
const videoContainer = document.getElementById("videoContainer");

let apiKey = "";
let accessKey = "";
let isRecording = false;
let currentRecordingId = null;
let recordingUpdateCallback = null;
let recordingIdTimeout = null;

joinButton.addEventListener("click", joinMeeting);
toggleRecordingButton.addEventListener("click", toggleRecording);

async function joinMeeting() {
  apiKey = apiKeyInput.value.trim();
  if (!validateApiKey(apiKey)) return;

  setLoading(true);

  try {
    const data = await createRoom();
    accessKey = data.access_key;
    const guestLink = data.links.gui;

    createVideoIframe(guestLink);
    updateUIAfterJoining();
  } catch (error) {
    handleError("Error joining meeting", error);
  } finally {
    setLoading(false);
  }
}

function validateApiKey(key) {
  if (!key) {
    errorMessage.textContent = "Please enter your API key.";
    return false;
  }
  return true;
}

async function createRoom() {
  const response = await fetch("https://api.eyeson.team/rooms", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user: { name: "Hermes Messenger" } }),
  });

  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return response.json();
}

function createVideoIframe(src) {
  const iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.width = "640";
  iframe.height = "480";
  iframe.allow = "camera; microphone; fullscreen; speaker; display-capture";

  videoContainer.innerHTML = "";
  videoContainer.appendChild(iframe);
}

function updateUIAfterJoining() {
  joinButton.disabled = true;
  apiKeyInput.disabled = true;
  toggleRecordingButton.disabled = false;
}

async function toggleRecording() {
  if (!isRecording) {
    await startRecording();
  } else {
    await stopRecording();
  }
}

async function startRecording() {
  try {
    await sendRecordingRequest("POST");
    isRecording = true;
    updateUIForRecordingStart();
    setupRecordingUpdateListener();
  } catch (error) {
    handleError("Error starting recording", error);
  }
}

async function stopRecording() {
  try {
    await sendRecordingRequest("DELETE");
    isRecording = false;
    updateUIForRecordingStop();
    cleanupRecordingListeners();
    await fetchRecordingLink();
  } catch (error) {
    handleError("Error stopping recording", error);
  }
}

async function sendRecordingRequest(method) {
  const response = await fetch(
    `https://api.eyeson.team/rooms/${accessKey}/recording`,
    {
      method,
      headers: { Authorization: apiKey },
    },
  );

  if (!response.ok) {
    if (response.status === 404 && method === "DELETE") {
      console.warn("Recording not found, it may have already been stopped.");
    } else {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }
}

function updateUIForRecordingStart() {
  toggleRecordingButton.textContent = "Stop Recording";
  errorMessage.textContent = "";
  recordingLink.textContent = "Waiting for recording ID...";
}

function updateUIForRecordingStop() {
  toggleRecordingButton.textContent = "Start Recording";
  errorMessage.textContent = "";
}

function setupRecordingUpdateListener() {
  recordingUpdateCallback = handleRecordingUpdate;
  window.addEventListener("message", recordingUpdateCallback);

  recordingIdTimeout = setTimeout(() => {
    console.warn("Timeout waiting for recording ID");
    recordingLink.textContent =
      "Timeout waiting for recording ID. The recording may still be in progress.";
    cleanupRecordingListeners();
  }, 30000);
}

function handleRecordingUpdate(event) {
  if (event.data && typeof event.data === "string") {
    try {
      const data = JSON.parse(event.data);
      if (
        data.type === "recording_update" &&
        data.recording &&
        data.recording.id
      ) {
        currentRecordingId = data.recording.id;
        console.log("Received recording ID:", currentRecordingId);
        recordingLink.textContent = `Recording ID: ${currentRecordingId}`;
        cleanupRecordingListeners();
      }
    } catch (error) {
      console.warn("Error parsing recording update:", error);
    }
  }
}

function cleanupRecordingListeners() {
  if (recordingUpdateCallback) {
    window.removeEventListener("message", recordingUpdateCallback);
    recordingUpdateCallback = null;
  }
  clearTimeout(recordingIdTimeout);
}

async function fetchRecordingLink(retries = 3) {
  if (!currentRecordingId) {
    recordingLink.textContent = "No recording ID available.";
    return;
  }

  try {
    const recordingData = await fetchRecordingData();
    if (recordingData.links && recordingData.links.download) {
      recordingLink.innerHTML = `<a href="${recordingData.links.download}" target="_blank">Download Recording</a>`;
    } else if (retries > 0) {
      recordingLink.textContent =
        "Recording link not available yet. Retrying...";
      setTimeout(() => fetchRecordingLink(retries - 1), 5000);
    } else {
      recordingLink.textContent =
        "Recording link not available. Please try again later.";
    }
  } catch (error) {
    handleError("Error fetching recording details", error);
    if (retries > 0) {
      setTimeout(() => fetchRecordingLink(retries - 1), 5000);
    }
  }
}

async function fetchRecordingData() {
  const response = await fetch(
    `https://api.eyeson.team/recordings/${currentRecordingId}`,
    {
      headers: { Authorization: apiKey },
    },
  );

  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return response.json();
}

function handleError(context, error) {
  console.error(`${context}:`, error);
  errorMessage.textContent = `${context}: ${error.message}`;
}

function setLoading(isLoading) {
  // Implement loading state UI changes here
  joinButton.disabled = isLoading;
  // Add more UI elements to indicate loading state
}
