import { createSignal, onCleanup } from 'solid-js';

export type TranscriptionStatus =
  | 'idle'
  | 'connecting'
  | 'waiting-for-model'
  | 'recording'
  | 'error';

export interface TranscriptionHook {
  status: () => TranscriptionStatus;
  statusMessage: () => string;
  transcript: () => string;
  isRecording: () => boolean;
  start: () => Promise<void>;
  stop: () => void;
  clear: () => void;
}

export const DEFAULT_WS_URL = 'ws://localhost:9009';

const STATUS_MESSAGES: Record<TranscriptionStatus, string> = {
  idle: 'Waiting',
  connecting: 'Connecting...',
  'waiting-for-model': 'Waiting for model...',
  recording: 'Recording...',
  error: 'Connection error',
};

export function useTranscription(getWsUrl: () => string = () => DEFAULT_WS_URL): TranscriptionHook {
  const [status, setStatus] = createSignal<TranscriptionStatus>('idle');
  const [transcript, setTranscript] = createSignal('');

  let ws: WebSocket | null = null;
  let audioContext: AudioContext | null = null;
  let mediaStream: MediaStream | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let reconnectAttempted = false;

  // Accumulated text from segments that have left the server's sliding window
  let accumulatedText = '';
  let lastConfirmedEnd = 0;

  function resetAccumulator() {
    accumulatedText = '';
    lastConfirmedEnd = 0;
  }

  function cleanup() {
    mediaStream?.getTracks().forEach(t => t.stop());
    workletNode?.disconnect();
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    audioContext?.close();
    ws = null;
    audioContext = null;
    mediaStream = null;
    workletNode = null;
  }

  function handleSegments(
    segments: Array<{ text: string; start?: number | string; end?: number | string; completed?: boolean }>,
  ) {
    // Add new completed segments to the permanent buffer
    for (const seg of segments) {
      if (!seg.completed) continue;
      const end = parseFloat(String(seg.end ?? 0));
      if (end > lastConfirmedEnd) {
        accumulatedText += seg.text;
        lastConfirmedEnd = end;
      }
    }

    // Live preview: last in-progress segment
    const inProgress = segments.filter(s => !s.completed);
    const liveText = inProgress.length > 0 ? inProgress[inProgress.length - 1].text : '';

    const fullText = (accumulatedText + liveText).trim();
    if (fullText) setTranscript(fullText);
  }

  function connectWebSocket(
    source: MediaStreamAudioSourceNode,
    ctx: AudioContext,
    node: AudioWorkletNode,
  ) {
    ws = new WebSocket(getWsUrl());

    ws.onopen = () => {
      ws?.send(
        JSON.stringify({
          uid: 'browser-client-1',
          language: null,
          task: 'transcribe',
          model: 'base',
          use_vad: true,
        }),
      );
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as {
        message?: string;
        segments?: Array<{ text: string; start?: number | string; end?: number | string; completed?: boolean }>;
      };

      if (data.message === 'WAIT') {
        setStatus('waiting-for-model');
      } else if (data.message === 'SERVER_READY') {
        setStatus('recording');
        node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(e.data);
        };
        source.connect(node);
        node.connect(ctx.destination);
      } else if (Array.isArray(data.segments)) {
        handleSegments(data.segments);
      }
    };

    ws.onerror = () => {
      setStatus('error');
      cleanup();
    };

    ws.onclose = () => {
      if (status() !== 'idle' && !reconnectAttempted) {
        reconnectAttempted = true;
        connectWebSocket(source, ctx, node);
      } else if (status() !== 'idle') {
        cleanup();
        setStatus('error');
      }
    };
  }

  async function start() {
    reconnectAttempted = false;
    resetAccumulator();
    setStatus('connecting');

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      setStatus('error');
      return;
    }

    audioContext = new AudioContext({ sampleRate: 16000 });

    try {
      await audioContext.audioWorklet.addModule('/pcm-processor.js');
    } catch {
      setStatus('error');
      cleanup();
      return;
    }

    const source = audioContext.createMediaStreamSource(mediaStream);
    workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
    connectWebSocket(source, audioContext, workletNode);
  }

  function stop() {
    cleanup();
    setStatus('idle');
  }

  function clear() {
    resetAccumulator();
    setTranscript('');
  }

  onCleanup(cleanup);

  return {
    status,
    statusMessage: () => STATUS_MESSAGES[status()],
    transcript,
    isRecording: () => status() === 'recording',
    start,
    stop,
    clear,
  };
}
