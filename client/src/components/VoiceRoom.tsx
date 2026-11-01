import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Mic,
  MicOff,
  Headphones,
  Monitor,
  PhoneOff,
  Maximize2,
  Minimize2,
  Fullscreen,
  Sliders,
  Sparkles,
  Volume2,
  VolumeX,
  MessageSquare,
  Send,
  Paperclip,
  FileText,
  Download,
  Settings,
  X,
} from 'lucide-react';
import {
  QUALITY_PRESETS,
  DEFAULT_AUDIO_SETTINGS,
  type Channel,
  type OnlineUser,
  type StreamQualityPreset,
  type User,
  type FriendItem,
  type DMMessage,
  type Message,
  type MessageAttachment,
  type AudioSettings,
} from '../types';

interface RemoteStreamItem {
  peerId: string;
  stream: MediaStream;
  isScreen: boolean;
  updatedAt?: number;
}

interface VoiceRoomProps {
  channel: Channel;
  currentUser: User | null;
  usersInRoom: OnlineUser[];
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  remoteSpeakingPeers?: string[];
  isScreenSharing: boolean;
  streamQuality: StreamQualityPreset;
  localScreenStream: MediaStream | null;
  remoteStreams: RemoteStreamItem[];
  audioSettings?: AudioSettings;
  isDMCall?: boolean;
  targetDMFriend?: FriendItem['friend'] | null;
  dmMessages?: DMMessage[];
  channelMessages?: Message[];
  onSendMessage?: (text: string, attachment?: MessageAttachment) => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleScreenShare: () => void;
  onLeaveVoice: () => void;
  onChangeQuality: (preset: StreamQualityPreset) => void;
  onOpenSettings?: () => void;
}

