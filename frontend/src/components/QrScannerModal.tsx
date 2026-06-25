import { useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';

interface QrScannerModalProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export function QrScannerModal({ onScanSuccess, onClose }: QrScannerModalProps) {
  useEffect(() => {
    // Función para traducir los elementos del escáner al español
    const translateScanner = () => {
      const container = document.getElementById('qr-reader-container');
      if (!container) return;

      // Traducir botón de permisos de cámara
      const permissionBtn = document.getElementById('html5-qrcode-button-camera-permission');
      if (permissionBtn && permissionBtn.textContent !== 'Permitir uso de cámara') {
        permissionBtn.textContent = 'Permitir uso de cámara';
      }

      // Traducir botón de selección de archivo de imagen
      const fileBtn = document.getElementById('html5-qrcode-button-file-selection');
      if (fileBtn && fileBtn.textContent !== 'Escanear archivo de imagen') {
        fileBtn.textContent = 'Escanear archivo de imagen';
      }

      // Traducir el enlace alternativo de tipo de escaneo
      const scanTypeAnchor = document.getElementById('html5-qrcode-anchor-scan-type');
      if (scanTypeAnchor) {
        if (scanTypeAnchor.textContent?.includes('Scan an Image File')) {
          scanTypeAnchor.textContent = 'Escanear un archivo de imagen';
        } else if (scanTypeAnchor.textContent?.includes('Scan using chip camera')) {
          scanTypeAnchor.textContent = 'Escanear usando la cámara del dispositivo';
        }
      }

      // Traducir etiqueta del selector de archivo privado
      const fileInputLabel = container.querySelector('label[for="html5-qrcode-private-files-selection"]');
      if (fileInputLabel && fileInputLabel.textContent !== 'Seleccionar archivo de imagen') {
        fileInputLabel.textContent = 'Seleccionar archivo de imagen';
      }
      
      // Traducir opción vacía en selección de cámara
      const selectCamera = container.querySelector('select#html5-qrcode-select-camera');
      if (selectCamera) {
        const option = selectCamera.querySelector('option[value=""]');
        if (option && option.textContent === 'Select Camera') {
          option.textContent = 'Seleccionar cámara';
        }
      }

      // Traducir botones de iniciar y detener escaneo
      const startBtn = document.getElementById('html5-qrcode-button-camera-start');
      if (startBtn && startBtn.textContent !== 'Iniciar cámara') {
        startBtn.textContent = 'Iniciar cámara';
      }
      const stopBtn = document.getElementById('html5-qrcode-button-camera-stop');
      if (stopBtn && stopBtn.textContent !== 'Detener cámara') {
        stopBtn.textContent = 'Detener cámara';
      }
    };

    // Inicializar el escáner de html5-qrcode
    const scanner = new Html5QrcodeScanner(
      'qr-reader-container',
      { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      },
      /* verbose= */ false
    );

    scanner.render(
      (decodedText) => {
        onScanSuccess(decodedText);
        scanner.clear().then(() => {
          onClose();
        }).catch(err => {
          console.error("Error al limpiar escáner:", err);
          onClose();
        });
      },
      () => {
        // Silenciar errores repetitivos de escaneo fallido en frames individuales
      }
    );

    // Observador para traducir elementos dinámicos en español cuando cambie el DOM
    const observer = new MutationObserver(() => {
      translateScanner();
    });
    
    const targetNode = document.getElementById('qr-reader-container');
    if (targetNode) {
      observer.observe(targetNode, { childList: true, subtree: true });
    }

    // Traducir inmediatamente la primera carga
    translateScanner();

    // Limpieza al desmontar el componente
    return () => {
      observer.disconnect();
      scanner.clear().catch(err => {
        console.warn("Escáner ya cerrado o error al limpiar:", err);
      });
    };
  }, [onScanSuccess, onClose]);

  return (
    <div className="modal-backdrop animate-fade">
      <div className="modal-content glass">
        <div className="modal-header">
          <h3>Escanear Código QR o Barras</h3>
          <button onClick={onClose} className="btn-close-modal">
            <X className="close-icon" />
          </button>
        </div>
        <div className="modal-body">
          <div id="qr-reader-container"></div>
          <p className="scanner-instruction">
            Apunta la cámara de tu dispositivo hacia el código QR o código de barras del producto.
          </p>
        </div>
      </div>
    </div>
  );
}
