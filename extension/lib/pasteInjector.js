import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

// O Alt+C dispara com o Alt ainda fisicamente pressionado. Se o Ctrl+V for
// injetado nesse instante, o app com foco recebe Ctrl+Alt+V e ignora — por
// isso o atalho parece "não fazer nada". A saída é esperar o usuário soltar
// os modificadores antes de injetar.
const MODIFIER_MASK =
    Clutter.ModifierType.SHIFT_MASK |
    Clutter.ModifierType.CONTROL_MASK |
    Clutter.ModifierType.MOD1_MASK |   // Alt
    Clutter.ModifierType.MOD4_MASK;    // Super

const POLL_MS = 15;
const MAX_WAIT_MS = 500;   // teto: injeta mesmo assim se o usuário segurar

// Injeta um Ctrl+V sintético na janela com foco, via teclado virtual do
// Clutter. O Shell pode fazer isso porque é o próprio compositor Wayland —
// é o mesmo mecanismo usado pelo teclado virtual de acessibilidade. Não tem
// equivalente confiável rodando fora do Shell (xdotool não funciona contra
// apps sandboxed no Wayland).
export class PasteInjector {
    constructor() {
        this._device = null;
        this._waitTimer = 0;
    }

    _getDevice() {
        if (!this._device) {
            const seat = Clutter.get_default_backend().get_default_seat();
            this._device = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        }
        return this._device;
    }

    // Injeta assim que os modificadores estiverem livres. Se já estiverem,
    // vai no mesmo frame — o caminho do dropdown/picker não paga nada.
    sendCtrlV() {
        if (this._waitTimer) {
            GLib.source_remove(this._waitTimer);
            this._waitTimer = 0;
        }

        if (!this._modifiersHeld())
            return this._emitCtrlV();

        let waited = 0;
        this._waitTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_MS, () => {
            waited += POLL_MS;
            if (this._modifiersHeld() && waited < MAX_WAIT_MS)
                return GLib.SOURCE_CONTINUE;

            this._waitTimer = 0;
            this._emitCtrlV();
            return GLib.SOURCE_REMOVE;
        });
        return true;
    }

    _modifiersHeld() {
        const [, , mods] = global.get_pointer();
        return (mods & MODIFIER_MASK) !== 0;
    }

    destroy() {
        if (this._waitTimer) {
            GLib.source_remove(this._waitTimer);
            this._waitTimer = 0;
        }
        this._device = null;
    }

    _emitCtrlV() {
        try {
            const device = this._getDevice();
            const time = Clutter.get_current_event_time();
            device.notify_keyval(time, Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
            device.notify_keyval(time, Clutter.KEY_v, Clutter.KeyState.PRESSED);
            device.notify_keyval(time, Clutter.KEY_v, Clutter.KeyState.RELEASED);
            device.notify_keyval(time, Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
            return true;
        } catch (e) {
            logError(e, 'clip-vault: falha ao injetar Ctrl+V');
            return false;
        }
    }
}
