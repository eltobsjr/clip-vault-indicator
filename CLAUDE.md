# Clip Vault

Extensão do **GNOME Shell** que guarda o histórico da área de transferência e
oferece dois atalhos globais: **Alt+V** abre um seletor de busca (estilo
Spotlight) pra escolher qualquer item copiado recentemente; **Alt+C** cola
direto o item anterior do histórico, sem abrir nada (cycle).

## Arquitetura

```
Meta.Selection (owner-changed) → clipboardWatcher → historyStore → history.json
                                                            ↓
Alt+V → pastePicker (overlay) ──┐                          │
Alt+C → cycle ───────────────────┼──→ St.Clipboard.set_text ┘
                                  └──→ pasteInjector (Ctrl+V sintético, opcional/sempre)
```

- **`extension/extension.js`** — `ClipVaultExtension` (enable/disable, liga os
  módulos, registra os dois keybindings via `Main.wm.addKeybinding`) e
  `ClipVaultIndicator` (`PanelMenu.Button` com dropdown: últimos itens,
  pausar captura, limpar histórico, preferências).
- **`extension/lib/clipboardWatcher.js`** — observa `global.display.get_selection()`
  or `owner-changed` no `SELECTION_CLIPBOARD` (orientado a evento, sem
  polling — mesma técnica do Pano). Tem `ignoreNext()` pra não recapturar as
  próprias escritas do Clip Vault, e um filtro best-effort de
  `x-kde-passwordManagerHint`.
- **`extension/lib/historyStore.js`** — array em memória (mais recente
  primeiro), persistência em `~/.local/share/clip-vault/history.json` com
  debounce de 2s, poda respeitando itens fixados, dedup, cursor do cycle.
- **`extension/lib/pasteInjector.js`** — injeta Ctrl+V sintético via teclado
  virtual do Clutter (`seat.create_virtual_device`). Funciona porque o Shell
  é o próprio compositor Wayland.
- **`extension/lib/pastePicker.js`** — overlay modal (`Main.layout.addChrome`
  + `Main.pushModal`), busca fuzzy, navegação por ↑/↓, Enter colar, Ctrl+P
  fixar, Esc fechar.
- **`extension/lib/fuzzyMatch.js`** — scorer simples (substring > subsequência).
- **`extension/prefs.js`** — Adwaita: Geral (atalhos reatribuíveis, colar
  automático, tamanho do histórico, posição na barra — reaproveita o
  seletor visual do claude-usage-indicator), Privacidade (respeitar hint de
  senha, pausar captura), Sobre.

## Convenções

- Mesmas do `claude-usage-indicator` / `game-launcher-indicator`: ESM, shell
  45–50, comentários e UI em português, CSS herdando do tema via
  `-st-accent-color`.
- `lib/` separado (diferente dos dois projetos irmãos, que são um
  `extension.js` monolítico) porque aqui watcher/store/injector/picker são
  responsabilidades bem distintas — import relativo ESM funciona normal
  dentro do pacote da extensão.

## Os dois atalhos

- **Alt+V** (`keybinding-open`) abre o overlay de busca. Selecionar um item
  regrava o clipboard; só injeta Ctrl+V se `autopaste-on-select` estiver
  ativo (padrão: desligado, comportamento seguro).
- **Alt+C** (`keybinding-cycle`) não abre nada: avança um cursor
  (`historyStore.nextForCycle()`) pro item mais antigo seguinte, regrava o
  clipboard e injeta Ctrl+V **sempre** (sem esse comportamento o atalho não
  serve pra nada, já que não tem UI pra escolher). O cursor volta a 0 sempre
  que chega uma cópia nova de verdade ou o Alt+V seleciona algo.
- Ambos usam `<Alt>` em vez de `<Super>` porque `Super+C`/`Super+V` já
  estavam em uso no setup do usuário.

## Pontos não verificados ao vivo

Escrito sem rodar num GNOME Shell real ainda — o que precisa de atenção no
primeiro `make install` + logout/login:

- [ ] `Meta.Selection.get_mimetypes()` — usado pra detectar
      `x-kde-passwordManagerHint`. A chamada está em try/catch e falha
      silenciosamente (não filtra) se a API não existir ou tiver assinatura
      diferente nesta versão do shell — mas vale confirmar se o filtro de
      fato funciona testando com o KeePassXC.
- [ ] `Main.layout.addChrome(picker, { trackFullscreen: true })` +
      `x_align/y_align` do `St.BoxLayout` — assume que o layer de chrome
      centraliza o actor pelos aligns, do jeito que o OSD/notificações do
      Shell fazem. Se não centralizar direito, ajustar com
      `set_position()` manual após o primeiro `allocate`.
- [ ] `Main.pushModal(this)` sem passar `actionMode` — assume que o grab
      captura tecla suficiente pra Esc/Enter/↑↓ funcionarem sem vazar pro
      resto do Shell. Se o overlay não fechar limpo ou roubar foco errado,
      testar passando `{ actionMode: Shell.ActionMode.NORMAL }`.
- [ ] `PasteInjector.sendCtrlV()` — a sequência de `notify_keyval` com
      `Clutter.get_current_event_time()` é o padrão usado por extensões de
      teclado virtual; testar contra apps comuns (terminal, navegador,
      Flatpak sandboxado) pra confirmar que não trava em nenhum.
- [ ] `Gtk.EventControllerKey` em `prefs.js` pra capturar o atalho — conferir
      se `Escape` cancela limpo e se acordes tipo `<Alt>v` batem certo com o
      que o `Main.wm.addKeybinding` espera.

## Pendências / ideias não implementadas ainda

- [ ] Suporte a imagem (`St.Clipboard.get_content` + mimetype) — v1 é só texto.
- [ ] Limpar histórico automaticamente ao bloquear a tela.
- [ ] Ícones por tipo de conteúdo (URL, cor hex, código) no picker.
- [ ] Publicar no extensions.gnome.org (ainda não foi feito nenhum upload).

## Comandos

```bash
make install    # copia p/ ~/.local/share/gnome-shell/extensions + compila schema
make enable     # ativa a extensão
make pack       # gera o .zip para o extensions.gnome.org
node --check extension/extension.js   # sintaxe rápida sem precisar do Shell
```

UUID: `clip-vault@eltobsjr.gmail.com`

## Ambiente do dev

GNOME Shell 50.2, Wayland, Fedora — mesmo setup do claude-usage-indicator e
do game-launcher-indicator. No Wayland, qualquer mudança na extensão exige
logout/login pro Shell recarregar (`Alt+F2 r` não existe fora do X11).

## Estado atual

Código inicial completo (watcher, store, picker, cycle, prefs) escrito numa
sessão só, **nunca instalado nem testado num Shell de verdade**. Próximo
passo natural: `make install`, logout/login, `gnome-extensions enable
clip-vault@eltobsjr.gmail.com`, e ir validando os pontos da seção acima.
