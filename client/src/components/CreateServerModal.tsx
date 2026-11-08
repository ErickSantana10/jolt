import React, { useState, useRef } from 'react';
import { X, ShieldCheck, KeyRound, AlertCircle, Camera, Trash2, Sparkles } from 'lucide-react';

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (
    name: string,
    iconColor: string,
    callback?: (error?: string) => void,
    extra?: { iconUrl?: string; description?: string }
  ) => void;
  onJoinByInvite: (inviteCode: string, callback?: (error?: string) => void) => void;
}

const SERVER_COLORS = [
  '#8b5cf6', // Violet
  '#a855f7', // Purple
  '#d946ef', // Fuchsia
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#f59e0b', // Amber
];

export const CreateServerModal: React.FC<CreateServerModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  onJoinByInvite,
}) => {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [serverName, setServerName] = useState('');
  const [description, setDescription] = useState('');
  const [iconUrl, setIconUrl] = useState<string | undefined>(undefined);
  const [inviteCode, setInviteCode] = useState('');
  const [selectedColor, setSelectedColor] = useState(SERVER_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleIconFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setIconUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (tab === 'create') {
      if (!serverName.trim()) {
        setLoading(false);
        return;
      }
      onCreate(
        serverName.trim(),
        selectedColor,
        (err) => {
          setLoading(false);
          if (err) {
            setError(err);
          } else {
            setServerName('');
            setDescription('');
            setIconUrl(undefined);
            onClose();
          }
        },
        { iconUrl, description: description.trim() || undefined }
      );
    } else {
      if (!inviteCode.trim()) {
        setLoading(false);
        return;
      }
      onJoinByInvite(inviteCode.trim(), (err) => {
        setLoading(false);
        if (err) {
          setError(err);
        } else {
          setInviteCode('');
          onClose();
        }
      });
    }
  };

  const getInitials = (name: string) => {
    if (!name.trim()) return 'JJ';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

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
          <div>
            <h3 className="font-bold text-lg text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-volt" />
              <span>Novo Espaço / Servidor</span>
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Crie sua comunidade personalizada ou entre com um convite.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.05] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex items-center bg-ink-900 p-1 rounded-xl border border-white/[0.07]">
          <button
            type="button"
            onClick={() => {
              setTab('create');
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              tab === 'create'
                ? 'bg-volt text-ink-950 shadow-lg'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Criar Servidor
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('join');
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              tab === 'join'
                ? 'bg-volt text-ink-950 shadow-lg'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Entrar com Convite
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'create' ? (
            <>
              {/* Server Photo / Icon Upload */}
              <div className="flex items-center gap-4 bg-ink-900 p-3.5 rounded-xl border border-white/[0.07]">
                <div className="relative group shrink-0">
                  {iconUrl ? (
                    <img
                      src={iconUrl}
                      alt="Ícone"
                      className="w-16 h-16 rounded-xl object-cover shadow-xl border-2 border-white/[0.07]"
                    />
                  ) : (
                    <div
                      className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold text-white shadow-xl transition-all"
                      style={{ backgroundColor: selectedColor }}
                    >
                      {getInitials(serverName)}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 rounded-xl bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[10px] font-bold transition cursor-pointer"
                  >
                    <Camera className="w-4 h-4 mb-0.5" />
                    <span>Foto</span>
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleIconFileChange}
                  className="hidden"
                />

                <div className="space-y-1.5 flex-1">
                  <div className="text-xs font-bold text-zinc-200">Foto do Servidor</div>
                  <p className="text-[11px] text-zinc-500">
                    Envie uma imagem ou escolha uma cor de destaque abaixo.
                  </p>
                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1 bg-white/[0.08] hover:bg-volt hover:text-ink-950 text-zinc-400 hover:text-white rounded-xl text-[11px] font-bold border border-white/[0.07] transition cursor-pointer"
                    >
                      Escolher Foto
                    </button>
                    {iconUrl && (
                      <button
                        type="button"
                        onClick={() => setIconUrl(undefined)}
                        className="p-1 text-rose-400 hover:bg-rose-500/15 rounded-lg transition cursor-pointer"
                        title="Remover foto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Name Input */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Nome do Servidor
                </label>
                <input
                  type="text"
                  autoFocus
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="Ex: Squad dos Crias, Servidor do Erick..."
                  maxLength={30}
                  className="w-full bg-ink-900 border border-white/[0.07] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-volt/40 transition select-text"
                />
              </div>

              {/* Description Input */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Descrição / Tema (Opcional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Jogos competitivos, cinema e música à noite"
                  maxLength={80}
                  className="w-full bg-ink-900 border border-white/[0.07] rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-volt/40 transition select-text"
                />
              </div>

              {/* Color Picker */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Cor de Destaque
                </label>
                <div className="flex items-center justify-between gap-2 bg-ink-900 p-2 rounded-xl border border-white/[0.07]">
                  {SERVER_COLORS.map((color) => {
                    const isSelected = selectedColor === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setSelectedColor(color)}
                        className={`flex-1 h-7 rounded-xl transition-transform cursor-pointer ${
                          isSelected
                            ? 'ring-2 ring-white scale-110 shadow-lg'
                            : 'hover:scale-105 opacity-75 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Privacy Notice */}
              <div className="bg-ink-900 p-3 rounded-xl border border-white/[0.07] text-[11px] text-zinc-300 space-y-1">
                <div className="font-bold text-zinc-200 flex items-center gap-1.5 text-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Espaço Privado & Seguro:
                </div>
                <p className="text-zinc-500">
                  Apenas amigos convidados por você ou que possuam o código de convite poderão entrar.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-volt" />
                  Código de Convite
                </label>
                <input
                  type="text"
                  autoFocus
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="Ex: JJ-A9B2"
                  className="w-full bg-ink-900 border border-white/[0.07] rounded-xl px-3.5 py-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-volt/40 transition font-mono tracking-widest text-center select-text"
                />
              </div>

              <div className="bg-ink-900 p-3.5 rounded-xl border border-white/[0.07] text-xs text-zinc-500">
                Peça o código de convite para o dono do servidor para entrar instantaneamente.
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || (tab === 'create' ? !serverName.trim() : !inviteCode.trim())}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-volt text-ink-950 disabled:opacity-40 transition shadow-lg cursor-pointer"
            >
              {loading ? 'Processando...' : tab === 'create' ? 'Criar Servidor' : 'Entrar no Servidor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
