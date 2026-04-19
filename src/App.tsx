/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality } from "@google/genai";
import { 
  Play, 
  Download, 
  Settings2, 
  Volume2, 
  Mic2, 
  AlertCircle, 
  Loader2,
  ChevronRight,
  Save,
  Trash2,
  Bookmark,
  UploadCloud,
  X,
  Radio
} from "lucide-react";
import { useState, useRef, useEffect, ChangeEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { base64ToUint8Array, pcmToWav } from "./lib/audioUtils";

const VOICES = [
  { id: "Puck", name: "Puck", description: "Energetic, youthful, and bright" },
  { id: "Charon", name: "Charon", description: "Deep, authoritative, and steady" },
  { id: "Kore", name: "Kore", description: "Warm, professional, and balanced" },
  { id: "Fenrir", name: "Fenrir", description: "Strong, gravelly, and textured" },
  { id: "Zephyr", name: "Zephyr", description: "Soft, airy, and whispered" },
];

export default function App() {
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0].id);
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<{id: string, name: string, voiceId: string, speed: number, pitch: number}[]>([]);
  const [newPresetName, setNewPresetName] = useState("");
  const [currentWordIndex, setCurrentWordIndex] = useState<number | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [wordTimestamps, setWordTimestamps] = useState<number[]>([]);
  const [isCloningMode, setIsCloningMode] = useState(false);
  const [clonedAudio, setClonedAudio] = useState<{base64: string, mimeType: string, url: string} | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load presets from localStorage on mount
  useEffect(() => {
    const savedPresets = localStorage.getItem("voxgen-presets");
    if (savedPresets) {
      try {
        setPresets(JSON.parse(savedPresets));
      } catch (e) {
        console.error("Failed to parse presets", e);
      }
    }
  }, []);

  // Save presets to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("voxgen-presets", JSON.stringify(presets));
  }, [presets]);

  // Initialize Gemini AI
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const handleGenerate = async () => {
    if (!text.trim()) {
      setError("Please enter some text to synthesize.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setAudioUrl(null);

    try {
      if (isCloningMode && !clonedAudio) {
        throw new Error("Please upload a voice sample for cloning.");
      }

      const getSynthesisInstructions = () => {
        let instructions = [];
        if (speed < 0.8) instructions.push("slowly");
        else if (speed > 1.5) instructions.push("very fast");
        else if (speed > 1.2) instructions.push("fast");

        if (pitch < 0.8) instructions.push("with a low pitch");
        else if (pitch > 1.5) instructions.push("with a very high pitch");
        else if (pitch > 1.2) instructions.push("with a high pitch");

        if (instructions.length === 0) return "";
        return `Speak ${instructions.join(" and ")}: `;
      };

      let response;

      if (isCloningMode && clonedAudio) {
        // Voice Cloning using gemini-3.1-flash-live-preview
        response = await ai.models.generateContent({
          model: "gemini-3.1-flash-live-preview",
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: clonedAudio.mimeType,
                    data: clonedAudio.base64
                  }
                },
                { text: `Synthesize this text using the exact voice, cadence, and tone from the audio sample above. ${getSynthesisInstructions()}${text}` }
              ]
            }
          ],
          config: {
            responseModalities: [Modality.AUDIO]
          },
        });
      } else {
        // Standard TTS
        response = await ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text: `${getSynthesisInstructions()}${text}` }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice as any },
              },
            },
          },
        });
      }

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (base64Audio) {
        const pcmData = base64ToUint8Array(base64Audio);
        const wavBlob = pcmToWav(pcmData, 24000);
        const url = URL.createObjectURL(wavBlob);
        setAudioUrl(url);
        
        // Prepare words for highlighting
        const textWords = text.trim().split(/\s+/);
        setWords(textWords);
        setCurrentWordIndex(null);
      } else {
        throw new Error("No audio data received from Gemini.");
      }
    } catch (err: any) {
      console.error("TTS Error:", err);
      setError(err.message || "Failed to generate speech. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePreview = async () => {
    setIsPreviewing(true);
    setError(null);

    try {
      const voice = VOICES.find(v => v.id === selectedVoice);
      const previewText = `Hello, I am ${voice?.name}. This is a preview of my voice profile.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: previewText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice as any },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (base64Audio) {
        const pcmData = base64ToUint8Array(base64Audio);
        const wavBlob = pcmToWav(pcmData, 24000);
        const url = URL.createObjectURL(wavBlob);
        
        // Use a temporary audio element to avoid overriding main result
        const audio = new Audio(url);
        audio.play();
      } else {
        throw new Error("No preview data received.");
      }
    } catch (err: any) {
      console.error("Preview Error:", err);
      setError("Failed to play voice preview.");
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = `voxel-ai-${Date.now()}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;
    const newPreset = {
      id: Date.now().toString(),
      name: newPresetName.trim(),
      voiceId: selectedVoice,
      speed: speed,
      pitch: pitch
    };
    setPresets([...presets, newPreset]);
    setNewPresetName("");
  };

  const applyPreset = (preset: {voiceId: string, speed: number, pitch?: number}) => {
    setSelectedVoice(preset.voiceId);
    setSpeed(preset.speed);
    if (preset.pitch !== undefined) {
      setPitch(preset.pitch);
    }
  };

  const deletePreset = (id: string) => {
    setPresets(presets.filter(p => p.id !== id));
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("audio/")) {
      setError("Please upload a valid audio file.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const result = event.target?.result as string;
        const base64 = result.split(",")[1];
        setClonedAudio({
          base64,
          mimeType: file.type,
          url: URL.createObjectURL(file)
        });
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Upload Error:", err);
      setError("Failed to process audio file.");
      setIsUploading(false);
    }
  };

  const removeClonedAudio = () => {
    if (clonedAudio?.url) {
      URL.revokeObjectURL(clonedAudio.url);
    }
    setClonedAudio(null);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current || words.length === 0) return;
    
    const currentTime = audioRef.current.currentTime;
    const duration = audioRef.current.duration;
    
    if (!duration) return;

    // Weighted estimation: words with more characters take longer to say
    const charCounts = words.map(w => w.length + 1); // +1 for spaces
    const totalChars = charCounts.reduce((a, b) => a + b, 0);
    
    let accumulatedTime = 0;
    let foundIndex = 0;
    
    for (let i = 0; i < words.length; i++) {
      const wordDuration = (charCounts[i] / totalChars) * duration;
      if (currentTime >= accumulatedTime && currentTime < accumulatedTime + wordDuration) {
        foundIndex = i;
        break;
      }
      accumulatedTime += wordDuration;
    }
    
    setCurrentWordIndex(foundIndex);
  };

  const handleAudioEnded = () => {
    setCurrentWordIndex(null);
  };

  return (
    <div className="flex flex-col min-h-screen lg:h-screen bg-elegant-bg lg:overflow-hidden overflow-y-auto font-sans">
      {/* Header */}
      <header className="h-[70px] border-b border-elegant-border flex items-center justify-between px-6 lg:px-10 shrink-0 sticky top-0 bg-elegant-bg z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-elegant-accent shape-hex-box neon-glow" />
          <h1 className="text-xl font-bold tracking-tighter text-white uppercase italic">VoxGen AI</h1>
        </div>
        <div className="text-elegant-secondary text-[0.7rem] uppercase tracking-[0.3em] font-mono hidden sm:block">
          System Status: <span className="text-elegant-accent neon-glow drop-shadow-[0_0_5px_rgba(124,77,255,1)]">Online</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-visible lg:overflow-hidden">
        {/* Editor Section (Left) */}
        <section className="flex-1 p-6 lg:p-10 flex flex-col border-b lg:border-b-0 lg:border-r border-elegant-border min-h-[400px] lg:min-h-0">
          <div className="flex-1 bg-elegant-surface border border-elegant-border rounded-xl p-6 lg:p-8 flex flex-col group focus-within:border-elegant-accent/50 focus-within:neon-glow transition-all duration-500 relative overflow-hidden">
            {audioUrl ? (
              <div className="flex-1 text-[1rem] lg:text-[1.15rem] leading-[1.8] text-elegant-secondary overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-elegant-border">
                {words.map((word, i) => (
                  <span 
                    key={i} 
                    className={`transition-all duration-200 inline-block mr-1.5 rounded-sm px-1 ${
                      currentWordIndex === i 
                        ? "bg-elegant-accent text-white neon-glow font-medium scale-110 translate-y-[-1px]" 
                        : ""
                    }`}
                  >
                    {word}
                  </span>
                ))}
                
                <button 
                  onClick={() => {
                    setAudioUrl(null);
                    setCurrentWordIndex(null);
                  }}
                  className="mt-12 block text-[0.7rem] text-elegant-accent hover:text-white uppercase tracking-[0.3em] font-bold transition-colors"
                >
                  [ Edit Script ]
                </button>
              </div>
            ) : (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Enter your script here..."
                className="flex-1 bg-transparent border-none text-white text-[1rem] lg:text-[1.15rem] leading-[1.8] resize-none outline-none placeholder-elegant-secondary/30 font-light min-h-[250px] lg:min-h-0"
              />
            )}
          </div>
          <div className="mt-4 text-elegant-secondary text-[0.7rem] lg:text-[0.85rem] flex justify-between uppercase font-mono tracking-wider">
            <span>{text.length} characters</span>
            <span>Approx. {Math.ceil(text.length / 15)} seconds</span>
          </div>
          
          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-3"
              >
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {audioUrl && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 bg-elegant-surface border border-elegant-border shape-cut-corner p-4 lg:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 neon-glow"
            >
              <div className="w-12 h-12 shrink-0 shape-hex-box bg-elegant-accent/20 flex items-center justify-center">
                <Play className="text-elegant-accent w-6 h-6 drop-shadow-[0_0_8px_rgba(124,77,255,0.5)]" />
              </div>
              <div className="flex-1 w-full">
                <p className="text-[10px] font-mono text-elegant-secondary uppercase tracking-[0.3em] mb-2 font-bold">Preview Interface</p>
                <audio 
                  ref={audioRef}
                  key={audioUrl} 
                  controls 
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={handleAudioEnded}
                  onPause={handleAudioEnded}
                  className="w-full h-8 accent-elegant-accent custom-audio-player"
                >
                  <source src={audioUrl} type="audio/wav" />
                </audio>
              </div>
            </motion.div>
          )}
        </section>

        {/* Controls Section (Right) */}
        <section className="w-full lg:w-[340px] p-6 lg:p-10 bg-elegant-darker flex flex-col gap-8 lg:overflow-y-auto scrollbar-thin scrollbar-thumb-elegant-border">
          {/* Mode Switcher */}
          <div className="flex bg-elegant-surface p-1 rounded-xl border border-elegant-border">
            <button 
              onClick={() => setIsCloningMode(false)}
              className={`flex-1 py-2 text-[0.7rem] uppercase font-bold tracking-widest rounded-lg transition-all ${!isCloningMode ? 'bg-elegant-accent text-white neon-glow' : 'text-elegant-secondary hover:text-white'}`}
            >
              Prebuilt
            </button>
            <button 
              onClick={() => setIsCloningMode(true)}
              className={`flex-1 py-2 text-[0.7rem] uppercase font-bold tracking-widest rounded-lg transition-all ${isCloningMode ? 'bg-elegant-accent text-white neon-glow' : 'text-elegant-secondary hover:text-white'}`}
            >
              Cloning
            </button>
          </div>

          {!isCloningMode ? (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col gap-3"
            >
              <label className="text-elegant-secondary text-[0.75rem] uppercase letter-spacing-[1px] font-semibold tracking-widest flex items-center justify-between">
                <span>Voice Model</span>
                <button 
                  onClick={handlePreview}
                  disabled={isPreviewing}
                  className="text-elegant-accent hover:text-white transition-colors flex items-center gap-1 normal-case tracking-normal font-medium text-[0.7rem] disabled:opacity-50"
                >
                  {isPreviewing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3 fill-current" />
                  )}
                  Play Sample
                </button>
              </label>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="bg-elegant-surface border border-elegant-border text-white p-3 rounded-lg text-[0.9rem] outline-none cursor-pointer hover:border-elegant-accent/50 transition-colors"
              >
                {VOICES.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name} — {voice.description}
                  </option>
                ))}
              </select>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col gap-3"
            >
              <label className="text-elegant-secondary text-[0.75rem] uppercase letter-spacing-[1px] font-semibold tracking-widest">
                Voice Sample
              </label>
              
              {!clonedAudio ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-elegant-surface border-2 border-dashed border-elegant-border h-32 rounded-xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-elegant-accent/50 hover:bg-elegant-accent/5 transition-all group"
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    accept="audio/*" 
                    className="hidden" 
                  />
                  {isUploading ? (
                    <Loader2 className="w-8 h-8 text-elegant-accent animate-spin" />
                  ) : (
                    <>
                      <UploadCloud className="w-8 h-8 text-elegant-secondary group-hover:text-elegant-accent transition-colors" />
                      <p className="text-[10px] text-elegant-secondary uppercase font-mono tracking-widest">Upload (.wav, .mp3)</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="bg-elegant-surface border border-elegant-accent/30 p-4 rounded-xl relative group">
                  <button 
                    onClick={removeClonedAudio}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-elegant-accent/10 rounded-lg flex items-center justify-center">
                      <Radio className="w-5 h-5 text-elegant-accent animate-pulse" />
                    </div>
                    <div>
                      <p className="text-xs text-white font-bold uppercase tracking-wider">Sample Captured</p>
                      <p className="text-[9px] text-elegant-secondary font-mono">{clonedAudio.mimeType} • Local Ready</p>
                    </div>
                  </div>
                  <audio src={clonedAudio.url} controls className="w-full h-8 accent-elegant-accent scale-95 origin-left" />
                </div>
              )}
              <p className="text-[9px] text-elegant-secondary italic leading-relaxed">
                * Upload a clear 10-20s sample of the voice you wish to clone.
              </p>
            </motion.div>
          )}

          <div className="flex flex-col gap-3">
            <label className="text-elegant-secondary text-[0.75rem] uppercase letter-spacing-[1px] font-semibold tracking-widest">
              Speech Rate
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="flex-1 accent-elegant-accent h-1.5 bg-elegant-border rounded-lg appearance-none cursor-pointer"
              />
              <span className="font-mono text-elegant-accent w-10 text-right text-sm">
                {speed.toFixed(1)}x
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-elegant-secondary text-[0.75rem] uppercase letter-spacing-[1px] font-semibold tracking-widest">
              Voice Pitch
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={pitch}
                onChange={(e) => setPitch(parseFloat(e.target.value))}
                className="flex-1 accent-elegant-accent h-1.5 bg-elegant-border rounded-lg appearance-none cursor-pointer"
              />
              <span className="font-mono text-elegant-accent w-10 text-right text-sm">
                {pitch.toFixed(1)}v
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-elegant-secondary text-[0.75rem] uppercase letter-spacing-[1px] font-semibold tracking-widest flex items-center gap-2">
              <Bookmark className="w-3 h-3 text-elegant-accent" />
              Presets
            </label>
            
            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="Name preset..."
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="flex-1 bg-elegant-surface border border-elegant-border text-white px-3 py-2 rounded-lg text-xs outline-none focus:border-elegant-accent/50 transition-colors"
              />
              <button 
                onClick={handleSavePreset}
                disabled={!newPresetName.trim()}
                className="px-4 bg-elegant-accent text-white shape-cyber-tag disabled:opacity-20 hover:neon-glow transition-all"
                title="Save Current Settings"
              >
                <Save className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-40 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-elegant-border">
              <AnimatePresence>
                {presets.map((preset) => (
                  <motion.div 
                    key={preset.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex items-center justify-between p-2 pl-4 bg-elegant-surface border border-elegant-border shape-cut-corner group hover:border-elegant-accent/50 hover:neon-glow transition-all cursor-pointer"
                    onClick={() => applyPreset(preset)}
                  >
                    <div className="flex-1 text-left">
                      <p className="text-xs text-white font-bold truncate tracking-tight">{preset.name}</p>
                      <p className="text-[9px] text-elegant-secondary font-mono italic">
                        {VOICES.find(v => v.id === preset.voiceId)?.name} • {preset.speed.toFixed(1)}x • {preset.pitch?.toFixed(1) || "1.0"}v
                      </p>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePreset(preset.id);
                      }}
                      className="p-1.5 text-elegant-secondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all mr-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
              {presets.length === 0 && (
                <p className="text-[10px] text-elegant-secondary/50 text-center py-4 italic">No presets saved yet</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-6">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`w-full py-6 shape-cyber-button font-black text-[1.1rem] tracking-[0.25em] transition-all flex items-center justify-center gap-4 active:scale-[0.97] group border-l-4 border-elegant-accent shadow-2xl shadow-elegant-accent/20 ${
                isGenerating
                  ? "bg-elegant-surface text-elegant-secondary cursor-not-allowed border-none opacity-50"
                  : "bg-elegant-accent text-white neon-glow-strong neon-pulse hover:translate-y-[-3px] active:translate-y-[1px]"
              }`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="animate-pulse">PROCESSING DATA...</span>
                </>
              ) : (
                <>
                  <Mic2 className="w-6 h-6 group-hover:rotate-12 transition-transform duration-300" />
                  <span>SYNTHESIZE</span>
                </>
              )}
            </button>

            {audioUrl && (
              <button
                onClick={handleDownload}
                className="w-full py-5 shape-cyber-button font-bold border border-elegant-accent/50 text-white text-[0.9rem] hover:bg-elegant-accent/10 transition-all flex items-center justify-center gap-3 tracking-[0.15em]"
              >
                <Download className="w-5 h-5" />
                <span>EXP0RT WAV</span>
              </button>
            )}
          </div>

          {/* Recents / Information */}
          <div className="mt-auto pt-8 border-t border-elegant-border flex flex-col gap-4">
            <label className="text-elegant-secondary text-[0.75rem] uppercase letter-spacing-[1px] font-semibold tracking-widest">
              System Specs
            </label>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-[0.85rem] text-elegant-secondary font-mono tracking-tighter">
                <span className="text-white">Sample Rate</span>
                <span>24.0 kHz</span>
              </div>
              <div className="flex justify-between items-center text-[0.85rem] text-elegant-secondary font-mono tracking-tighter">
                <span className="text-white">Bit Depth</span>
                <span>16-bit</span>
              </div>
              <div className="flex justify-between items-center text-[0.85rem] text-elegant-secondary font-mono tracking-tighter">
                <span className="text-white">Audio Logic</span>
                <span>Gemini 3.1</span>
              </div>
            </div>
          </div>
        </section>
      </main>
      
      {/* Global CSS for the range slider and scrollbars could go in index.css, 
          but keeping it simple with Tailwind for now */}
    </div>
  );
}
