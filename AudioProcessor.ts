
/**
 * AudioProcessor handles the conversion between Web Audio API (Float32) 
 * and Gemini Live API (Int16 PCM).
 */
export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private onAudioData: (base64Data: string) => void;

  constructor(onAudioData: (base64Data: string) => void) {
    this.onAudioData = onAudioData;
  }

  async start() {
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // In a production app, we'd use an AudioWorklet for better performance.
    // For this implementation, we'll use ScriptProcessor (deprecated but simpler to bundle here)
    // or a basic AnalyserNode approach. Actually, let's use a standard pattern.
    
    const source = this.audioContext.createMediaStreamSource(this.stream);
    const processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    source.connect(processor);
    processor.connect(this.audioContext.destination);

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = this.float32ToInt16(inputData);
      const base64 = this.arrayBufferToBase64(pcm16.buffer);
      this.onAudioData(base64);
    };
  }

  stop() {
    this.stream?.getTracks().forEach(track => track.stop());
    this.audioContext?.close();
  }

  private float32ToInt16(buffer: Float32Array): Int16Array {
    const l = buffer.length;
    const res = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      res[i] = Math.max(-1, Math.min(1, buffer[i])) * 0x7FFF;
    }
    return res;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  /**
   * Decodes and plays 24kHz PCM16 audio chunks from the model.
   */
  static createPlayer() {
    const audioCtx = new AudioContext({ sampleRate: 24000 });
    let nextStartTime = audioCtx.currentTime;

    return {
      play: (base64Data: string) => {
        const binary = window.atob(base64Data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        
        const pcm16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
          float32[i] = pcm16[i] / 32768.0;
        }

        const buffer = audioCtx.createBuffer(1, float32.length, 24000);
        buffer.getChannelData(0).set(float32);

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        
        const startTime = Math.max(nextStartTime, audioCtx.currentTime);
        source.start(startTime);
        nextStartTime = startTime + buffer.duration;
      },
      stop: () => {
        audioCtx.close();
      }
    };
  }
}
