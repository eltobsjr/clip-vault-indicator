import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { fuzzyFilter } from './fuzzyMatch.js';

const MAX_VISIBLE_ROWS = 9;
const PREVIEW_CHARS = 140;

function relTime(ms) {
    const diff = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (diff < 60) return 'agora';
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
    return `há ${Math.floor(diff / 86400)}d`;
}

function preview(text) {
    const oneLine = text.replace(/\s+/g, ' ').trim();
    return oneLine.length > PREVIEW_CHARS ? oneLine.slice(0, PREVIEW_CHARS) + '…' : oneLine;
}

const PickerRow = GObject.registerClass(
class PickerRow extends St.Button {
    _init(item) {
        super._init({ style_class: 'cv-item', x_expand: true, can_focus: false });
        this.item = item;

        const box = new St.BoxLayout({ vertical: true, x_expand: true, style_class: 'cv-item-box' });
        const topLine = new St.BoxLayout({ x_expand: true });

        const text = new St.Label({
            text: preview(item.text),
            x_expand: true,
            style_class: 'cv-item-text',
        });
        text.clutter_text.line_wrap = false;
        text.clutter_text.ellipsize = 3; // Pango.EllipsizeMode.END
        topLine.add_child(text);

        this._pinLabel = new St.Label({ text: '📌', style_class: 'cv-item-pin' });
        this._pinLabel.visible = !!item.pinned;
        topLine.add_child(this._pinLabel);

        box.add_child(topLine);
        box.add_child(new St.Label({
            text: relTime(item.createdAt),
            style_class: 'cv-item-time',
        }));

        this.set_child(box);
    }

    setSelected(selected) {
        if (selected)
            this.add_style_class_name('cv-item-selected');
        else
            this.remove_style_class_name('cv-item-selected');
    }

    setPinned(pinned) {
        this.item.pinned = pinned;
        this._pinLabel.visible = pinned;
    }
});

export const PastePicker = GObject.registerClass(
class PastePicker extends St.BoxLayout {
    _init({ onSelect, onTogglePin }) {
        super._init({
            style_class: 'cv-picker',
            vertical: true,
            reactive: true,
            can_focus: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
        });
        this._onSelect = onSelect;
        this._onTogglePin = onTogglePin;
        this._allItems = [];
        this._rows = [];
        this._selectedIndex = 0;
        this._grab = null;

        this._entry = new St.Entry({
            style_class: 'cv-search',
            hint_text: 'Buscar no histórico…',
            can_focus: true,
            x_expand: true,
        });
        this._entry.clutter_text.connect('text-changed', () => this._applyFilter());
        this.add_child(this._entry);

        this._list = new St.BoxLayout({ vertical: true, style_class: 'cv-list' });
        this._scroll = new St.ScrollView({
            style_class: 'cv-scroll',
            x_expand: true,
        });
        this._scroll.set_child(this._list);
        this.add_child(this._scroll);

        this._emptyLabel = new St.Label({ text: 'Histórico vazio.', style_class: 'cv-empty' });
        this._emptyLabel.hide();
        this.add_child(this._emptyLabel);

        this.add_child(new St.Label({
            text: '↑↓ navegar · Enter colar · Ctrl+P fixar · Esc fechar',
            style_class: 'cv-hint',
        }));

        this.connect('key-press-event', (_actor, event) => this._onKeyPress(event));
    }

    open(items) {
        this._allItems = items;
        this._entry.set_text('');
        this._applyFilter();

        Main.layout.addChrome(this, { trackFullscreen: true });
        this._grab = Main.pushModal(this);
        global.stage.set_key_focus(this._entry);
    }

    close() {
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
        Main.layout.removeChrome(this);
        this.destroy();
    }

    _applyFilter() {
        const query = this._entry.get_text();
        const filtered = fuzzyFilter(query, this._allItems, i => i.text).slice(0, MAX_VISIBLE_ROWS);

        this._list.destroy_all_children();
        this._rows = filtered.map(item => {
            const row = new PickerRow(item);
            row.connect('clicked', () => this._select(item));
            this._list.add_child(row);
            return row;
        });

        this._selectedIndex = 0;
        this._updateSelection();

        this._emptyLabel.visible = this._rows.length === 0;
        this._scroll.visible = this._rows.length > 0;
    }

    _updateSelection() {
        this._rows.forEach((row, i) => row.setSelected(i === this._selectedIndex));
    }

    _select(item) {
        this._onSelect(item);
        this.close();
    }

    _onKeyPress(event) {
        const symbol = event.get_key_symbol();

        if (symbol === Clutter.KEY_Escape) {
            this.close();
            return Clutter.EVENT_STOP;
        }
        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
            if (this._rows[this._selectedIndex])
                this._select(this._rows[this._selectedIndex].item);
            return Clutter.EVENT_STOP;
        }
        if (symbol === Clutter.KEY_Down) {
            if (this._rows.length > 0) {
                this._selectedIndex = Math.min(this._selectedIndex + 1, this._rows.length - 1);
                this._updateSelection();
            }
            return Clutter.EVENT_STOP;
        }
        if (symbol === Clutter.KEY_Up) {
            if (this._rows.length > 0) {
                this._selectedIndex = Math.max(this._selectedIndex - 1, 0);
                this._updateSelection();
            }
            return Clutter.EVENT_STOP;
        }
        if (symbol === Clutter.KEY_p && (event.get_state() & Clutter.ModifierType.CONTROL_MASK)) {
            const row = this._rows[this._selectedIndex];
            if (row && this._onTogglePin) {
                const pinned = !row.item.pinned;
                this._onTogglePin(row.item, pinned);
                row.setPinned(pinned);
            }
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }
});
