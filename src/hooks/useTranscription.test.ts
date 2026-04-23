import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'solid-js';
import { useTranscription, type TranscriptionStatus, type TranscriptionHook } from './useTranscription';

// --- MockWebSocket ---
class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  sentMessages: unknown[] = [];
  static instances: MockWebSocket[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    // Spustí onopen po aktuálním microtask checkpointu — proběhne před pokračováním await
    queueMicrotask(() => this.onopen?.(new Event('open')));
  }

  send(data: unknown) { this.sentMessages.push(data); }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }

  static reset() { MockWebSocket.instances = []; }
}

// --- Audio mocks ---
const mockTrack = { stop: vi.fn() };
const mockStream = { getTracks: () => [mockTrack] };
const mockWorkletPort = { onmessage: null as ((e: MessageEvent) => void) | null };
const mockWorkletNode = { port: mockWorkletPort, connect: vi.fn(), disconnect: vi.fn() };
const mockSource = { connect: vi.fn() };
const mockAudioContext = {
  audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
  createMediaStreamSource: vi.fn(() => mockSource),
  destination: {},
  close: vi.fn(),
};

let disposeRoot: (() => void) | undefined;

beforeEach(() => {
  MockWebSocket.reset();
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.stubGlobal('AudioContext', vi.fn(() => mockAudioContext));
  vi.stubGlobal('AudioWorkletNode', vi.fn(() => mockWorkletNode));
  mockAudioContext.audioWorklet.addModule.mockClear().mockResolvedValue(undefined);
  mockAudioContext.close.mockClear();
  mockWorkletNode.connect.mockClear();
  mockWorkletNode.disconnect.mockClear();
  mockSource.connect.mockClear();
  mockTrack.stop.mockClear();
  Object.defineProperty(navigator, 'mediaDevices', {
    writable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
  });
});

afterEach(() => {
  disposeRoot?.();
  disposeRoot = undefined;
  vi.unstubAllGlobals();
});

function makeHook(): TranscriptionHook {
  let hook!: TranscriptionHook;
  disposeRoot = createRoot(dispose => {
    hook = useTranscription();
    return dispose;
  });
  return hook;
}

describe('useTranscription', () => {
  it('starts in idle state with empty transcript', () => {
    const t = makeHook();
    expect(t.status()).toBe<TranscriptionStatus>('idle');
    expect(t.transcript()).toBe('');
    expect(t.isRecording()).toBe(false);
  });

  it('start() sends config JSON on WebSocket open', async () => {
    const t = makeHook();
    await t.start();
    const ws = MockWebSocket.instances[0];
    expect(ws.sentMessages).toHaveLength(1);
    const config = JSON.parse(ws.sentMessages[0] as string) as Record<string, unknown>;
    expect(config['language']).toBeNull();
    expect(config['task']).toBe('transcribe');
    expect(config['model']).toBe('base');
    expect(config['use_vad']).toBe(true);
  });

  it('WAIT message sets status to waiting-for-model', async () => {
    const t = makeHook();
    await t.start();
    MockWebSocket.instances[0].onmessage!(
      new MessageEvent('message', { data: JSON.stringify({ message: 'WAIT' }) }),
    );
    expect(t.status()).toBe<TranscriptionStatus>('waiting-for-model');
  });

  it('SERVER_READY sets status to recording and connects worklet', async () => {
    const t = makeHook();
    await t.start();
    MockWebSocket.instances[0].onmessage!(
      new MessageEvent('message', { data: JSON.stringify({ message: 'SERVER_READY' }) }),
    );
    expect(t.status()).toBe<TranscriptionStatus>('recording');
    expect(t.isRecording()).toBe(true);
    expect(mockSource.connect).toHaveBeenCalledWith(mockWorkletNode);
  });

  it('accumulates completed segments and shows in-progress as live preview', async () => {
    const t = makeHook();
    await t.start();
    const ws = MockWebSocket.instances[0];
    ws.onmessage!(new MessageEvent('message', { data: JSON.stringify({ message: 'SERVER_READY' }) }));

    // První zpráva: jeden in-progress segment
    ws.onmessage!(new MessageEvent('message', {
      data: JSON.stringify({ segments: [{ text: ' ahoj', start: 0, end: 1, completed: false }] }),
    }));
    expect(t.transcript()).toContain('ahoj');

    // Druhá zpráva: první se stal completed, přibyl nový in-progress
    ws.onmessage!(new MessageEvent('message', {
      data: JSON.stringify({ segments: [
        { text: ' ahoj', start: 0, end: 1, completed: true },
        { text: ' světe', start: 1, end: 2, completed: false },
      ]}),
    }));
    expect(t.transcript()).toContain('ahoj');
    expect(t.transcript()).toContain('světe');
  });

  it('does not accumulate the same completed segment twice', async () => {
    const t = makeHook();
    await t.start();
    const ws = MockWebSocket.instances[0];
    ws.onmessage!(new MessageEvent('message', { data: JSON.stringify({ message: 'SERVER_READY' }) }));

    const seg = { text: ' ahoj', start: 0, end: 1, completed: true };
    ws.onmessage!(new MessageEvent('message', { data: JSON.stringify({ segments: [seg] }) }));
    ws.onmessage!(new MessageEvent('message', { data: JSON.stringify({ segments: [seg] }) }));
    // 'ahoj' se nesmí opakovat
    expect(t.transcript().split('ahoj').length - 1).toBe(1);
  });

  it('clear() empties transcript and resets accumulator', async () => {
    const t = makeHook();
    await t.start();
    const ws = MockWebSocket.instances[0];
    ws.onmessage!(new MessageEvent('message', {
      data: JSON.stringify({ segments: [{ text: ' text', start: 0, end: 1, completed: true }] }),
    }));
    t.clear();
    expect(t.transcript()).toBe('');
    // Po clear: stejný segment nesmí způsobit duplikát
    ws.onmessage!(new MessageEvent('message', {
      data: JSON.stringify({ segments: [{ text: ' nový', start: 2, end: 3, completed: true }] }),
    }));
    expect(t.transcript()).not.toContain('text');
    expect(t.transcript()).toContain('nový');
  });

  it('start() sets error status when getUserMedia is denied', async () => {
    (navigator.mediaDevices as { getUserMedia: ReturnType<typeof vi.fn> }).getUserMedia =
      vi.fn().mockRejectedValue(new Error('Permission denied'));
    const t = makeHook();
    await t.start();
    expect(t.status()).toBe<TranscriptionStatus>('error');
  });

  it('stop() returns to idle and closes WebSocket', async () => {
    const t = makeHook();
    await t.start();
    MockWebSocket.instances[0].onmessage!(
      new MessageEvent('message', { data: JSON.stringify({ message: 'SERVER_READY' }) }),
    );
    const ws = MockWebSocket.instances[0];
    t.stop();
    expect(t.status()).toBe<TranscriptionStatus>('idle');
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
  });
});
