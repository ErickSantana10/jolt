import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  Monitor,
  PhoneOff,
  Maximize2,
  Minimize2,
  Fullscreen,
  Sliders,
  Sparkles,
  Volume2,
  VolumeX,
  EyeOff,
  Eye,
  RefreshCw,
  Loader2,
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
  peerStates?: Record<string, RTCPeerConnectionState>;
  onReloadPeer?: (peerId: string) => void;
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
  peerStates = {},
  onReloadPeer,
}) => {
  const [focusedStream, setFocusedStream] = useState<'local' | string | null>(null);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showCallChat, setShowCallChat] = useState(isDMCall);
  const [chatInput, setChatInput] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<MessageAttachment | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Transmissões que o espectador escolheu parar de assistir (por socketId de quem transmite)
  const [hiddenStreams, setHiddenStreams] = useState<Set<string>>(() => new Set());
  const stopWatching = (peerId: string) =>
    setHiddenStreams((prev) => new Set(prev).add(peerId));
  const startWatching = (peerId: string) =>
    setHiddenStreams((prev) => {
      const next = new Set(prev);
      next.delete(peerId);
      return next;
    });

  const allRemoteShares = remoteStreams.filter((s) => s.isScreen);
  const screenShares = allRemoteShares.filter((s) => !hiddenStreams.has(s.peerId));
  const audioStreams = remoteStreams.filter((s) => !s.isScreen);

  // Quem diz estar transmitindo mas não tem player na tela: parou de assistir ou ainda está conectando
  const sharePlaceholders = usersInRoom
    .filter(
      (u, i, arr) =>
        u.isScreenSharing &&
        u.id !== currentUser?.id &&
        u.socketId &&
        arr.findIndex((x) => x.id === u.id) === i &&
        !screenShares.some((s) => s.peerId === u.socketId)
    )
    .map((u) => ({
      user: u,
      hidden: hiddenStreams.has(u.socketId),
      connection: peerStates[u.socketId],
    }));

  const hasAnyScreenShare =
    (isScreenSharing && !!localScreenStream) || screenShares.length > 0 || sharePlaceholders.length > 0;
  const totalScreensCount =
    (isScreenSharing && localScreenStream ? 1 : 0) + screenShares.length + sharePlaceholders.length;

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
    <div className="flex-1 bg-ink-900 flex flex-col justify-between overflow-hidden relative select-none">
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
      <div className="h-14 px-6 border-b border-white/[0.07] flex items-center justify-between bg-ink-850/90 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.07] flex items-center justify-center">
            <Volume2 className="w-4 h-4 text-volt animate-pulse" />
          </div>
          <div>
            <div className="font-bold text-zinc-100 text-sm">{channel.name}</div>
            <div className="text-[11px] text-zinc-500 font-medium">
              {sortedUsersInRoom.length} {sortedUsersInRoom.length === 1 ? 'participante' : 'participantes'} na sala
            </div>
          </div>
        </div>

        {/* Stream Quality Selector & Chat Toggle */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <button
              onClick={() => setShowQualityMenu(!showQualityMenu)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-ink-700 hover:bg-ink-600 text-xs font-bold text-zinc-200 border border-white/[0.07] transition cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-volt" />
              <span>Qualidade: {QUALITY_PRESETS[streamQuality].label}</span>
            </button>

            {showQualityMenu && (
              <div className="absolute right-0 mt-2 w-80 bg-ink-800 border border-white/[0.07] rounded-xl shadow-2xl p-3 z-50 space-y-2">
                <div className="text-xs font-bold text-zinc-400 px-2 py-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-volt" />
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
                          ? 'bg-white/[0.08] border border-volt/40 text-white'
                          : 'hover:bg-ink-600 text-zinc-300'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center justify-between">
                        <span>{preset.label}</span>
                        {active && (
                          <span className="text-[10px] bg-volt text-ink-950 px-1.5 py-0.5 rounded-md">
                            ATIVO
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400">{preset.description}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-ink-700 hover:bg-ink-600 border border-white/[0.07] text-zinc-200 transition cursor-pointer"
              title="Configurações de Voz e Dispositivos"
            >
              <Settings className="w-3.5 h-3.5 text-volt" />
              <span className="hidden sm:inline">Áudio</span>
            </button>
          )}

          <button
            onClick={() => setShowCallChat(!showCallChat)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
              showCallChat
                ? 'bg-volt text-ink-950 border-volt/40 shadow-lg'
                : 'bg-ink-700 hover:bg-ink-600 border-white/[0.07] text-zinc-200'
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
                          volumeKey={peerUser?.id}
                          onStopWatching={() => {
                            setFocusedStream(null);
                            stopWatching(share.peerId);
                          }}
                          onReload={onReloadPeer ? () => onReloadPeer(share.peerId) : undefined}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Sidebar dos Participantes à Direita */}
                <div className="w-56 lg:w-64 bg-ink-800/95 backdrop-blur-md rounded-xl border border-white/[0.07] p-2.5 flex flex-col gap-2 shrink-0 overflow-hidden max-h-full">
                  <div className="text-[11px] font-bold text-zinc-400 px-2 py-1 uppercase tracking-wider flex items-center justify-between border-b border-white/[0.07] shrink-0">
                    <span>Na chamada ({sortedUsersInRoom.length})</span>
                    <span className="text-[10px] text-volt font-mono font-semibold">Ao Vivo</span>
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
                          volumeKey={peerUser?.id}
                          onStopWatching={() => stopWatching(share.peerId)}
                          onReload={onReloadPeer ? () => onReloadPeer(share.peerId) : undefined}
                        />
                      </div>
                    );
                  })}

                  {sharePlaceholders.map(({ user, hidden, connection }) => (
                    <StreamPlaceholder
                      key={`${user.id}-placeholder`}
                      name={user.name || user.displayName}
                      avatarUrl={user.avatarUrl}
                      avatarColor={user.avatarColor}
                      hidden={hidden}
                      connection={connection}
                      onWatch={() => startWatching(user.socketId)}
                      onReload={onReloadPeer ? () => onReloadPeer(user.socketId) : undefined}
                    />
                  ))}
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
                    className={`aspect-video bg-ink-800/90 rounded-2xl border transition-all duration-150 flex flex-col items-center justify-center relative p-6 shadow-xl ${
                      speaking
                        ? 'border-volt/40 ring-2 ring-volt/40'
                        : 'border-white/[0.07] hover:border-white/[0.07]'
                    }`}
                  >
                    <div className="relative flex items-center justify-center">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={displayName}
                          className={`w-20 h-20 rounded-full object-cover shadow-xl transition-all duration-150 ${
                            speaking ? 'scale-105 ring-4 ring-volt/40' : ''
                          }`}
                        />
                      ) : (
                        <div
                          className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-xl transition-all duration-150 ${
                            speaking ? 'scale-105 ring-4 ring-volt/40' : ''
                          }`}
                          style={{ backgroundColor: user.avatarColor }}
                        >
                          {displayName.slice(0, 1).toUpperCase()}
                        </div>
                      )}

                      {(user.isMuted || user.isDeafened) && (
                        <div className="absolute -bottom-1 -right-1 bg-rose-500 text-white p-1.5 rounded-full shadow-md border-2 border-ink-800" title={user.isDeafened ? 'Áudio desativado' : 'Microfone mutado'}>
                          {user.isDeafened ? <HeadphoneOff className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-center gap-2 max-w-full px-2">
                      <span className="font-bold text-zinc-100 text-sm truncate">
                        {displayName} {isMe && '(Você)'}
                      </span>
                    </div>

                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      {user.isScreenSharing
                        ? 'Transmitindo tela'
                        : user.isDeafened
                        ? 'Áudio desativado'
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
          <div className="w-80 bg-ink-800 border-l border-white/[0.07] flex flex-col justify-between h-full shrink-0">
            <div className="p-3.5 border-b border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                <MessageSquare className="w-4 h-4 text-volt" />
                <span>{isDMCall ? `Chat com ${targetDMFriend?.displayName}` : 'Chat da Sala'}</span>
              </div>
              <button
                onClick={() => setShowCallChat(false)}
                className="text-zinc-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-3">
              {activeCallMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center text-xs text-zinc-500 px-4">
                  Envie mensagens ou fotos aqui enquanto conversa por voz!
                </div>
              ) : (
                activeCallMessages.map((m: any) => {
                  const isMe = (m.fromUserId || m.userId) === currentUser?.id;
                  const senderName = isMe
                    ? currentUser?.displayName
                    : m.userName || targetDMFriend?.displayName || 'Amigo';

                  return (
                    <div key={m.id} className="text-xs space-y-1 bg-ink-700 p-2.5 rounded-xl border border-white/[0.07]">
                      <div className="flex items-center justify-between">
                        <span className={`font-bold ${isMe ? 'text-volt' : 'text-zinc-200'}`}>
                          {senderName}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">{m.timestamp}</span>
                      </div>
                      {m.text && <p className="text-zinc-300 break-words select-text">{m.text}</p>}
                      {m.attachment && (
                        <div className="mt-1.5">
                          {m.attachment.type === 'image' ? (
                            <img
                              src={m.attachment.url}
                              alt={m.attachment.name}
                              className="max-h-40 rounded-xl object-contain border border-white/[0.07]"
                            />
                          ) : (
                            <a
                              href={m.attachment.url}
                              download={m.attachment.name}
                              className="flex items-center gap-2 bg-ink-600 p-2 rounded-xl text-zinc-400 hover:text-white"
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

            <div className="p-3 border-t border-white/[0.07]">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                className="hidden"
              />
              {pendingAttachment && (
                <div className="mb-2 bg-ink-700 p-2 rounded-xl flex items-center justify-between text-xs border border-white/[0.07]">
                  <span className="truncate text-zinc-200 font-medium">{pendingAttachment.name}</span>
                  <button onClick={() => setPendingAttachment(null)} className="text-rose-400 ml-2 cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <form
                onSubmit={handleChatSubmit}
                className="flex items-center gap-1.5 bg-ink-700 border border-white/[0.07] rounded-xl px-2.5 py-2"
              >
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-zinc-400 hover:text-volt cursor-pointer"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Mensagem na call..."
                  className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 outline-none select-text"
                />
                <button
                  type="submit"
                  className="p-1.5 bg-volt text-ink-950 hover:brightness-110 rounded-lg cursor-pointer"
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
        <div className="bg-ink-800/95 backdrop-blur-xl border border-white/[0.07] px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3.5">
          <button
            onClick={onToggleMute}
            className={`p-3.5 rounded-xl font-semibold transition flex items-center gap-2 cursor-pointer ${
              isMuted
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30'
                : 'bg-ink-600 text-zinc-200 hover:bg-ink-600'
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
                : 'bg-ink-600 text-zinc-200 hover:bg-ink-600'
            }`}
            title={isDeafened ? 'Ativar Áudio' : 'Desativar Áudio'}
          >
            {isDeafened ? <HeadphoneOff className="w-5 h-5" /> : <Headphones className="w-5 h-5" />}
          </button>

          <button
            onClick={onToggleScreenShare}
            className={`px-5 py-3.5 rounded-xl font-bold text-sm transition flex items-center gap-2 cursor-pointer ${
              isScreenSharing
                ? 'bg-volt text-ink-950 shadow-lg'
                : 'bg-ink-600 text-zinc-200 hover:bg-ink-600'
            }`}
          >
            <Monitor className="w-5 h-5" />
            <span>{isScreenSharing ? 'Parar Transmissão' : 'Transmitir Tela'}</span>
          </button>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="p-3.5 rounded-xl bg-ink-600 text-zinc-200 hover:bg-ink-600 transition cursor-pointer"
              title="Configurações de Voz & Vídeo"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}

          <div className="w-[1px] h-8 bg-white/[0.08] mx-1" />

          <button
            onClick={onLeaveVoice}
            className="px-5 py-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-lg transition flex items-center gap-2 cursor-pointer"
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
      } bg-ink-800/95 rounded-xl border flex items-center gap-3 transition-all duration-150 shadow-lg shrink-0 ${
        speaking
          ? 'border-volt/40 ring-2 ring-volt/40 bg-ink-700'
          : 'border-white/[0.07] hover:border-white/[0.07]'
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
              speaking ? 'ring-2 ring-volt/40 scale-105' : ''
            }`}
          />
        ) : (
          <div
            className={`${
              compact ? 'w-10 h-10 text-sm' : 'w-11 h-11 text-base'
            } rounded-full flex items-center justify-center font-bold text-white transition-transform duration-150 ${
              speaking ? 'ring-2 ring-volt/40 scale-105' : ''
            }`}
            style={{ backgroundColor: user.avatarColor }}
          >
            {displayName.slice(0, 1).toUpperCase()}
          </div>
        )}

        {(user.isMuted || user.isDeafened) && (
          <div className="absolute -bottom-1 -right-1 bg-rose-500 text-white p-1 rounded-full border-2 border-ink-800" title={user.isDeafened ? 'Áudio desativado' : 'Microfone mutado'}>
            {user.isDeafened ? <HeadphoneOff className="w-2.5 h-2.5" /> : <MicOff className="w-2.5 h-2.5" />}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-zinc-100 truncate">
          {displayName} {isMe && '(Você)'}
        </div>
        <div className="text-[10px] text-zinc-500 truncate mt-0.5 flex items-center gap-1">
          {user.isScreenSharing ? (
            <span className="text-volt font-bold">● Transmitindo</span>
          ) : user.isDeafened ? (
            <span>Áudio off</span>
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
          ? 'bg-ink-600 border-volt/40 ring-1 ring-volt/40 shadow-md'
          : 'bg-ink-800/90 border-white/[0.07] hover:border-white/[0.07]'
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
            className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white transition-transform duration-150 ${
              speaking ? 'ring-2 ring-emerald-400 scale-105' : ''
            }`}
            style={{ backgroundColor: user.avatarColor }}
          >
            {displayName.slice(0, 1).toUpperCase()}
          </div>
        )}

        {(user.isMuted || user.isDeafened) && (
          <div className="absolute -bottom-1 -right-1 bg-rose-500 text-white p-1 rounded-full border-2 border-ink-800" title={user.isDeafened ? 'Áudio desativado' : 'Microfone mutado'}>
            {user.isDeafened ? <HeadphoneOff className="w-2.5 h-2.5" /> : <MicOff className="w-2.5 h-2.5" />}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-zinc-100 truncate flex items-center gap-1.5">
          <span className="truncate">{displayName}</span>
          {isMe && <span className="text-[10px] text-volt font-semibold shrink-0">(Você)</span>}
        </div>
        <div className="text-[11px] text-zinc-500 truncate mt-0.5 flex items-center gap-1">
          {user.isScreenSharing ? (
            <span className="text-volt font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-volt text-ink-950 animate-pulse" />
              Transmitindo
            </span>
          ) : user.isDeafened ? (
            <span className="text-rose-400/80">Áudio off</span>
          ) : user.isMuted ? (
            <span className="text-rose-400/80">Mutado</span>
          ) : speaking ? (
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              Falando...
            </span>
          ) : (
            <span className="text-zinc-400">Na chamada</span>
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
  volumeKey?: string;
  onStopWatching?: () => void;
  onReload?: () => void;
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
  volumeKey,
  onStopWatching,
  onReload,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastAudioTrackIdsRef = useRef<string>('');
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const volumeStorageKey = volumeKey ? `jolt_stream_volume_${volumeKey}` : null;
  const [streamVolume, setStreamVolumeState] = useState<number>(() => {
    try {
      const saved = volumeStorageKey ? Number(localStorage.getItem(volumeStorageKey)) : NaN;
      return Number.isFinite(saved) && saved >= 0 && saved <= 100 && localStorage.getItem(volumeStorageKey!) !== null
        ? saved
        : 100;
    } catch {
      return 100;
    }
  });
  const setStreamVolume = (v: number) => {
    setStreamVolumeState(v);
    try {
      if (volumeStorageKey) localStorage.setItem(volumeStorageKey, String(v));
    } catch {}
  };
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
      className={`bg-black rounded-xl overflow-hidden border relative group shadow-2xl flex items-center justify-center transition-all ${
        isNativeFullscreen
          ? 'w-screen h-screen rounded-none border-0'
          : isFocused
          ? 'w-full h-full max-h-full border-white/[0.07]'
          : 'w-full aspect-video max-h-[62vh] border-volt/40'
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
          className="absolute z-20 px-5 py-3 rounded-xl bg-volt text-ink-950 text-xs font-bold shadow-2xl flex items-center gap-2 animate-bounce cursor-pointer"
        >
          <Volume2 className="w-4 h-4" />
          <span>Clique para Ativar o Som da Transmissão</span>
        </button>
      )}

      {/* Badge sempre visível no canto superior esquerdo */}
      <div className="absolute top-3.5 left-4 flex items-center gap-2 pointer-events-none z-10">
        <span
          className={`px-2.5 py-1 text-[10px] font-bold text-white rounded-lg uppercase tracking-wider shadow-lg ${
            isLocal
              ? 'bg-volt text-ink-950'
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

      {/* Controles do espectador (sempre visíveis): volume da transmissão, recarregar e parar de assistir */}
      {!isLocal && (
        <div
          className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-black/70 backdrop-blur-md p-1 rounded-xl border border-white/10"
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 pl-2 pr-1" title="Volume desta transmissão">
            <button
              type="button"
              onClick={() => setLocalMuteStream(!localMuteStream)}
              className="text-zinc-200 hover:text-white transition cursor-pointer"
              title={localMuteStream ? 'Ativar som da transmissão' : 'Silenciar transmissão'}
            >
              {localMuteStream || streamVolume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
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
              aria-label="Volume da transmissão"
              className="w-24 accent-volt cursor-pointer h-1.5"
            />
            <span className="w-8 text-right text-[11px] font-mono text-zinc-300">
              {localMuteStream ? 0 : streamVolume}%
            </span>
          </div>
          {onReload && (
            <button
              type="button"
              onClick={onReload}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Recarregar transmissão (se travar ou ficar preta)"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          {onStopWatching && (
            <button
              type="button"
              onClick={onStopWatching}
              className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-[12px] font-medium text-zinc-200 hover:text-white hover:bg-rose-500/80 transition cursor-pointer"
              title="Parar de assistir esta transmissão"
            >
              <EyeOff className="w-4 h-4" />
              <span className="hidden md:inline">Sair da tela</span>
            </button>
          )}
        </div>
      )}

      {/* Barra de controles flutuante ao passar o mouse */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-zinc-300/80 hidden sm:inline">
            Clique duplo no vídeo para Tela Cheia
          </span>
        </div>

        <div className="flex items-center gap-2" onDoubleClick={(e) => e.stopPropagation()}>
          {!isNativeFullscreen && (
            <button
              type="button"
              onClick={onToggleFocus}
              className="px-3 py-2 bg-black/75 hover:bg-volt hover:text-ink-950 text-white rounded-xl backdrop-blur-md border border-white/15 transition flex items-center gap-1.5 text-xs font-bold cursor-pointer"
              title={isFocused ? 'Restaurar Grade' : 'Destacar no App'}
            >
              {isFocused ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span>{isFocused ? 'Grade' : 'Expandir'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleNativeFullscreen}
            className="px-3.5 py-2 bg-volt text-ink-950 rounded-xl shadow-lg transition flex items-center gap-1.5 text-xs font-bold cursor-pointer"
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

/**
 * Lugar de uma transmissão sem player: quem parou de assistir vê "Assistir"; quem ainda não recebeu
 * a tela vê "Conectando" com opção de recarregar (a auto-recuperação também tenta sozinha).
 */
const StreamPlaceholder: React.FC<{
  name: string;
  avatarUrl?: string;
  avatarColor?: string;
  hidden: boolean;
  connection?: RTCPeerConnectionState;
  onWatch: () => void;
  onReload?: () => void;
}> = ({ name, avatarUrl, avatarColor, hidden, connection, onWatch, onReload }) => {
  const failed = connection === 'failed' || connection === 'disconnected';
  return (
    <div className="w-full aspect-video max-h-[62vh] rounded-xl border border-white/[0.07] bg-ink-850 flex flex-col items-center justify-center gap-4 p-6 text-center">
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="w-14 h-14 rounded-full object-cover" />
      ) : (
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-semibold text-white"
          style={{ backgroundColor: avatarColor || '#3f3f46' }}
        >
          {(name || '?').slice(0, 1).toUpperCase()}
        </div>
      )}
      <div>
        <div className="text-[14px] font-semibold text-zinc-100 flex items-center justify-center gap-2">
          <span className="px-1.5 rounded bg-rose-500 text-white text-[9px] font-bold leading-[15px] tracking-wide">
            AO VIVO
          </span>
          {name} está transmitindo
        </div>
        <div className="text-[12.5px] text-zinc-500 mt-1">
          {hidden
            ? 'Você saiu desta transmissão.'
            : failed
            ? 'Não foi possível conectar com essa pessoa. Tentando de novo...'
            : 'Conectando à transmissão...'}
        </div>
      </div>
      {hidden ? (
        <button
          type="button"
          onClick={onWatch}
          className="h-9 px-4 rounded-lg bg-volt text-ink-950 text-[13px] font-semibold flex items-center gap-2 hover:brightness-110 transition cursor-pointer"
        >
          <Eye className="w-4 h-4" />
          Assistir
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
          {onReload && (
            <button
              type="button"
              onClick={onReload}
              className="h-8 px-3 rounded-lg bg-white/[0.06] text-zinc-200 text-[12.5px] font-medium flex items-center gap-1.5 hover:bg-white/[0.1] transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Recarregar
            </button>
          )}
        </div>
      )}
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