export const VoiceRoom: React.FC<VoiceRoomProps> = ({
  channel,
  currentUser,
  usersInRoom,
  isMuted,
  isDeafened,
  isSpeaking,
  remoteSpeakingPeers = [],
  isScreenSharing,
  streamQuality,
  localScreenStream,
  remoteStreams,
  audioSettings = DEFAULT_AUDIO_SETTINGS,
  isDMCall = false,
  targetDMFriend = null,
  dmMessages = [],
  channelMessages = [],
  onSendMessage,
  onToggleMute,
  onToggleDeafen,
  onToggleScreenShare,
  onLeaveVoice,
  onChangeQuality,
  onOpenSettings,
}) => {
  const [focusedStream, setFocusedStream] = useState<'local' | string | null>(null);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showCallChat, setShowCallChat] = useState(isDMCall);
  const [chatInput, setChatInput] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<MessageAttachment | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const screenShares = remoteStreams.filter((s) => s.isScreen);
  const audioStreams = remoteStreams.filter((s) => !s.isScreen);

  const hasAnyScreenShare = (isScreenSharing && !!localScreenStream) || screenShares.length > 0;
  const totalScreensCount = (isScreenSharing && localScreenStream ? 1 : 0) + screenShares.length;

  // Ordenação determinística para que os participantes NUNCA saiam de ordem ou pulem de lugar
  const sortedUsersInRoom = useMemo(() => {
    const uniqueById = new Map<string, OnlineUser>();
    for (const u of usersInRoom) {
      if (!uniqueById.has(u.id)) {
        uniqueById.set(u.id, u);
      }
    }
    return Array.from(uniqueById.values()).sort((a, b) => {
      if (a.id === currentUser?.id) return -1;
      if (b.id === currentUser?.id) return 1;
      const nameA = (a.name || a.displayName || '').toLowerCase();
      const nameB = (b.name || b.displayName || '').toLowerCase();
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      return a.id.localeCompare(b.id);
    });
  }, [usersInRoom, currentUser?.id]);

  // Reseta o foco automaticamente se a transmissão focada for encerrada
  useEffect(() => {
    if (focusedStream === 'local' && (!isScreenSharing || !localScreenStream)) {
      setFocusedStream(null);
    } else if (focusedStream && focusedStream !== 'local') {
      const stillExists = screenShares.some((s) => s.peerId === focusedStream);
      if (!stillExists) {
        setFocusedStream(null);
      }
    }
  }, [focusedStream, isScreenSharing, localScreenStream, screenShares]);

  const activeCallMessages =
    isDMCall && targetDMFriend
      ? dmMessages.filter(
          (m) =>
            (m.fromUserId === currentUser?.id && m.toUserId === targetDMFriend.id) ||
            (m.fromUserId === targetDMFriend.id && m.toUserId === currentUser?.id)
        )
      : channelMessages;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeCallMessages.length, showCallChat]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return;
    const isImage = file.type.startsWith('image/');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPendingAttachment({
          name: file.name,
          type: isImage ? 'image' : 'file',
          url: reader.result,
          size: file.size,
        });
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!chatInput.trim() && !pendingAttachment) || !onSendMessage) return;
    onSendMessage(chatInput.trim(), pendingAttachment || undefined);
    setChatInput('');
    setPendingAttachment(null);
  };

  // Define as classes do grid quando só há avatares (sem tela compartilhada)
  const getAvatarGridClasses = (count: number) => {
    if (count <= 1) return 'grid-cols-1 max-w-md';
    if (count === 2) return 'grid-cols-1 sm:grid-cols-2 max-w-3xl';
    if (count <= 4) return 'grid-cols-1 sm:grid-cols-2 max-w-4xl';
    return 'grid-cols-2 md:grid-cols-3 max-w-5xl';
  };

  return (
    <div className="flex-1 bg-[#0a0612] flex flex-col justify-between overflow-hidden relative select-none">
      {/* Hidden Audio Players for Remote Voice Peers */}
      {audioStreams.map((item) => (
        <RemoteAudioPlayer
          key={`${item.peerId}-audio`}
          stream={item.stream}
          muted={isDeafened}
          volume={audioSettings.outputVolume}
          sinkId={audioSettings.outputDeviceId}
        />
      ))}

      {/* Top Header */}
      <div className="h-14 px-6 border-b border-violet-500/15 flex items-center justify-between bg-[#100a1d]/90 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
            <Volume2 className="w-4 h-4 text-violet-400 animate-pulse" />
          </div>
          <div>
            <div className="font-bold text-slate-100 text-sm">{channel.name}</div>
            <div className="text-[11px] text-violet-300/60 font-medium">
              {sortedUsersInRoom.length} {sortedUsersInRoom.length === 1 ? 'participante' : 'participantes'} na sala
            </div>
          </div>
        </div>

        {/* Stream Quality Selector & Chat Toggle */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <button
              onClick={() => setShowQualityMenu(!showQualityMenu)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#19112c] hover:bg-[#23183c] text-xs font-bold text-violet-200 border border-violet-500/25 transition cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-fuchsia-400" />
              <span>Qualidade: {QUALITY_PRESETS[streamQuality].label}</span>
            </button>

            {showQualityMenu && (
              <div className="absolute right-0 mt-2 w-80 bg-[#140d24] border border-violet-500/30 rounded-2xl shadow-2xl p-3 z-50 space-y-2">
                <div className="text-xs font-bold text-violet-300 px-2 py-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />
                  <span>Otimizador de Transmissão</span>
                </div>
                {(Object.keys(QUALITY_PRESETS) as StreamQualityPreset[]).map((key) => {
                  const preset = QUALITY_PRESETS[key];
                  const active = streamQuality === key;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        onChangeQuality(key);
                        setShowQualityMenu(false);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl transition flex flex-col gap-0.5 cursor-pointer ${
                        active
                          ? 'bg-violet-600/25 border border-violet-500/50 text-white'
                          : 'hover:bg-[#1e1433] text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center justify-between">
                        <span>{preset.label}</span>
                        {active && (
                          <span className="text-[10px] bg-violet-600 text-white px-1.5 py-0.5 rounded-md">
                            ATIVO
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">{preset.description}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#19112c] hover:bg-[#23183c] border border-violet-500/25 text-violet-200 transition cursor-pointer"
              title="Configurações de Voz e Dispositivos"
            >
              <Settings className="w-3.5 h-3.5 text-violet-400" />
              <span className="hidden sm:inline">Áudio</span>
            </button>
          )}

          <button
            onClick={() => setShowCallChat(!showCallChat)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
              showCallChat
                ? 'bg-gradient-to-r from-violet-600 to-purple-600 border-violet-400 text-white shadow-lg shadow-violet-600/20'
                : 'bg-[#19112c] hover:bg-[#23183c] border-violet-500/25 text-violet-200'
            }`}
            title="Abrir/Fechar Chat da Chamada"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>
        </div>
      </div>

      {/* Main Content Area: Stage + Optional Side Chat */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Stage / Grid Area */}
        <div
          className={`flex-1 flex min-h-0 ${
            focusedStream
              ? 'p-2.5 overflow-hidden'
              : 'overflow-y-auto p-4 items-center justify-center'
          }`}
        >
          {/* MODO UNIFICADO DE TRANSMISSÃO DE TELA (Nunca desmonta o player ao clicar em Expandir/Grade!) */}
          {hasAnyScreenShare && (
            focusedStream ? (
              /* MODO EXPANDIDO: Tela grande à esquerda ocupando toda a altura + participantes organizados à direita */
              <div className="w-full flex-1 flex flex-row items-stretch min-h-0 gap-3">
                {/* Player Principal Expandido */}
                <div className="flex-1 h-full min-h-0 min-w-0 flex items-center justify-center">
                  {isScreenSharing && localScreenStream && (
                    <div
                      className={
                        focusedStream === 'local'
                          ? 'w-full h-full flex items-center justify-center min-h-0'
                          : 'hidden'
                      }
                    >
                      <ScreenShareCard
                        key="local-screen"
                        stream={localScreenStream}
                        title={`SUA TELA (${QUALITY_PRESETS[streamQuality].name.toUpperCase()})`}
                        isLocal={true}
                        muted={true}
                        isFocused={true}
                        onToggleFocus={() => setFocusedStream(null)}
                        outputVolume={audioSettings.outputVolume}
                        sinkId={audioSettings.outputDeviceId}
                      />
                    </div>
                  )}

                  {screenShares.map((share) => {
                    const peerUser = sortedUsersInRoom.find((u) => u.socketId === share.peerId);
                    const isThisFocused = focusedStream === share.peerId;
                    return (
                      <div
                        key={`${share.peerId}-screen`}
                        className={
                          isThisFocused
                            ? 'w-full h-full flex items-center justify-center min-h-0'
                            : 'hidden'
                        }
                      >
                        <ScreenShareCard
                          stream={share.stream}
                          updatedAt={share.updatedAt}
                          title={`Tela de ${peerUser?.name || peerUser?.displayName || 'Participante'}`}
                          isLocal={false}
                          muted={false}
                          isFocused={true}
                          onToggleFocus={() => setFocusedStream(null)}
                          outputVolume={audioSettings.outputVolume}
                          sinkId={audioSettings.outputDeviceId}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Sidebar dos Participantes à Direita */}
                <div className="w-56 lg:w-64 bg-[#110a1f]/95 backdrop-blur-md rounded-2xl border border-violet-500/20 p-2.5 flex flex-col gap-2 shrink-0 overflow-hidden max-h-full">
                  <div className="text-[11px] font-bold text-violet-300/80 px-2 py-1 uppercase tracking-wider flex items-center justify-between border-b border-violet-500/15 shrink-0">
                    <span>Na chamada ({sortedUsersInRoom.length})</span>
                    <span className="text-[10px] text-fuchsia-400 font-mono font-semibold">Ao Vivo</span>
                  </div>
                  <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-0.5">
                    {sortedUsersInRoom.map((user) => {
                      const isMe = user.id === currentUser?.id;
                      const speaking = isMe
                        ? isSpeaking && !isMuted
                        : remoteSpeakingPeers.includes(user.socketId) && !user.isMuted;

                      return (
                        <ParticipantSidebarCard
                          key={user.id}
                          user={user}
                          isMe={isMe}
                          speaking={speaking}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* MODO GRADE: Grade central com participantes abaixo */
              <div className="w-full flex-1 flex flex-col items-center justify-center max-w-6xl gap-4 min-h-0">
                <div
                  className={`w-full grid gap-4 items-center justify-center ${
                    totalScreensCount === 1 ? 'grid-cols-1 max-w-5xl mx-auto' : 'grid-cols-1 lg:grid-cols-2'
                  }`}
                >
                  {isScreenSharing && localScreenStream && (
                    <div className="w-full h-full flex items-center justify-center min-h-0">
                      <ScreenShareCard
                        key="local-screen"
                        stream={localScreenStream}
                        title={`SUA TELA (${QUALITY_PRESETS[streamQuality].name.toUpperCase()})`}
                        isLocal={true}
                        muted={true}
                        isFocused={false}
                        onToggleFocus={() => setFocusedStream('local')}
                        outputVolume={audioSettings.outputVolume}
                        sinkId={audioSettings.outputDeviceId}
                      />
                    </div>
                  )}

                  {screenShares.map((share) => {
                    const peerUser = sortedUsersInRoom.find((u) => u.socketId === share.peerId);
                    return (
                      <div key={`${share.peerId}-screen`} className="w-full h-full flex items-center justify-center min-h-0">
                        <ScreenShareCard
                          stream={share.stream}
                          updatedAt={share.updatedAt}
                          title={`Tela de ${peerUser?.name || peerUser?.displayName || 'Participante'}`}
                          isLocal={false}
                          muted={false}
                          isFocused={false}
                          onToggleFocus={() => setFocusedStream(share.peerId)}
                          outputVolume={audioSettings.outputVolume}
                          sinkId={audioSettings.outputDeviceId}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Faixa simétrica e ordenada de participantes abaixo da transmissão */}
                <div className="w-full max-w-5xl flex flex-wrap items-center justify-center gap-3.5 pt-1 shrink-0">
                  {sortedUsersInRoom.map((user) => {
                    const isMe = user.id === currentUser?.id;
                    const speaking = isMe
                      ? isSpeaking && !isMuted
                      : remoteSpeakingPeers.includes(user.socketId) && !user.isMuted;

                    return (
                      <ParticipantCompactTile
                        key={user.id}
                        user={user}
                        isMe={isMe}
                        speaking={speaking}
                        compact={false}
                      />
                    );
                  })}
                </div>
              </div>
            )
          )}

          {/* MODO 3: SOMENTE VOZ (Grade simétrica centralizada e ordenada de participantes) */}
          {!focusedStream && !hasAnyScreenShare && (
            <div className={`w-full grid ${getAvatarGridClasses(sortedUsersInRoom.length)} gap-5 items-center justify-center`}>
              {sortedUsersInRoom.map((user) => {
                const isMe = user.id === currentUser?.id;
                const speaking = isMe
                  ? isSpeaking && !isMuted
                  : remoteSpeakingPeers.includes(user.socketId) && !user.isMuted;
                const displayName = user.name || user.displayName;

                return (
                  <div
                    key={user.id}
                    className={`aspect-video bg-[#130d21]/90 rounded-3xl border transition-all duration-150 flex flex-col items-center justify-center relative p-6 shadow-xl ${
                      speaking
                        ? 'border-violet-400 ring-2 ring-violet-500/40 shadow-violet-500/20'
                        : 'border-violet-500/15 hover:border-violet-500/30'
                    }`}
                  >
                    <div className="relative flex items-center justify-center">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={displayName}
                          className={`w-20 h-20 rounded-full object-cover shadow-xl transition-all duration-150 ${
                            speaking ? 'scale-105 ring-4 ring-violet-400' : ''
                          }`}
                        />
                      ) : (
                        <div
                          className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-black text-white shadow-xl transition-all duration-150 ${
                            speaking ? 'scale-105 ring-4 ring-violet-400' : ''
                          }`}
                          style={{ backgroundColor: user.avatarColor }}
                        >
                          {displayName.slice(0, 1).toUpperCase()}
                        </div>
                      )}

                      {user.isMuted && (
                        <div className="absolute -bottom-1 -right-1 bg-rose-500 text-white p-1.5 rounded-full shadow-md border-2 border-[#130d21]">
                          <MicOff className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-center gap-2 max-w-full px-2">
                      <span className="font-bold text-slate-100 text-sm truncate">
                        {displayName} {isMe && '(Você)'}
                      </span>
                    </div>

                    <div className="text-[11px] text-violet-300/60 mt-0.5">
                      {user.isScreenSharing
                        ? 'Transmitindo tela'
                        : user.isMuted
                        ? 'Microfone mutado'
                        : speaking
                        ? 'Falando agora...'
                        : 'Conectado na voz'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Side Chat Drawer inside Voice Call */}
        {showCallChat && (
          <div className="w-80 bg-[#120b20] border-l border-violet-500/15 flex flex-col justify-between h-full shrink-0">
            <div className="p-3.5 border-b border-violet-500/15 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <MessageSquare className="w-4 h-4 text-violet-400" />
                <span>{isDMCall ? `Chat com ${targetDMFriend?.displayName}` : 'Chat da Sala'}</span>
              </div>
              <button
                onClick={() => setShowCallChat(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-3">
              {activeCallMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center text-xs text-slate-500 px-4">
                  Envie mensagens ou fotos aqui enquanto conversa por voz!
                </div>
              ) : (
                activeCallMessages.map((m: any) => {
                  const isMe = (m.fromUserId || m.userId) === currentUser?.id;
                  const senderName = isMe
                    ? currentUser?.displayName
                    : m.userName || targetDMFriend?.displayName || 'Amigo';

                  return (
                    <div key={m.id} className="text-xs space-y-1 bg-[#19112b] p-2.5 rounded-2xl border border-violet-500/10">
                      <div className="flex items-center justify-between">
                        <span className={`font-bold ${isMe ? 'text-violet-400' : 'text-slate-200'}`}>
                          {senderName}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">{m.timestamp}</span>
                      </div>
                      {m.text && <p className="text-slate-300 break-words select-text">{m.text}</p>}
                      {m.attachment && (
                        <div className="mt-1.5">
                          {m.attachment.type === 'image' ? (
                            <img
                              src={m.attachment.url}
                              alt={m.attachment.name}
                              className="max-h-40 rounded-xl object-contain border border-violet-500/20"
                            />
                          ) : (
                            <a
                              href={m.attachment.url}
                              download={m.attachment.name}
                              className="flex items-center gap-2 bg-[#211638] p-2 rounded-xl text-violet-300 hover:text-white"
                            >
                              <FileText className="w-4 h-4 shrink-0" />
                              <span className="truncate flex-1">{m.attachment.name}</span>
                              <Download className="w-3.5 h-3.5 shrink-0" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-3 border-t border-violet-500/15">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                className="hidden"
              />
              {pendingAttachment && (
                <div className="mb-2 bg-[#1a112c] p-2 rounded-xl flex items-center justify-between text-xs border border-violet-500/30">
                  <span className="truncate text-slate-200 font-medium">{pendingAttachment.name}</span>
                  <button onClick={() => setPendingAttachment(null)} className="text-rose-400 ml-2 cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <form
                onSubmit={handleChatSubmit}
                className="flex items-center gap-1.5 bg-[#19112b] border border-violet-500/20 rounded-xl px-2.5 py-2"
              >
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-slate-400 hover:text-violet-400 cursor-pointer"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Mensagem na call..."
                  className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 outline-none select-text"
                />
                <button
                  type="submit"
                  className="p-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Floating Control Dock */}
      <div className={`flex justify-center z-10 shrink-0 ${focusedStream ? 'pb-2.5 pt-1' : 'pb-5 pt-2'}`}>
        <div className="bg-[#150e26]/95 backdrop-blur-xl border border-violet-500/25 px-6 py-3 rounded-2xl shadow-2xl shadow-violet-950/60 flex items-center gap-3.5">
          <button
            onClick={onToggleMute}
            className={`p-3.5 rounded-xl font-semibold transition flex items-center gap-2 cursor-pointer ${
              isMuted
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30'
                : 'bg-[#211738] text-slate-200 hover:bg-[#2b1e47]'
            }`}
            title={isMuted ? 'Ativar Microfone' : 'Mutar Microfone'}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            onClick={onToggleDeafen}
            className={`p-3.5 rounded-xl font-semibold transition flex items-center gap-2 cursor-pointer ${
              isDeafened
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30'
                : 'bg-[#211738] text-slate-200 hover:bg-[#2b1e47]'
            }`}
            title={isDeafened ? 'Ativar Áudio' : 'Desativar Áudio'}
          >
            <Headphones className="w-5 h-5" />
          </button>

          <button
            onClick={onToggleScreenShare}
            className={`px-5 py-3.5 rounded-xl font-bold text-sm transition flex items-center gap-2 cursor-pointer ${
              isScreenSharing
                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-600/30 hover:from-violet-500 hover:to-fuchsia-500'
                : 'bg-[#211738] text-slate-200 hover:bg-[#2b1e47]'
            }`}
          >
            <Monitor className="w-5 h-5" />
            <span>{isScreenSharing ? 'Parar Transmissão' : 'Transmitir Tela'}</span>
          </button>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="p-3.5 rounded-xl bg-[#211738] text-slate-200 hover:bg-[#2b1e47] transition cursor-pointer"
              title="Configurações de Voz & Vídeo"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}

          <div className="w-[1px] h-8 bg-violet-500/20 mx-1" />

          <button
            onClick={onLeaveVoice}
            className="px-5 py-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-lg shadow-rose-600/30 transition flex items-center gap-2 cursor-pointer"
          >
            <PhoneOff className="w-5 h-5" />
            <span>Desconectar</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Card compacto e simétrico para a barra inferior de participantes quando há tela compartilhada
 */
const ParticipantCompactTile: React.FC<{
  user: OnlineUser;
  isMe: boolean;
  speaking: boolean;
  compact?: boolean;
}> = ({ user, isMe, speaking, compact = false }) => {
  const displayName = user.name || user.displayName;
  return (
    <div
      className={`${
        compact ? 'w-44 h-16 px-3 py-1.5' : 'w-48 h-20 px-3.5 py-2'
      } bg-[#130d21]/95 rounded-2xl border flex items-center gap-3 transition-all duration-150 shadow-lg shrink-0 ${
        speaking
          ? 'border-violet-400 ring-2 ring-violet-500/40 bg-[#19112b]'
          : 'border-violet-500/20 hover:border-violet-500/35'
      }`}
    >
      <div className="relative shrink-0">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={displayName}
            className={`${
              compact ? 'w-10 h-10' : 'w-11 h-11'
            } rounded-full object-cover transition-transform duration-150 ${
              speaking ? 'ring-2 ring-violet-400 scale-105' : ''
            }`}
          />
        ) : (
          <div
            className={`${
              compact ? 'w-10 h-10 text-sm' : 'w-11 h-11 text-base'
            } rounded-full flex items-center justify-center font-black text-white transition-transform duration-150 ${
              speaking ? 'ring-2 ring-violet-400 scale-105' : ''
            }`}
            style={{ backgroundColor: user.avatarColor }}
          >
            {displayName.slice(0, 1).toUpperCase()}
          </div>
        )}

        {user.isMuted && (
          <div className="absolute -bottom-1 -right-1 bg-rose-500 text-white p-1 rounded-full border-2 border-[#130d21]">
            <MicOff className="w-2.5 h-2.5" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-slate-100 truncate">
          {displayName} {isMe && '(Você)'}
        </div>
        <div className="text-[10px] text-violet-300/70 truncate mt-0.5 flex items-center gap-1">
          {user.isScreenSharing ? (
            <span className="text-fuchsia-400 font-bold">● Transmitindo</span>
          ) : user.isMuted ? (
            <span>Mutado</span>
          ) : speaking ? (
            <span className="text-emerald-400 font-semibold">Falando...</span>
          ) : (
            <span>Na chamada</span>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Card vertical para os participantes na coluna direita quando a transmissão está expandida
 */
const ParticipantSidebarCard: React.FC<{
  user: OnlineUser;
  isMe: boolean;
  speaking: boolean;
}> = ({ user, isMe, speaking }) => {
  const displayName = user.name || user.displayName;
  return (
    <div
      className={`w-full p-2.5 rounded-xl border flex items-center gap-3 transition-all duration-150 ${
        speaking
          ? 'bg-[#1e1435] border-violet-400 ring-1 ring-violet-500/50 shadow-md shadow-violet-500/10'
          : 'bg-[#140d24]/90 border-violet-500/15 hover:border-violet-500/30'
      }`}
    >
      <div className="relative shrink-0">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={displayName}
            className={`w-9 h-9 rounded-full object-cover transition-transform duration-150 ${
              speaking ? 'ring-2 ring-emerald-400 scale-105' : ''
            }`}
          />
        ) : (
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white transition-transform duration-150 ${
              speaking ? 'ring-2 ring-emerald-400 scale-105' : ''
            }`}
            style={{ backgroundColor: user.avatarColor }}
          >
            {displayName.slice(0, 1).toUpperCase()}
          </div>
        )}

        {user.isMuted && (
          <div className="absolute -bottom-1 -right-1 bg-rose-500 text-white p-1 rounded-full border-2 border-[#140d24]">
            <MicOff className="w-2.5 h-2.5" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-slate-100 truncate flex items-center gap-1.5">
          <span className="truncate">{displayName}</span>
          {isMe && <span className="text-[10px] text-violet-400 font-semibold shrink-0">(Você)</span>}
        </div>
        <div className="text-[11px] text-violet-300/70 truncate mt-0.5 flex items-center gap-1">
          {user.isScreenSharing ? (
            <span className="text-fuchsia-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-pulse" />
              Transmitindo
            </span>
          ) : user.isMuted ? (
            <span className="text-rose-400/80">Mutado</span>
          ) : speaking ? (
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              Falando...
            </span>
          ) : (
            <span className="text-slate-400">Na chamada</span>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Card de Transmissão de Tela com suporte a Tela Cheia Nativa (Monitor Inteiro) + Modo Expandido Grande + Volume Individual
 */
const ScreenShareCard: React.FC<{
  stream: MediaStream;
  updatedAt?: number;
  title: string;
  isLocal: boolean;
  muted: boolean;
  isFocused: boolean;
  onToggleFocus: () => void;
  outputVolume: number;
  sinkId?: string;
}> = ({
  stream,
  updatedAt,
  title,
  isLocal,
  muted,
  isFocused,
  onToggleFocus,
  outputVolume,
  sinkId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastAudioTrackIdsRef = useRef<string>('');
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [streamVolume, setStreamVolume] = useState(100);
  const [localMuteStream, setLocalMuteStream] = useState(false);
  const [needsUserAudioUnlock, setNeedsUserAudioUnlock] = useState(false);

  const audioTrackIds = stream
    .getAudioTracks()
    .map((t) => t.id)
    .join(',');
  const hasScreenAudio = stream.getAudioTracks().length > 0;
  const effectiveMuted = isLocal || muted || localMuteStream || streamVolume === 0;
  const combinedVol = Math.min(1, Math.max(0, (outputVolume / 100) * (streamVolume / 100)));

  // Reproduz vídeo e áudio diretamente no elemento <video> visível no palco!
  // Isso impede que o Chromium suspenda elementos <audio> ocultos (0x0) após alguns segundos.
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    stream.getAudioTracks().forEach((t) => {
      t.enabled = true;
    });

    // Se uma nova track de áudio chegou no stream depois do vídeo, re-anexa o srcObject
    // para que o WebMediaPlayerMS do Chromium inicialize o renderizador de áudio!
    if (videoEl.srcObject !== stream || lastAudioTrackIdsRef.current !== audioTrackIds) {
      lastAudioTrackIdsRef.current = audioTrackIds;
      videoEl.srcObject = null;
      videoEl.srcObject = stream;
    }

    videoEl.muted = effectiveMuted;
    videoEl.volume = combinedVol;

    if (!isLocal && sinkId && sinkId !== 'default' && 'setSinkId' in videoEl) {
      (videoEl as any).setSinkId(sinkId).catch(() => {});
    }

    videoEl
      .play()
      .then(() => {
        setNeedsUserAudioUnlock(false);
      })
      .catch(() => {
        if (!effectiveMuted && hasScreenAudio) {
          // Caso o navegador exija gesto do usuário para tocar com som, inicia o vídeo mudo e exibe o botão de ativar som
          videoEl.muted = true;
          videoEl.play().catch(() => {});
          setNeedsUserAudioUnlock(true);
        }
      });
  }, [stream, updatedAt, audioTrackIds, isLocal, effectiveMuted, combinedVol, sinkId, hasScreenAudio]);

  // Watchdog contínuo para garantir que o áudio da transmissão nunca seja silenciado ou pausado pelo navegador
  useEffect(() => {
    if (isLocal || !hasScreenAudio) return;
    const interval = window.setInterval(() => {
      const videoEl = videoRef.current;
      if (!videoEl) return;
      stream.getAudioTracks().forEach((t) => {
        if (!t.enabled) t.enabled = true;
      });
      if (!needsUserAudioUnlock) {
        if (videoEl.muted !== effectiveMuted) {
          videoEl.muted = effectiveMuted;
        }
        if (Math.abs(videoEl.volume - combinedVol) > 0.01) {
          videoEl.volume = combinedVol;
        }
        if (videoEl.paused) {
          videoEl.play().catch(() => {});
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isLocal, hasScreenAudio, stream, effectiveMuted, combinedVol, needsUserAudioUnlock]);

  const handleManualAudioUnlock = () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    videoEl.srcObject = null;
    videoEl.srcObject = stream;
    videoEl.muted = effectiveMuted;
    videoEl.volume = combinedVol;
    videoEl
      .play()
      .then(() => setNeedsUserAudioUnlock(false))
      .catch(() => {});
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsNativeFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleToggleNativeFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (document.fullscreenElement === containerRef.current) {
        await document.exitFullscreen();
      } else {
        await containerRef.current.requestFullscreen();
      }
    } catch (err) {
      console.warn('Falha ao alternar tela cheia:', err);
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={() => {
        if (needsUserAudioUnlock) handleManualAudioUnlock();
      }}
      onDoubleClick={handleToggleNativeFullscreen}
      className={`bg-black rounded-2xl overflow-hidden border relative group shadow-2xl flex items-center justify-center transition-all ${
        isNativeFullscreen
          ? 'w-screen h-screen rounded-none border-0'
          : isFocused
          ? 'w-full h-full max-h-full border-violet-500/40 shadow-violet-950/60'
          : 'w-full aspect-video max-h-[62vh] border-violet-500/50 shadow-violet-900/25'
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={effectiveMuted}
        className="w-full h-full object-contain bg-black"
      />

      {/* Botão de desbloqueio caso o navegador bloqueie o autoplay de áudio antes de um clique */}
      {!isLocal && needsUserAudioUnlock && hasScreenAudio && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleManualAudioUnlock();
          }}
          className="absolute z-20 px-5 py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-xs font-black shadow-2xl flex items-center gap-2 animate-bounce cursor-pointer"
        >
          <Volume2 className="w-4 h-4" />
          <span>Clique para Ativar o Som da Transmissão</span>
        </button>
      )}

      {/* Badge sempre visível no canto superior esquerdo */}
      <div className="absolute top-3.5 left-4 flex items-center gap-2 pointer-events-none z-10">
        <span
          className={`px-2.5 py-1 text-[10px] font-black text-white rounded-lg uppercase tracking-wider shadow-lg ${
            isLocal
              ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600'
              : 'bg-rose-600 animate-pulse'
          }`}
        >
          ● AO VIVO
        </span>
        <span className="px-2.5 py-1 text-xs font-bold text-white bg-black/70 backdrop-blur-md rounded-lg border border-white/10">
          {title}
        </span>
        {hasScreenAudio && (
          <span className="px-2 py-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/20 backdrop-blur-md rounded-lg border border-emerald-500/35 flex items-center gap-1">
            <Volume2 className="w-3 h-3" />
            <span>SOM ATIVO</span>
          </span>
        )}
      </div>

      {/* Barra de controles flutuante ao passar o mouse */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          {!isLocal && (
            <div
              className="flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/15"
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setLocalMuteStream(!localMuteStream)}
                className="text-slate-200 hover:text-violet-400 transition cursor-pointer"
                title={localMuteStream ? 'Ativar som da transmissão' : 'Silenciar transmissão'}
              >
                {localMuteStream || streamVolume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-violet-400" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={localMuteStream ? 0 : streamVolume}
                onChange={(e) => {
                  setLocalMuteStream(false);
                  setStreamVolume(Number(e.target.value));
                }}
                className="w-20 accent-violet-500 cursor-pointer h-1.5"
              />
            </div>
          )}
          <span className="text-[11px] text-slate-300/80 hidden sm:inline">
            Clique duplo no vídeo para Tela Cheia
          </span>
        </div>

        <div className="flex items-center gap-2" onDoubleClick={(e) => e.stopPropagation()}>
          {!isNativeFullscreen && (
            <button
              type="button"
              onClick={onToggleFocus}
              className="px-3 py-2 bg-black/75 hover:bg-violet-600 text-white rounded-xl backdrop-blur-md border border-white/15 transition flex items-center gap-1.5 text-xs font-bold cursor-pointer"
              title={isFocused ? 'Restaurar Grade' : 'Destacar no App'}
            >
              {isFocused ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span>{isFocused ? 'Grade' : 'Expandir'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleNativeFullscreen}
            className="px-3.5 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-xl shadow-lg shadow-violet-600/30 transition flex items-center gap-1.5 text-xs font-bold cursor-pointer"
            title={isNativeFullscreen ? 'Sair da Tela Cheia (ESC)' : 'Ver em Tela Cheia'}
          >
            <Fullscreen className="w-4 h-4" />
            <span>{isNativeFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const RemoteAudioPlayer: React.FC<{
  stream: MediaStream;
  muted: boolean;
  volume: number;
  sinkId?: string;
}> = ({ stream, muted, volume, sinkId }) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    el.muted = muted;
    el.volume = Math.min(1, Math.max(0, volume / 100));

    if (sinkId && sinkId !== 'default' && 'setSinkId' in el) {
      (el as any).setSinkId(sinkId).catch(() => {});
    }

    el.play().catch(() => {});
  }, [stream, muted, volume, sinkId]);

  return <audio ref={audioRef} autoPlay muted={muted} className="hidden" />;
};
