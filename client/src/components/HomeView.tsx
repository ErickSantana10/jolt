import React, { useState } from 'react';
import {
  Users,
  Plus,
  Volume2,
  UserPlus,
  Check,
  X,
  Clock,
  ShieldCheck,
  AlertCircle,
  Download,
  Sparkles,
} from 'lucide-react';
import type { User, ServerItem, FriendItem, OnlineUser } from '../types';

interface HomeViewProps {
  currentUser: User | null;
  onlineUsers: OnlineUser[];
  servers: ServerItem[];
  friends: FriendItem[];
  onOpenCreateServer: () => void;
  onSelectServer: (server: ServerItem) => void;
  onJoinVoice: (channelId: string, serverId: string) => void;
  onSendFriendRequest: (
    targetUsername: string,
    callback: (res: { success: boolean; message?: string; error?: string }) => void
  ) => void;
  onAcceptFriend: (friendshipId: string) => void;
  onRemoveFriend: (friendshipId: string) => void;
  downloadUrl?: string;
}

export const HomeView: React.FC<HomeViewProps> = ({
  currentUser,
  onlineUsers,
  servers,
  friends,
  onOpenCreateServer,
  onSelectServer,
  onJoinVoice,
  onSendFriendRequest,
  onAcceptFriend,
  onRemoveFriend,
  downloadUrl = 'https://github.com/ErickSantana10/jolt/releases/latest/download/Jolt-Windows.exe',
}) => {
  const [tab, setTab] = useState<'online' | 'all' | 'pending' | 'add'>('online');
  const [addUsernameInput, setAddUsernameInput] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isElectron = Boolean(window.electronAPI?.isElectron);

  const getServerInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const acceptedFriends = friends.filter((f) => f.status === 'accepted');
  const pendingRequests = friends.filter((f) => f.status === 'pending');
  const incomingPending = pendingRequests.filter((f) => !f.isInitiator);
  const outgoingPending = pendingRequests.filter((f) => f.isInitiator);

  const onlineFriends = acceptedFriends.filter((f) => {
    return onlineUsers.some((ou) => ou.id === f.friend.id);
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUsernameInput.trim()) return;
    setFeedback(null);

    onSendFriendRequest(addUsernameInput.trim(), (res) => {
      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'Pedido enviado com sucesso!' });
        setAddUsernameInput('');
      } else {
        setFeedback({ type: 'error', message: res.error || 'Erro ao enviar pedido.' });
      }
    });
  };

  return (
    <div className="flex-1 bg-transparent flex flex-col overflow-hidden">
      {/* Top Bar with Navigation Tabs */}
      <div className="h-14 px-6 border-b border-white/[0.07] flex items-center justify-between bg-ink-800/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
            <Users className="w-4 h-4 text-volt" />
            <span>Central de Amigos</span>
          </div>

          <div className="w-[1px] h-4 bg-white/[0.08] mx-2" />

          {/* Subtabs */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setTab('online')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                tab === 'online'
                  ? 'bg-white/[0.08] text-white border border-white/[0.07]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
              }`}
            >
              Disponíveis ({onlineFriends.length})
            </button>
            <button
              onClick={() => setTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                tab === 'all'
                  ? 'bg-white/[0.08] text-white border border-white/[0.07]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
              }`}
            >
              Todos ({acceptedFriends.length})
            </button>
            <button
              onClick={() => setTab('pending')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition relative cursor-pointer ${
                tab === 'pending'
                  ? 'bg-white/[0.08] text-white border border-white/[0.07]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
              }`}
            >
              <span>Pendentes</span>
              {incomingPending.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 bg-volt text-ink-950 text-[10px] rounded-full">
                  {incomingPending.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('add')}
              className={`ml-1 px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                tab === 'add'
                  ? 'bg-volt text-ink-950 shadow-lg'
                  : 'bg-white/[0.05] text-zinc-400 border border-white/[0.07] hover:bg-volt hover:text-ink-950 hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Adicionar Amigo</span>
            </button>
          </div>
        </div>

        <button
          onClick={onOpenCreateServer}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-volt text-ink-950 text-xs font-bold rounded-xl transition shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Criar ou Entrar</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-7 overflow-y-auto space-y-8 max-w-5xl mx-auto w-full">
        {/* Desktop App Promo Banner (Only on Web) */}
        {!isElectron && (
          <div className="bg-transparent border border-white/[0.07] rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-4">
              <img
                src="/logo.jpg"
                alt="Jolt App"
                className="w-14 h-14 rounded-xl object-cover border border-white/[0.07] shadow-lg shrink-0"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">Jolt Desktop para Windows</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.08] text-zinc-400 border border-white/[0.07] flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    60 FPS + Áudio Nativo
                  </span>
                </div>
                <p className="text-xs text-zinc-200 mt-1">
                  Baixe o aplicativo oficial (.exe) para transmitir seus jogos e telas inteiras com áudio do sistema sem travamentos.
                </p>
              </div>
            </div>

            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 rounded-xl bg-volt text-ink-950 text-xs font-bold tracking-wide shadow-lg flex items-center gap-2 shrink-0 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Baixar App (.exe)</span>
            </a>
          </div>
        )}

        {/* TAB: ADICIONAR AMIGO */}
        {tab === 'add' && (
          <div className="bg-ink-800/90 border border-white/[0.07] rounded-2xl p-6 shadow-xl space-y-5">
            <div>
              <h3 className="text-base font-bold text-white">ADICIONAR AMIGO</h3>
              <p className="text-xs text-zinc-200 mt-0.5">
                Adicione um amigo usando o Nome e a # dele (ex:{' '}
                <span className="text-volt font-semibold font-mono">fulaninho#001</span>).
              </p>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="flex items-center gap-2 bg-ink-900 border border-white/[0.07] rounded-xl p-2 pl-4 focus-within:border-volt/40 transition">
                <input
                  type="text"
                  autoFocus
                  value={addUsernameInput}
                  onChange={(e) => setAddUsernameInput(e.target.value)}
                  placeholder="Digite Nome#001 do seu amigo"
                  className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 outline-none select-text"
                />
                <button
                  type="submit"
                  disabled={!addUsernameInput.trim()}
                  className="px-5 py-2.5 bg-volt text-ink-950 disabled:opacity-40 text-xs font-bold rounded-xl transition shadow-md cursor-pointer"
                >
                  Enviar Pedido
                </button>
              </div>

              {feedback && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                    feedback.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <Check className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{feedback.message}</span>
                </div>
              )}
            </form>
          </div>
        )}

        {/* TAB: PENDENTES */}
        {tab === 'pending' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Pedidos Recebidos ({incomingPending.length})
              </h4>

              {incomingPending.length === 0 ? (
                <div className="p-6 bg-ink-800/80 border border-white/[0.07] rounded-xl text-center text-xs text-zinc-500">
                  Nenhum pedido de amizade pendente no momento.
                </div>
              ) : (
                <div className="bg-ink-800/80 border border-white/[0.07] rounded-xl divide-y divide-white/[0.06]">
                  {incomingPending.map((req) => (
                    <div key={req.friendshipId} className="p-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm"
                          style={{ backgroundColor: req.friend.avatarColor }}
                        >
                          {req.friend.displayName.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-zinc-100">
                            {req.friend.name || req.friend.displayName}
                          </div>
                          <div className="text-xs text-zinc-500 font-mono">
                            #{req.friend.tag || '001'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onAcceptFriend(req.friendshipId)}
                          className="p-2 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-xl transition cursor-pointer"
                          title="Aceitar Pedido"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onRemoveFriend(req.friendshipId)}
                          className="p-2 bg-rose-500/20 hover:bg-rose-500 text-rose-400 hover:text-white rounded-xl transition cursor-pointer"
                          title="Recusar"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {outgoingPending.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Pedidos Enviados ({outgoingPending.length})
                </h4>
                <div className="bg-ink-800/80 border border-white/[0.07] rounded-xl divide-y divide-white/[0.06]">
                  {outgoingPending.map((req) => (
                    <div key={req.friendshipId} className="p-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm"
                          style={{ backgroundColor: req.friend.avatarColor }}
                        >
                          {req.friend.displayName.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-zinc-100">
                            {req.friend.name || req.friend.displayName}
                          </div>
                          <div className="text-xs text-zinc-500 font-mono">
                            #{req.friend.tag || '001'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Aguardando resposta</span>
                        <button
                          onClick={() => onRemoveFriend(req.friendshipId)}
                          className="ml-2 p-1.5 text-zinc-500 hover:text-rose-400 rounded transition cursor-pointer"
                          title="Cancelar Pedido"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: ONLINE OU TODOS */}
        {(tab === 'online' || tab === 'all') && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base text-zinc-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-volt" />
                <span>{tab === 'online' ? 'Amigos Disponíveis' : 'Todos os Amigos'}</span>
              </h3>
              <span className="text-xs text-zinc-500 font-medium">
                {tab === 'online' ? `${onlineFriends.length} online` : `${acceptedFriends.length} amigos`}
              </span>
            </div>

            {(tab === 'online' ? onlineFriends : acceptedFriends).length === 0 ? (
              <div className="py-12 bg-ink-800/70 border border-white/[0.07] rounded-2xl flex flex-col items-center justify-center space-y-3 text-center">
                <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/[0.07] flex items-center justify-center text-volt">
                  <Users className="w-6 h-6" />
                </div>
                <div className="text-zinc-200 font-bold text-sm">
                  {tab === 'online'
                    ? 'Nenhum amigo online agora'
                    : 'Você ainda não tem amigos adicionados'}
                </div>
                <button
                  onClick={() => setTab('add')}
                  className="px-4 py-2 bg-volt text-ink-950 text-xs font-bold rounded-xl transition shadow-md cursor-pointer"
                >
                  Adicionar Amigos
                </button>
              </div>
            ) : (
              <div className="bg-ink-800/75 border border-white/[0.07] rounded-2xl divide-y divide-white/[0.06] overflow-hidden">
                {(tab === 'online' ? onlineFriends : acceptedFriends).map((item) => {
                  const friend = item.friend;
                  const onlineUser = onlineUsers.find((ou) => ou.id === friend.id);
                  const isOnline = !!onlineUser;
                  const inVoiceChannel = onlineUser?.currentVoiceChannel;
                  const userServer = inVoiceChannel
                    ? servers.find((s) => s.id === onlineUser.currentServerId)
                    : null;

                  return (
                    <div
                      key={friend.id}
                      className="p-3.5 flex items-center justify-between hover:bg-white/[0.05] transition"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm relative"
                          style={{ backgroundColor: friend.avatarColor }}
                        >
                          {friend.displayName.slice(0, 1).toUpperCase()}
                          <div
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-ink-800 ${
                              isOnline ? 'bg-emerald-500' : 'bg-zinc-600'
                            }`}
                          />
                        </div>
                        <div>
                          <div className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                            <span>{friend.name || friend.displayName}</span>
                            <span className="text-[11px] font-mono text-zinc-500">
                              #{friend.tag || '001'}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-400">
                            {inVoiceChannel ? (
                              <span className="text-zinc-400 flex items-center gap-1 font-medium">
                                <Volume2 className="w-3 h-3 text-volt" />
                                Em call no {userServer?.name || 'servidor'}
                              </span>
                            ) : isOnline ? (
                              <span className="text-emerald-400">Online</span>
                            ) : (
                              <span className="text-zinc-500">Offline</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {inVoiceChannel && userServer && (
                          <button
                            onClick={() => {
                              onSelectServer(userServer);
                              onJoinVoice(inVoiceChannel, userServer.id);
                            }}
                            className="px-3 py-1.5 bg-white/[0.08] hover:bg-volt hover:text-ink-950 text-zinc-200 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            <span>Entrar na Sala</span>
                          </button>
                        )}

                        <button
                          onClick={() => onRemoveFriend(item.friendshipId)}
                          className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition cursor-pointer"
                          title="Remover Amigo"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SERVERS SECTION */}
        <div className="space-y-4 pt-4 border-t border-white/[0.07]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-base text-zinc-100">Seus Espaços & Servidores</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Acesse rapidamente suas comunidades privadas ou crie uma nova.
              </p>
            </div>
            <span className="text-xs text-zinc-500 font-medium">{servers.length} participando</span>
          </div>

          {servers.length === 0 ? (
            <div className="p-8 bg-ink-800/70 border border-white/[0.07] rounded-2xl flex flex-col items-center justify-center space-y-3 text-center">
              <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/[0.07] flex items-center justify-center text-volt">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="text-zinc-200 font-bold text-sm">
                Você ainda não faz parte de nenhum servidor
              </div>
              <p className="text-xs text-zinc-400 max-w-sm">
                Crie seu primeiro servidor ou peça o código de convite para um amigo.
              </p>
              <button
                onClick={onOpenCreateServer}
                className="px-4 py-2 bg-volt text-ink-950 text-xs font-bold rounded-xl transition shadow-md cursor-pointer"
              >
                + Criar Servidor
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {servers.map((server) => {
                const textCount = server.channels.filter((c) => c.type === 'text').length;
                const voiceCount = server.channels.filter((c) => c.type === 'voice').length;
                const isOwner = server.ownerId === currentUser?.id;

                return (
                  <div
                    key={server.id}
                    onClick={() => onSelectServer(server)}
                    className="bg-ink-800/80 hover:bg-ink-600 border border-white/[0.07] hover:border-white/[0.07] rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 shadow-lg group flex flex-col justify-between"
                  >
                    {server.bannerUrl && (
                      <div className="h-20 w-full relative overflow-hidden">
                        <img
                          src={server.bannerUrl}
                          alt={server.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-ink-800 to-transparent" />
                      </div>
                    )}

                    <div className="p-5 space-y-4">
                      <div className="flex items-center gap-3.5">
                        {server.iconUrl ? (
                          <img
                            src={server.iconUrl}
                            alt={server.name}
                            className="w-12 h-12 rounded-xl object-cover shadow-md border border-white/[0.07] group-hover:scale-105 transition-transform shrink-0"
                          />
                        ) : (
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white text-base shadow-md group-hover:scale-105 transition-transform shrink-0"
                            style={{ backgroundColor: server.iconColor }}
                          >
                            {getServerInitials(server.name)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-zinc-100 truncate group-hover:text-zinc-400 transition">
                              {server.name}
                            </h4>
                            {isOwner && (
                              <span className="text-[10px] bg-white/[0.08] text-zinc-400 border border-white/[0.07] px-1.5 rounded-md font-mono font-bold">
                                DONO
                              </span>
                            )}
                          </div>
                          {server.description && (
                            <p className="text-xs text-zinc-400 truncate mt-0.5">
                              {server.description}
                            </p>
                          )}
                          <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                            {textCount} texto • {voiceCount} voz • {server.members.length} membros
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/[0.07] flex items-center justify-between text-xs text-zinc-400">
                        <span className="font-mono text-[11px] bg-ink-900 px-2.5 py-0.5 rounded-lg border border-white/[0.07] text-zinc-400">
                          Convite: {server.inviteCode}
                        </span>
                        <span className="text-volt font-bold group-hover:translate-x-1 transition-transform">
                          →
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
