import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import VoiceInput from './VoiceInput';

afterEach(cleanup);

describe('VoiceInput', () => {
  describe('when Web Speech API is unavailable', () => {
    beforeEach(() => {
      (
        window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
      ).SpeechRecognition = undefined;
      (
        window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
      ).webkitSpeechRecognition = undefined;
    });

    it('does not render the mic button', () => {
      const { queryByLabelText } = render(() => <VoiceInput onTranscript={() => {}} />);
      expect(queryByLabelText('Start voice input')).not.toBeInTheDocument();
    });
  });

  describe('when Web Speech API is available', () => {
    let startMock: ReturnType<typeof vi.fn>;
    let stopMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      startMock = vi.fn();
      stopMock = vi.fn();

      class MockRecognition {
        continuous = false;
        interimResults = false;
        lang = '';
        onresult: ((event: unknown) => void) | null = null;
        onerror: (() => void) | null = null;
        onend: (() => void) | null = null;
        start = startMock;
        stop = stopMock;
      }

      (
        window as Window & {
          SpeechRecognition?: unknown;
          webkitSpeechRecognition?: unknown;
        }
      ).SpeechRecognition = MockRecognition;
      (
        window as Window & {
          SpeechRecognition?: unknown;
          webkitSpeechRecognition?: unknown;
        }
      ).webkitSpeechRecognition = MockRecognition;
    });

    afterEach(() => {
      delete (window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition;
      delete (window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition;
    });

    it('renders mic button when SpeechRecognition is available', () => {
      render(() => <VoiceInput onTranscript={() => {}} />);
      expect(screen.getByLabelText('Start voice input')).toBeInTheDocument();
    });

    it('clicking mic button starts recognition', async () => {
      render(() => <VoiceInput onTranscript={() => {}} />);
      fireEvent.click(screen.getByLabelText('Start voice input'));
      await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    });

    it('pressing Escape stops recognition while recording', async () => {
      render(() => <VoiceInput onTranscript={() => {}} />);
      fireEvent.click(screen.getByLabelText('Start voice input'));
      await waitFor(() => expect(startMock).toHaveBeenCalled());

      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(stopMock).toHaveBeenCalledTimes(1));
    });

    it('shows stop label while recording', async () => {
      render(() => <VoiceInput onTranscript={() => {}} />);
      fireEvent.click(screen.getByLabelText('Start voice input'));
      await waitFor(() => {
        expect(screen.getByLabelText('Stop voice input')).toBeInTheDocument();
      });
    });
  });
});
