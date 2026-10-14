// Coordina la recarga automática por versión nueva con el trabajo en curso:
// el carrito no se guarda al recargar, así que no se recarga a mitad de venta.
let busy = false;
let pendingReload: (() => void) | null = null;

/** El POS avisa si hay una venta en curso (carrito con productos, cobro o recibo abiertos). */
export function setAppBusy(value: boolean) {
  busy = value;
  if (!busy && pendingReload) {
    const reload = pendingReload;
    pendingReload = null;
    reload();
  }
}

/** Aplica la versión nueva ahora, o en cuanto termine la venta en curso. */
export function applyUpdateWhenIdle(reload: () => void) {
  if (busy) pendingReload = reload;
  else reload();
}
