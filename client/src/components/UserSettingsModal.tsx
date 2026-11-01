import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  User,
  Palette,
  Check,
  Camera,
  Image,
  Trash2,
  Mic,
  Headphones,
  Volume2,
  Monitor,
  Bell,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  Radio,
  LogOut,
} from 'lucide-react';
import {
  QUALITY_PRESETS,
  DEFAULT_AUDIO_SETTINGS,
  type User as UserType,
  type AudioSettings,
  type StreamQualityPreset,
  type InputAudioProfile,
} from '../types';
import { sounds } from '../services/soundEffects';

interface UserSettingsModalProps {
  currentUser: UserType | null;
  isOpen: boolean;
  initialTab?: 'account' | 'voice' | 'streaming' | 'sounds';
  audioSettings?: AudioSettings;
  streamQuality?: StreamQualityPreset;
  onClose: () => void;
  onSave: (updates: { name: string; avatarColor: string; avatarUrl?: string; bio?: string }) => void;
  onUpdateAudioSettings?: (settings: AudioSettings) => void;
  onChangeStreamQuality?: (preset: StreamQualityPreset) => void;
  onLogout?: () => void;
}

const COLOR_OPTIONS = [
  '#8b5cf6', // Violet
  '#a855f7', // Purple
  '#d946ef', // Fuchsia
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#f59e0b', // Amber
];

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  currentUser,
  isOpen,
  initialTab = 'voice',
  audioSettings = DEFAULT_AUDIO_SETTINGS,
  streamQuality = 'balanced',
  onClose,
  onSave,
  onUpdateAudioSettings,
  onChangeStreamQuality,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'account' | 'voice' | 'streaming' | 'sounds'>(initialTab);

  // Account State
  const currentName = currentUser?.name || currentUser?.displayName || currentUser?.username || '';
  const [name, setName] = useState(currentName);
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [selectedColor, setSelectedColor] = useState(currentUser?.avatarColor || '#8b5cf6');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(currentUser?.avatarUrl);
  const [profileSavedToast, setProfileSavedToast] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audio Devices State
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [localAudio, setLocalAudio] = useState<AudioSettings>(audioSettings);

  // Mic Test State
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micTestLevel, setMicTestLevel] = useState(0);
  const testStreamRef = useRef<MediaStream | null>(null);
  const testAudioCtxRef = useRef<AudioContext | null>(null);
  const testIntervalRef = useRef<number | null>(null);
  const testAudioElRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(currentUser?.name || currentUser?.displayName || currentUser?.username || '');
      setBio(currentUser?.bio || '');
      setSelectedColor(currentUser?.avatarColor || '#8b5cf6');
      setAvatarUrl(currentUser?.avatarUrl);
      setLocalAudio(audioSettings);
      loadAudioDevices();
    } else {
      stopMicTest();
    }
  }, [isOpen, currentUser]);

  useEffect(() => {
    if (!isOpen) return;
    const handleDeviceChange = () => loadAudioDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, []);

  const loadAudioDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      // Solicita permissão rápida caso os rótulos estejam ocultos pelo navegador
      const initialDevices = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = initialDevices.some((d) => d.label && d.label.trim().length > 0);
      if (!hasLabels) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          tempStream.getTracks().forEach((t) => t.stop());
        } catch {}
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      const outputs = devices.filter((d) => d.kind === 'audiooutput');
      setInputDevices(inputs);
      setOutputDevices(outputs);
    } catch (err) {
      console.warn('Erro ao listar dispositivos de áudio:', err);
    }
  };

  const updateAudioField = <K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) => {
    const updated: AudioSettings = { ...localAudio, [key]: value };

    if (key === 'inputProfile') {
      if (value === 'isolation') {
        updated.echoCancellation = true;
        updated.noiseSuppression = true;
        updated.autoGainControl = true;
      } else if (value === 'studio') {
        updated.echoCancellation = false;
        updated.noiseSuppression = false;
        updated.autoGainControl = false;
      }
    }

    setLocalAudio(updated);
    onUpdateAudioSettings?.(updated);
  };

  const startMicTest = async () => {
    stopMicTest();
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId:
            localAudio.inputDeviceId && localAudio.inputDeviceId !== 'default'
              ? { ideal: localAudio.inputDeviceId }
              : undefined,
          echoCancellation: localAudio.echoCancellation,
          noiseSuppression: localAudio.noiseSuppression,
          autoGainControl: localAudio.autoGainControl,
        },
        video: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      testStreamRef.current = stream;

      const ctx = new AudioContext();
      testAudioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = localAudio.inputVolume / 100;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      const dest = ctx.createMediaStreamDestination();
      source.connect(gainNode);
      gainNode.connect(analyser);
      gainNode.connect(dest);

      // Retorno de áudio para o usuário se ouvir durante o teste
      const audioEl = new Audio();
      audioEl.srcObject = dest.stream;
      audioEl.volume = Math.min(1, localAudio.outputVolume / 100);
      if (localAudio.outputDeviceId && localAudio.outputDeviceId !== 'default' && 'setSinkId' in audioEl) {
        try {
          await (audioEl as any).setSinkId(localAudio.outputDeviceId);
        } catch {}
      }
      audioEl.play().catch(() => {});
      testAudioElRef.current = audioEl;

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      setIsTestingMic(true);

      testIntervalRef.current = window.setInterval(() => {
        analyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) sum += freqData[i];
        const avg = sum / freqData.length;
        const normalized = Math.min(100, Math.round((avg / 55) * 100));
        setMicTestLevel(normalized);
      }, 45);
    } catch (err) {
      console.warn('Falha ao iniciar teste de microfone:', err);
      setIsTestingMic(false);
    }
  };

  const stopMicTest = () => {
    if (testIntervalRef.current) {
      clearInterval(testIntervalRef.current);
      testIntervalRef.current = null;
    }
    if (testAudioElRef.current) {
      testAudioElRef.current.pause();
      testAudioElRef.current.srcObject = null;
      testAudioElRef.current = null;
    }
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
    }
    if (testAudioCtxRef.current) {
      testAudioCtxRef.current.close().catch(() => {});
      testAudioCtxRef.current = null;
    }
    setIsTestingMic(false);
    setMicTestLevel(0);
  };

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      avatarColor: selectedColor,
      avatarUrl: avatarUrl || '',
      bio: bio.trim(),
    });
    setProfileSavedToast(true);
    setTimeout(() => setProfileSavedToast(false), 2500);
  };

  const totalBars = 36;
  const activeBarsCount = Math.round((micTestLevel / 100) * totalBars);
  const thresholdBarIndex = localAudio.autoSensitivity
    ? Math.round((14 / 80) * totalBars)
    : Math.round((localAudio.sensitivityThreshold / 80) * totalBars);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl h-[84vh] max-h-[720px] bg-[#0e081a] border border-violet-500/30 rounded-3xl shadow-2xl shadow-violet-950/80 flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* LEFT SIDEBAR MENU (Estilo Discord alinhado ao Janjacord) */}
        <div className="w-64 bg-[#120b22] border-r border-violet-500/15 p-4 flex flex-col justify-between shrink-0">
          <div className="space-y-5">
            {/* Mini User Profile Header */}
            <button
              type="button"
              onClick={() => setActiveTab('account')}
              className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-[#19102e] hover:bg-[#21153b] border border-violet-500/20 transition text-left cursor-pointer"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={name}
                  className="w-10 h-10 rounded-full object-cover border border-violet-400/40 shrink-0"
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0"
                  style={{ backgroundColor: selectedColor }}
                >
                  {(name || 'U').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-extrabold text-white truncate">{name || 'Usuário'}</div>
                <div className="text-[10px] text-violet-300/70 font-medium flex items-center gap-1">
                  <span>Editar Perfil</span>
                  {currentUser?.tag && <span className="font-mono text-violet-400">#{currentUser.tag}</span>}
                </div>
              </div>
            </button>

            {/* Navigation Groups */}
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="px-3 text-[10px] font-black uppercase tracking-wider text-violet-300/50">
                  Configurações de Usuário
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('account')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    activeTab === 'account'
                      ? 'bg-gradient-to-r from-violet-600/30 to-fuchsia-600/20 text-white border border-violet-500/40'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <User className="w-4 h-4 text-violet-400" />
                  <span>Minha Conta & Perfil</span>
                </button>
              </div>

              <div className="space-y-1">
                <div className="px-3 text-[10px] font-black uppercase tracking-wider text-violet-300/50">
                  Experiência (Voz & Vídeo)
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('voice')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    activeTab === 'voice'
                      ? 'bg-gradient-to-r from-violet-600/30 to-fuchsia-600/20 text-white border border-violet-500/40'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Mic className="w-4 h-4 text-violet-400" />
                  <span>Voz & Dispositivos</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('streaming')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    activeTab === 'streaming'
                      ? 'bg-gradient-to-r from-violet-600/30 to-fuchsia-600/20 text-white border border-violet-500/40'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Monitor className="w-4 h-4 text-fuchsia-400" />
                  <span>Transmissão de Tela</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('sounds')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    activeTab === 'sounds'
                      ? 'bg-gradient-to-r from-violet-600/30 to-fuchsia-600/20 text-white border border-violet-500/40'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Bell className="w-4 h-4 text-violet-400" />
                  <span>Sons & Efeitos</span>
                </button>
              </div>
            </div>
          </div>

          {/* Logout / Bottom Info */}
          <div className="pt-3 border-t border-violet-500/15 space-y-2">
            {onLogout && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-500/15 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair da Conta</span>
              </button>
            )}
            <div className="px-3 text-[10px] text-slate-500 font-mono">
              Jolt v1.2.0 • Audio Engine
            </div>
          </div>
        </div>

        {/* RIGHT CONTENT AREA */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Header Bar */}
          <div className="h-14 px-7 border-b border-violet-500/15 flex items-center justify-between bg-[#120b22]/60 shrink-0">
            <div className="flex items-center gap-2.5">
              {activeTab === 'voice' && <Mic className="w-4 h-4 text-violet-400" />}
              {activeTab === 'account' && <User className="w-4 h-4 text-violet-400" />}
              {activeTab === 'streaming' && <Monitor className="w-4 h-4 text-fuchsia-400" />}
              {activeTab === 'sounds' && <Bell className="w-4 h-4 text-violet-400" />}
              <h2 className="text-sm font-black text-white tracking-wide">
                {activeTab === 'voice' && 'Voz & Vídeo'}
                {activeTab === 'account' && 'Minha Conta & Perfil'}
                {activeTab === 'streaming' && 'Qualidade de Transmissão & Anti-Eco'}
                {activeTab === 'sounds' && 'Sons do Aplicativo'}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-violet-500/20 text-slate-400 hover:text-white transition flex items-center gap-1 text-xs font-bold px-2.5 cursor-pointer"
            >
              <span>ESC</span>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Tab Body */}
          <div className="flex-1 overflow-y-auto p-7 space-y-7">
            {/* TAB 1: VOZ & DISPOSITIVOS (Inspirado no Discord Voice & Video) */}
            {activeTab === 'voice' && (
              <div className="space-y-7">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-white">Voz</h3>
                    <p className="text-xs text-slate-400">
                      Escolha qual microfone e qual fone/alto-falante o Jolt deve usar.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={loadAudioDevices}
                    className="px-3 py-1.5 rounded-xl bg-[#19112c] hover:bg-[#24183e] border border-violet-500/25 text-violet-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Atualizar Dispositivos</span>
                  </button>
                </div>

                {/* Seletores de Microfone e Alto-falante lado a lado */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Microfone */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-violet-400" />
                      <span>Microfone (Dispositivo de Entrada)</span>
                    </label>
                    <div className="relative">
                      <select
                        value={localAudio.inputDeviceId}
                        onChange={(e) => updateAudioField('inputDeviceId', e.target.value)}
                        className="w-full bg-[#160f29] hover:bg-[#1c1333] border border-violet-500/30 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-white outline-none focus:border-violet-400 transition cursor-pointer"
                      >
                        <option value="default">Padrão do Sistema (Windows Default)</option>
                        {inputDevices.map((d, idx) => (
                          <option key={d.deviceId || idx} value={d.deviceId}>
                            {d.label || `Microfone ${idx + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Alto-falante / Fone */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Headphones className="w-3.5 h-3.5 text-fuchsia-400" />
                      <span>Fone / Alto-falante (Dispositivo de Saída)</span>
                    </label>
                    <div className="relative">
                      <select
                        value={localAudio.outputDeviceId}
                        onChange={(e) => updateAudioField('outputDeviceId', e.target.value)}
                        className="w-full bg-[#160f29] hover:bg-[#1c1333] border border-violet-500/30 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-white outline-none focus:border-violet-400 transition cursor-pointer"
                      >
                        <option value="default">Padrão do Sistema (Windows Default)</option>
                        {outputDevices.map((d, idx) => (
                          <option key={d.deviceId || idx} value={d.deviceId}>
                            {d.label || `Alto-falante / Fone ${idx + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Sliders de Volume de Microfone e Volume de Saída */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-200">Volume do Microfone</span>
                      <span className="text-violet-400 font-mono">{localAudio.inputVolume}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={localAudio.inputVolume}
                      onChange={(e) => updateAudioField('inputVolume', Number(e.target.value))}
                      className="w-full accent-violet-500 h-2 bg-[#1c1333] rounded-lg cursor-pointer"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-200">Volume do Fone / Alto-falante</span>
                      <span className="text-fuchsia-400 font-mono">{localAudio.outputVolume}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={localAudio.outputVolume}
                      onChange={(e) => updateAudioField('outputVolume', Number(e.target.value))}
                      className="w-full accent-fuchsia-500 h-2 bg-[#1c1333] rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* Teste de Microfone com Barra Segmentada (Igual ao Discord) */}
                <div className="bg-[#140d24] border border-violet-500/20 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <button
                      type="button"
                      onClick={isTestingMic ? stopMicTest : startMicTest}
                      className={`px-5 py-2.5 rounded-xl text-xs font-black transition shadow-lg shrink-0 cursor-pointer ${
                        isTestingMic
                          ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                          : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-violet-600/30'
                      }`}
                    >
                      {isTestingMic ? 'Parar Teste' : 'Testar Microfone'}
                    </button>

                    {/* Medidor de barras verticais */}
                    <div className="flex-1 flex items-center justify-between gap-1 h-8 px-2 bg-[#0b0714] rounded-xl border border-violet-500/15">
                      {Array.from({ length: totalBars }).map((_, idx) => {
                        const isFilled = isTestingMic && idx < activeBarsCount;
                        const isAboveThreshold = idx >= thresholdBarIndex;
                        return (
                          <div
                            key={idx}
                            className={`w-1.5 h-5 rounded-full transition-colors duration-75 ${
                              isFilled
                                ? isAboveThreshold
                                  ? 'bg-gradient-to-t from-violet-500 to-emerald-400 shadow-sm shadow-emerald-400/50'
                                  : 'bg-violet-500/60'
                                : 'bg-slate-800'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Problemas no áudio? Clique em <strong className="text-violet-300">Testar Microfone</strong> e fale para ouvir seu retorno e ver o medidor subir.
                  </p>
                </div>

                <div className="h-[1px] bg-violet-500/15" />

                {/* Perfil de Entrada (Input Profile: Voice Isolation / Studio / Custom) */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-violet-300">
                    Perfil de Entrada (Input Profile)
                  </h4>

                  <div className="space-y-2.5">
                    {(
                      [
                        {
                          id: 'isolation',
                          title: 'Isolamento de Voz (Voice Isolation)',
                          desc: 'Apenas sua voz limpa: o Jolt corta o barulho do teclado, ventilador e eco automaticamente.',
                        },
                        {
                          id: 'studio',
                          title: 'Estúdio (Studio)',
                          desc: 'Áudio puro: microfone aberto sem filtros de processamento para interfaces e microfones dedicados.',
                        },
                        {
                          id: 'custom',
                          title: 'Personalizado (Custom)',
                          desc: 'Modo avançado: escolha individualmente quais filtros de áudio deseja ligar ou desligar.',
                        },
                      ] as { id: InputAudioProfile; title: string; desc: string }[]
                    ).map((profile) => {
                      const active = localAudio.inputProfile === profile.id;
                      return (
                        <div
                          key={profile.id}
                          onClick={() => updateAudioField('inputProfile', profile.id)}
                          className={`p-3.5 rounded-2xl border transition flex items-start gap-3.5 cursor-pointer ${
                            active
                              ? 'bg-violet-600/15 border-violet-500/50 text-white'
                              : 'bg-[#130c21] hover:bg-[#19102c] border-violet-500/15 text-slate-300'
                          }`}
                        >
                          <div
                            className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              active ? 'border-violet-400 bg-violet-600' : 'border-slate-500'
                            }`}
                          >
                            {active && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-100">{profile.title}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">{profile.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Se Personalizado estiver marcado, exibe os switches individuais */}
                  {localAudio.inputProfile === 'custom' && (
                    <div className="p-4 rounded-2xl bg-[#150d26] border border-violet-500/25 space-y-3 mt-2">
                      <ToggleRow
                        label="Cancelamento de Eco (Echo Cancellation)"
                        description="Impede que o som saindo das caixas de som volte pelo microfone."
                        checked={localAudio.echoCancellation}
                        onChange={(v) => updateAudioField('echoCancellation', v)}
                      />
                      <ToggleRow
                        label="Supressão de Ruído (Noise Suppression)"
                        description="Remove chiados e ruídos constantes de fundo da sua transmissão de voz."
                        checked={localAudio.noiseSuppression}
                        onChange={(v) => updateAudioField('noiseSuppression', v)}
                      />
                      <ToggleRow
                        label="Controle Automático de Ganho (Auto Gain Control)"
                        description="Nivela automaticamente o volume da sua voz quando você fala mais baixo ou mais alto."
                        checked={localAudio.autoGainControl}
                        onChange={(v) => updateAudioField('autoGainControl', v)}
                      />
                    </div>
                  )}
                </div>

                <div className="h-[1px] bg-violet-500/15" />

                {/* Sensibilidade de Entrada Automática */}
                <div className="space-y-4">
                  <ToggleRow
                    label="Ajustar Sensibilidade de Entrada Automaticamente"
                    description="Controla quanto som o Jolt exige para ativar seu microfone na chamada."
                    checked={localAudio.autoSensitivity}
                    onChange={(v) => updateAudioField('autoSensitivity', v)}
                  />

                  {!localAudio.autoSensitivity && (
                    <div className="bg-[#140d24] p-4 rounded-2xl border border-violet-500/25 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-300">Limite do Gate de Voz</span>
                        <span className="text-violet-400 font-mono">{localAudio.sensitivityThreshold}%</span>
                      </div>
                      <input
                        type="range"
                        min={2}
                        max={65}
                        value={localAudio.sensitivityThreshold}
                        onChange={(e) => updateAudioField('sensitivityThreshold', Number(e.target.value))}
                        className="w-full accent-violet-500 h-2 bg-[#1c1333] rounded-lg cursor-pointer"
                      />
                      <div className="text-[11px] text-slate-400">
                        Sons abaixo de {localAudio.sensitivityThreshold}% serão silenciados automaticamente para não transmitir cliques de teclado.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: MINHA CONTA & PERFIL */}
            {activeTab === 'account' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-center gap-6 bg-[#140d24] p-5 rounded-3xl border border-violet-500/20">
                  <div className="relative group shrink-0">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={name}
                        className="w-24 h-24 rounded-full object-cover shadow-2xl border-2 border-violet-500/60"
                      />
                    ) : (
                      <div
                        className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-black text-white shadow-xl"
                        style={{ backgroundColor: selectedColor }}
                      >
                        {(name || '?').slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-xs font-bold transition cursor-pointer"
                    >
                      <Camera className="w-6 h-6 mb-1" />
                      <span>Trocar</span>
                    </button>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <div className="space-y-2 text-center sm:text-left flex-1">
                    <div className="text-base font-black text-white flex items-center justify-center sm:justify-start gap-2">
                      <span>{name || 'Usuário'}</span>
                      {currentUser?.tag && (
                        <span className="text-xs font-mono text-violet-300 bg-violet-500/15 px-2 py-0.5 rounded-lg border border-violet-500/25">
                          #{currentUser.tag}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      Personalize sua foto, nome de exibição, recado e cor no Jolt.
                    </p>
                    <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3.5 py-1.5 bg-violet-600/25 hover:bg-violet-600 text-violet-200 hover:text-white border border-violet-500/35 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Image className="w-3.5 h-3.5" />
                        <span>Enviar Foto</span>
                      </button>

                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={() => setAvatarUrl(undefined)}
                          className="px-3.5 py-1.5 bg-rose-500/15 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/25 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remover</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-violet-300/80">
                      Nome de Exibição
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Seu nome no Jolt"
                      className="w-full bg-[#150d26] border border-violet-500/25 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-400 transition select-text"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-violet-300/80">
                      Status / Recado do Perfil
                    </label>
                    <input
                      type="text"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      maxLength={60}
                      placeholder="Ex: Jogando Valorant • Online à noite"
                      className="w-full bg-[#150d26] border border-violet-500/25 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-400 transition select-text"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-violet-300/80 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-violet-400" />
                    Cor de Destaque do Perfil
                  </label>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5">
                    {COLOR_OPTIONS.map((color) => {
                      const isSelected = selectedColor === color;
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setSelectedColor(color)}
                          className="h-9 rounded-xl flex items-center justify-center transition-transform hover:scale-105 relative shadow-sm cursor-pointer"
                          style={{ backgroundColor: color }}
                        >
                          {isSelected && <Check className="w-4 h-4 text-white drop-shadow" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  {profileSavedToast ? (
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-4 h-4" />
                      Perfil atualizado com sucesso!
                    </span>
                  ) : (
                    <span />
                  )}

                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    className="px-6 py-2.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 transition shadow-lg shadow-violet-600/30 cursor-pointer"
                  >
                    Salvar Perfil
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: TRANSMISSÃO DE TELA */}
            {activeTab === 'streaming' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-fuchsia-400" />
                    <span>Predefinição de Qualidade da Transmissão</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Escolha a resolução e taxa de quadros ideal para quando você compartilhar sua tela ou jogo.
                  </p>
                </div>

                <div className="space-y-3">
                  {(Object.keys(QUALITY_PRESETS) as StreamQualityPreset[]).map((key) => {
                    const preset = QUALITY_PRESETS[key];
                    const active = streamQuality === key;
                    return (
                      <div
                        key={key}
                        onClick={() => onChangeStreamQuality?.(key)}
                        className={`p-4 rounded-2xl border transition flex items-center justify-between cursor-pointer ${
                          active
                            ? 'bg-violet-600/20 border-violet-500/60 text-white shadow-lg shadow-violet-950/40'
                            : 'bg-[#140d24] hover:bg-[#1b1230] border-violet-500/15 text-slate-300'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="text-sm font-black flex items-center gap-2">
                            <span>{preset.label}</span>
                            {active && (
                              <span className="text-[10px] bg-violet-600 text-white px-2 py-0.5 rounded-md">
                                PADRÃO ATIVO
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">{preset.description}</div>
                        </div>

                        <div className="text-right font-mono text-xs text-violet-300 font-bold">
                          {preset.width}x{preset.height} • {preset.fps} FPS
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-4 rounded-2xl bg-[#140d24] border border-emerald-500/30 flex items-start gap-3.5">
                  <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-black text-emerald-300">
                      Proteção Anti-Eco do Jolt Sempre Ativa
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Mesmo quando você compartilha o áudio de todo o computador, o motor WebAudio + WASAPI do Jolt isola e suprime automaticamente a voz dos seus amigos na call para que eles nunca ouçam a própria voz duplicada.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: SONS & EFEITOS */}
            {activeTab === 'sounds' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-black text-white">Sons & Efeitos do Jolt</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Teste e configure os avisos sonoros de chamadas e mensagens.
                  </p>
                </div>

                <div className="bg-[#140d24] p-4 rounded-2xl border border-violet-500/20">
                  <ToggleRow
                    label="Ativar Efeitos Sonoros"
                    description="Tocar sons ao entrar/sair de canais de voz e receber novas mensagens."
                    checked={localAudio.soundEffectsEnabled}
                    onChange={(v) => updateAudioField('soundEffectsEnabled', v)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => sounds.playJoinVoice()}
                    className="p-3.5 rounded-2xl bg-[#160f29] hover:bg-[#21163d] border border-violet-500/25 flex items-center justify-between text-xs font-bold text-slate-200 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-emerald-400" />
                      Som de Entrar na Call
                    </span>
                    <span className="text-[10px] text-violet-300 bg-violet-500/20 px-2 py-1 rounded-lg">
                      Testar ▶
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => sounds.playLeaveVoice()}
                    className="p-3.5 rounded-2xl bg-[#160f29] hover:bg-[#21163d] border border-violet-500/25 flex items-center justify-between text-xs font-bold text-slate-200 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-rose-400" />
                      Som de Sair da Call
                    </span>
                    <span className="text-[10px] text-violet-300 bg-violet-500/20 px-2 py-1 rounded-lg">
                      Testar ▶
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => sounds.playMessagePop()}
                    className="p-3.5 rounded-2xl bg-[#160f29] hover:bg-[#21163d] border border-violet-500/25 flex items-center justify-between text-xs font-bold text-slate-200 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-violet-400" />
                      Notificação de Mensagem
                    </span>
                    <span className="text-[10px] text-violet-300 bg-violet-500/20 px-2 py-1 rounded-lg">
                      Testar ▶
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const ToggleRow: React.FC<{
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}> = ({ label, description, checked, onChange }) => {
  return (
    <div
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-4 cursor-pointer py-1"
    >
      <div>
        <div className="text-xs font-bold text-slate-100">{label}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">{description}</div>
      </div>
      <button
        type="button"
        className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 cursor-pointer ${
          checked ? 'bg-violet-600' : 'bg-slate-700'
        }`}
      >
        <div
          className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};
