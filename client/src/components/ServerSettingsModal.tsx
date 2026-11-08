import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Settings,
  Shield,
  Users,
  Trash2,
  Plus,
  Crown,
  Clock,
  UserX,
  Save,
  Check,
  Camera,
  Image as ImageIcon,
} from 'lucide-react';
import type { ServerItem, User, ServerMemberInfo } from '../types';

interface ServerSettingsModalProps {
  isOpen: boolean;
  server: ServerItem;
  currentUser: User | null;
  allMembersInfo: ServerMemberInfo[];
  onClose: () => void;
  onUpdateSettings: (
    name: string,
    iconColor: string,
    extra?: { iconUrl?: string; bannerUrl?: string; description?: string }
  ) => void;
  onCreateRole: (name: string, color: string, isAdmin: boolean) => void;
  onDeleteRole: (roleId: string) => void;
  onAssignRole: (targetUserId: string, roleId: string) => void;
  onTimeoutMember: (targetUserId: string, durationMinutes: number) => void;
  onKickMember: (targetUserId: string) => void;
  onDeleteServer: () => void;
}

const PRESET_COLORS = [
  '#8b5cf6', // Violet
  '#a855f7', // Purple
  '#d946ef', // Fuchsia
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Rose
];

export const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({
  isOpen,
  server,
  currentUser,
  allMembersInfo,
  onClose,
  onUpdateSettings,
  onCreateRole,
  onDeleteRole,
  onAssignRole,
  onTimeoutMember,
  onKickMember,
  onDeleteServer,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'roles' | 'members'>('overview');
  const [serverName, setServerName] = useState(server.name);
  const [serverColor, setServerColor] = useState(server.iconColor || '#8b5cf6');
  const [serverIconUrl, setServerIconUrl] = useState<string>(server.iconUrl || '');
  const [serverBannerUrl, setServerBannerUrl] = useState<string>(server.bannerUrl || '');
  const [serverDescription, setServerDescription] = useState<string>(server.description || '');
  const [isSaved, setIsSaved] = useState(false);

  const iconInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setServerName(server.name);
    setServerColor(server.iconColor || '#8b5cf6');
    setServerIconUrl(server.iconUrl || '');
    setServerBannerUrl(server.bannerUrl || '');
    setServerDescription(server.description || '');
  }, [server, isOpen]);

  // New role form
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#a855f7');
  const [newRoleIsAdmin, setNewRoleIsAdmin] = useState(false);
  const [isCreatingRole, setIsCreatingRole] = useState(false);

  // Member search
  const [memberSearch, setMemberSearch] = useState('');
  const [confirmDeleteServer, setConfirmDeleteServer] = useState(false);
  const [confirmKickMember, setConfirmKickMember] = useState<{ id: string; name: string } | null>(null);
  const [timeoutMemberTarget, setTimeoutMemberTarget] = useState<{ id: string; name: string } | null>(null);
  const [customTimeoutMinutes, setCustomTimeoutMinutes] = useState('15');

  if (!isOpen) return null;

  const isOwner = currentUser?.id === server.ownerId;
  const myRoles = currentUser ? server.memberRoles?.[currentUser.id] || [] : [];
  const isAdmin = isOwner || (server.roles || []).some((r) => myRoles.includes(r.id) && r.isAdmin);

  const handleImageFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 4MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setter(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveOverview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverName.trim()) return;
    onUpdateSettings(serverName.trim(), serverColor, {
      iconUrl: serverIconUrl,
      bannerUrl: serverBannerUrl,
      description: serverDescription.trim(),
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleCreateRoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    onCreateRole(newRoleName.trim(), newRoleColor, newRoleIsAdmin);
    setNewRoleName('');
    setNewRoleColor('#a855f7');
    setNewRoleIsAdmin(false);
    setIsCreatingRole(false);
  };

  // Map member info
  const membersMap = new Map<string, ServerMemberInfo>();
  allMembersInfo.forEach((u) => membersMap.set(u.id, u));
  if (currentUser) {
    membersMap.set(currentUser.id, {
      id: currentUser.id,
      name: currentUser.name || (currentUser as any).displayName || 'Jogador',
      tag: currentUser.tag || '001',
      avatarColor: currentUser.avatarColor,
      avatarUrl: currentUser.avatarUrl,
      bio: currentUser.bio,
    });
  }

  const uniqueMemberIds = Array.from(new Set(server.members || []));
  const serverMembers = uniqueMemberIds
    .map((id) => {
      const info = membersMap.get(id);
      return {
        id,
        name: info?.name || 'Membro',
        tag: info?.tag || '001',
        avatarColor: info?.avatarColor || '#8b5cf6',
        avatarUrl: info?.avatarUrl,
      };
    })
    .filter((m) => m.name.toLowerCase().includes(memberSearch.toLowerCase()));

  const serverRoles = server.roles || [
    { id: 'role-admin', name: 'Administrador', color: '#ef4444', isAdmin: true },
    { id: 'role-mod', name: 'Moderador', color: '#8b5cf6', isAdmin: false },
    { id: 'role-member', name: 'Membro', color: '#94a3b8', isAdmin: false },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-3xl h-[610px] bg-ink-800 border border-white/[0.07] rounded-2xl shadow-2xl flex overflow-hidden select-none">
        {/* 1. Left Sidebar Tabs */}
        <div className="w-60 bg-ink-900 border-r border-white/[0.07] p-4 flex flex-col justify-between shrink-0">
          <div className="space-y-4">
            <div className="px-3 flex items-center gap-2.5">
              {serverIconUrl ? (
                <img
                  src={serverIconUrl}
                  alt={serverName}
                  className="w-7 h-7 rounded-xl object-cover border border-white/[0.07] shrink-0"
                />
              ) : (
                <span
                  className="w-7 h-7 rounded-xl flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                  style={{ backgroundColor: serverColor }}
                >
                  {serverName.slice(0, 2).toUpperCase() || 'JJ'}
                </span>
              )}
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-200 truncate">
                {server.name}
              </h4>
            </div>

            <div className="space-y-1.5">
              <button
                onClick={() => setActiveTab('overview')}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeTab === 'overview'
                    ? 'bg-white/[0.07] text-white border border-white/[0.07] shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
                }`}
              >
                <Settings className="w-4 h-4 text-volt" />
                <span>Visão Geral & Estilo</span>
              </button>

              <button
                onClick={() => setActiveTab('roles')}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeTab === 'roles'
                    ? 'bg-white/[0.07] text-white border border-white/[0.07] shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
                }`}
              >
                <Shield className="w-4 h-4 text-volt" />
                <span>Cargos ({serverRoles.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('members')}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeTab === 'members'
                    ? 'bg-white/[0.07] text-white border border-white/[0.07] shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
                }`}
              >
                <Users className="w-4 h-4 text-emerald-400" />
                <span>Membros ({uniqueMemberIds.length})</span>
              </button>
            </div>
          </div>

          {/* Delete Server Option at Bottom (Owner Only) */}
          {isOwner && (
            <button
              onClick={() => setConfirmDeleteServer(true)}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-500/15 border border-transparent hover:border-rose-500/30 transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Excluir Servidor</span>
            </button>
          )}
        </div>

        {/* 2. Main Tab Content */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="h-15 px-6 border-b border-white/[0.07] flex items-center justify-between bg-transparent shrink-0">
            <div>
              <h3 className="font-bold text-base text-white">
                {activeTab === 'overview' && 'Personalização & Visão Geral'}
                {activeTab === 'roles' && 'Cargos & Permissões'}
                {activeTab === 'members' && 'Gerenciamento de Membros'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tab Body */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* TAB 1: VISÃO GERAL & ESTILO */}
            {activeTab === 'overview' && (
              <form onSubmit={handleSaveOverview} className="space-y-5 max-w-lg">
                {/* Banner / Capa do Servidor + Ícone Sobreposto */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-200 block">
                    Capa (Banner) & Foto do Servidor
                  </label>
                  <div className="relative rounded-xl overflow-hidden border border-white/[0.07] bg-ink-900 shadow-lg">
                    {/* Banner Area */}
                    <div
                      onClick={() => bannerInputRef.current?.click()}
                      className="h-28 w-full relative cursor-pointer group overflow-hidden flex items-center justify-center"
                      style={{
                        background: serverBannerUrl
                          ? undefined
                          : `linear-gradient(135deg, ${serverColor}55 0%, #1e103a 50%, #0b0714 100%)`,
                      }}
                    >
                      {serverBannerUrl && (
                        <img
                          src={serverBannerUrl}
                          alt="Banner do Servidor"
                          className="w-full h-full object-cover"
                        />
                      )}
                      <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 text-xs font-bold text-white transition">
                        <ImageIcon className="w-4 h-4 text-zinc-400" />
                        <span>Alterar Capa do Servidor</span>
                      </div>
                      {serverBannerUrl && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setServerBannerUrl('');
                          }}
                          className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-black/70 hover:bg-rose-600 text-[10px] font-bold text-white transition cursor-pointer"
                        >
                          Remover Capa
                        </button>
                      )}
                    </div>

                    <input
                      ref={bannerInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageFile(e, setServerBannerUrl)}
                      className="hidden"
                    />

                    {/* Bottom Strip inside Preview Card with Icon + Colors */}
                    <div className="p-4 pt-3 flex items-center justify-between gap-4 bg-ink-800/90">
                      <div className="flex items-center gap-3.5">
                        <div
                          onClick={() => iconInputRef.current?.click()}
                          className="relative -mt-9 w-16 h-16 rounded-xl flex items-center justify-center text-white text-xl font-bold shadow-xl border-4 border-ink-800 cursor-pointer group overflow-hidden shrink-0"
                          style={{ backgroundColor: serverColor }}
                          title="Clique para enviar uma foto para o servidor"
                        >
                          {serverIconUrl ? (
                            <img
                              src={serverIconUrl}
                              alt={serverName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span>{serverName.slice(0, 2).toUpperCase() || 'JJ'}</span>
                          )}
                          <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                            <Camera className="w-5 h-5 text-white" />
                          </div>
                        </div>

                        <input
                          ref={iconInputRef}
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageFile(e, setServerIconUrl)}
                          className="hidden"
                        />

                        <div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => iconInputRef.current?.click()}
                              className="text-xs font-bold text-zinc-400 hover:text-white transition cursor-pointer"
                            >
                              {serverIconUrl ? 'Trocar Foto' : 'Enviar Foto'}
                            </button>
                            {serverIconUrl && (
                              <button
                                type="button"
                                onClick={() => setServerIconUrl('')}
                                className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                              >
                                Remover
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-2">
                            {PRESET_COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setServerColor(c)}
                                className={`w-5 h-5 rounded-full transition cursor-pointer ${
                                  serverColor === c
                                    ? 'ring-2 ring-white scale-110'
                                    : 'opacity-75 hover:opacity-100'
                                }`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Nome e Descrição */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-200 block">
                      Nome do Servidor
                    </label>
                    <input
                      type="text"
                      value={serverName}
                      onChange={(e) => setServerName(e.target.value)}
                      maxLength={32}
                      className="w-full bg-ink-900 border border-white/[0.07] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-volt/40 transition select-text"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-200 block">
                      Descrição Curta / Status
                    </label>
                    <input
                      type="text"
                      value={serverDescription}
                      onChange={(e) => setServerDescription(e.target.value)}
                      placeholder="Ex: Comunidade oficial de jogos e resenha"
                      maxLength={80}
                      className="w-full bg-ink-900 border border-white/[0.07] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-volt/40 transition select-text"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-200 block">
                    Código de Convite
                  </label>
                  <div className="p-3 bg-ink-900 border border-white/[0.07] rounded-xl text-xs font-mono text-zinc-400 flex items-center justify-between">
                    <span className="font-bold tracking-wider">{server.inviteCode}</span>
                    <span className="text-[10px] text-zinc-500 font-sans">
                      Compartilhe para convidar amigos
                    </span>
                  </div>
                </div>

                <div className="pt-1 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={!serverName.trim()}
                    className="px-5 py-2.5 bg-volt text-ink-950 disabled:opacity-40 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>Salvar Personalizações</span>
                  </button>
                  {isSaved && (
                    <span className="text-xs text-emerald-400 font-bold flex items-center gap-1 animate-pulse">
                      <Check className="w-4 h-4" />
                      <span>Personalizações salvas!</span>
                    </span>
                  )}
                </div>
              </form>
            )}

            {/* TAB 2: CARGOS */}
            {activeTab === 'roles' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">Cargos do Servidor</h4>
                    <p className="text-xs text-zinc-500">
                      Crie cargos para organizar membros e definir quem pode administrar.
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => setIsCreatingRole(true)}
                      className="px-4 py-2 bg-volt text-ink-950 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg transition cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Novo Cargo</span>
                    </button>
                  )}
                </div>

                {/* Form to create role */}
                {isCreatingRole && (
                  <form
                    onSubmit={handleCreateRoleSubmit}
                    className="p-4 bg-ink-900 border border-white/[0.07] rounded-xl space-y-3"
                  >
                    <div className="font-bold text-xs text-zinc-200 uppercase tracking-wider">
                      Criar Novo Cargo
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold uppercase text-zinc-500">
                          Nome do Cargo
                        </label>
                        <input
                          type="text"
                          value={newRoleName}
                          onChange={(e) => setNewRoleName(e.target.value)}
                          placeholder="ex: Campeão, DJ, VIP"
                          className="w-full mt-1 bg-ink-800 border border-white/[0.07] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-volt/40 transition select-text"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-zinc-500">
                          Cor do Cargo
                        </label>
                        <div className="flex items-center gap-2 mt-2">
                          {PRESET_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setNewRoleColor(c)}
                              className={`w-5 h-5 rounded-full transition cursor-pointer ${
                                newRoleColor === c ? 'ring-2 ring-white scale-110' : ''
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-zinc-300 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newRoleIsAdmin}
                        onChange={(e) => setNewRoleIsAdmin(e.target.checked)}
                        className="accent-volt rounded"
                      />
                      <span>Conceder Permissão de Administrador (Kick, Timeout, Gerenciar)</span>
                    </label>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsCreatingRole(false)}
                        className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white rounded-xl transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={!newRoleName.trim()}
                        className="px-4 py-1.5 bg-volt text-ink-950 disabled:opacity-40 rounded-xl text-xs font-bold transition shadow cursor-pointer"
                      >
                        Salvar Cargo
                      </button>
                    </div>
                  </form>
                )}

                {/* Roles List */}
                <div className="space-y-2">
                  {serverRoles.map((role) => (
                    <div
                      key={role.id}
                      className="flex items-center justify-between p-3.5 bg-ink-900 border border-white/[0.07] rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: role.color }}
                        />
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            <span>{role.name}</span>
                            {role.isAdmin && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-white/[0.08] text-zinc-400 border border-white/[0.07]">
                                Admin
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                            ID: {role.id}
                          </div>
                        </div>
                      </div>

                      {isAdmin && role.id !== 'role-admin' && (
                        <button
                          onClick={() => onDeleteRole(role.id)}
                          className="p-1.5 text-zinc-500 hover:text-rose-400 rounded-xl hover:bg-rose-500/10 transition cursor-pointer"
                          title="Excluir Cargo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: MEMBROS */}
            {activeTab === 'members' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      Membros ({uniqueMemberIds.length})
                    </h4>
                    <p className="text-xs text-zinc-500">
                      Atribua cargos, silencie com timeout ou remova membros deste servidor.
                    </p>
                  </div>
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Buscar membro..."
                    className="bg-ink-900 border border-white/[0.07] rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-volt/40 transition select-text"
                  />
                </div>

                <div className="space-y-2">
                  {serverMembers.map((member) => {
                    const isMemberOwner = member.id === server.ownerId;
                    const assignedRoleIds = server.memberRoles?.[member.id] || [];
                    const timeoutExp = server.timeouts?.[member.id];
                    const isTimedOut = timeoutExp && timeoutExp > Date.now();
                    const remainingMin = isTimedOut ? Math.ceil((timeoutExp - Date.now()) / 60000) : 0;

                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3.5 bg-ink-900 border border-white/[0.07] rounded-xl"
                      >
                        {/* Member Identity */}
                        <div className="flex items-center gap-3 min-w-0">
                          {member.avatarUrl ? (
                            <img
                              src={member.avatarUrl}
                              alt={member.name}
                              className="w-9 h-9 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0"
                              style={{ backgroundColor: member.avatarColor }}
                            >
                              {member.name.slice(0, 1).toUpperCase()}
                            </div>
                          )}

                          <div className="min-w-0 truncate">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white truncate">{member.name}</span>
                              <span className="text-[10px] text-zinc-500 font-mono">
                                #{member.tag}
                              </span>
                              {isMemberOwner && (
                                <span title="Dono do Servidor">
                                  <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                </span>
                              )}
                              {isTimedOut && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>{remainingMin}m</span>
                                </span>
                              )}
                            </div>

                            {/* Assigned roles badges */}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {serverRoles
                                .filter((r) => assignedRoleIds.includes(r.id))
                                .map((r) => (
                                  <span
                                    key={r.id}
                                    className="px-2 py-0.2 rounded text-[10px] font-semibold"
                                    style={{
                                      backgroundColor: `${r.color}20`,
                                      color: r.color,
                                    }}
                                  >
                                    {r.name}
                                  </span>
                                ))}
                            </div>
                          </div>
                        </div>

                        {/* Actions (Timeout, Assign Role, Kick) */}
                        {isAdmin && !isMemberOwner && member.id !== currentUser?.id && (
                          <div className="flex items-center gap-2">
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  onAssignRole(member.id, e.target.value);
                                }
                              }}
                              className="bg-ink-700 border border-white/[0.07] text-zinc-200 text-xs rounded-xl px-2.5 py-1.5 outline-none cursor-pointer"
                            >
                              <option value="">+ Cargo</option>
                              {serverRoles.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {assignedRoleIds.includes(r.id) ? `✓ ${r.name}` : `+ ${r.name}`}
                                </option>
                              ))}
                            </select>

                            <button
                              onClick={() => {
                                if (isTimedOut) {
                                  onTimeoutMember(member.id, 0);
                                } else {
                                  setTimeoutMemberTarget({ id: member.id, name: member.name });
                                  setCustomTimeoutMinutes('15');
                                }
                              }}
                              className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                                isTimedOut
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                  : 'bg-ink-700 text-zinc-300 hover:text-white border-white/[0.07]'
                              }`}
                              title={
                                isTimedOut
                                  ? 'Remover silenciamento'
                                  : 'Silenciar temporariamente (Timeout)'
                              }
                            >
                              <Clock className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() =>
                                setConfirmKickMember({ id: member.id, name: member.name })
                              }
                              className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition cursor-pointer"
                              title="Expulsar do Servidor"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Customizado: Confirmar Exclusão do Servidor */}
        {confirmDeleteServer && (
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={() => setConfirmDeleteServer(false)}
          >
            <div
              className="w-full max-w-sm bg-ink-800 border border-rose-500/40 rounded-2xl p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Excluir Servidor?</h4>
                  <p className="text-[11px] text-rose-300 font-semibold">
                    Esta ação não pode ser desfeita
                  </p>
                </div>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed">
                Tem certeza que deseja excluir permanentemente o servidor{' '}
                <span className="font-bold text-white">"{server.name}"</span> e todos os seus canais?
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteServer(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDeleteServer(false);
                    onDeleteServer();
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg transition cursor-pointer"
                >
                  Sim, Excluir
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Customizado: Confirmar Expulsão de Membro */}
        {confirmKickMember && (
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={() => setConfirmKickMember(null)}
          >
            <div
              className="w-full max-w-sm bg-ink-800 border border-rose-500/40 rounded-2xl p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                  <UserX className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    Expulsar {confirmKickMember.name}?
                  </h4>
                  <p className="text-[11px] text-zinc-400">Remover membro do servidor</p>
                </div>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed">
                Tem certeza que deseja expulsar{' '}
                <span className="font-bold text-rose-300">{confirmKickMember.name}</span> do servidor{' '}
                <span className="font-bold text-white">{server.name}</span>?
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmKickMember(null)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onKickMember(confirmKickMember.id);
                    setConfirmKickMember(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg transition cursor-pointer"
                >
                  Sim, Expulsar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Customizado: Escolher Tempo de Timeout */}
        {timeoutMemberTarget && (
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={() => setTimeoutMemberTarget(null)}
          >
            <div
              className="w-full max-w-sm bg-ink-800 border border-white/[0.07] rounded-2xl p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.07] flex items-center justify-center text-zinc-400 shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    Silenciar {timeoutMemberTarget.name}
                  </h4>
                  <p className="text-[11px] text-zinc-500">
                    Escolha por quanto tempo aplicar o Timeout
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: '5 minutos', mins: 5 },
                  { label: '15 minutos', mins: 15 },
                  { label: '1 hora', mins: 60 },
                  { label: '24 horas', mins: 1440 },
                ].map((opt) => (
                  <button
                    key={opt.mins}
                    type="button"
                    onClick={() => {
                      onTimeoutMember(timeoutMemberTarget.id, opt.mins);
                      setTimeoutMemberTarget(null);
                    }}
                    className="py-2 px-3 rounded-xl bg-ink-900 hover:bg-volt hover:text-ink-950 text-zinc-200 hover:text-white text-xs font-bold border border-white/[0.07] transition cursor-pointer"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="pt-2 border-t border-white/[0.07] space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-zinc-500">
                  Ou defina os minutos personalizados:
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max="10080"
                    value={customTimeoutMinutes}
                    onChange={(e) => setCustomTimeoutMinutes(e.target.value)}
                    className="flex-1 bg-ink-900 border border-white/[0.07] rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-volt/40 select-text"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const mins = Number(customTimeoutMinutes);
                      if (mins > 0) {
                        onTimeoutMember(timeoutMemberTarget.id, mins);
                        setTimeoutMemberTarget(null);
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-volt text-ink-950 text-xs font-bold transition cursor-pointer"
                  >
                    Aplicar
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setTimeoutMemberTarget(null)}
                  className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
