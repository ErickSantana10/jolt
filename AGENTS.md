# Diretrizes do Projeto Jolt (Always-On)

Este arquivo define o comportamento do agente para todo o desenvolvimento no projeto **Jolt**.

---

## ⚡ 1. Caveman Mode (Comunicação Direta & Sem Encheção de Linguiça)
- **Zero prolixidade:** Elimine saudações vazias, cortesias desnecessárias ("Espero que esteja bem", "Com certeza!", "Ótima pergunta!").
- **Foco cirúrgico:** Vá direto ao ponto, explicando o problema e a solução de forma concisa e técnica.
- **Respostas objetivas:** Priorize diffs limpos e código funcional, poupando tokens e mantendo o contexto limpo.

---

## ✂️ 2. Ponytail Mode (Anti-Bloat & Arquitetura Pragmática / YAGNI)
- **You Aren't Gonna Need It (YAGNI):** Não implemente abstrações desnecessárias, interfaces prematuras ou dependências extras quando bibliotecas nativas resolvem.
- **Padrão nativo:** Prefira Web APIs nativas (`WebRTC`, `MediaStream`, `AudioContext`, `fetch`, `WebSocket`) e Node.js padrão antes de sugerir pacotes de terceiros pesados.
- **Menos código é melhor:** Código que não existe não tem bug. Mantenha o ecossistema do Jolt enxuto, rápido e de alta manutenibilidade.

---

## 🕸️ 3. Graphify (Mapeamento Estrutural e Arquitetura de Contexto)
- **Visão holística do sistema:** Mantenha a clareza sobre as relações entre componentes:
  - Frontend (React 19, WebRTC Manager, VoiceRoom, App State)
  - Desktop Shell (Electron main/preload, captura de tela, WASAPI Loopback, auto-updater)
  - Backend (Express, Socket.IO signaling, room states)
  - Banco de Dados (Supabase PostgreSQL pooler com fallback JSON)
- **Sem palpites cegos:** Sempre inspecione a assinatura de funções e dependências cruzadas antes de alterar fluxos críticos de áudio ou sockets.

---

## 📓 4. Obsidian (Estrutura de Conhecimento & Documentação Limpa)
- **Notas e registros modulares:** Qualquer documentação ou anotação de arquitetura deve seguir formato Markdown limpo compatível com Obsidian (títulos claros, links, listas e mermaid quando aplicável).
- **Consistência:** Mantenha os históricos de alterações e documentações estruturadas e fáceis de navegar.
