import React, { useState } from 'react';
import {
  Hash,
  Volume2,
  Mic,
  MicOff,
  Headphones,
  Settings,
  PhoneOff,
  Plus,
  Users,
  LogOut,
  UserPlus,
  Monitor,
  Film,
  ChevronDown,
  Sparkles,
  MessageCircle,
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
  onOpenSettings: () => void;
  onLogout: () => void;
}

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

  return (
    <aside className="w-64 h-full bg-[#110b1f]/90 backdrop-blur-xl border border-violet-500/15 rounded-3xl flex flex-col justify-between overflow-hidden shadow-2xl select-none shrink-0">
      <div className="flex flex-col flex-1 min-h-0">
        {/* Top Context Header (with Server Banner & Icon Personalization) */}
        {currentServer ? (
          <div className="relative shrink-0">
            {currentServer.bannerUrl ? (
              <div
                onClick={() => setIsServerMenuOpen(!isServerMenuOpen)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setIsServerMenuOpen(true);
                }}
                className="relative h-24 w-full border-b border-violet-500/20 overflow-hidden cursor-pointer group select-none"
              >
                <img
                  src={currentServer.bannerUrl}
                  alt={currentServer.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d0818] via-[#0d0818]/50 to-black/20" />
                <div className="absolute bottom-2.5 left-3.5 right-3.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {currentServer.iconUrl ? (
                      <img
                        src={currentServer.iconUrl}
                        alt={currentServer.name}
                        className="w-8 h-8 rounded-xl object-cover border border-white/20 shadow-md shrink-0"
                      />
                    ) : (
                      <span
                        className="w-7 h-7 rounded-xl flex items-center justify-center text-[11px] font-black text-white shadow-md shrink-0"
                        style={{ backgroundColor: currentServer.iconColor }}
                      >
                        {currentServer.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-white drop-shadow">
                        {currentServer.name}
                      </div>
                      {currentServer.description && (
                        <div className="truncate text-[10px] text-violet-200/80">
                          {currentServer.description}
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-white/80 shrink-0 transition-transform duration-200 ${
                      isServerMenuOpen ? 'rotate-180 text-white' : ''
                    }`}
                  />
                </div>
              </div>
            ) : (
              <div
                onClick={() => setIsServerMenuOpen(!isServerMenuOpen)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setIsServerMenuOpen(true);
                }}
                className="min-h-14 py-2.5 px-4 border-b border-violet-500/15 flex items-center justify-between font-bold text-slate-100 bg-gradient-to-r from-violet-950/30 to-transparent hover:from-violet-900/40 transition cursor-pointer select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {currentServer.iconUrl ? (
                    <img
                      src={currentServer.iconUrl}
                      alt={currentServer.name}
                      className="w-7 h-7 rounded-xl object-cover border border-violet-400/30 shrink-0 shadow-sm"
                    />
                  ) : (
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: currentServer.iconColor }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-extrabold tracking-tight">
                      {currentServer.name}
                    </div>
                    {currentServer.description && (
                      <div className="truncate text-[10px] font-medium text-violet-300/60">
                        {currentServer.description}
                      </div>
                    )}
                  </div>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-violet-300/70 shrink-0 transition-transform duration-200 ${
                    isServerMenuOpen ? 'rotate-180 text-white' : ''
                  }`}
                />
              </div>
            )}

            {/* Server Dropdown Menu */}
            {isServerMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setIsServerMenuOpen(false)} />
                <div className="absolute top-14 left-3 right-3 z-40 bg-[#140d26] border border-violet-500/35 rounded-2xl shadow-2xl p-1.5 space-y-0.5 animate-in fade-in duration-150">
                  <button
                    onClick={() => {
                      setIsServerMenuOpen(false);
                      setIsBoostModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-fuchsia-400 hover:bg-fuchsia-500/15 hover:text-fuchsia-300 transition cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Impulso de Servidor</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsServerMenuOpen(false);
                      onOpenInviteModal();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-violet-300 hover:bg-violet-600/20 hover:text-white transition cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Convidar Pessoas</span>
                  </button>

                  {isAdmin && (
                    <button
                      onClick={() => {
                        setIsServerMenuOpen(false);
                        onOpenServerSettings();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-violet-500/15 hover:text-white transition cursor-pointer"
                    >
                      <Settings className="w-4 h-4 text-violet-400" />
                      <span>Personalizar & Configurar</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setIsServerMenuOpen(false);
                      onOpenCreateChannel('text');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-violet-500/15 hover:text-white transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-violet-400" />
                    <span>Criar Canal</span>
                  </button>

                  <div className="my-1 border-t border-violet-500/15" />

                  <button
                    onClick={() => {
                      setIsServerMenuOpen(false);
                      setIsLeaveModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/15 transition cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sair do Servidor</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="h-14 px-4 border-b border-violet-500/15 flex items-center justify-between font-bold text-slate-100 bg-gradient-to-r from-violet-950/30 to-transparent shrink-0">
            <span className="flex items-center gap-2 text-sm font-extrabold tracking-tight">
              <MessageCircle className="w-4 h-4 text-violet-400" />
              <span>Mensagens & Amigos</span>
            </span>
            <span className="text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded-full font-mono">
              INÍCIO
            </span>
          </div>
        )}

        {/* Scrollable Navigation Body */}
        <div className="p-3 space-y-5 overflow-y-auto flex-1">
          {isAtHome ? (
            <div className="space-y-4">
              <button
                onClick={onSelectHome}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                  activeDMFriendId === null
                    ? 'bg-gradient-to-r from-violet-600/30 to-fuchsia-600/20 text-white border border-violet-500/35 shadow-lg shadow-violet-950/40'
                    : 'text-slate-400 hover:bg-violet-500/10 hover:text-slate-100'
                }`}
              >
                <Users className="w-4 h-4 text-violet-400" />
                <span>Painel de Amigos</span>
              </button>

              {/* Direct Messages List */}
              <div className="space-y-1.5">
                <div className="px-2 py-1 text-[10px] font-extrabold text-violet-300/60 uppercase tracking-widest flex items-center justify-between">
                  <span>Conversas Diretas</span>
                  <span className="text-[10px] font-mono bg-violet-500/15 text-violet-300 px-1.5 py-0.2 rounded-full">
                    {acceptedFriends.length}
                  </span>
                </div>

                {acceptedFriends.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-slate-500 bg-[#0c0717]/60 rounded-2xl border border-violet-500/10 text-center">
                    Adicione amigos para conversar em privado!
                  </div>
                ) : (
                  acceptedFriends.map((item) => {
                    const friend = item.friend;
                    const isActive = activeDMFriendId === friend.id;

                    return (
                      <button
                        key={friend.id}
                        onClick={() => onSelectDM(friend)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-2xl text-xs font-medium transition cursor-pointer ${
                          isActive
                            ? 'bg-gradient-to-r from-violet-600/30 to-purple-600/20 text-white border border-violet-500/35 shadow-md'
                            : 'text-slate-300 hover:bg-violet-500/10 hover:text-white'
                        }`}
                      >
                        <div className="relative shrink-0">
                          {friend.avatarUrl ? (
                            <img
                              src={friend.avatarUrl}
                              alt={friend.displayName}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs"
                              style={{ backgroundColor: friend.avatarColor }}
                            >
                              {friend.displayName.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div
                            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#110b1f] ${
                              friend.isOnline ? 'bg-emerald-500' : 'bg-slate-600'
                            }`}
                          />
                        </div>

                        <div className="truncate text-left flex-1 min-w-0">
                          <div className="truncate font-bold">{friend.displayName}</div>
                          <div className="text-[10px] text-violet-300/50 font-mono truncate">
                            #{friend.tag || '001'}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Quick Invite Pill */}
              <button
                onClick={onOpenInviteModal}
                className="w-full flex items-center justify-between px-3 py-2 bg-violet-600/15 hover:bg-violet-600/25 text-violet-200 rounded-2xl text-xs font-bold border border-violet-500/25 transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <UserPlus className="w-3.5 h-3.5 text-violet-400" />
                  <span>Convidar Amigo</span>
                </span>
                <span className="text-[10px] font-mono bg-violet-500/25 text-violet-200 px-1.5 py-0.5 rounded-lg">
                  {currentServer.inviteCode}
                </span>
              </button>

              {/* Text Channels */}
              <div>
                <div className="px-2 py-1 text-[10px] font-extrabold text-violet-300/60 uppercase tracking-widest flex items-center justify-between">
                  <span>Canais de Texto</span>
                  <button
                    onClick={() => onOpenCreateChannel('text')}
                    className="p-1 text-violet-300/70 hover:text-white rounded-lg hover:bg-violet-500/20 transition cursor-pointer"
                    title="Criar Canal de Texto (+)"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1 mt-1">
                  {textChannels.map((channel) => {
                    const isActive = activeChannel?.id === channel.id;
                    return (
                      <button
                        key={channel.id}
                        onClick={() => onSelectChannel(channel)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl text-xs font-semibold transition cursor-pointer ${
                          isActive
                            ? 'bg-gradient-to-r from-violet-600/30 to-purple-600/15 text-white border border-violet-500/30 shadow-sm'
                            : 'text-slate-400 hover:bg-violet-500/10 hover:text-slate-200'
                        }`}
                      >
                        <Hash className={`w-4 h-4 ${isActive ? 'text-violet-400' : 'text-slate-500'}`} />
                        <span className="truncate">{channel.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Voice Channels */}
              <div>
                <div className="px-2 py-1 text-[10px] font-extrabold text-violet-300/60 uppercase tracking-widest flex items-center justify-between">
                  <span>Voz & Transmissão</span>
                  <button
                    onClick={() => onOpenCreateChannel('voice')}
                    className="p-1 text-violet-300/70 hover:text-white rounded-lg hover:bg-violet-500/20 transition cursor-pointer"
                    title="Criar Canal de Voz (+)"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5 mt-1">
                  {voiceChannels.map((channel) => {
                    const isConnectedHere = currentVoiceChannelId === channel.id;
                    // Deduplicate members in this voice channel by member.id
                    const rawMembers = onlineUsers.filter((u) => u.currentVoiceChannel === channel.id);
                    const membersInThisVoice = Array.from(
                      new Map(rawMembers.map((m) => [m.id, m])).values()
                    );

                    return (
                      <div key={channel.id} className="space-y-1">
                        <button
                          onClick={() => {
                            if (isConnectedHere) {
                              onViewVoiceRoom();
                            } else {
                              onJoinVoice(channel.id, currentServer.id);
                            }
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl text-xs font-semibold transition cursor-pointer ${
                            isConnectedHere
                              ? 'bg-violet-600/25 text-violet-200 border border-violet-500/40 shadow-sm'
                              : 'text-slate-400 hover:bg-violet-500/10 hover:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <Volume2
                              className={`w-4 h-4 shrink-0 ${
                                isConnectedHere ? 'text-violet-400 animate-pulse' : 'text-slate-500'
                              }`}
                            />
                            <span className="truncate">{channel.name}</span>
                          </div>
                          {isConnectedHere && (
                            <span className="text-[10px] bg-violet-500/30 text-violet-200 px-1.5 py-0.5 rounded-md font-bold shrink-0">
                              na call
                            </span>
                          )}
                        </button>

                        {membersInThisVoice.length > 0 && (
                          <div className="pl-3.5 pr-2.5 py-1.5 space-y-1 bg-[#0b0714]/70 border border-violet-500/10 rounded-2xl">
                            {membersInThisVoice.map((member) => {
                              const isMe = member.id === currentUser?.id;
                              const memberSpeaking = isMe
                                ? isSpeaking && !isMuted
                                : remoteSpeakingPeers?.includes(member.socketId) && !member.isMuted;

                              return (
                                <div
                                  key={member.id}
                                  className="flex items-center justify-between py-1 px-1 text-xs text-slate-200"
                                >
                                  {/* Notice: NO overflow-hidden/truncate on the outer flex container so the speaking ring is NEVER clipped! */}
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <div className="relative p-0.5 shrink-0">
                                      {member.avatarUrl ? (
                                        <img
                                          src={member.avatarUrl}
                                          alt={member.displayName || member.username}
                                          className={`w-6 h-6 rounded-full object-cover transition-all duration-150 ${
                                            memberSpeaking
                                              ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#0b0714] shadow-[0_0_10px_rgba(52,211,153,0.65)]'
                                              : ''
                                          }`}
                                        />
                                      ) : (
                                        <div
                                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white transition-all duration-150 ${
                                            memberSpeaking
                                              ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#0b0714] shadow-[0_0_10px_rgba(52,211,153,0.65)]'
                                              : ''
                                          }`}
                                          style={{ backgroundColor: member.avatarColor }}
                                        >
                                          {(member.name || member.displayName || '?')
                                            .slice(0, 1)
                                            .toUpperCase()}
                                        </div>
                                      )}
                                    </div>
                                    <span
                                      className={`truncate font-semibold text-[11px] transition-colors ${
                                        memberSpeaking ? 'text-emerald-300' : 'text-slate-200'
                                      }`}
                                    >
                                      {member.name || member.displayName}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1 text-slate-400 shrink-0 pl-1">
                                    {member.isScreenSharing && (
                                      <span title="Transmitindo tela">
                                        <Monitor className="w-3 h-3 text-fuchsia-400 animate-pulse" />
                                      </span>
                                    )}
                                    {member.isMuted && (
                                      <span title="Mutado">
                                        <MicOff className="w-3 h-3 text-rose-400" />
                                      </span>
                                    )}
                                  </div>
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

              {/* Media Rooms */}
              <div>
                <div className="px-2 py-1 text-[10px] font-extrabold text-violet-300/60 uppercase tracking-widest flex items-center justify-between">
                  <span>Salas de Vídeo & DJ</span>
                  <button
                    onClick={() => onOpenCreateChannel('media')}
                    className="p-1 text-violet-300/70 hover:text-white rounded-lg hover:bg-violet-500/20 transition cursor-pointer"
                    title="Criar Sala de Vídeo/Música (+)"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1 mt-1">
                  {mediaChannels.map((channel) => {
                    const isActive = activeChannel?.id === channel.id;
                    return (
                      <button
                        key={channel.id}
                        onClick={() => onSelectChannel(channel)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl text-xs font-semibold transition cursor-pointer ${
                          isActive
                            ? 'bg-gradient-to-r from-fuchsia-600/30 to-violet-600/20 text-fuchsia-200 border border-fuchsia-500/35 shadow-sm'
                            : 'text-slate-400 hover:bg-violet-500/10 hover:text-slate-200'
                        }`}
                      >
                        <Film className="w-4 h-4 text-fuchsia-400 shrink-0" />
                        <span className="truncate">{channel.name.replace(/^🎬\s*/, '')}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom Section: Active Voice Status + User Profile & Mute Controls (Bottom-Left Corner!) */}
      <div className="shrink-0">
        {currentVoiceChannelId && (
          <div className="bg-gradient-to-r from-violet-950/80 to-fuchsia-950/60 px-3.5 py-2 border-t border-violet-500/20 flex items-center justify-between">
            <div
              className="flex items-center gap-2.5 cursor-pointer group flex-1 min-w-0"
              onClick={onViewVoiceRoom}
              title="Clique para abrir o palco da chamada"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-violet-200 group-hover:text-white truncate">
                  Call Conectada
                </div>
                <div className="text-[10px] text-violet-300/70 truncate">Voltar para transmissão</div>
              </div>
            </div>
            <button
              onClick={onLeaveVoice}
              className="p-1.5 text-slate-300 hover:text-rose-400 hover:bg-rose-500/15 rounded-xl transition shrink-0 ml-1 cursor-pointer"
              title="Desconectar da Voz"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* User Profile & Mute/Deafen/Settings Bar in the Bottom-Left Corner */}
        <div className="p-2.5 bg-[#0b0714]/95 border-t border-violet-500/20 flex items-center justify-between gap-1.5">
          <div
            onClick={onOpenSettings}
            className="flex items-center gap-2.5 min-w-0 flex-1 p-1 rounded-2xl hover:bg-violet-500/10 transition cursor-pointer group"
            title="Editar Perfil e Foto"
          >
            {/* Padding p-0.5 + shrink-0 so the speaking ring is never clipped */}
            <div className="relative p-0.5 shrink-0">
              {currentUser?.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.displayName}
                  className={`w-9 h-9 rounded-full object-cover transition-all duration-150 ${
                    isSpeaking
                      ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#0b0714] shadow-[0_0_10px_rgba(52,211,153,0.65)]'
                      : ''
                  }`}
                />
              ) : (
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-xs transition-all duration-150 ${
                    isSpeaking
                      ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#0b0714] shadow-[0_0_10px_rgba(52,211,153,0.65)]'
                      : ''
                  }`}
                  style={{ backgroundColor: currentUser?.avatarColor || '#8b5cf6' }}
                >
                  {(currentUser?.displayName || '?').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0b0714]" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold text-white truncate group-hover:text-violet-300 transition leading-tight">
                {currentUser?.name || currentUser?.displayName || 'Jogador'}
              </div>
              <div className="text-[10px] text-violet-300/60 font-mono truncate leading-tight">
                {isMuted ? 'Microfone mutado' : `#${currentUser?.tag || '001'}`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={onToggleMute}
              className={`p-2 rounded-xl transition cursor-pointer ${
                isMuted
                  ? 'text-rose-400 bg-rose-500/15 hover:bg-rose-500/25'
                  : 'text-slate-300 hover:text-white hover:bg-violet-500/15'
              }`}
              title={isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              onClick={onToggleDeafen}
              className={`p-2 rounded-xl transition cursor-pointer ${
                isDeafened
                  ? 'text-rose-400 bg-rose-500/15 hover:bg-rose-500/25'
                  : 'text-slate-300 hover:text-white hover:bg-violet-500/15'
              }`}
              title={isDeafened ? 'Reativar Áudio' : 'Ensurdecer'}
            >
              <Headphones className="w-4 h-4" />
            </button>
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-violet-500/15 transition cursor-pointer"
              title="Configurações de Perfil"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onLogout}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 transition cursor-pointer"
              title="Sair da Conta"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Impulso de Servidor */}
      {isBoostModalOpen && currentServer && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
          onClick={() => setIsBoostModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-[#130d24] border border-fuchsia-500/40 rounded-3xl p-6 shadow-2xl text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 mx-auto rounded-2xl bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400 shadow-lg shadow-fuchsia-500/20">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-base font-black text-white">Nível Máximo de Impulso!</h4>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                O servidor <span className="font-bold text-fuchsia-400">"{currentServer.name}"</span> já possui todos os recursos VIP do Jolt liberados: transmissão 1080p 60fps, áudio cristalino e salas de vídeo sincronizadas!
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsBoostModalOpen(false)}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-xs font-bold shadow-lg shadow-fuchsia-600/30 transition cursor-pointer"
            >
              Incrível!
            </button>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Sair do Servidor */}
      {isLeaveModalOpen && currentServer && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
          onClick={() => setIsLeaveModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-[#130d24] border border-rose-500/40 rounded-3xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-white">Sair de {currentServer.name}?</h4>
                <p className="text-[11px] text-slate-400">Confirmar saída do servidor</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Tem certeza que deseja sair do servidor <span className="font-bold text-white">"{currentServer.name}"</span>? Você precisará de um novo convite caso queira voltar.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsLeaveModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLeaveModalOpen(false);
                  onLeaveServer(currentServer.id);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition cursor-pointer"
              >
                Sim, Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
