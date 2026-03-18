import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Hook para reconocimiento de voz usando la Web Speech API.
 * Transcribe voz a texto en tiempo real.
 */

// Tipos globales para la Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

interface UseSpeechRecognitionOptions {
  /** Idioma de reconocimiento (default: 'es-ES') */
  lang?: string;
  /** Callback con el texto final transcrito */
  onResult?: (transcript: string) => void;
  /** Si es true, acumula texto con cada resultado final */
  continuous?: boolean;
}

interface UseSpeechRecognitionReturn {
  /** Si el micrófono está activo */
  isListening: boolean;
  /** Texto interino (aún no finalizado) */
  interimTranscript: string;
  /** Si el navegador soporta Speech Recognition */
  isSupported: boolean;
  /** Iniciar grabación */
  startListening: () => void;
  /** Detener grabación */
  stopListening: () => void;
  /** Toggle grabación */
  toggleListening: () => void;
}

export function useSpeechRecognition({
  lang = 'es-ES',
  onResult,
  continuous = true,
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onResultRef = useRef(onResult);

  // Mantener referencia actualizada al callback
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const SpeechRecognitionAPI =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : undefined;

  const isSupported = !!SpeechRecognitionAPI;

  const startListening = useCallback(() => {
    if (!SpeechRecognitionAPI) return;

    // Detener instancia previa si existe
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => {
      setIsListening(true);
      setInterimTranscript('');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          final += text;
        } else {
          interim += text;
        }
      }

      setInterimTranscript(interim);

      if (final) {
        onResultRef.current?.(final);
        setInterimTranscript('');
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'aborted' y 'no-speech' son normales, no logueamos
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        console.warn('Speech recognition error:', event.error);
      }
      setIsListening(false);
      setInterimTranscript('');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      console.warn('Error starting speech recognition:', err);
      setIsListening(false);
    }
  }, [SpeechRecognitionAPI, lang, continuous]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
      }
    };
  }, []);

  return {
    isListening,
    interimTranscript,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
  };
}
