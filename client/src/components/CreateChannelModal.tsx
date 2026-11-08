import React, { useState } from 'react';
import { X, Hash, Volume2, Plus, Film, Check } from 'lucide-react';

interface CreateChannelModalProps {
  isOpen: boolean;
  serverName: string;
  initialType?: 'text' | 'voice' | 'media';
  onClose: () => void;
  onCreateChannel: (name: string, type: 'text' | 'voice' | 'media') => void;
}

export const CreateChannelModal: React.FC<CreateChannelModalProps> = ({
  isOpen,
  serverName,
  initialType = 'text',
  onClose,
  onCreateChannel,
}) => {
  const [channelType, setChannelType] = useState<'text' | 'voice' | 'media'>(initialType);
  const [channelName, setChannelName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName.trim()) return;
    onCreateChannel(channelName.trim(), channelType);
    setChannelName('');
    onClose();
  };

  const types = [
    {
      id: 'text' as const,
      title: 'Canal de Texto',
      desc: 'Postar mensagens, fotos e conversar em tempo real',
      icon: Hash,
      accent: 'text-volt bg-white/[0.05] border-white/[0.07]',
    },
    {
      id: 'voice' as const,
      title: 'Voz & Transmissão',
      desc: 'Conversar por voz e transmitir tela/jogos em 60 FPS',
      icon: Volume2,
      accent: 'text-volt bg-white/[0.05] border-white/[0.07]',
    },
    {
      id: 'media' as const,
      title: 'Sala de Vídeo & DJ',
      desc: 'Assistir YouTube e ouvir músicas sincronizadas com a galera',
      icon: Film,
      accent: 'text-volt bg-white/[0.05] border-white/[0.07]',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-ink-800 border border-white/[0.07] rounded-2xl p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-3.5">
          <div>
            <h3 className="font-bold text-lg text-white">Criar Novo Canal</h3>
            <p className="text-xs text-zinc-500 mt-0.5">em {serverName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.05] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type Selection */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Escolha a Categoria
            </label>
            <div className="space-y-2">
              {types.map((t) => {
                const Icon = t.icon;
                const active = channelType === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setChannelType(t.id)}
                    className={`flex items-center gap-3.5 p-3.5 rounded-xl border cursor-pointer transition-all ${
                      active
                        ? 'bg-white/[0.07] border-volt/40 shadow-lg'
                        : 'bg-ink-900 border-white/[0.07] hover:border-white/[0.07]'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${t.accent}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white">{t.title}</div>
                      <div className="text-[11px] text-zinc-500 truncate">{t.desc}</div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition ${
                        active
                          ? 'bg-volt text-ink-950 border-volt/40'
                          : 'border-white/[0.07] bg-ink-800'
                      }`}
                    >
                      {active && <Check className="w-3 h-3" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Name Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Nome do Canal
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-volt font-bold text-sm">
                {channelType === 'text' ? '#' : channelType === 'voice' ? '🔊' : '🎬'}
              </span>
              <input
                type="text"
                autoFocus
                value={channelName}
                onChange={(e) => setChannelName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                placeholder="ex: cinema-da-galera"
                maxLength={25}
                className="w-full bg-ink-900 border border-white/[0.07] rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-volt/40 transition select-text"
              />
            </div>
          </div>

          {/* Actions */}
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
              disabled={!channelName.trim()}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-volt text-ink-950 disabled:opacity-40 transition shadow-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Criar Canal</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
