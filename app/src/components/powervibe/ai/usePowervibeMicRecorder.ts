import { onUnmounted, ref } from "vue";
import { postPowervibeTranscribeAudio } from "@/components/powervibe/apps/powervibeAppApi";

export type UsePowervibeMicRecorderOptions = {
  /** Called with trimmed transcript after stop and successful transcription. */
  onTranscript: (text: string) => void;
};

function pickRecorderMimeType(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "video/webm;codecs=opus",
    "video/webm",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return undefined;
}

export function usePowervibeMicRecorder(options: UsePowervibeMicRecorderOptions) {
  const isRecording = ref(false);
  const isTranscribing = ref(false);
  const micError = ref<string | null>(null);
  const transcribeError = ref<string | null>(null);

  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  const chunks: BlobPart[] = [];

  function stopTracks(): void {
    stream?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
    stream = null;
  }

  async function startRecording(): Promise<void> {
    transcribeError.value = null;
    micError.value = null;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      micError.value = "Microphone access is not supported in this browser.";
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.length = 0;
      const mimeType = pickRecorderMimeType();
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onerror = () => {
        micError.value = "Recording failed.";
        void stopRecordingInternal(false);
      };
      recorder.start(250);
      isRecording.value = true;
    } catch (e) {
      stopTracks();
      recorder = null;
      micError.value =
        e instanceof DOMException && e.name === "NotAllowedError" ?
          "Microphone permission denied."
        : e instanceof Error ? e.message
        : "Could not access microphone.";
    }
  }

  async function stopRecordingInternal(requestTranscript: boolean): Promise<void> {
    const rec = recorder;
    const savedMime = rec?.mimeType ?? "";
    recorder = null;

    if (rec && rec.state !== "inactive") {
      await new Promise<void>((resolve) => {
        rec.addEventListener("stop", () => resolve(), { once: true });
        try {
          rec.stop();
        } catch {
          resolve();
        }
      });
    }

    stopTracks();
    isRecording.value = false;

    if (!requestTranscript) {
      chunks.length = 0;
      return;
    }

    if (chunks.length === 0) {
      transcribeError.value = "No audio captured.";
      return;
    }

    const blobType = savedMime || pickRecorderMimeType() || "audio/webm";
    const blob = new Blob(chunks, { type: blobType });
    chunks.length = 0;

    if (blob.size === 0) {
      transcribeError.value = "No audio captured.";
      return;
    }

    isTranscribing.value = true;
    transcribeError.value = null;
    try {
      const r = await postPowervibeTranscribeAudio(blob);
      if (r.ok) {
        if (r.text) options.onTranscript(r.text);
      } else {
        transcribeError.value = r.message;
      }
    } catch (e) {
      transcribeError.value = e instanceof Error ? e.message : "Transcription request failed.";
    } finally {
      isTranscribing.value = false;
    }
  }

  async function toggleRecording(): Promise<void> {
    if (isTranscribing.value) return;
    if (isRecording.value) {
      await stopRecordingInternal(true);
    } else {
      await startRecording();
    }
  }

  onUnmounted(() => {
    void stopRecordingInternal(false);
  });

  return {
    isRecording,
    isTranscribing,
    micError,
    transcribeError,
    toggleRecording,
  };
}
