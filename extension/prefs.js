import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// Linha de atalho reatribuível: mostra o acelerador atual (Gtk.ShortcutLabel)
// e um botão "Alterar…" que entra em modo de captura da próxima tecla.
function buildShortcutRow(settings, key, title, subtitle) {
    const row = new Adw.ActionRow({ title, subtitle });

    const shortcutLabel = new Gtk.ShortcutLabel({ valign: Gtk.Align.CENTER });
    const updateLabel = () => {
        const [accel] = settings.get_strv(key);
        shortcutLabel.set_accelerator(accel || '');
    };
    updateLabel();

    const editBtn = new Gtk.Button({
        label: _('Alterar…'),
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });

    editBtn.connect('clicked', () => {
        editBtn.label = _('Pressione a tecla…');
        const controller = new Gtk.EventControllerKey();
        editBtn.add_controller(controller);

        const handlerId = controller.connect('key-pressed', (_c, keyval, _keycode, state) => {
            if (keyval === Gdk.KEY_Escape) {
                editBtn.label = _('Alterar…');
                controller.disconnect(handlerId);
                return Gdk.EVENT_STOP;
            }

            const mask = state & Gtk.accelerator_get_default_mod_mask();
            if (Gtk.accelerator_valid(keyval, mask)) {
                settings.set_strv(key, [Gtk.accelerator_name(keyval, mask)]);
                updateLabel();
            }
            editBtn.label = _('Alterar…');
            controller.disconnect(handlerId);
            return Gdk.EVENT_STOP;
        });
    });

    row.add_suffix(shortcutLabel);
    row.add_suffix(editBtn);
    return row;
}

