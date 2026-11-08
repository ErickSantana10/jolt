import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile, Paperclip, PhoneCall, FileText, Download, X, Check } from 'lucide-react';
import type { User, DMMessage, FriendItem, MessageAttachment } from '../types';

interface DMChatAreaProps {
  currentUser: User | null;
  targetFriend: FriendItem['friend'];
  messages: DMMessage[];
  onSendMessage: (text: string, attachment?: MessageAttachment) => void;
  onStartCall: (friend: FriendItem['friend']) => void;
  onRespondServerInvite?: (messageId: string, action: 'accept' | 'decline') => void;
}

export const DMChatArea: React.FC<DMChatAreaProps> = ({
  currentUser,
  targetFriend,
  messages,
  onSendMessage,
  onStartCall,
  onRespondServerInvite,
}) => {
  const [inputText, setInputText] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<MessageAttachment | null>(null);
  const [selectedImageModal, setSelectedImageModal] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const conversationMessages = messages.filter(
    (m) =>
      (m.fromUserId === currentUser?.id && m.toUserId === targetFriend.id) ||
      (m.fromUserId === targetFriend.id && m.toUserId === currentUser?.id)
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversationMessages]);

  // Handle Ctrl+V paste of screenshots
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            processFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const processFile = (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      alert('O arquivo deve ter no máximo 8MB.');
      return;
    }

    const isImage = file.type.startsWith('image/');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPendingAttachment({
          name: file.name || 'imagem.png',
          type: isImage ? 'image' : 'file',
          url: reader.result,
          size: file.size,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !pendingAttachment) return;
    onSendMessage(inputText.trim(), pendingAttachment || undefined);
    setInputText('');
    setPendingAttachment(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex-1 bg-transparent flex flex-col justify-between overflow-hidden relative">
      {/* Top Header */}
      <div className="h-14 px-6 border-b border-white/[0.07] flex items-center justify-between bg-ink-800/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            {targetFriend.avatarUrl ? (
              <img
                src={targetFriend.avatarUrl}
                alt={targetFriend.displayName}
                className="w-8 h-8 rounded-full object-cover border border-white/[0.07]"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs"
                style={{ backgroundColor: targetFriend.avatarColor }}
              >
                {targetFriend.displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-ink-800 ${
                targetFriend.isOnline ? 'bg-emerald-500' : 'bg-zinc-600'
              }`}
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-zinc-100">
                {targetFriend.name || targetFriend.displayName}
              </span>
              <span className="text-[11px] font-mono text-zinc-500">
                #{targetFriend.tag || '001'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onStartCall(targetFriend)}
            className="px-4 py-1.5 bg-volt text-ink-950 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg cursor-pointer"
            title="Iniciar Ligação de Voz e Compartilhamento de Tela"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>Ligar</span>
          </button>

          <div className="text-xs text-zinc-400 flex items-center gap-1.5 font-medium">
            <span
              className={`w-2 h-2 rounded-full ${
                targetFriend.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
              }`}
            />
            <span>{targetFriend.isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </div>
      </div>

      {/* Message Feed */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        {conversationMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-3">
            <div className="relative">
              {targetFriend.avatarUrl ? (
                <img
                  src={targetFriend.avatarUrl}
                  alt={targetFriend.displayName}
                  className="w-20 h-20 rounded-full object-cover shadow-2xl border-2 border-white/[0.07]"
                />
              ) : (
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-white text-3xl shadow-xl"
                  style={{ backgroundColor: targetFriend.avatarColor }}
                >
                  {targetFriend.displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="text-center space-y-1">
              <div className="text-xl font-bold text-zinc-200">{targetFriend.displayName}</div>
              <div className="text-xs text-zinc-500 font-mono">
                #{targetFriend.tag || '001'}
              </div>
              <div className="text-xs text-zinc-500 max-w-sm pt-2">
                Esse é o início do seu histórico de mensagens privadas com{' '}
                <strong>{targetFriend.displayName}</strong>.
              </div>
            </div>
          </div>
        ) : (
          conversationMessages.map((msg) => {
            const isMe = msg.fromUserId === currentUser?.id;
            const senderUser = isMe ? currentUser : targetFriend;

            return (
              <div
                key={msg.id}
                className="flex items-start gap-3 group hover:bg-white/[0.05] -mx-4 px-4 py-1.5 rounded-xl transition"
              >
                {senderUser?.avatarUrl ? (
                  <img
                    src={senderUser.avatarUrl}
                    alt={senderUser.displayName}
                    className="w-10 h-10 rounded-full object-cover shrink-0 border border-white/[0.07] shadow-md"
                  />
                ) : (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0 shadow-md"
                    style={{ backgroundColor: senderUser?.avatarColor || '#8b5cf6' }}
                  >
                    {(senderUser?.displayName || '?').slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-sm font-bold truncate ${
                        isMe ? 'text-zinc-400' : 'text-zinc-100'
                      }`}
                    >
                      {senderUser?.displayName}
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono">{msg.timestamp}</span>
                  </div>

                  {/* Text content */}
                  {msg.text && (
                    <div className="text-zinc-200 text-sm mt-0.5 break-words select-text">
                      {msg.text}
                    </div>
                  )}

                  {/* Interactive Server Invite Card */}
                  {msg.serverInvite && (
                    <div className="mt-2.5 max-w-sm bg-ink-700 border border-white/[0.07] rounded-xl p-4 shadow-xl space-y-3">
                      <div className="flex items-center gap-3">
                        {msg.serverInvite.iconUrl ? (
                          <img
                            src={msg.serverInvite.iconUrl}
                            alt={msg.serverInvite.serverName}
                            className="w-11 h-11 rounded-xl object-cover shadow-md shrink-0"
                          />
                        ) : (
                          <div
                            className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white text-base shadow-md shrink-0"
                            style={{ backgroundColor: msg.serverInvite.iconColor }}
                          >
                            {msg.serverInvite.serverName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] uppercase font-bold text-volt tracking-wider">
                            Convite para Servidor
                          </span>
                          <h4 className="font-semibold text-sm text-white truncate">
                            {msg.serverInvite.serverName}
                          </h4>
                        </div>
                      </div>

                      {/* Status / Action Buttons */}
                      {msg.serverInvite.status === 'accepted' ? (
                        <div className="py-1.5 px-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5">
                          <Check className="w-4 h-4" />
                          <span>Convite Aceito</span>
                        </div>
                      ) : msg.serverInvite.status === 'declined' ? (
                        <div className="py-1.5 px-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-semibold flex items-center justify-center gap-1.5">
                          <X className="w-4 h-4" />
                          <span>Convite Recusado</span>
                        </div>
                      ) : !isMe ? (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => onRespondServerInvite?.(msg.id, 'accept')}
                            className="flex-1 py-2 bg-volt text-ink-950 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Entrar</span>
                          </button>
                          <button
                            onClick={() => onRespondServerInvite?.(msg.id, 'decline')}
                            className="py-2 px-3 bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 text-zinc-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                          >
                            Recusar
                          </button>
                        </div>
                      ) : (
                        <div className="text-[11px] text-zinc-500 font-mono py-1">
                          Aguardando resposta do amigo...
                        </div>
                      )}
                    </div>
                  )}

                  {/* Attachment */}
                  {msg.attachment && (
                    <div className="mt-2">
                      {msg.attachment.type === 'image' ? (
                        <img
                          src={msg.attachment.url}
                          alt={msg.attachment.name}
                          onClick={() => setSelectedImageModal(msg.attachment!.url)}
                          className="max-h-72 max-w-sm rounded-xl object-contain border border-white/[0.07] cursor-pointer hover:opacity-95 transition shadow-lg"
                        />
                      ) : (
                        <div className="flex items-center gap-3 bg-ink-700 border border-white/[0.07] rounded-xl p-3 max-w-sm shadow-md">
                          <div className="w-10 h-10 rounded-xl bg-white/[0.08] text-volt flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-zinc-200 truncate">
                              {msg.attachment.name}
                            </div>
                            <div className="text-[10px] text-zinc-400">
                              {formatFileSize(msg.attachment.size)}
                            </div>
                          </div>
                          <a
                            href={msg.attachment.url}
                            download={msg.attachment.name}
                            className="p-2 bg-white/[0.08] hover:bg-volt hover:text-ink-950 text-zinc-400 hover:text-white rounded-xl transition"
                            title="Baixar arquivo"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box & Attachment Preview */}
      <div className="px-6 pb-5 pt-2">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* Pending attachment banner */}
        {pendingAttachment && (
          <div className="mb-2 bg-ink-700 border border-white/[0.07] rounded-xl p-2.5 flex items-center justify-between gap-3 shadow-lg max-w-md">
            <div className="flex items-center gap-2.5 truncate">
              {pendingAttachment.type === 'image' ? (
                <img
                  src={pendingAttachment.url}
                  alt="Prévia"
                  className="w-10 h-10 rounded-xl object-cover border border-white/10"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-white/[0.08] text-volt flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
              )}
              <div className="truncate">
                <div className="text-xs font-bold text-zinc-200 truncate">{pendingAttachment.name}</div>
                <div className="text-[10px] text-zinc-400">{formatFileSize(pendingAttachment.size)}</div>
              </div>
            </div>
            <button
              onClick={() => setPendingAttachment(null)}
              className="p-1 text-zinc-400 hover:text-rose-400 rounded-lg transition"
              title="Cancelar anexo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="bg-ink-700 border border-white/[0.07] rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-lg focus-within:border-volt/40 transition-colors"
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-zinc-500 hover:text-zinc-400 transition cursor-pointer"
            title="Anexar arquivo ou imagem"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <input
            type="text"
            autoFocus
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Conversar com @${targetFriend.displayName}... (cole fotos com Ctrl+V)`}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none select-text"
          />

          <button
            type="button"
            className="text-zinc-500 hover:text-volt transition"
            title="Emojis"
          >
            <Smile className="w-5 h-5" />
          </button>

          <button
            type="submit"
            disabled={!inputText.trim() && !pendingAttachment}
            className="p-2 bg-volt text-ink-950 disabled:opacity-40 rounded-xl transition shadow-md cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Lightbox Image Preview Modal */}
      {selectedImageModal && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setSelectedImageModal(null)}
        >
          <img
            src={selectedImageModal}
            alt="Imagem ampliada"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};
