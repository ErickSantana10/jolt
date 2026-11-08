import React, { useState } from 'react';
import {
  Hash,
  Volume2,
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  Settings,
  PhoneOff,
  Plus,
  Users,
  LogOut,
  UserPlus,
  Monitor,
  ScreenShare,
  ScreenShareOff,
  Film,
  ChevronDown,
  Sparkles,
  Signal,
} from 'lucide-react';
import type { Channel, User, ServerItem, FriendItem, OnlineUser } from '../types';

interface SidebarProps {
  currentUser: User | null;
  servers: ServerItem[];
  currentServer: ServerItem | null;
  activeChannel: Channel | null;
  currentVoiceChannelId: string | null;
  activeDMFriendId: string | null;
  friends: FriendItem[];
  onlineUsers: OnlineUser[];
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  remoteSpeakingPeers?: string[];
  isScreenSharing?: boolean;
  voiceChannelName?: string | null;
  onSelectHome: () => void;
  onSelectDM: (friend: FriendItem['friend']) => void;
  onSelectServer: (server: ServerItem) => void;
  onOpenCreateServer: () => void;
  onOpenCreateChannel: (initialType: 'text' | 'voice' | 'media') => void;
  onOpenInviteModal: () => void;
  onOpenServerSettings: () => void;
  onLeaveServer: (serverId: string) => void;
  onSelectChannel: (channel: Channel) => void;
  onJoinVoice: (channelId: string, serverId: string) => void;
  onViewVoiceRoom: () => void;
  onLeaveVoice: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleScreenShare?: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

const speakingRing = 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-ink-900';

/** Avatar redondo com fallback de inicial colorida. */
const Avatar: React.FC<{
  name: string;
  url?: string;
  color?: string;
  size: string;
  text: string;
  speaking?: boolean;
}> = ({ name, url, color, size, text, speaking }) =>
  url ? (
    <img
      src={url}
      alt={name}
      className={`${size} rounded-full object-cover transition-shadow duration-150 ${speaking ? speakingRing : ''}`}
    />
  ) : (
    <div
      className={`${size} ${text} rounded-full flex items-center justify-center font-semibold text-white transition-shadow duration-150 ${
        speaking ? speakingRing : ''
      }`}
      style={{ backgroundColor: color || '#3f3f46' }}
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </div>
  );

const SectionLabel: React.FC<{ label: string; onAdd?: () => void; addTitle?: string }> = ({
  label,
  onAdd,
  addTitle,
}) => (
  <div className="px-2 pt-1 pb-1.5 flex items-center justify-between">
    <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-zinc-500">{label}</span>
    {onAdd && (
      <button
        onClick={onAdd}
        className="p-1 -mr-1 rounded-md text-zinc-600 hover:text-zinc-200 hover:bg-white/[0.06] transition cursor-pointer"
        title={addTitle}
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
);

const rowBase =
  'w-full flex items-center gap-2.5 px-2.5 h-8 rounded-lg text-[13px] transition-colors duration-150 cursor-pointer';
const rowIdle = 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]';
const rowActive = 'text-zinc-50 bg-white/[0.07]';

/** Botão quadrado de ícone usado nos painéis inferiores. */
const IconButton: React.FC<{
  onClick: () => void;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, danger, children }) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
      danger
        ? 'text-rose-400 bg-rose-500/10 hover:bg-rose-500/20'
        : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]'
    }`}
  >
    {children}
  </button>
);

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  currentServer,
  activeChannel,
  currentVoiceChannelId,
  activeDMFriendId,
  friends,
  onlineUsers,
  isMuted,
  isDeafened,
  isSpeaking,
  remoteSpeakingPeers = [],
  isScreenSharing = false,
  voiceChannelName = null,
  onSelectHome,
  onSelectDM,
  onOpenCreateChannel,
  onOpenInviteModal,
  onOpenServerSettings,
  onLeaveServer,
  onSelectChannel,
  onJoinVoice,
  onViewVoiceRoom,
  onLeaveVoice,
  onToggleMute,
  onToggleDeafen,
  onToggleScreenShare,
  onOpenSettings,
  onLogout,
}) => {
  const isAtHome = currentServer === null;
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
  const [isBoostModalOpen, setIsBoostModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);

  const textChannels = currentServer ? currentServer.channels.filter((c) => c.type === 'text') : [];
  const voiceChannels = currentServer ? currentServer.channels.filter((c) => c.type === 'voice') : [];
  const mediaChannels = currentServer ? currentServer.channels.filter((c) => c.type === 'media') : [];
  const acceptedFriends = friends.filter((f) => f.status === 'accepted');

  const isOwner = currentUser?.id === currentServer?.ownerId;
  const myRoles = currentUser && currentServer ? currentServer.memberRoles?.[currentUser.id] || [] : [];
  const isAdmin = isOwner || (currentServer?.roles || []).some((r) => myRoles.includes(r.id) && r.isAdmin);

  const menuItem =
    'w-full flex items-center gap-2.5 px-2.5 h-8 rounded-md text-[13px] text-zinc-300 hover:text-zinc-50 hover:bg-white/[0.06] transition cursor-pointer';

  return (
    <aside className="w-[248px] h-full bg-ink-900 border border-white/[0.06] rounded-2xl flex flex-col overflow-hidden select-none shrink-0">
      {/* Cabeçalho */}
      {currentServer ? (
        <div className="relative shrink-0">
          <button
            onClick={() => setIsServerMenuOpen(!isServerMenuOpen)}
            onContextMenu={(e) => {
              e.preventDefault();
              setIsServerMenuOpen(true);
            }}
            className="relative w-full text-left cursor-pointer group block"
          >
            {currentServer.bannerUrl && (
              <div className="relative h-20 w-full overflow-hidden">
                <img
                  src={currentServer.bannerUrl}
                  alt=""
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-ink-900" />
              </div>
            )}
            <div className="h-14 px-4 flex items-center justify-between gap-2 border-b border-white/[0.06]">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold text-zinc-50 tracking-tight">
                  {currentServer.name}
                </div>
                {currentServer.description && (
                  <div className="truncate text-[11px] text-zinc-500">{currentServer.description}</div>
                )}
              </div>
              <ChevronDown
                className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform duration-200 ${
                  isServerMenuOpen ? 'rotate-180 text-zinc-200' : ''
                }`}
              />
            </div>
          </button>

          {isServerMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setIsServerMenuOpen(false)} />
              <div className="absolute top-full mt-1 left-2 right-2 z-40 bg-ink-800 border border-white/[0.08] rounded-xl shadow-2xl shadow-black/60 p-1">
                <button
                  onClick={() => {
                    setIsServerMenuOpen(false);
                    onOpenInviteModal();
                  }}
                  className={menuItem}
                >
                  <UserPlus className="w-4 h-4 text-volt" />
                  <span>Convidar pessoas</span>
                </button>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setIsServerMenuOpen(false);
                      onOpenServerSettings();
                    }}
                    className={menuItem}
                  >
                    <Settings className="w-4 h-4 text-zinc-500" />
                    <span>Configurações do servidor</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsServerMenuOpen(false);
                    onOpenCreateChannel('text');
                  }}
                  className={menuItem}
                >
                  <Plus className="w-4 h-4 text-zinc-500" />
                  <span>Criar canal</span>
                </button>
                <button
                  onClick={() => {
                    setIsServerMenuOpen(false);
                    setIsBoostModalOpen(true);
                  }}
                  className={menuItem}
                >
                  <Sparkles className="w-4 h-4 text-zinc-500" />
                  <span>Impulso do servidor</span>
                </button>
                <div className="my-1 h-px bg-white/[0.06]" />
                <button
                  onClick={() => {
                    setIsServerMenuOpen(false);
                    setIsLeaveModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 h-8 rounded-md text-[13px] text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sair do servidor</span>
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="h-14 px-4 border-b border-white/[0.06] flex items-center shrink-0">
          <span className="text-[14px] font-semibold text-zinc-50 tracking-tight">Início</span>
        </div>
      )}

      {/* Corpo */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-5">
        {isAtHome ? (
          <>
            <button onClick={onSelectHome} className={`${rowBase} ${activeDMFriendId === null ? rowActive : rowIdle}`}>
              <Users className="w-4 h-4 shrink-0" />
              <span>Amigos</span>
            </button>

            <div>
              <SectionLabel label={`Mensagens diretas · ${acceptedFriends.length}`} />
              {acceptedFriends.length === 0 ? (
                <p className="px-2.5 py-3 text-[12px] text-zinc-600 leading-relaxed">
                  Adicione amigos para conversar em privado.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {acceptedFriends.map(({ friend }) => {
                    const isActive = activeDMFriendId === friend.id;
                    return (
                      <button
                        key={friend.id}
                        onClick={() => onSelectDM(friend)}
                        className={`w-full flex items-center gap-2.5 px-2 h-10 rounded-lg transition-colors cursor-pointer ${
                          isActive ? rowActive : rowIdle
                        }`}
                      >
                        <div className="relative shrink-0">
                          <Avatar
                            name={friend.displayName}
                            url={friend.avatarUrl}
                            color={friend.avatarColor}
                            size="w-7 h-7"
                            text="text-[11px]"
                          />
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-ink-900 ${
                              friend.isOnline ? 'bg-emerald-400' : 'bg-zinc-600'
                            }`}
                          />
                        </div>
                        <span className="truncate text-[13px] flex-1 text-left">{friend.displayName}</span>
                        <span className="text-[10.5px] font-mono text-zinc-600">#{friend.tag || '001'}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Convite rápido */}
            <button
              onClick={onOpenInviteModal}
              className="w-full flex items-center justify-between px-2.5 h-8 rounded-lg border border-white/[0.06] text-[12.5px] text-zinc-400 hover:text-zinc-100 hover:border-white/[0.12] transition cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <UserPlus className="w-3.5 h-3.5 text-volt" />
                Convidar
              </span>
              <span className="font-mono text-[11px] text-zinc-500">{currentServer.inviteCode}</span>
            </button>

            {/* Texto */}
            <div>
              <SectionLabel label="Texto" onAdd={() => onOpenCreateChannel('text')} addTitle="Criar canal de texto" />
              <div className="space-y-0.5">
                {textChannels.map((channel) => {
                  const isActive = activeChannel?.id === channel.id;
                  return (
                    <button
                      key={channel.id}
                      onClick={() => onSelectChannel(channel)}
                      className={`${rowBase} ${isActive ? rowActive : rowIdle}`}
                    >
                      <Hash className={`w-4 h-4 shrink-0 ${isActive ? 'text-volt' : 'text-zinc-600'}`} />
                      <span className="truncate">{channel.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Voz */}
            <div>
              <SectionLabel label="Voz" onAdd={() => onOpenCreateChannel('voice')} addTitle="Criar canal de voz" />
              <div className="space-y-0.5">
                {voiceChannels.map((channel) => {
                  const isConnectedHere = currentVoiceChannelId === channel.id;
                  const rawMembers = onlineUsers.filter((u) => u.currentVoiceChannel === channel.id);
                  const members = Array.from(new Map(rawMembers.map((m) => [m.id, m])).values());

                  return (
                    <div key={channel.id}>
                      <button
                        onClick={() =>
                          isConnectedHere ? onViewVoiceRoom() : onJoinVoice(channel.id, currentServer.id)
                        }
                        className={`${rowBase} ${isConnectedHere ? 'text-zinc-50 bg-white/[0.05]' : rowIdle}`}
                      >
                        <Volume2
                          className={`w-4 h-4 shrink-0 ${isConnectedHere ? 'text-emerald-400' : 'text-zinc-600'}`}
                        />
                        <span className="truncate flex-1 text-left">{channel.name.replace(/^🔊\s*/, '')}</span>
                        {members.length > 0 && (
                          <span className="text-[11px] font-mono text-zinc-600">{members.length}</span>
                        )}
                      </button>

                      {members.length > 0 && (
                        <div className="ml-[18px] pl-3 border-l border-white/[0.06] mt-0.5 mb-1 space-y-px">
                          {members.map((member) => {
                            const isMe = member.id === currentUser?.id;
                            const speaking = isMe
                              ? isSpeaking && !isMuted
                              : remoteSpeakingPeers.includes(member.socketId) && !member.isMuted;
                            const name = member.name || member.displayName;

                            return (
                              <div key={member.id} className="flex items-center gap-2 h-8 px-1 rounded-md">
                                <div className="p-[3px] shrink-0">
                                  <Avatar
                                    name={name}
                                    url={member.avatarUrl}
                                    color={member.avatarColor}
                                    size="w-5 h-5"
                                    text="text-[9px]"
                                    speaking={speaking}
                                  />
                                </div>
                                <span
                                  className={`truncate text-[12.5px] flex-1 ${
                                    speaking ? 'text-emerald-300' : 'text-zinc-300'
                                  }`}
                                >
                                  {name}
                                </span>
                                <span className="flex items-center gap-1 shrink-0">
                                  {member.isScreenSharing && (
                                    <span
                                      title="Transmitindo tela"
                                      className="px-1 rounded bg-rose-500 text-white text-[8.5px] font-bold leading-[13px] tracking-wide"
                                    >
                                      AO VIVO
                                    </span>
                                  )}
                                  {member.isMuted && (
                                    <span title="Microfone mutado">
                                      <MicOff className="w-3.5 h-3.5 text-rose-400/90" />
                                    </span>
                                  )}
                                  {member.isDeafened && (
                                    <span title="Áudio desativado (fone mutado)">
                                      <HeadphoneOff className="w-3.5 h-3.5 text-rose-400/90" />
                                    </span>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mídia */}
            <div>
              <SectionLabel
                label="Vídeo & música"
                onAdd={() => onOpenCreateChannel('media')}
                addTitle="Criar sala de vídeo/música"
              />
              <div className="space-y-0.5">
                {mediaChannels.map((channel) => {
                  const isActive = activeChannel?.id === channel.id;
                  return (
                    <button
                      key={channel.id}
                      onClick={() => onSelectChannel(channel)}
                      className={`${rowBase} ${isActive ? rowActive : rowIdle}`}
                    >
                      <Film className={`w-4 h-4 shrink-0 ${isActive ? 'text-volt' : 'text-zinc-600'}`} />
                      <span className="truncate">{channel.name.replace(/^🎬\s*/, '')}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Painel de voz conectada (canto inferior esquerdo) */}
      {currentVoiceChannelId && (
        <div className="shrink-0 mx-2 mb-2 p-2.5 rounded-xl bg-ink-850 border border-white/[0.06]">
          <div className="flex items-center gap-2">
            <button
              onClick={onViewVoiceRoom}
              className="min-w-0 flex-1 text-left cursor-pointer group"
              title="Abrir a sala de voz"
            >
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-400">
                <Signal className="w-3.5 h-3.5" />
                <span>Voz conectada</span>
              </div>
              <div className="truncate text-[11.5px] text-zinc-500 group-hover:text-zinc-300 transition-colors">
                {voiceChannelName ? voiceChannelName.replace(/^🔊\s*/, '') : 'Chamada privada'}
              </div>
            </button>
            <IconButton onClick={onLeaveVoice} title="Desconectar" danger>
              <PhoneOff className="w-4 h-4" />
            </IconButton>
          </div>

          {onToggleScreenShare && (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button
                onClick={onToggleScreenShare}
                title={isScreenSharing ? 'Parar transmissão de tela' : 'Compartilhar tela'}
                className={`h-8 rounded-lg flex items-center justify-center gap-1.5 text-[12px] font-medium transition cursor-pointer ${
                  isScreenSharing
                    ? 'bg-volt text-ink-950 hover:brightness-110'
                    : 'bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09] hover:text-zinc-50'
                }`}
              >
                {isScreenSharing ? <ScreenShareOff className="w-4 h-4" /> : <ScreenShare className="w-4 h-4" />}
                <span>{isScreenSharing ? 'Parar' : 'Tela'}</span>
              </button>
              <button
                onClick={onViewVoiceRoom}
                title="Ver a sala e as transmissões"
                className="h-8 rounded-lg flex items-center justify-center gap-1.5 text-[12px] font-medium bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09] hover:text-zinc-50 transition cursor-pointer"
              >
                <Monitor className="w-4 h-4" />
                <span>Sala</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Painel do usuário */}
      <div className="shrink-0 h-14 px-2 border-t border-white/[0.06] flex items-center gap-0.5">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 min-w-0 flex-1 px-1 py-1 rounded-lg hover:bg-white/[0.04] transition cursor-pointer text-left"
          title="Perfil e configurações"
        >
          <div className="relative p-[3px] shrink-0">
            <Avatar
              name={currentUser?.displayName || '?'}
              url={currentUser?.avatarUrl}
              color={currentUser?.avatarColor}
              size="w-8 h-8"
              text="text-xs"
              speaking={isSpeaking && !isMuted}
            />
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-ink-900" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-zinc-100 truncate leading-tight">
              {currentUser?.name || currentUser?.displayName || 'Jogador'}
            </div>
            <div className="text-[11px] text-zinc-500 font-mono truncate leading-tight">
              {isDeafened ? 'áudio off' : isMuted ? 'mic off' : `#${currentUser?.tag || '001'}`}
            </div>
          </div>
        </button>

        <IconButton onClick={onToggleMute} title={isMuted ? 'Ativar microfone' : 'Mutar microfone'} danger={isMuted}>
          {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </IconButton>
        <IconButton
          onClick={onToggleDeafen}
          title={isDeafened ? 'Ativar áudio' : 'Desativar áudio'}
          danger={isDeafened}
        >
          {isDeafened ? <HeadphoneOff className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
        </IconButton>
        <IconButton onClick={onLogout} title="Sair da conta">
          <LogOut className="w-4 h-4" />
        </IconButton>
      </div>

      {/* Modal: Impulso de Servidor */}
      {isBoostModalOpen && currentServer && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsBoostModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-ink-850 border border-white/[0.08] rounded-2xl p-6 text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 mx-auto rounded-xl bg-volt/10 flex items-center justify-center text-volt">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-[15px] font-semibold text-zinc-50">Impulso máximo</h4>
              <p className="text-[13px] text-zinc-400 mt-1.5 leading-relaxed">
                <span className="text-zinc-100">{currentServer.name}</span> já tem todos os recursos liberados:
                transmissão 1080p 60fps, áudio em alta qualidade e salas de vídeo sincronizadas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsBoostModalOpen(false)}
              className="w-full h-9 rounded-lg bg-volt text-ink-950 text-[13px] font-semibold hover:brightness-110 transition cursor-pointer"
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Sair do Servidor */}
      {isLeaveModalOpen && currentServer && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsLeaveModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-ink-850 border border-white/[0.08] rounded-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-[15px] font-semibold text-zinc-50">Sair de {currentServer.name}?</h4>
            <p className="text-[13px] text-zinc-400 leading-relaxed">
              Você vai precisar de um novo convite para voltar.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsLeaveModalOpen(false)}
                className="px-3.5 h-9 rounded-lg text-[13px] text-zinc-300 hover:bg-white/[0.06] transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLeaveModalOpen(false);
                  onLeaveServer(currentServer.id);
                }}
                className="px-3.5 h-9 rounded-lg bg-rose-500 text-white text-[13px] font-semibold hover:bg-rose-400 transition cursor-pointer"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
