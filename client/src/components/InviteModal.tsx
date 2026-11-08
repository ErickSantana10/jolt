import React, { useState } from 'react';
import { X, Copy, Check, UserPlus, Users } from 'lucide-react';
import type { ServerItem, FriendItem } from '../types';

interface InviteModalProps {
  isOpen: boolean;
  server: ServerItem | null;
  friends: FriendItem[];
  onClose: () => void;
  onInviteFriend: (serverId: string, friendUserId: string) => void;
}

export const InviteModal: React.FC<InviteModalProps> = ({
  isOpen,
  server,
  friends,
  onClose,
  onInviteFriend,
}) => {
  const [copied, setCopied] = useState(false);
  const [invitedMap, setInvitedMap] = useState<Record<string, boolean>>({});

  if (!isOpen || !server) return null;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(server.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInvite = (friendUserId: string) => {
    onInviteFriend(server.id, friendUserId);
    setInvitedMap((prev) => ({ ...prev, [friendUserId]: true }));
  };

  const acceptedFriends = friends.filter((f) => f.status === 'accepted');

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-ink-800 border border-white/[0.07] rounded-2xl p-6 shadow-2xl relative space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.07] flex items-center justify-center text-volt">
              <UserPlus className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-base text-white truncate">Convidar para {server.name}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.05] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Invite Code Box */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            Código de Convite do Servidor
          </label>
          <div className="flex items-center gap-2 bg-ink-900 border border-white/[0.07] rounded-xl p-2 pl-4">
            <span className="font-mono text-base font-bold text-zinc-400 tracking-wider flex-1 select-all">
              {server.inviteCode}
            </span>
            <button
              onClick={handleCopyCode}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-volt text-ink-950 shadow-md'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copiado!' : 'Copiar'}</span>
            </button>
          </div>
          <p className="text-[11px] text-zinc-500">
            Envie esse código para seus amigos clicarem em <strong>Novo Espaço</strong> e colarem o convite.
          </p>
        </div>

        {/* Invite Friends Directly */}
        <div className="space-y-2 pt-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-volt" />
            Enviar Convite Direto aos Amigos
          </label>

          <div className="bg-ink-900 border border-white/[0.07] rounded-xl max-h-48 overflow-y-auto divide-y divide-white/[0.06]">
            {acceptedFriends.length === 0 ? (
              <div className="p-5 text-center text-xs text-zinc-400">
                Você ainda não tem amigos adicionados. Adicione amigos na Central de Amigos para convidá-los!
              </div>
            ) : (
              acceptedFriends.map((item) => {
                const friend = item.friend;
                const isMember = server.members.includes(friend.id);
                const isInvited = invitedMap[friend.id];

                return (
                  <div key={friend.id} className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5 truncate">
                      {friend.avatarUrl ? (
                        <img
                          src={friend.avatarUrl}
                          alt={friend.displayName}
                          className="w-8 h-8 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0"
                          style={{ backgroundColor: friend.avatarColor }}
                        >
                          {friend.displayName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="truncate">
                        <div className="text-xs font-bold text-zinc-100 truncate">
                          {friend.displayName}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          #{friend.tag || '001'}
                        </div>
                      </div>
                    </div>

                    {isMember ? (
                      <span className="text-[11px] text-zinc-500 font-semibold">Já é membro</span>
                    ) : isInvited ? (
                      <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Enviado!
                      </span>
                    ) : (
                      <button
                        onClick={() => handleInvite(friend.id)}
                        className="px-3.5 py-1.5 bg-white/[0.08] hover:bg-volt hover:text-ink-950 text-zinc-200 hover:text-white border border-white/[0.07] rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        Convidar
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
