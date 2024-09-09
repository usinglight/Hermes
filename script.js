let apiKey = "";
let accessKey = "";
let isRecording = false;
let isRecordingInProgress = false;
let currentRecordingId = null;

const apiKeyInput = document.getElementById("apiKeyInput");
const joinButton = document.getElementById("joinButton");
const toggleRecordingButton = document.getElementById("toggleRecordingButton");
const errorMessage = document.getElementById("errorMessage");
const recordingLink = document.getElementById("recordingLink");

joinButton.addEventListener("click", async () => {
  apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    errorMessage.textContent = "Please enter your API key.";
    return;
  }

  try {
    const response = await fetch(`https://api.eyeson.team/rooms`, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user: { name: "Test User" } }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    accessKey = data.access_key;
    const guestLink = data.links.gui;

    const iframe = document.createElement("iframe");
    iframe.src = guestLink;
    iframe.width = "640";
    iframe.height = "480";
    iframe.allow = "camera; microphone; fullscreen; speaker; display-capture";

    const videoContainer = document.getElementById("videoContainer");
    videoContainer.innerHTML = "";
    videoContainer.appendChild(iframe);

    joinButton.disabled = true;
    apiKeyInput.disabled = true;
    toggleRecordingButton.disabled = false;
  } catch (error) {
    console.error("Error joining meeting:", error);
    errorMessage.textContent = `Error joining meeting: ${error.message}`;
  }
});

let recordingUpdateCallback = null;
let recordingIdTimeout = null;

toggleRecordingButton.addEventListener("click", async () => {
  if (!isRecording) {
    try {
      const response = await fetch(
        `https://api.eyeson.team/rooms/${accessKey}/recording`,
        {
          method: "POST",
          headers: {
            Authorization: apiKey,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      isRecording = true;
      isRecordingInProgress = true;
      toggleRecordingButton.textContent = "Stop Recording";
      console.log("Recording started");
      errorMessage.textContent = "";
      recordingLink.textContent = "Waiting for recording ID...";

      recordingUpdateCallback = (event) => {
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
              clearTimeout(recordingIdTimeout);
              window.removeEventListener("message", recordingUpdateCallback);
            }
          } catch (error) {
            console.warn("Error parsing recording update:", error);
          }
        }
      };

      window.addEventListener("message", recordingUpdateCallback);

      recordingIdTimeout = setTimeout(() => {
        console.warn("Timeout waiting for recording ID");
        recordingLink.textContent =
          "Timeout waiting for recording ID. The recording may still be in progress.";
        window.removeEventListener("message", recordingUpdateCallback);
      }, 30000);
    } catch (error) {
      console.error("Error starting recording:", error);
      errorMessage.textContent = `Error starting recording: ${error.message}`;
    }
  } else if (isRecordingInProgress) {
    try {
      const response = await fetch(
        `https://api.eyeson.team/rooms/${accessKey}/recording`,
        {
          method: "DELETE",
          headers: {
            Authorization: apiKey,
          },
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(
            "Recording not found, it may have already been stopped.",
          );
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }

      isRecordingInProgress = false;
      isRecording = false;
      toggleRecordingButton.textContent = "Start Recording";
      console.log("Recording stopped");
      errorMessage.textContent = "";

      if (recordingUpdateCallback) {
        window.removeEventListener("message", recordingUpdateCallback);
        recordingUpdateCallback = null;
      }
      clearTimeout(recordingIdTimeout);

      if (currentRecordingId) {
        recordingLink.textContent = "Fetching recording link...";
        fetchRecordingLink();
      } else {
        recordingLink.textContent =
          "No recording ID available, cannot fetch recording link";
      }
    } catch (error) {
      console.error("Error stopping recording:", error);
      errorMessage.textContent = `Error stopping recording: ${error.message}`;
    }
  } else {
    console.warn("No active recording to stop.");
    isRecording = false;
    toggleRecordingButton.textContent = "Start Recording";
  }
});

async function fetchRecordingLink(retries = 3) {
  if (!currentRecordingId) {
    recordingLink.textContent = "No recording ID available.";
    return;
  }

  try {
    const response = await fetch(
      `https://api.eyeson.team/recordings/${currentRecordingId}`,
      {
        headers: {
          Authorization: apiKey,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const recordingData = await response.json();
    if (recordingData.links && recordingData.links.download) {
      recordingLink.innerHTML = `<a href="${recordingData.links.download}" target="_blank">Download Recording</a>`;
    } else {
      if (retries > 0) {
        recordingLink.textContent =
          "Recording link not available yet. Retrying...";
        setTimeout(() => fetchRecordingLink(retries - 1), 5000);
      } else {
        recordingLink.textContent =
          "Recording link not available. Please try again later.";
      }
    }
  } catch (error) {
    console.error("Error fetching recording details:", error);
    errorMessage.textContent = `Error fetching recording details: ${error.message}`;
    if (retries > 0) {
      setTimeout(() => fetchRecordingLink(retries - 1), 5000);
    }
  }
}
