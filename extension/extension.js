import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GObject from 'gi://GObject';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ClipboardWatcher } from './lib/clipboardWatcher.js';
import { HistoryStore } from './lib/historyStore.js';
import { PasteInjector } from './lib/pasteInjector.js';
import { PastePicker } from './lib/pastePicker.js';

const MAX_MENU_ROWS = 8;

function preview(text, len = 60) {
    const oneLine = text.replace(/\s+/g, ' ').trim();
    return oneLine.length > len ? oneLine.slice(0, len) + '…' : oneLine;
}

const ClipVaultIndicator = GObject.registerClass(
class ClipVaultIndicator extends PanelMenu.Button {
    _init(ext) {
        super._init(0.5, 'Clip Vault', false);
        this._ext = ext;
        this._settings = ext.settings;

        const box = new St.BoxLayout({ style_class: 'panel-status-menu-box cv-panel' });
        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(
                GLib.build_filenamev([ext.path, 'icons', 'clip-vault-symbolic.svg'])),
            style_class: 'system-status-icon',
        });
        box.add_child(this._icon);
        this.add_child(box);

        this._buildMenu();
        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._render();
        });
    }

    _buildMenu() {
        this._itemsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._itemsSection);

        this._emptyItem = new PopupMenu.PopupMenuItem(_('Histórico vazio'),
            { reactive: false, style_class: 'cv-empty-item' });
        this.menu.addMenuItem(this._emptyItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._pauseItem = new PopupMenu.PopupSwitchMenuItem(
            _('Pausar captura'), this._settings.get_boolean('pause-capture'));
        this._pauseItem.connect('toggled', (_item, state) => {
            this._settings.set_boolean('pause-capture', state);
        });
        this.menu.addMenuItem(this._pauseItem);
        this._pauseHandlerId = this._settings.connect('changed::pause-capture', () => {
            this._pauseItem.setToggleState(this._settings.get_boolean('pause-capture'));
        });

        const clearItem = new PopupMenu.PopupImageMenuItem(_('Limpar histórico'), 'edit-clear-all-symbolic');
        clearItem.connect('activate', () => {
            this._ext.store.clear();
            this._render();
        });
        this.menu.addMenuItem(clearItem);

        const prefsItem = new PopupMenu.PopupImageMenuItem(_('Preferências'), 'preferences-system-symbolic');
        prefsItem.connect('activate', () => this._ext.openPreferences());
        this.menu.addMenuItem(prefsItem);
    }

    _render() {
        this._itemsSection.removeAll();
        const items = this._ext.store.all().slice(0, MAX_MENU_ROWS);
        this._emptyItem.visible = items.length === 0;

        items.forEach(item => {
            const label = (item.pinned ? '📌 ' : '') + preview(item.text);
            const menuItem = new PopupMenu.PopupMenuItem(label);
            menuItem.connect('activate', () => this._ext.copyItem(item));
            this._itemsSection.addMenuItem(menuItem);
        });
    }

    destroy() {
        if (this._pauseHandlerId) {
            this._settings.disconnect(this._pauseHandlerId);
            this._pauseHandlerId = null;
        }
        super.destroy();
    }
});

export default class ClipVaultExtension extends Extension {
    enable() {
        this.settings = this.getSettings();
        this.store = new HistoryStore();
        this.store.load();
        this._injector = new PasteInjector();
        this._picker = null;

        this._watcher = new ClipboardWatcher({
            settings: this.settings,
            onText: text => this.store.add(text, this.settings.get_int('max-history')),
        });
        this._applyCapturePaused();
        this._pauseHandler = this.settings.connect('changed::pause-capture',
            () => this._applyCapturePaused());

        this._posHandler = this.settings.connect('changed::panel-position',
            () => this._reposition());
        this._createIndicator();

        Main.wm.addKeybinding(
            'keybinding-open',
            this.settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._openPicker());

        Main.wm.addKeybinding(
            'keybinding-cycle',
            this.settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            () => this._cyclePaste());
    }

    _applyCapturePaused() {
        // "pausar" simplesmente desconecta o watcher do sinal de owner-changed
        // — mais barato do que checar a flag em todo evento de clipboard.
        if (this.settings.get_boolean('pause-capture'))
            this._watcher.stop();
        else
            this._watcher.start();
    }

    _createIndicator() {
        this._indicator = new ClipVaultIndicator(this);
        const pos = this.settings.get_string('panel-position');
        switch (pos) {
            case 'left':
                Main.panel.addToStatusArea(this.uuid, this._indicator, -1, 'left');
                break;
            case 'left-edge':
                Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'left');
                break;
            default: // 'right'
                Main.panel.addToStatusArea(this.uuid, this._indicator);
                break;
        }
    }

    _reposition() {
        delete Main.panel.statusArea[this.uuid];
        this._indicator?.destroy();
        this._indicator = null;
        this._createIndicator();
    }

    _openPicker() {
        if (this._picker)
            return; // já está aberto

        this._picker = new PastePicker({
            onSelect: item => this.copyItem(item, {
                autopaste: this.settings.get_boolean('autopaste-on-select'),
            }),
            onTogglePin: (item, pinned) => this.store.setPinned(item.id, pinned),
        });
        this._picker.connect('destroy', () => { this._picker = null; });
        this._picker.open(this.store.all());
    }

    _cyclePaste() {
        const item = this.store.nextForCycle();
        if (!item)
            return; // já está no item mais antigo do histórico
        this.copyItem(item, { autopaste: true, resetCursor: false });
    }

    // Regrava a área de transferência com o texto do item e, se pedido,
    // injeta o Ctrl+V na janela ativa.
    copyItem(item, { autopaste = false, resetCursor = true } = {}) {
        this._watcher.ignoreNext();
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, item.text);
        if (resetCursor)
            this.store.resetCursor();
        if (autopaste)
            this._injector.sendCtrlV();
    }

    disable() {
        Main.wm.removeKeybinding('keybinding-open');
        Main.wm.removeKeybinding('keybinding-cycle');

        this._picker?.close();
        this._picker = null;

        if (this._pauseHandler) {
            this.settings.disconnect(this._pauseHandler);
            this._pauseHandler = null;
        }
        if (this._posHandler) {
            this.settings.disconnect(this._posHandler);
            this._posHandler = null;
        }

        this._watcher?.stop();
        this._watcher = null;

        this.store?.flush();
        this.store = null;

        this._indicator?.destroy();
        this._indicator = null;

        this._injector = null;
        this.settings = null;
    }
}
