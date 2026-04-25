
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality } from "@google/genai";
import { Mic, MicOff, Video, VideoOff, Power, Activity, Database, Shield, Globe, Terminal } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AudioProcessor } from './AudioProcessor';

/** Utility for tailwind classes */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const API_KEY = process.env.GEMINI_API_KEY!;

export function App() {
  const [isActive, setIsActive] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);
  const [transcriptions, setTranscriptions] = useState<{ role: string; text: string }[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<any>(null);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const audioPlayerRef = useRef<any>(null);

  const startSession = async () => {
    try {
      setConnectionStatus('connecting');
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      
      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
          },
          systemInstruction: {
            parts: [{
              text: `
                You are Ethio AI, a sophisticated real-time agent. 
                Your personality is professional, helpful, and deeply knowledgeable about Ethiopian culture, history, and technology.
                You speak with clarity and warmth.
                You can see the user (if camera active) and hear them in real-time.
              `
            }]
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setConnectionStatus('connected');
            setIsActive(true);
            setIsMicOn(true);
            startAudio();
          },
          onmessage: async (message: any) => {
            // Audio output from model
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioPlayerRef.current) {
              audioPlayerRef.current.play(base64Audio);
            }

            // Interruptions
            if (message.serverContent?.interrupted) {
              console.log("Interrupted");
            }

            // Transcriptions
            // The model sends transcriptions of its own voice and the user's voice
            // if inputAudioTranscription and outputAudioTranscription are enabled.
            const modelTurnParts = message.serverContent?.modelTurn?.parts;
            if (modelTurnParts) {
              for (const part of modelTurnParts) {
                if (part.text) {
                  setTranscriptions(prev => [...prev, { role: 'model', text: part.text }]);
                }
              }
            }

            // User transcriptions might appear in a specific field or as a part 
            // depending on the SDK version's implementation of transcriptions.
            // Using a generic check for now.
            const userText = (message as any).serverContent?.userTurn?.parts?.[0]?.text;
            if (userText) {
              setTranscriptions(prev => [...prev, { role: 'user', text: userText }]);
            }
          },
          onclose: () => {
            setConnectionStatus('idle');
            stopSession();
          },
          onerror: (e) => {
            console.error(e);
            setConnectionStatus('error');
          }
        },
      });

      sessionRef.current = await sessionPromise;
      audioPlayerRef.current = AudioProcessor.createPlayer();

    } catch (error) {
      console.error("Failed to start session:", error);
      setConnectionStatus('error');
    }
  };

  const startAudio = async () => {
    if (!audioProcessorRef.current) {
      audioProcessorRef.current = new AudioProcessor((base64) => {
        if (sessionRef.current) {
          sessionRef.current.sendRealtimeInput({
            audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      });
    }
    await audioProcessorRef.current.start();
  };

  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCamOn(true);
      }
    } catch (e) {
      console.error("Camera access denied", e);
    }
  };

  const stopSession = () => {
    sessionRef.current?.close();
    audioProcessorRef.current?.stop();
    setIsActive(false);
    setIsMicOn(false);
    setIsCamOn(false);
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
  };

  // Video frame streaming loop
  useEffect(() => {
    if (!isActive || !isCamOn) return;

    const streamFrames = () => {
      if (!canvasRef.current || !videoRef.current || !sessionRef.current) return;
      
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      // Draw video to small canvas for efficient encoding
      ctx.drawImage(videoRef.current, 0, 0, 320, 240);
      const base64 = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];
      
      sessionRef.current.sendRealtimeInput({
        video: { data: base64, mimeType: 'image/jpeg' }
      });
    };

    const interval = setInterval(streamFrames, 1000); // 1 frame per second
    return () => clearInterval(interval);
  }, [isActive, isCamOn]);

  return (
    <div className="flex-1 flex flex-col p-6 gap-6 max-w-6xl mx-auto w-full">
      {/* Header */}
      <header className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg bg-orange-500/10 text-orange-500 border border-orange-500/20",
            connectionStatus === 'connected' && "status-glow text-orange-400"
          )}>
            < Globe size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tighter uppercase serif">Ethio AI</h1>
            <p className="text-xs text-neutral-500 mono uppercase tracking-widest">Multimodal Live Interface [v3.1.2]</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/5 bg-white/5">
            <div className={cn(
              "w-2 h-2 rounded-full",
              connectionStatus === 'connected' ? "bg-emerald-500 animate-pulse" : 
              connectionStatus === 'connecting' ? "bg-amber-500 animate-pulse" : "bg-neutral-700"
            )} />
            <span className="text-[10px] mono uppercase font-semibold text-neutral-400">
              {connectionStatus}
            </span>
          </div>
          <button 
            onClick={isActive ? stopSession : startSession}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-bold uppercase text-xs transition-all",
              isActive 
                ? "bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20" 
                : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20"
            )}
          >
            <Power size={14} />
            {isActive ? "Initialize Termination" : "Initiate Link"}
          </button>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        
        {/* Left: Video / Visualization */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="hardware-card aspect-video relative flex-1 group">
            <div className="scanline" />
            <div className="glow-dots absolute inset-0 opacity-20" />
            <div className="scanner" />
            
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              playsInline 
              className={cn(
                "w-full h-full object-cover grayscale opacity-50 contrast-125 transition-all",
                isCamOn && "grayscale-0 opacity-100"
              )} 
            />
            
            <canvas ref={canvasRef} width="320" height="240" className="hidden" />

            {/* Overlay UI */}
            <div className="absolute inset-0 p-4 flex flex-col justify-between pointer-events-none">
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1">
                  <div className="bg-black/80 backdrop-blur px-2 py-1 border border-white/10 rounded">
                    <span className="text-[10px] text-orange-500 mono uppercase tracking-tight">System Feed: VIS-01</span>
                  </div>
                  {isActive && (
                    <div className="bg-emerald-500/20 text-emerald-500 px-2 py-0.5 border border-emerald-500/50 rounded flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-[10px] font-black mono">LIVE</span>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={startVideo}
                    disabled={!isActive}
                    className="pointer-events-auto p-2 rounded-lg bg-black/60 border border-white/10 text-white/50 hover:text-white transition-colors disabled:opacity-30"
                  >
                    {isCamOn ? <Video size={18} /> : <VideoOff size={18} />}
                  </button>
                </div>
              </div>

              {/* Visualization Placeholder */}
              <div className="flex items-end justify-between">
                <div className="flex gap-1 h-32 items-end opacity-40">
                  {[...Array(24)].map((_, i) => (
                    <div 
                      key={i} 
                      className="w-1 bg-orange-500 visualizer-bar" 
                      style={{ 
                        height: isActive ? `${Math.random() * 100}%` : '4px',
                        opacity: 0.1 + (i / 24) * 0.8
                      }} 
                    />
                  ))}
                </div>
                
                <div className="text-right">
                  <p className="text-[10px] mono text-white/30 uppercase">Coordinates</p>
                  <p className="text-xs mono text-orange-500/70">9.0333° N, 38.7408° E</p>
                </div>
              </div>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="hardware-card p-4 flex items-center justify-between border-t-0 rounded-t-none mt-[-24px] bg-[#141414] z-20">
             <div className="flex gap-4">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] mono text-neutral-500 uppercase tracking-widest px-1">Hardware Bus</span>
                  <div className="flex gap-2">
                    <button className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                      <Database size={18} />
                    </button>
                    <button className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-neutral-400">
                      <Shield size={18} />
                    </button>
                    <button className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-neutral-400">
                      <Terminal size={18} />
                    </button>
                  </div>
                </div>
             </div>

             <div className="flex gap-3">
                <button 
                   onClick={() => setIsMicOn(!isMicOn)}
                   disabled={!isActive}
                   className={cn(
                     "w-12 h-12 rounded-full flex items-center justify-center transition-all disabled:opacity-30",
                     isMicOn ? "bg-orange-500 text-black pulse-animation" : "bg-neutral-800 text-neutral-500"
                   )}
                >
                  {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
                </button>
                <div className="flex flex-col justify-center">
                  <span className="text-[10px] mono text-neutral-500 uppercase">Status</span>
                  <span className={cn(
                    "text-xs font-bold mono",
                    isMicOn ? "text-orange-500" : "text-neutral-600"
                  )}>
                    {isMicOn ? "CAPTURING" : "STANDBY"}
                  </span>
                </div>
             </div>
          </div>
        </div>

        {/* Right: Transcript / Log */}
        <div className="lg:col-span-4 hardware-card flex flex-col bg-black/40 border-orange-500/10">
          <div className="p-3 border-b border-white/5 bg-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={12} className="text-orange-500" />
              <span className="text-[10px] mono uppercase font-bold text-neutral-400">Interface Logs</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 mono text-xs scrollbar-hide">
            {transcriptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full opacity-20 gap-3 grayscale">
                <Database size={40} />
                <p className="text-center px-8 uppercase text-[10px] tracking-widest">Awaiting Initial Exchange...</p>
              </div>
            ) : (
              transcriptions.map((t, i) => (
                <div key={i} className={cn(
                  "p-3 rounded border",
                  t.role === 'user' ? "bg-white/5 border-white/10" : "bg-orange-500/5 border-orange-500/20 text-neutral-300"
                )}>
                  <div className="flex justify-between items-center mb-2">
                    <span className={cn(
                      "text-[9px] font-black uppercase px-1.5 py-0.5 rounded",
                      t.role === 'user' ? "bg-white/10 text-white/60" : "bg-orange-500 text-black"
                    )}>
                      {t.role}
                    </span>
                    <span className="text-[8px] text-neutral-600">OFFSET +{i * 12}ms</span>
                  </div>
                  <p className="leading-relaxed">{t.text}</p>
                </div>
              ))
            )}
          </div>

          <div className="p-3 bg-black/60 border-t border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              <span className="text-[9px] mono uppercase text-neutral-500">Live Telemetry</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] mono text-neutral-600 uppercase font-medium">
              <span>LATENCY: 42MS</span>
              <span>JITTER: 0.2MS</span>
              <span>VOICE: GEM-3-L</span>
              <span>CODEC: L-PCM</span>
            </div>
          </div>
        </div>
      </main>

      {/* Grid Pattern Background */}
      <div className="fixed inset-0 glow-dots pointer-events-none opacity-20 -z-10" />
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
