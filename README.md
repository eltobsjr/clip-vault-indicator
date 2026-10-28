# Clip Vault

Extensão do GNOME Shell que guarda o histórico da área de transferência com
busca instantânea e dois atalhos de teclado globais.

- **Alt+V** — abre um seletor de busca (estilo Spotlight) com todo o
  histórico. Digite pra filtrar, `↑`/`↓` navega, `Enter` cola, `Ctrl+P` fixa
  o item selecionado, `Esc` fecha sem mudar nada.
- **Alt+C** — cola direto o item anterior do histórico, sem abrir overlay
  nenhum. Ótimo pra "copiei errado, quero o de antes".

Não usa `Super+C`/`Super+V` de propósito — os dois já costumam estar
ocupados por outra coisa.

## Instalação

```bash
git clone https://github.com/eltobsjr/clip-vault-indicator
cd clip-vault-indicator
./install.sh
```

ou, com `make`:

```bash
make install
make enable
```

No Wayland, uma extensão recém-instalada só aparece pro Shell depois de
logout/login — depois disso, `gnome-extensions enable
clip-vault@eltobsjr.gmail.com`.

### Tema e opções (escolhidos na instalação)

O `./install.sh` pergunta no terminal, antes de copiar qualquer coisa:

- **Paleta**: Catppuccin Macchiato (padrão), Frappé ou Mocha, com uma prévia em cores.
- **Cor de destaque**: 12 opções, ou **seguir o destaque do GNOME** (47+).
- **Opções da extensão**: posição, tamanho do histórico, atalhos, colagem direta e respeito a gerenciadores de senha.

Nenhuma cor fica escrita no código: o `stylesheet.css` é gerado na instalação a partir da paleta que você escolheu.
Para refazer as escolhas, rode `./install.sh --reconfigure`. Sem terminal (CI, `curl | bash`) ou com `--yes`,
vale o que já estava salvo ou o padrão. Também aceita `--palette macchiato|frappe|mocha`, `--accent blue|mauve|…` e `--system-accent`.
Detalhes do padrão visual em [`docs/DESIGN.md`](docs/DESIGN.md).

## Privacidade

- A captura roda inteiramente local — nenhum dado sai da máquina.
- Por padrão, conteúdo marcado por gerenciadores de senha (KeePassXC,
  Bitwarden, 1Password) com o hint `x-kde-passwordManagerHint` é ignorado.
- O histórico fica em `~/.local/share/clip-vault/history.json`, com
  permissão `600`.
- Dá pra pausar a captura a qualquer momento pelo menu do indicador ou nas
  preferências.

## Configuração

Clique no ícone na barra → **Preferências**: atalhos reatribuíveis, colar
automático on/off, tamanho do histórico, posição do indicador na barra,
privacidade.

## Desenvolvimento

Ver `CLAUDE.md` para a arquitetura completa e o estado atual do projeto.

```bash
make install   # instala em ~/.local/share/gnome-shell/extensions
make pack      # gera o .zip para o extensions.gnome.org
```

## Licença

MIT — ver `LICENSE`.
