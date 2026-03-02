import type { Component } from 'solid-js';
import { Show, createSignal, onCleanup } from 'solid-js';
import { Mic, MicOff } from 'lucide-solid';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
}

interface SpeechRecognitionResultLike {
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const VoiceInput: Component<VoiceInputProps> = (props) => {
  const getSpeechRecognitionCtor = (): SpeechRecognitionCtor | undefined => {
    const win = window as Window & {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return win.SpeechRecognition ?? win.webkitSpeechRecognition;
  };

  const [recording, setRecording] = createSignal(false);
  let recognition: SpeechRecognitionLike | null = null;

  const stop = () => {
    recognition?.stop();
    setRecording(false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && recording()) {
      stop();
    }
  };

  document.addEventListener('keydown', onKeyDown);
  onCleanup(() => {
    document.removeEventListener('keydown', onKeyDown);
    recognition?.stop();
  });

  const toggle = () => {
    const SpeechRecognition = getSpeechRecognitionCtor();
    if (!SpeechRecognition) return;

    if (recording()) {
      stop();
      return;
    }

    const next = new SpeechRecognition();
    next.continuous = true;
    next.interimResults = true;
    next.lang = 'en-US';
    next.onresult = (event: SpeechRecognitionEventLike) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join('');
      props.onTranscript(transcript);
    };
    next.onerror = () => setRecording(false);
    next.onend = () => setRecording(false);
    next.start();
    recognition = next;
    setRecording(true);
  };

  return (
    <Show when={getSpeechRecognitionCtor()}>
      <button
        type="button"
        onClick={toggle}
        aria-label={recording() ? 'Stop voice input' : 'Start voice input'}
        aria-pressed={recording()}
        class="p-1.5 rounded transition-colors"
        title={recording() ? 'Stop voice input' : 'Start voice input'}
        style={{
          color: recording() ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
        }}
      >
        <Show when={recording()} fallback={<Mic size={16} />}>
          <MicOff size={16} />
        </Show>
      </button>
    </Show>
  );
};

export default VoiceInput;
