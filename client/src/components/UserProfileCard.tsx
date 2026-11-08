import React, { useState } from 'react';
import {
  X,
  UserPlus,
  UserCheck,
  Phone,
  MessageSquare,
  Clock,
  UserX,
  Send,
  Sparkles,
  Gamepad2,
  Tv,
  Swords,
  Crown,
} from 'lucide-react';
import type { User, ServerItem, FriendItem, OnlineUser, ServerMemberInfo } from '../types';

interface UserProfileCardProps {
  user: User | ServerMemberInfo | OnlineUser | null;
  currentUser: User | null;
  server?: ServerItem | null;
  friends: FriendItem[];
  onlineUsers: OnlineUser[];
  onClose: () => void;
  onSendFriendRequest: (tag: string, callback?: any) => void;
  onStartDMCall?: (user: any) => void;
  onSelectDM?: (user: any) => void;
  onSendDM?: (toUserId: string, text: string) => void;
  onAssignRole?: (targetUserId: string, roleId: string) => void;
  onTimeoutMember?: (targetUserId: string, minutes: number) => void;
  onKickMember?: (targetUserId: string) => void;
}

export const UserProfileCard: React.FC<UserProfileCardProps> = ({
  user,
  currentUser,
  server,
  friends,
  onlineUsers,
  onClose,
  onSendFriendRequest,
  onStartDMCall,
  onSelectDM,
  onSendDM,
  onAssignRole,
  onTimeoutMember,
  onKickMember,
}) => {
  const [quickMessage, setQuickMessage] = useState('');
  const [sentFeedback, setSentFeedback] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showTimeoutMenu, setShowTimeoutMenu] = useState(false);
  const [confirmingKick, setConfirmingKick] = useState(false);
  const [friendFeedback, setFriendFeedback] = useState<{ text: string; isError?: boolean } | null>(null);

  if (!user) return null;

  const isMe = currentUser?.id === user.id;
  const isOnline = onlineUsers.some((ou) => ou.id === user.id);
  const isFriend = friends.some((f) => f.friend.id === user.id && f.status === 'accepted');
  const isPendingFriend = friends.some((f) => f.friend.id === user.id && f.status === 'pending');

  const displayName = user.name || (user as any).displayName || 'Jogador';
  const tag = user.tag || '001';
  const bio = user.bio || (user as any).quote || 'Nenhum recado ainda.';

  // Server-specific roles & permissions
  const isServerOwner = server && server.ownerId === user.id;
  const iAmServerOwner = server && currentUser && server.ownerId === currentUser.id;
  const myRoles = server && currentUser ? server.memberRoles?.[currentUser.id] || [] : [];
  const iAmAdmin = iAmServerOwner || (server?.roles || []).some((r) => myRoles.includes(r.id) && r.isAdmin);

  const userRoleIds = server ? server.memberRoles?.[user.id] || [] : [];
  const userRoles = server && server.roles ? server.roles.filter((r) => userRoleIds.includes(r.id)) : [];

  // Timeout status
  const timeoutExpiry = server?.timeouts?.[user.id];
  const isTimedOut = timeoutExpiry && timeoutExpiry > Date.now();
  const timeoutRemainingMinutes = isTimedOut ? Math.ceil((timeoutExpiry - Date.now()) / 60000) : 0;

  const handleSendQuickMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickMessage.trim() || !onSendDM) return;
    onSendDM(user.id, quickMessage.trim());
    setQuickMessage('');
    setSentFeedback(true);
    setTimeout(() => setSentFeedback(false), 2000);
  };

  const handleFriendClick = () => {
    if (isMe || isFriend || isPendingFriend) return;
    onSendFriendRequest(`${displayName}#${tag}`, (res: any) => {
      if (res?.message) {
        setFriendFeedback({ text: res.message, isError: false });
      } else if (res?.error) {
        setFriendFeedback({ text: res.error, isError: true });
      }
      setTimeout(() => setFriendFeedback(null), 3500);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[350px] bg-ink-800 border border-white/[0.07] rounded-2xl overflow-hidden shadow-2xl relative select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Header Banner */}
        <div
          className="h-24 w-full relative"
          style={{
            background: `linear-gradient(135deg, ${user.avatarColor || '#8b5cf6'} 0%, #2e1065 60%, #120b22 100%)`,
          }}
        >
          {/* Top Right Action Icons */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
            {!isMe && (
              <>
                <button
                  onClick={handleFriendClick}
                  disabled={isFriend || isPendingFriend}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition backdrop-blur-md cursor-pointer ${
                    isFriend
                      ? 'bg-emerald-500/30 text-emerald-300'
                      : isPendingFriend
                      ? 'bg-amber-500/30 text-amber-300'
                      : 'bg-black/40 hover:bg-black/60 text-white'
                  }`}
                  title={isFriend ? 'Já são amigos' : isPendingFriend ? 'Pedido pendente' : 'Adicionar Amigo'}
                >
                  {isFriend ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                </button>

                {onStartDMCall && isFriend && (
                  <button
                    onClick={() => {
                      onStartDMCall(user);
                      onClose();
                    }}
                    className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition backdrop-blur-md cursor-pointer"
                    title="Ligar para amigo"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                )}

                {onSelectDM && isFriend && (
                  <button
                    onClick={() => {
                      onSelectDM(user);
                      onClose();
                    }}
                    className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition backdrop-blur-md cursor-pointer"
                    title="Abrir Chat Privado"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                )}
              </>
            )}

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition backdrop-blur-md cursor-pointer"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Avatar with Status Dot */}
        <div className="px-5 relative pb-2">
          <div className="relative -mt-12 inline-block">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={displayName}
                className="w-20 h-20 rounded-xl object-cover border-4 border-ink-800 shadow-xl"
              />
            ) : (
              <div
                className="w-20 h-20 rounded-xl flex items-center justify-center font-semibold text-white text-2xl border-4 border-ink-800 shadow-xl"
                style={{ backgroundColor: user.avatarColor || '#8b5cf6' }}
              >
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div
              className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-4 border-ink-800 ${
                isOnline ? 'bg-emerald-500' : 'bg-zinc-600'
              }`}
              title={isOnline ? 'Disponível' : 'Offline'}
            />
          </div>

          {/* Speech Bubble / Status Quote */}
          {bio && bio !== 'Nenhum recado ainda.' && (
            <div className="absolute top-2 right-5 max-w-[175px] bg-ink-700 border border-white/[0.07] text-zinc-200 text-xs px-3 py-1.5 rounded-xl rounded-tl-none shadow-lg">
              <span className="line-clamp-2 italic">“{bio}”</span>
            </div>
          )}
        </div>

        {/* 3. User Identity Details */}
        <div className="px-5 pb-4 space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white truncate">{displayName}</h3>
              {isServerOwner && (
                <span title="Dono do Servidor">
                  <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                </span>
              )}
            </div>
            <div className="text-xs text-zinc-500 font-mono">
              @{displayName.toLowerCase().replace(/\s+/g, '')} • #{tag}
            </div>
          </div>

          {/* Badges / Gaming decorative strip */}
          <div className="flex items-center gap-1.5 py-1 text-zinc-400">
            <span className="p-1.5 rounded-xl bg-ink-900 border border-white/[0.07] text-volt" title="Gamer">
              <Gamepad2 className="w-4 h-4" />
            </span>
            <span className="p-1.5 rounded-xl bg-ink-900 border border-white/[0.07] text-volt" title="Streamer">
              <Tv className="w-4 h-4" />
            </span>
            <span className="p-1.5 rounded-xl bg-ink-900 border border-white/[0.07] text-pink-400" title="AURA">
              <Swords className="w-4 h-4" />
            </span>
            <span className="p-1.5 rounded-xl bg-ink-900 border border-white/[0.07] text-emerald-400" title="Janjacord Pro">
              <Sparkles className="w-4 h-4" />
            </span>
          </div>

          {friendFeedback && (
            <div
              className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
                friendFeedback.isError
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}
            >
              {friendFeedback.text}
            </div>
          )}

          {/* Timeout Alert if Timed Out */}
          {isTimedOut && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-xs text-rose-300 font-semibold">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-rose-400" />
                <span>Silenciado: restam {timeoutRemainingMinutes}m</span>
              </div>
              {iAmAdmin && onTimeoutMember && server && (
                <button
                  onClick={() => onTimeoutMember(user.id, 0)}
                  className="text-[10px] text-rose-400 hover:text-white underline cursor-pointer"
                >
                  Desmutar
                </button>
              )}
            </div>
          )}

          {/* 4. Server Roles Section */}
          {server && (
            <div className="space-y-1.5 pt-2 border-t border-white/[0.07]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Cargos no Servidor
                </span>
                {iAmAdmin && !isMe && !isServerOwner && (
                  <button
                    onClick={() => setShowRoleMenu(!showRoleMenu)}
                    className="text-[11px] text-volt hover:text-zinc-400 font-semibold cursor-pointer"
                  >
                    + Gerenciar
                  </button>
                )}
              </div>

              {/* Roles Badges */}
              <div className="flex flex-wrap gap-1.5">
                {isServerOwner && (
                  <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <Crown className="w-3 h-3" />
                    <span>Dono</span>
                  </span>
                )}
                {userRoles.map((role) => (
                  <span
                    key={role.id}
                    className="px-2.5 py-0.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 border"
                    style={{
                      backgroundColor: `${role.color}20`,
                      borderColor: `${role.color}40`,
                      color: role.color,
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: role.color }} />
                    <span>{role.name}</span>
                  </span>
                ))}
                {!isServerOwner && userRoles.length === 0 && (
                  <span className="text-xs text-zinc-500 italic">Nenhum cargo atribuído.</span>
                )}
              </div>

              {/* Role Toggle Dropdown if Admin clicks Gerenciar */}
              {showRoleMenu && server.roles && (
                <div className="p-2.5 bg-ink-900 border border-white/[0.07] rounded-xl space-y-1 mt-1">
                  <div className="text-[10px] text-zinc-500 font-bold uppercase">Atribuir cargo:</div>
                  {server.roles.map((r) => {
                    const hasRole = userRoleIds.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        onClick={() => onAssignRole?.(user.id, r.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition cursor-pointer ${
                          hasRole ? 'bg-white/[0.08] text-white font-bold' : 'text-zinc-300 hover:bg-white/[0.05]'
                        }`}
                      >
                        <span style={{ color: r.color }}>{r.name}</span>
                        <span>{hasRole ? '✓' : '+'}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 5. Moderation Quick Actions (Admin Only) */}
          {iAmAdmin && !isMe && !isServerOwner && server && (
            <div className="pt-2 border-t border-white/[0.07] space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowTimeoutMenu(!showTimeoutMenu);
                    setConfirmingKick(false);
                  }}
                  className="flex-1 py-1.5 px-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Timeout</span>
                </button>

                <button
                  onClick={() => {
                    setConfirmingKick(!confirmingKick);
                    setShowTimeoutMenu(false);
                  }}
                  className={`py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center gap-1 transition cursor-pointer border ${
                    confirmingKick
                      ? 'bg-rose-600 text-white border-rose-500 shadow-lg'
                      : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30'
                  }`}
                  title="Expulsar do servidor"
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>Expulsar</span>
                </button>
              </div>

              {confirmingKick && (
                <div className="p-3 bg-ink-900 border border-rose-500/40 rounded-xl space-y-2.5 shadow-xl animate-in fade-in duration-150">
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0 mt-0.5">
                      <UserX className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white">Expulsar {displayName}?</div>
                      <p className="text-[11px] text-zinc-300 leading-snug mt-0.5">
                        Tem certeza que deseja remover{' '}
                        <span className="font-bold text-rose-300">{displayName}</span> do servidor{' '}
                        <span className="font-bold text-white">{server.name}</span>?
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setConfirmingKick(false)}
                      className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-bold transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onKickMember?.(user.id);
                        setConfirmingKick(false);
                        onClose();
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg transition cursor-pointer"
                    >
                      Sim, Expulsar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Timeout Options Dropdown */}
          {showTimeoutMenu && server && onTimeoutMember && (
            <div className="p-2.5 bg-ink-900 border border-white/[0.07] rounded-xl space-y-1.5 text-xs">
              <div className="text-[10px] text-zinc-500 font-bold uppercase">Tempo de silenciamento:</div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: '5 minutos', mins: 5 },
                  { label: '15 minutos', mins: 15 },
                  { label: '1 hora', mins: 60 },
                  { label: '24 horas', mins: 1440 },
                ].map((opt) => (
                  <button
                    key={opt.mins}
                    onClick={() => {
                      onTimeoutMember(user.id, opt.mins);
                      setShowTimeoutMenu(false);
                    }}
                    className="p-1.5 bg-ink-700 hover:bg-volt hover:text-ink-950 text-zinc-200 hover:text-white rounded-xl text-center font-semibold transition cursor-pointer"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 6. Quick Direct Message Input */}
          {!isMe && onSendDM && (
            <form onSubmit={handleSendQuickMessage} className="pt-2 border-t border-white/[0.07]">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={quickMessage}
                  onChange={(e) => setQuickMessage(e.target.value)}
                  placeholder={`Conversar com @${displayName}`}
                  className="w-full bg-ink-900 border border-white/[0.07] rounded-xl pl-3.5 pr-9 py-2.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-volt/40 transition select-text"
                />
                <button
                  type="submit"
                  disabled={!quickMessage.trim()}
                  className="absolute right-1.5 p-1.5 text-volt hover:text-white disabled:opacity-30 transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
              {sentFeedback && (
                <div className="text-[10px] text-emerald-400 mt-1 text-center font-semibold animate-pulse">
                  ✓ Mensagem direta enviada!
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
