import React, { useState } from 'react';
import { LogIn, UserPlus, Sparkles, Lock, AlertCircle, Download, Monitor } from 'lucide-react';

interface LoginModalProps {
  onLogin: (name: string, password: string, callback: (error?: string) => void) => void;
  onRegister: (
    name: string,
    password: string,
    avatarColor: string,
    callback: (error?: string) => void
  ) => void;
  downloadUrl?: string;
}

const AVATAR_COLORS = [
  '#8b5cf6', // Violet
  '#a855f7', // Purple
  '#d946ef', // Fuchsia
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#f59e0b', // Amber
];

export const LoginModal: React.FC<LoginModalProps> = ({
  onLogin,
  onRegister,
  downloadUrl = 'https://github.com/ErickSantana10/jolt/releases/download/v1.0.0/Jolt-Windows.exe',
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isElectron = Boolean(window.electronAPI?.isElectron);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !password.trim()) {
      setError('Preencha seu nome e sua senha.');
      return;
    }

    setLoading(true);

    if (mode === 'login') {
      onLogin(name.trim(), password, (err) => {
        setLoading(false);
        if (err) setError(err);
      });
    } else {
      onRegister(name.trim(), password, selectedColor, (err) => {
        setLoading(false);
        if (err) setError(err);
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#07040d] flex items-center justify-center p-4 select-none overflow-y-auto">
      {/* Ambient Violet/Fuchsia Background Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-violet-600/20 blur-[130px]" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-fuchsia-600/20 blur-[130px]" />
      </div>

      <div className="w-full max-w-md bg-[#120b20]/90 backdrop-blur-2xl border border-violet-500/25 rounded-[2rem] shadow-2xl shadow-violet-950/60 overflow-hidden relative z-10">
        {/* Top Banner with New Logo */}
        <div className="bg-gradient-to-br from-violet-900/40 via-[#180f2c] to-fuchsia-900/30 p-7 text-center relative border-b border-violet-500/15">
          <div className="relative w-20 h-20 mx-auto mb-3">
            <div className="absolute inset-0 rounded-2xl bg-violet-500/40 blur-xl animate-pulse" />
            <img
              src="/logo.jpg"
              alt="Jolt"
              className="relative w-20 h-20 rounded-2xl object-cover shadow-2xl border-2 border-violet-400/50"
            />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Jolt</h1>
          <p className="text-xs text-violet-200/75 mt-1">
            Voz cristalina, salas de cinema sincronizadas e transmissão 60 FPS
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="px-6 pt-5">
          <div className="grid grid-cols-2 bg-[#0a0612] p-1 rounded-2xl border border-violet-500/15">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2.5 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'login'
                  ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-600/25'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Entrar</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2.5 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'register'
                  ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-600/25'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Criar Conta</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Name Input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-violet-300/80 mb-1.5">
              Seu Nome
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Erick"
              maxLength={24}
              className="w-full bg-[#0a0612] border border-violet-500/20 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition select-text"
            />
            {mode === 'register' && (
              <span className="text-[11px] text-violet-300/60 mt-1 block">
                Uma # automática (ex: #001) será gerada caso outra pessoa tenha o mesmo nome.
              </span>
            )}
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-violet-300/80 mb-1.5">
              Senha
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-violet-400/60 absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#0a0612] border border-violet-500/20 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition select-text"
              />
            </div>
          </div>

          {/* Register-only fields: Avatar Color */}
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-violet-300/80 mb-2">
                Cor do seu Perfil
              </label>
              <div className="flex items-center justify-between gap-2 bg-[#0a0612] p-2.5 rounded-xl border border-violet-500/20">
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                      selectedColor === color ? 'scale-125 ring-2 ring-white shadow-lg' : 'opacity-70 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-violet-600/30 transition flex items-center justify-center gap-2 text-sm cursor-pointer mt-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {loading
                ? 'Conectando...'
                : mode === 'login'
                ? 'Entrar no Jolt'
                : 'Criar Minha Conta'}
            </span>
          </button>

          {/* Desktop App Download Banner (Visible on Web Browser) */}
          {!isElectron && (
            <div className="pt-3 border-t border-violet-500/15">
              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 bg-[#19102c] hover:bg-[#22163b] border border-violet-500/30 rounded-xl flex items-center justify-between group transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400 group-hover:scale-105 transition-transform">
                    <Monitor className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-extrabold text-white flex items-center gap-1.5">
                      <span>Baixar App para Windows</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 font-mono">
                        .EXE
                      </span>
                    </div>
                    <div className="text-[11px] text-violet-300/60">
                      Transmissão de tela e jogos com áudio nativo
                    </div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-violet-400 group-hover:translate-y-0.5 transition-transform" />
              </a>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
