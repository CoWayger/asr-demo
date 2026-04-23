import { createSignal } from 'solid-js';
import { useTranscription, DEFAULT_WS_URL } from '../hooks/useTranscription';

export default function Home() {
  const [wsUrl, setWsUrl] = createSignal(DEFAULT_WS_URL);
  const { isRecording, statusMessage, transcript, start, stop, clear } = useTranscription(wsUrl);

  return (
    <main
      style={{
        padding: '2rem',
        'max-width': '800px',
        margin: '0 auto',
        'font-family': 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ 'margin-bottom': '1.5rem', 'font-size': '1.5rem' }}>ASR Transcription</h1>

      <div style={{ display: 'flex', gap: '0.5rem', 'margin-bottom': '1rem', 'align-items': 'center' }}>
        <label style={{ 'font-size': '0.875rem', color: '#374151', 'white-space': 'nowrap' }}>
          WebSocket URL
        </label>
        <input
          type="text"
          value={wsUrl()}
          onInput={e => setWsUrl(e.currentTarget.value)}
          disabled={isRecording()}
          style={{
            flex: '1',
            padding: '0.4rem 0.75rem',
            'font-size': '0.875rem',
            'border-radius': '6px',
            border: '1px solid #d1d5db',
            'font-family': 'monospace',
            opacity: isRecording() ? '0.5' : '1',
          }}
        />
        <button
          onClick={() => (isRecording() ? stop() : start())}
          style={{
            padding: '0.5rem 1.25rem',
            'font-size': '1rem',
            cursor: 'pointer',
            'background-color': isRecording() ? '#dc2626' : '#16a34a',
            color: 'white',
            border: 'none',
            'border-radius': '6px',
            'white-space': 'nowrap',
          }}
        >
          {isRecording() ? '⏹ Stop' : '● Start'}
        </button>
      </div>

      <textarea
        aria-label="Transcript"
        value={transcript()}
        readOnly
        rows={14}
        style={{
          display: 'block',
          width: '100%',
          padding: '0.75rem',
          'font-size': '1rem',
          'border-radius': '6px',
          border: '1px solid #d1d5db',
          resize: 'vertical',
          'box-sizing': 'border-box',
          'margin-bottom': '0.5rem',
          'font-family': 'inherit',
        }}
      />

      <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
        <span style={{ 'font-size': '0.875rem', color: '#6b7280' }}>
          Stav: {statusMessage()}
        </span>
        <button
          onClick={clear}
          style={{
            padding: '0.4rem 1rem',
            'font-size': '0.875rem',
            cursor: 'pointer',
            background: 'none',
            border: '1px solid #d1d5db',
            'border-radius': '4px',
          }}
        >
          Clear
        </button>
      </div>
    </main>
  );
}
