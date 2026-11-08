import React, { useState, useEffect } from 'react';
import { LogIn, UserPlus, Sparkles, Lock, AlertCircle, Download, Monitor, Check } from 'lucide-react';

interface LoginModalProps {
  onLogin: (name: string, password: string, rememberMe: boolean, callback: (error?: string) => void) => void;
  onRegister: (
    name: string,
    password: string,
    avatarColor: string,
    rememberMe: boolean,
    callback: (error?: string) => void
  ) => void;
  initialName?: string;
  initialPassword?: string;
  initialRememberMe?: boolean;
  isAutoReconnecting?: boolean;
  onCancelAutoReconnect?: () => void;
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
  initialName = '',
  initialPassword = '',
  initialRememberMe = true,
  isAutoReconnecting = false,
  onCancelAutoReconnect,
  downloadUrl = 'https://github.com/ErickSantana10/jolt/releases/latest/download/Jolt-Windows.exe',
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState(initialName);
  const [password, setPassword] = useState(initialPassword);
  const [rememberMe, setRememberMe] = useState(initialRememberMe);
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialName && !name) setName(initialName);
    if (initialPassword && !password) setPassword(initialPassword);
  }, [initialName, initialPassword]);

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
      onLogin(name.trim(), password, rememberMe, (err) => {
        setLoading(false);
        if (err) setError(err);
      });
    } else {
      onRegister(name.trim(), password, selectedColor, rememberMe, (err) => {
        setLoading(false);
        if (err) setError(err);
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink-950 flex items-center justify-center p-4 select-none overflow-y-auto">
      {/* Ambient Violet/Fuchsia Background Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-white/[0.08] blur-[130px]" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-white/[0.08] blur-[130px]" />
      </div>

      <div className="w-full max-w-md bg-ink-800/90 backdrop-blur-2xl border border-white/[0.07] rounded-[2rem] shadow-2xl overflow-hidden relative z-10">
        {/* Top Banner with New Logo */}
        <div className="bg-transparent p-7 text-center relative border-b border-white/[0.07]">
          <div className="relative w-20 h-20 mx-auto mb-3">
            <div className="absolute inset-0 rounded-xl bg-white/[0.12] blur-xl animate-pulse" />
            <img
              src="/logo.jpg"
              alt="Jolt"
              className="relative w-20 h-20 rounded-xl object-cover shadow-2xl border-2 border-volt/40"
            />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Jolt</h1>
          <p className="text-xs text-zinc-200 mt-1">
            Voz cristalina, salas de cinema sincronizadas e transmissão 60 FPS
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="px-6 pt-5">
          <div className="grid grid-cols-2 bg-ink-900 p-1 rounded-xl border border-white/[0.07]">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2.5 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'login'
                  ? 'bg-volt text-ink-950 shadow-lg'
                  : 'text-zinc-400 hover:text-zinc-200'
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
                  ? 'bg-volt text-ink-950 shadow-lg'
                  : 'text-zinc-400 hover:text-zinc-200'
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
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
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
              className="w-full bg-ink-900 border border-white/[0.07] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-volt/40 transition select-text"
            />
            {mode === 'register' && (
              <span className="text-[11px] text-zinc-500 mt-1 block">
                Uma # automática (ex: #001) será gerada caso outra pessoa tenha o mesmo nome.
              </span>
            )}
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              Senha
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-volt absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-ink-900 border border-white/[0.07] rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-volt/40 transition select-text"
              />
            </div>
          </div>

          {/* Register-only fields: Avatar Color */}
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                Cor do seu Perfil
              </label>
              <div className="flex items-center justify-between gap-2 bg-ink-900 p-2.5 rounded-xl border border-white/[0.07]">
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

          {/* Remember Me & Auto Login Toggle */}
          <button
            type="button"
            onClick={() => setRememberMe((prev) => !prev)}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-ink-900/90 border border-white/[0.07] hover:border-white/[0.07] transition text-left cursor-pointer"
          >
            <div
              className={`w-5 h-5 rounded-lg flex items-center justify-center border transition shrink-0 ${
                rememberMe
                  ? 'bg-volt text-ink-950 border-volt/40 shadow-sm'
                  : 'bg-ink-800 border-white/[0.07] text-transparent'
              }`}
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">Manter conectado neste computador</div>
              <div className="text-[11px] text-zinc-500">
                Lembra sua senha e entra direto sempre que abrir o Jolt
              </div>
            </div>
          </button>

          <button
            type="submit"
            disabled={loading || isAutoReconnecting}
            className="w-full py-3.5 px-4 bg-volt text-ink-950 disabled:opacity-50 font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2 text-sm cursor-pointer mt-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {isAutoReconnecting
                ? `Entrando automaticamente como ${name || initialName || 'sua conta'}...`
                : loading
                ? 'Conectando...'
                : mode === 'login'
                ? 'Entrar no Jolt'
                : 'Criar Minha Conta'}
            </span>
          </button>

          {isAutoReconnecting && onCancelAutoReconnect && (
            <button
              type="button"
              onClick={onCancelAutoReconnect}
              className="w-full py-2 text-xs font-semibold text-zinc-400 hover:text-white transition cursor-pointer"
            >
              Trocar de conta
            </button>
          )}

          {/* Desktop App Download Banner (Visible on Web Browser) */}
          {!isElectron && (
            <div className="pt-3 border-t border-white/[0.07]">
              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 bg-ink-700 hover:bg-ink-600 border border-white/[0.07] rounded-xl flex items-center justify-between group transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.07] flex items-center justify-center text-volt group-hover:scale-105 transition-transform">
                    <Monitor className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <span>Baixar App para Windows</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-zinc-400 font-mono">
                        .EXE
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Transmissão de tela e jogos com áudio nativo
                    </div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-volt group-hover:translate-y-0.5 transition-transform" />
              </a>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
