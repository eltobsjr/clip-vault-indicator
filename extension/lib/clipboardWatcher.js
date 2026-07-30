import Meta from 'gi://Meta';
import St from 'gi://St';

// Observa a área de transferência via Meta.Selection (owner-changed), não por
// polling — é a mesma técnica usada pelo Pano. Dispara `onText` sempre que um
// novo dono grava algo no CLIPBOARD (Ctrl+C em algum app).
export class ClipboardWatcher {
    constructor({ onText, settings }) {
        this._onText = onText;
        this._settings = settings;
        this._selection = null;
        this._ownerChangedId = 0;
        this._ignoreOnce = false;
    }

    start() {
        this._selection = global.display.get_selection();
        this._ownerChangedId = this._selection.connect('owner-changed',
            (selection, selectionType, source) => this._onOwnerChanged(selectionType, source));
    }

    stop() {
        if (this._selection && this._ownerChangedId)
            this._selection.disconnect(this._ownerChangedId);
        this._selection = null;
        this._ownerChangedId = 0;
    }

    // O próprio Clip Vault escreve na área de transferência (seleção no
    // picker, cycle do Alt+C). Sem isso, cada escrita nossa voltaria como um
    // "novo" item copiado pelo usuário. Chamar antes de qualquer
    // St.Clipboard.set_text feito por nós mesmos.
    ignoreNext() {
        this._ignoreOnce = true;
    }

    _onOwnerChanged(selectionType, source) {
        if (selectionType !== Meta.SelectionType.SELECTION_CLIPBOARD)
            return;

        if (this._ignoreOnce) {
            this._ignoreOnce = false;
            return;
        }

        if (!source)
            return; // área de transferência foi limpa

        if (this._settings.get_boolean('respect-password-hint') && this._hasPasswordHint())
            return;

        St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) => {
            if (text)
                this._onText(text);
        });
    }

    // Best-effort: nem toda versão do shell expõe get_mimetypes() em
    // Meta.Selection da mesma forma. Se a chamada falhar, simplesmente não
    // filtra (nunca bloqueia a captura por erro de API) — ver CLAUDE.md,
    // seção "Pontos não verificados ao vivo".
    _hasPasswordHint() {
        try {
            if (typeof this._selection?.get_mimetypes !== 'function')
                return false;
            const mimetypes = this._selection.get_mimetypes(Meta.SelectionType.SELECTION_CLIPBOARD) ?? [];
            return mimetypes.includes('x-kde-passwordManagerHint');
        } catch (e) {
            return false;
        }
    }
}
