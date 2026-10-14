import { useState, type ReactNode } from 'react';
import { Bluetooth, ChevronDown, Printer, Smartphone, Monitor } from 'lucide-react';
import { useToast } from './Toast';
import {
  bluetoothPrinterName, chooseBluetoothPrinter, chooseSerialPrinter, printerErrorMessage, isBluetoothSupported, isSerialSupported, printTestPage, savePrinterSettings,
  type PrintMethod, type PrinterSettings,
} from '../utils/thermalPrinter';

const METHODS: { id: PrintMethod; label: string; hint: string; icon: ReactNode }[] = [
  { id: 'browser', label: 'Navegador', hint: 'Abre el diálogo de impresión. Sirve con cualquier impresora.', icon: <Monitor size={16} /> },
  { id: 'serial', label: 'Impresora integrada (sin apps)', hint: 'Terminales Android con impresora incorporada y ticketeras Bluetooth emparejadas. Se elige una sola vez.', icon: <Printer size={16} /> },
  { id: 'rawbt', label: 'Directa (RawBT)', hint: 'Android y terminales con impresora integrada (Sunmi, PDA). Requiere la app RawBT.', icon: <Smartphone size={16} /> },
  { id: 'bluetooth', label: 'Bluetooth directo', hint: 'Impresoras Bluetooth BLE desde Chrome. Se elige una vez por sesión.', icon: <Bluetooth size={16} /> },
];

export const METHOD_LABELS: Record<PrintMethod, string> = { browser: 'Navegador', serial: 'Integrada', rawbt: 'RawBT', bluetooth: 'Bluetooth' };

interface Props {
  settings: PrinterSettings;
  onChange: (settings: PrinterSettings) => void;
}

/** Ajustes de la impresora de recibos de este dispositivo. */
export function PrinterSettingsPanel({ settings, onChange }: Props) {
  const { success, error } = useToast();
  const [open, setOpen] = useState(false);
  const [btName, setBtName] = useState(bluetoothPrinterName());

  const update = (patch: Partial<PrinterSettings>) => {
    const next = { ...settings, ...patch };
    savePrinterSettings(next);
    onChange(next);
  };

  const [serialName, setSerialName] = useState<string | null>(null);
  const chooseSerial = async () => {
    try {
      const name = await chooseSerialPrinter();
      setSerialName(name);
      success('Impresora elegida. Toca "Imprimir prueba".');
    } catch (e: any) {
      const message = printerErrorMessage(e, 'serial');
      if (message) error(message);
    }
  };

  const choosePrinter = async () => {
    try {
      const name = await chooseBluetoothPrinter();
      setBtName(name);
      success(`Impresora conectada: ${name}`);
    } catch (e: any) {
      if (e?.name !== 'NotFoundError') error(e?.message || 'No se pudo conectar la impresora');
    }
  };

  const test = async () => {
    try { await printTestPage(settings); setBtName(bluetoothPrinterName()); }
    catch (e: any) { const message = printerErrorMessage(e, settings.method); if (message) error(message); }
  };

  return (
    <div className="printer-settings">
      <button type="button" className="printer-settings-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <Printer size={14} />
        <span>Impresora: {settings.paper} mm · {METHOD_LABELS[settings.method]}</span>
        <ChevronDown size={14} style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div className="printer-settings-body">
          <div className="printer-settings-group">
            <span className="printer-settings-label">Ancho del papel</span>
            <div className="printer-seg">
              {(['58', '80'] as const).map(p => (
                <button key={p} type="button" className={settings.paper === p ? 'active' : ''} onClick={() => update({ paper: p })}>
                  {p} mm
                </button>
              ))}
            </div>
          </div>

          <div className="printer-settings-group">
            <span className="printer-settings-label">Forma de imprimir</span>
            {METHODS.map(m => (
              <button
                key={m.id}
                type="button"
                className={`printer-method ${settings.method === m.id ? 'active' : ''}`}
                onClick={() => update({ method: m.id })}
              >
                <span className="printer-method-icon">{m.icon}</span>
                <span className="printer-method-text">
                  <strong>{m.label}</strong>
                  <small>{m.hint}</small>
                </span>
              </button>
            ))}
            {settings.method === 'bluetooth' && (
              isBluetoothSupported() ? (
                <button type="button" className="btn-secondary" onClick={choosePrinter} style={{ minHeight: '40px' }}>
                  <Bluetooth size={15} /> {btName ? `Conectada: ${btName} · Cambiar` : 'Elegir impresora'}
                </button>
              ) : (
                <p className="printer-settings-note">Este navegador no permite Bluetooth. Usa Chrome en Android o la opción RawBT.</p>
              )
            )}
            {settings.method === 'serial' && (
              isSerialSupported() ? (
                <>
                  <button type="button" className="btn-secondary" onClick={chooseSerial} style={{ minHeight: '40px' }}>
                    <Printer size={15} /> {serialName ? `${serialName} elegida · Cambiar` : 'Elegir impresora'}
                  </button>
                  <p className="printer-settings-note">
                    En la lista elige la impresora del equipo (suele llamarse <strong>InnerPrinter</strong> o <strong>Printer</strong>).
                    Si no aparece, revisa en Ajustes → Bluetooth que esté emparejada.
                  </p>
                </>
              ) : (
                <p className="printer-settings-note">Este navegador no permite conectar la impresora directamente. Actualiza Chrome o usa RawBT.</p>
              )
            )}
            {settings.method === 'rawbt' && (
              <p className="printer-settings-note">
                Instala <a href="https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter" target="_blank" rel="noreferrer">RawBT</a> y
                elige ahí la impresora (integrada, Bluetooth o USB). Activa en RawBT la impresión sin confirmación.
              </p>
            )}
          </div>

          {settings.method !== 'browser' && (<>
          <label className="printer-check">
            <input type="checkbox" checked={settings.openDrawer} onChange={e => update({ openDrawer: e.target.checked })} />
            Abrir el cajón monedero al imprimir
          </label>
          <label className="printer-check">
            <input type="checkbox" checked={!!settings.basic} onChange={e => update({ basic: e.target.checked })} />
            Modo básico: solo texto (si la impresora no imprime nada)
          </label>
          <label className="printer-check">
            <input type="checkbox" checked={settings.plainText} onChange={e => update({ plainText: e.target.checked })} />
            Imprimir sin tildes (si salen símbolos raros)
          </label>
          </>)}

          <button type="button" className="btn-secondary" onClick={test} style={{ minHeight: '40px' }}>
            <Printer size={15} /> Imprimir prueba
          </button>
          <small className="printer-settings-note">Versión {__APP_VERSION__}</small>
        </div>
      )}
    </div>
  );
}
