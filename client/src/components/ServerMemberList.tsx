import React from 'react';
import { Crown, Volume2, MicOff, HeadphoneOff, Monitor } from 'lucide-react';
import type { ServerItem, OnlineUser, User, ServerMemberInfo } from '../types';

interface ServerMemberListProps {
  server: ServerItem;
  currentUser: User | null;
  onlineUsers: OnlineUser[];
  allMembersInfo: ServerMemberInfo[];
  onSelectMember: (member: any) => void;
}

export const ServerMemberList: React.FC<ServerMemberListProps> = ({
  server,
  currentUser,
  onlineUsers,
  allMembersInfo,
  onSelectMember,
}) => {
  const memberIds = Array.from(new Set(server.members || []));

  const usersInfoMap = new Map<string, ServerMemberInfo>();
  allMembersInfo.forEach((u) => usersInfoMap.set(u.id, u));
  if (currentUser) {
    usersInfoMap.set(currentUser.id, {
      id: currentUser.id,
      name: currentUser.name || currentUser.displayName || 'Jogador',
      tag: currentUser.tag || '001',
      avatarColor: currentUser.avatarColor,
      avatarUrl: currentUser.avatarUrl,
    });
  }

  // Deduplicate online members by user ID (preferring session connected to voice or sharing screen)
  const dedupedOnlineMap = new Map<string, OnlineUser>();
  for (const ou of onlineUsers) {
    if (!memberIds.includes(ou.id)) continue;
    const existing = dedupedOnlineMap.get(ou.id);
    if (
      !existing ||
      (!existing.currentVoiceChannel && ou.currentVoiceChannel) ||
      (!existing.isScreenSharing && ou.isScreenSharing)
    ) {
      dedupedOnlineMap.set(ou.id, ou);
    }
  }
  const serverOnlineMembers = Array.from(dedupedOnlineMap.values());
  const onlineIds = new Set(serverOnlineMembers.map((ou) => ou.id));
  const offlineMemberIds = memberIds.filter((id) => !onlineIds.has(id));

  return (
    <div className="w-60 bg-ink-800/80 border-l border-white/[0.07] flex flex-col h-full select-none shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="h-14 px-4 border-b border-white/[0.07] flex items-center justify-between text-[11px] font-semibold text-zinc-500 uppercase tracking-widest shrink-0">
        <span>Membros</span>
        <span className="bg-white/[0.05] border border-white/[0.07] px-2 py-0.5 rounded-full text-[11px] text-zinc-200 font-mono">
          {memberIds.length}
        </span>
      </div>

      <div className="p-3 space-y-5 flex-1">
        {/* ONLINE SECTION */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 px-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
            <span>Disponível — {serverOnlineMembers.length}</span>
          </div>

          <div className="space-y-0.5">
            {serverOnlineMembers.map((member) => {
              const isOwner = member.id === server.ownerId;
              const isMe = member.id === currentUser?.id;
              const inVoice = !!member.currentVoiceChannel;
              const displayName = member.name || member.displayName || 'Jogador';

              return (
                <div
                  key={member.id}
                  onClick={() => onSelectMember(member)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/[0.05] transition group cursor-pointer"
                  title={isMe ? `${displayName} (Você)` : displayName}
                >
                  <div className="relative shrink-0">
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt={displayName}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs"
                        style={{ backgroundColor: member.avatarColor || '#8b5cf6' }}
                      >
                        {displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-ink-800" />
                  </div>

                  <div className="min-w-0 flex-1 truncate">
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className={`text-xs font-bold truncate ${
                          isOwner ? 'text-zinc-400' : 'text-zinc-200 group-hover:text-white'
                        }`}
                      >
                        {displayName}
                      </span>
                      {isOwner && (
                        <span title="Dono do Servidor">
                          <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-[10px] text-zinc-400 truncate">
                      {inVoice ? (
                        <span className="text-zinc-400 flex items-center gap-1 font-medium">
                          <Volume2 className="w-3 h-3 text-volt" />
                          <span>Em call</span>
                        </span>
                      ) : (
                        <span className="text-zinc-500">Online</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-zinc-400 shrink-0">
                    {member.isScreenSharing && (
                      <span title="Compartilhando Tela">
                        <Monitor className="w-3 h-3 text-volt animate-pulse" />
                      </span>
                    )}
                    {member.isMuted && (
                      <span title="Mutado">
                        <MicOff className="w-3 h-3 text-rose-400" />
                      </span>
                    )}
                    {member.isDeafened && (
                      <span title="Áudio desativado">
                        <HeadphoneOff className="w-3 h-3 text-rose-400" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* OFFLINE SECTION */}
        {offlineMemberIds.length > 0 && (
          <div className="space-y-1.5 pt-2">
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 px-2">
              <span className="w-2 h-2 rounded-full bg-zinc-600 inline-block" />
              <span>Offline — {offlineMemberIds.length}</span>
            </div>

            <div className="space-y-0.5">
              {offlineMemberIds.map((id) => {
                const isOwner = id === server.ownerId;
                const memberInfo = usersInfoMap.get(id);
                const displayName = memberInfo ? memberInfo.name : `Membro (${id.slice(4, 8)})`;
                const avatarColor = memberInfo?.avatarColor || '#475569';
                const avatarUrl = memberInfo?.avatarUrl;

                const u = memberInfo
                  ? { ...memberInfo, id }
                  : { id, name: displayName, tag: '001', avatarColor, avatarUrl };

                return (
                  <div
                    key={id}
                    onClick={() => onSelectMember(u)}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl opacity-55 hover:opacity-100 hover:bg-white/[0.05] transition group cursor-pointer"
                  >
                    <div className="relative shrink-0">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={displayName}
                          className="w-8 h-8 rounded-full object-cover grayscale"
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs bg-zinc-700"
                          style={{ backgroundColor: avatarColor }}
                        >
                          {displayName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-zinc-600 rounded-full border-2 border-ink-800" />
                    </div>

                    <div className="min-w-0 flex-1 truncate">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-xs font-semibold text-zinc-400 truncate">
                          {displayName}
                        </span>
                        {isOwner && (
                          <span title="Dono do Servidor">
                            <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500">Offline</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
