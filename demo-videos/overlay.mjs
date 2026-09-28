// Capa que se inyecta en la página grabada: subtítulos, indicador de toque y portada.
// No recibe eventos (pointer-events: none) para no interferir con la app.
export const overlayScript = () => {
  const ensure = () => {
    if (document.getElementById('__demo-root')) return;
    const style = document.createElement('style');
    style.textContent = `
      #__demo-root { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; font-family: 'Outfit', system-ui, sans-serif; }
      #__demo-caption {
        position: absolute; left: 14px; right: 14px; padding: 14px 16px; border-radius: 18px;
        background: rgba(10, 12, 24, 0.9); color: #fff; font-size: 17px; font-weight: 600; line-height: 1.35;
        box-shadow: 0 10px 30px rgba(0,0,0,0.45); border: 1px solid rgba(129,140,248,0.55);
        opacity: 0; transform: translateY(8px); transition: opacity .25s ease, transform .25s ease;
        display: flex; gap: 10px; align-items: flex-start;
      }
      #__demo-caption.show { opacity: 1; transform: translateY(0); }
      #__demo-caption .step { flex-shrink: 0; min-width: 26px; height: 26px; border-radius: 13px; background: #6366f1;
        font-size: 14px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
      .__demo-tap { position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
        background: rgba(250, 204, 21, 0.45); border: 3px solid #facc15; animation: __demoTap .7s ease-out forwards; }
      @keyframes __demoTap { 0% { transform: scale(.4); opacity: 1 } 70% { transform: scale(1.1); opacity: .9 } 100% { transform: scale(1.5); opacity: 0 } }
      #__demo-title { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 14px; padding: 32px; text-align: center; color: #fff; background: linear-gradient(160deg, #1e1b4b, #070b12 70%);
        opacity: 0; transition: opacity .4s ease; }
      #__demo-title.show { opacity: 1; }
      #__demo-title .badge { width: 76px; height: 76px; border-radius: 24px; background: #4f46e5; display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 800; box-shadow: 0 0 40px rgba(99,102,241,.55); }
      #__demo-title h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.5px; margin: 0; }
      #__demo-title p { font-size: 17px; color: #c7d2fe; margin: 0; line-height: 1.45; }
      #__demo-title small { position: absolute; bottom: 42px; font-size: 13px; color: #818cf8; letter-spacing: 1px; text-transform: uppercase; }
    `;
    document.documentElement.appendChild(style);
    const root = document.createElement('div');
    root.id = '__demo-root';
    root.innerHTML = '<div id="__demo-caption"><span class="step"></span><span class="text"></span></div><div id="__demo-title"></div>';
    document.documentElement.appendChild(root);
  };

  window.__demo = {
    caption(text, position = 'bottom', step = '') {
      ensure();
      const el = document.getElementById('__demo-caption');
      if (!text) { el.classList.remove('show'); return; }
      el.querySelector('.text').textContent = text;
      const stepEl = el.querySelector('.step');
      stepEl.textContent = step;
      stepEl.style.display = step ? 'flex' : 'none';
      el.style.top = position === 'top' ? '14px' : position === 'middle' ? '42%' : '';
      el.style.bottom = position === 'bottom' ? '150px' : '';
      el.classList.add('show');
    },
    tap(x, y) {
      ensure();
      const dot = document.createElement('div');
      dot.className = '__demo-tap';
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      document.getElementById('__demo-root').appendChild(dot);
      setTimeout(() => dot.remove(), 800);
    },
    title(show, heading = '', text = '', icon = '') {
      ensure();
      const el = document.getElementById('__demo-title');
      if (show) {
        el.innerHTML = `<div class="badge">${icon}</div><h1>${heading}</h1><p>${text}</p><small>Tienda Doña Rosa · Sistema POS</small>`;
        el.classList.add('show');
      } else {
        el.classList.remove('show');
      }
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure);
  else ensure();
};