export default class ClipVaultPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(620, 700);

        // =================== Página: Geral ===================
        const page = new Adw.PreferencesPage({
            title: _('Geral'),
            icon_name: 'preferences-desktop-display-symbolic',
        });
        window.add(page);

        const shortcutsGroup = new Adw.PreferencesGroup({
            title: _('Atalhos'),
            description: _('Padrão: Alt+V abre o seletor · Alt+C cola o item anterior'),
        });
        page.add(shortcutsGroup);
        shortcutsGroup.add(buildShortcutRow(settings, 'keybinding-open',
            _('Abrir seletor de busca'), _('Overlay com busca, navegação por teclado e Enter para colar')));
        shortcutsGroup.add(buildShortcutRow(settings, 'keybinding-cycle',
            _('Colar item anterior (cycle)'), _('Sem abrir nada — cola direto o item anterior do histórico')));

        const behaviorGroup = new Adw.PreferencesGroup({ title: _('Comportamento') });
        page.add(behaviorGroup);

        const autopasteRow = new Adw.SwitchRow({
            title: _('Colar automático no seletor'),
            subtitle: _('Ao escolher um item no Alt+V, já injeta Ctrl+V na janela ativa ' +
                '(o Alt+C sempre cola automático, independente desta opção)'),
        });
        settings.bind('autopaste-on-select', autopasteRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behaviorGroup.add(autopasteRow);

        const maxHistoryRow = new Adw.SpinRow({
            title: _('Tamanho do histórico'),
            subtitle: _('Itens não fixados mantidos'),
            adjustment: new Gtk.Adjustment({ lower: 20, upper: 500, step_increment: 10, page_increment: 50 }),
        });
        settings.bind('max-history', maxHistoryRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        behaviorGroup.add(maxHistoryRow);

        // =================== Posição na barra (seletor visual) ===================
        const posGroup = new Adw.PreferencesGroup({ title: _('Posição na barra') });
        page.add(posGroup);

        let currentPosicao = settings.get_string('panel-position');
        if (currentPosicao === 'right-edge') {
            currentPosicao = 'right';
            settings.set_string('panel-position', 'right');
        }

        const posCSS = new Gtk.CssProvider();
        posCSS.load_from_string(
            '.cv-badge{background-color:alpha(@accent_bg_color,.9);color:@accent_fg_color;' +
            'border-radius:4px;padding:1px 7px;font-size:.78em;font-weight:bold;}'
        );
        Gtk.StyleContext.add_provider_for_display(
            window.get_display(), posCSS, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        const posRow = new Adw.PreferencesRow({ activatable: false, focusable: false });
        const posContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            margin_top: 12,
            margin_bottom: 14,
            margin_start: 12,
            margin_end: 12,
        });
        posRow.set_child(posContainer);
        posGroup.add(posRow);

        const miniBar = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            css_classes: ['card'],
            height_request: 34,
            overflow: Gtk.Overflow.HIDDEN,
        });

        const barLeft = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL, spacing: 4,
            margin_start: 10, valign: Gtk.Align.CENTER,
        });
        const leftEdgeBadge = new Gtk.Label({
            label: 'Clip', css_classes: ['cv-badge'],
            visible: currentPosicao === 'left-edge',
        });
        barLeft.append(leftEdgeBadge);
        barLeft.append(new Gtk.Label({ label: 'Ativid.', css_classes: ['dim-label', 'caption'] }));
        const leftBadge = new Gtk.Label({
            label: 'Clip', css_classes: ['cv-badge'],
            visible: currentPosicao === 'left',
        });
        barLeft.append(leftBadge);
        miniBar.append(barLeft);

        const barCenter = new Gtk.Box({ hexpand: true, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER });
        barCenter.append(new Gtk.Label({ label: '12:00', css_classes: ['caption'] }));
        miniBar.append(barCenter);

        const barRight = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL, spacing: 4,
            margin_end: 10, valign: Gtk.Align.CENTER,
        });
        const rightBadge = new Gtk.Label({
            label: 'Clip', css_classes: ['cv-badge'],
            visible: currentPosicao === 'right',
        });
        barRight.append(rightBadge);
        barRight.append(new Gtk.Label({ label: '🔊 ◉ ◉ ☰', css_classes: ['dim-label', 'caption'] }));
        miniBar.append(barRight);

        posContainer.append(miniBar);

        const posBadges = { 'left-edge': leftEdgeBadge, 'left': leftBadge, 'right': rightBadge };
        const updatePosPreview = pos => {
            Object.entries(posBadges).forEach(([k, b]) => { b.visible = k === pos; });
        };

        const posicoes = [
            { id: 'left-edge', label: _('Borda esquerda') },
            { id: 'left', label: _('Esquerda') },
            { id: 'right', label: _('Direita') },
        ];

        const btnBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL, homogeneous: true, css_classes: ['linked'],
        });

        const toggleBtns = [];
        posicoes.forEach(p => {
            const btn = new Gtk.ToggleButton({ label: p.label, active: currentPosicao === p.id });
            if (currentPosicao === p.id)
                btn.add_css_class('suggested-action');
            btn.connect('toggled', () => {
                if (btn.active) {
                    toggleBtns.forEach(b => {
                        if (b !== btn) { b.active = false; b.remove_css_class('suggested-action'); }
                    });
                    btn.add_css_class('suggested-action');
                    settings.set_string('panel-position', p.id);
                    updatePosPreview(p.id);
                } else if (!toggleBtns.some(b => b.active)) {
                    btn.active = true;
                    btn.add_css_class('suggested-action');
                }
            });
            btnBox.append(btn);
            toggleBtns.push(btn);
        });
        posContainer.append(btnBox);

        // =================== Página: Privacidade ===================
        const privacyPage = new Adw.PreferencesPage({
            title: _('Privacidade'),
            icon_name: 'channel-secure-symbolic',
        });
        window.add(privacyPage);

        const privacyGroup = new Adw.PreferencesGroup({
            title: _('Captura'),
            description: _('KeePassXC, Bitwarden e 1Password marcam senhas copiadas com um hint ' +
                'específico (x-kde-passwordManagerHint); respeitar esse hint evita guardar ' +
                'senha no histórico.'),
        });
        privacyPage.add(privacyGroup);

        const hintRow = new Adw.SwitchRow({
            title: _('Ignorar conteúdo marcado como sensível'),
        });
        settings.bind('respect-password-hint', hintRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        privacyGroup.add(hintRow);

        const pauseRow = new Adw.SwitchRow({
            title: _('Pausar captura agora'),
            subtitle: _('O mesmo botão existe no menu do indicador na barra'),
        });
        settings.bind('pause-capture', pauseRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        privacyGroup.add(pauseRow);

        const clearHintGroup = new Adw.PreferencesGroup({
            description: _('Para limpar o histórico agora, use "Limpar histórico" no menu do ' +
                'indicador na barra — as prefs rodam num processo separado e não têm acesso ' +
                'direto ao histórico em memória da extensão.'),
        });
        privacyPage.add(clearHintGroup);

        // =================== Página: Sobre ===================
        const aboutPage = new Adw.PreferencesPage({
            title: _('Sobre'),
            icon_name: 'help-about-symbolic',
        });
        window.add(aboutPage);
        const aboutGroup = new Adw.PreferencesGroup();
        aboutPage.add(aboutGroup);
        aboutGroup.add(new Adw.ActionRow({
            title: _('Clip Vault'),
            subtitle: _('Histórico de área de transferência com busca instantânea. ' +
                'Alt+V abre o seletor, Alt+C cola o item anterior.'),
        }));
    }
}
