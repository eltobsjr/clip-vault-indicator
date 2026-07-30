import Clutter from 'gi://Clutter';

// Injeta um Ctrl+V sintético na janela com foco, via teclado virtual do
// Clutter. O Shell pode fazer isso porque é o próprio compositor Wayland —
// é o mesmo mecanismo usado pelo teclado virtual de acessibilidade. Não tem
// equivalente confiável rodando fora do Shell (xdotool não funciona contra
// apps sandboxed no Wayland).
export class PasteInjector {
    constructor() {
        this._device = null;
    }

    _getDevice() {
        if (!this._device) {
            const seat = Clutter.get_default_backend().get_default_seat();
            this._device = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        }
        return this._device;
    }

    sendCtrlV() {
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
