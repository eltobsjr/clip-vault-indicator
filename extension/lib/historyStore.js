import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const DATA_DIR = GLib.build_filenamev([GLib.get_user_data_dir(), 'clip-vault']);
const HISTORY_FILE = GLib.build_filenamev([DATA_DIR, 'history.json']);
const WRITE_DEBOUNCE_MS = 2000;

// Guarda o histórico em memória (mais recente primeiro) e persiste em disco
// com debounce, no mesmo padrão do usage.json do claude-usage-indicator.
export class HistoryStore {
    constructor() {
        this._items = [];
        this._cursor = 0;   // posição do cycle do Alt+C; 0 = topo (item atual)
        this._nextId = 1;
        this._writeTimer = 0;
    }

    load() {
        try {
            const file = Gio.File.new_for_path(HISTORY_FILE);
            const [ok, contents] = file.load_contents(null);
            if (ok) {
                const data = JSON.parse(new TextDecoder().decode(contents));
                this._items = Array.isArray(data.items) ? data.items : [];
                this._nextId = data.nextId || (this._items.length + 1);
            }
        } catch (e) {
            this._items = [];
        }
    }

    all() {
        return this._items;
    }

    get(id) {
        return this._items.find(i => i.id === id);
    }

    // Retorna true se um item novo foi de fato adicionado (usado pra decidir
    // se vale a pena redesenhar a UI).
    add(text, maxHistory) {
        const trimmed = text.trim();
        if (!trimmed)
            return false;
        if (this._items[0]?.text === trimmed)
            return false; // já é o item mais recente, nada a fazer

        // se o mesmo texto já existir mais pra trás (e não fixado), remove a
        // ocorrência antiga pra não duplicar — o item "sobe" pro topo
        const dupIndex = this._items.findIndex(i => i.text === trimmed && !i.pinned);
        if (dupIndex !== -1)
            this._items.splice(dupIndex, 1);

        this._items.unshift({
            id: this._nextId++,
            text: trimmed,
            pinned: false,
            createdAt: Date.now(),
        });

        this._prune(maxHistory);
        this._cursor = 0;
        this._scheduleSave();
        return true;
    }

    _prune(maxHistory) {
        let unpinnedSeen = 0;
        this._items = this._items.filter(item => {
            if (item.pinned)
                return true;
            unpinnedSeen += 1;
            return unpinnedSeen <= maxHistory;
        });
    }

    setPinned(id, pinned) {
        const item = this.get(id);
        if (!item)
            return;
        item.pinned = pinned;
        this._scheduleSave();
    }

    remove(id) {
        const idx = this._items.findIndex(i => i.id === id);
        if (idx === -1)
            return;
        this._items.splice(idx, 1);
        this._scheduleSave();
    }

    // Limpa tudo, exceto os itens fixados.
    clear() {
        this._items = this._items.filter(i => i.pinned);
        this._cursor = 0;
        this._scheduleSave();
    }

    resetCursor() {
        this._cursor = 0;
    }

    // Usado pelo Alt+C: avança o cursor um item pra trás no histórico e
    // devolve o item, ou null se já chegou no mais antigo.
    nextForCycle() {
        const next = this._cursor + 1;
        if (next >= this._items.length)
            return null;
        this._cursor = next;
        return this._items[this._cursor];
    }

    _scheduleSave() {
        if (this._writeTimer)
            GLib.source_remove(this._writeTimer);
        this._writeTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, WRITE_DEBOUNCE_MS, () => {
            this._writeTimer = 0;
            this._save();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Escrita imediata (usado no disable() da extensão pra não perder o
    // último item se o Shell for recarregado logo após copiar algo).
    flush() {
        if (this._writeTimer) {
            GLib.source_remove(this._writeTimer);
            this._writeTimer = 0;
        }
        this._save();
    }

    _save() {
        try {
            GLib.mkdir_with_parents(DATA_DIR, 0o700);
            const payload = JSON.stringify({ items: this._items, nextId: this._nextId });
            const file = Gio.File.new_for_path(HISTORY_FILE);
            file.replace_contents(payload, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            GLib.chmod(HISTORY_FILE, 0o600);
        } catch (e) {
            logError(e, 'clip-vault: falha ao salvar o histórico');
        }
    }
}
