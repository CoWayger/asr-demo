import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import type { TranscriptionHook, TranscriptionStatus } from '../hooks/useTranscription';

vi.mock('../hooks/useTranscription', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useTranscription')>();
  return { ...actual, useTranscription: vi.fn() };
});

import { useTranscription } from '../hooks/useTranscription';
import Home from './index';

function makeMock(overrides: Partial<TranscriptionHook> = {}): TranscriptionHook {
  const [status, setStatus] = createSignal<TranscriptionStatus>('idle');
  const [transcript] = createSignal('');

  const STATUS_MSG: Record<TranscriptionStatus, string> = {
    idle: 'Waiting',
    connecting: 'Connecting...',
    'waiting-for-model': 'Waiting for model...',
    recording: 'Recording...',
    error: 'Connection error',
  };

  return {
    status,
    statusMessage: () => STATUS_MSG[status()],
    transcript,
    isRecording: () => status() === 'recording',
    start: vi.fn(async () => { setStatus('recording'); }),
    stop: vi.fn(() => setStatus('idle')),
    clear: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(useTranscription).mockReturnValue(makeMock());
});

describe('Home page', () => {
  it('renders Start button', () => {
    render(() => <Home />);
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
  });

  it('shows idle status message', () => {
    render(() => <Home />);
    expect(screen.getByText(/waiting/i)).toBeInTheDocument();
  });

  it('renders textarea', () => {
    render(() => <Home />);
    expect(screen.getByRole('textbox', { name: /transcript/i })).toBeInTheDocument();
  });

  it('renders Clear button', () => {
    render(() => <Home />);
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('clicking Start calls start()', () => {
    const mock = makeMock();
    vi.mocked(useTranscription).mockReturnValue(mock);
    render(() => <Home />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(mock.start).toHaveBeenCalledOnce();
  });

  it('after start() shows Stop button', async () => {
    const mock = makeMock();
    vi.mocked(useTranscription).mockReturnValue(mock);
    render(() => <Home />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(await screen.findByRole('button', { name: /stop/i })).toBeInTheDocument();
  });

  it('clicking Stop calls stop()', async () => {
    const mock = makeMock();
    vi.mocked(useTranscription).mockReturnValue(mock);
    render(() => <Home />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    const stopBtn = await screen.findByRole('button', { name: /stop/i });
    fireEvent.click(stopBtn);
    expect(mock.stop).toHaveBeenCalledOnce();
  });

  it('clicking Clear calls clear()', () => {
    const mock = makeMock();
    vi.mocked(useTranscription).mockReturnValue(mock);
    render(() => <Home />);
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(mock.clear).toHaveBeenCalledOnce();
  });

  it('textarea displays transcript value', () => {
    const [transcript] = createSignal('hello world');
    const mock = makeMock({ transcript });
    vi.mocked(useTranscription).mockReturnValue(mock);
    render(() => <Home />);
    expect((screen.getByRole('textbox', { name: /transcript/i }) as HTMLTextAreaElement).value).toBe('hello world');
  });
});
