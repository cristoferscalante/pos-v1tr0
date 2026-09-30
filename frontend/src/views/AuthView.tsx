import { useState } from 'react';
import { ArrowLeft, Mail, Lock, Store, Sparkles, KeyRound } from 'lucide-react';
import { authApi } from '../api/client';
import { useToast } from '../components/Toast';
import { BusinessTypeSelect } from '../components/BusinessTypeSelect';
import { PasswordInput } from '../components/PasswordInput';
import { BrandLogo } from '../components/BrandLogo';
import { TRIAL_DAYS } from '../utils/plans';
import type { AuthResponse, BusinessType } from '../types';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

interface Props {
  initialMode: 'login' | 'register';
  onAuthenticated: (data: AuthResponse, welcome: string) => void;
}

export function AuthView({ initialMode, onAuthenticated }: Props) {
  const { success, error } = useToast();
  const initialReset = new URLSearchParams(window.location.search).get('reset_token') || '';
  const [mode, setMode] = useState<Mode>(initialReset ? 'reset' : initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('veterinaria');
  const [resetToken, setResetToken] = useState(initialReset);
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    // La URL refleja la pantalla (/login o /registro) para poder compartir el enlace
    window.history.replaceState({}, '', next === 'register' ? '/registro' : '/login');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const data = await authApi.login(email, password);
        onAuthenticated(data, `Bienvenido, ${data.user.business_name}`);
      } else if (mode === 'register') {
        if (!businessName.trim()) { error('Escribe el nombre de tu negocio'); return; }
        const data = await authApi.register({ business_name: businessName.trim(), business_type: businessType, email, password });
        onAuthenticated(data, `¡Listo! Tienes ${TRIAL_DAYS} días gratis para probar V1TR0 POS`);
      } else if (mode === 'forgot') {
        const res = await authApi.forgotPassword(email);
        success(res.message);
        setMode('login');
      } else {
        const res = await authApi.resetPassword(resetToken, password);
        success(res.message);
        setPassword('');
        setResetToken('');
        window.history.replaceState({}, '', '/login');
        setMode('login');
      }
    } catch (err: any) {
      error(err.message || (mode === 'login' ? 'Correo o contraseña incorrectos' : 'No se pudo completar la solicitud'));
    } finally {
      setSubmitting(false);
    }
  };

  const titles: Record<Mode, [string, string]> = {
    login: ['Bienvenido de nuevo', 'Ingresa para seguir vendiendo'],
    register: ['Crea tu cuenta', `Prueba gratis ${TRIAL_DAYS} días, sin tarjeta`],
    forgot: ['Recupera tu contraseña', 'Te enviamos un enlace a tu correo'],
    reset: ['Nueva contraseña', 'Escribe tu nueva contraseña'],
  };
  const submitLabel: Record<Mode, [string, string]> = {
    login: ['Ingresar', 'Ingresando…'],
    register: ['Crear cuenta y empezar gratis', 'Creando tu cuenta…'],
    forgot: ['Enviar enlace', 'Enviando…'],
    reset: ['Guardar contraseña', 'Guardando…'],
  };

  return (
    <div className="auth-page">
      <div className="auth-bg-glow" />
      <div className="auth-shell">
        <a href="/" className="auth-back"><ArrowLeft size={16} /> Volver al inicio</a>
        <div className="auth-card glass animate-fade">
          <BrandLogo size={48} subtitle="Punto de venta en tu celular" />

          {(mode === 'login' || mode === 'register') && (
            <div className="auth-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => switchMode('login')} className={`auth-tab ${mode === 'login' ? 'active' : ''}`}>
                Ingresar
              </button>
              <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => switchMode('register')} className={`auth-tab ${mode === 'register' ? 'active' : ''}`}>
                Crear cuenta
              </button>
            </div>
          )}

          <div className="auth-heading">
            <h1>{titles[mode][0]}</h1>
            <p>{titles[mode][1]}</p>
          </div>

          {mode === 'register' && (
            <div className="auth-trial">
              <Sparkles size={18} />
              <span>Usa todas las funciones <strong>{TRIAL_DAYS} días gratis</strong>. Al terminar eliges tu plan y tus datos se conservan.</span>
            </div>
          )}

          <form onSubmit={submit} className="auth-form">
            {mode === 'register' && (
              <>
                <div className="form-group">
                  <label className="form-label" htmlFor="auth-business">Nombre del negocio</label>
                  <div className="input-icon">
                    <Store size={18} />
                    <input id="auth-business" required value={businessName} onChange={e => setBusinessName(e.target.value)} className="form-input" placeholder="Ej. Tienda Doña Rosa" autoComplete="organization" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de negocio</label>
                  <BusinessTypeSelect value={businessType} onChange={setBusinessType} />
                </div>
              </>
            )}

            {mode === 'reset' ? (
              <div className="form-group">
                <label className="form-label" htmlFor="auth-token">Código de recuperación</label>
                <div className="input-icon">
                  <KeyRound size={18} />
                  <input id="auth-token" required value={resetToken} onChange={e => setResetToken(e.target.value)} className="form-input" placeholder="Código recibido por correo" />
                </div>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label" htmlFor="auth-email">Correo electrónico</label>
                <div className="input-icon">
                  <Mail size={18} />
                  <input id="auth-email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} className="form-input" placeholder="correo@negocio.com" />
                </div>
              </div>
            )}

            {mode !== 'forgot' && (
              <div className="form-group">
                <div className="auth-label-row">
                  <label className="form-label" htmlFor="auth-password">{mode === 'reset' ? 'Nueva contraseña' : 'Contraseña'}</label>
                  {mode === 'login' && (
                    <button type="button" className="auth-link" onClick={() => setMode('forgot')}>¿La olvidaste?</button>
                  )}
                </div>
                <div className="input-icon">
                  <Lock size={18} />
                  <PasswordInput
                    id="auth-password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    minLength={mode === 'login' ? undefined : 8}
                    placeholder={mode === 'login' ? 'Tu contraseña' : 'Mínimo 8 caracteres'}
                  />
                </div>
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn-primary auth-submit">
              {submitting ? submitLabel[mode][1] : submitLabel[mode][0]}
            </button>

            {(mode === 'forgot' || mode === 'reset') && (
              <button type="button" className="auth-link auth-link-center" onClick={() => setMode('login')}>Volver a ingresar</button>
            )}
          </form>

          <p className="auth-disclaimer">Tus ventas quedan guardadas aunque se caiga el internet.</p>
        </div>
      </div>
    </div>
  );
}
