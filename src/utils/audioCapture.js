import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Toast } from '@capacitor/toast';
import { triggerWarning } from './haptics.js';

let globalVoiceListener = null;

const cleanupVoiceResources = () => {
  if (globalVoiceListener) {
    globalVoiceListener.remove();
    globalVoiceListener = null;
  }
  try {
    SpeechRecognition.removeAllListeners();
  } catch (e) { /* noop */ }
};

export const startVoiceCapture = async () => {
  try {
    const permissions = await SpeechRecognition.requestPermissions();
    if (permissions.speechRecognition !== 'granted') {
      triggerWarning();
      await Toast.show({ text: 'Доступ к микрофону отклонен ОС' });
      return null;
    }

    const available = await SpeechRecognition.available();
    if (!available.available) {
      triggerWarning();
      await Toast.show({ text: 'Голосовой ввод недоступен на этом устройстве' });
      return null;
    }

    const result = await SpeechRecognition.start({
      language: "ru-RU",
      maxResults: 1,
      partialResults: false,
      popup: true
    });

    if (result && result.matches && result.matches.length > 0) {
      return result.matches[0];
    }
    
    return null;

  } catch (err) {
    triggerWarning();
    await Toast.show({ text: 'Критическая ошибка подсистемы аудио' });
    return null;
  }
};

export const stopVoiceCapture = async () => {
  try {
    await SpeechRecognition.stop();
  } catch (e) { /* noop */ }
  cleanupVoiceResources();
};
