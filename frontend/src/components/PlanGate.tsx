import { Check, Clock, LogOut, MessageCircle, RefreshCw } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { PUBLIC_PLANS, SALES_WHATSAPP_DISPLAY, formatCOP, whatsappLink } from '../utils/plans';
import type { AuthUser } from '../types';

/** Días que le quedan al plan (null = sin vencimiento). */
export function daysLeft(user: AuthUser | null): number | null {
  if (!user?.subscription_ends_at) return null;
  return Math.ceil((new Date(user.subscription_ends_at).getTime() - Date.now()) / 86400000);
}

/**
 * La app se bloquea si el plan venció. subscription_active viene del servidor;
 * si la sesión es anterior a este cambio (no lo trae) se deja pasar y se
 * actualiza al consultar /auth/subscription. El superadmin nunca se bloquea.
 */
export function isPlanExpired(user: AuthUser | null): boolean {
  if (!user || user.is_superadmin) return false;
  if (user.subscription_active === false) return true;
  const left = daysLeft(user);
  return left !== null && left <= 0 && user.subscription_active !== true;
}

interface ExpiredProps {
  user: AuthUser;
  checking: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}

/** Pantalla "Compra tu plan": precios y contacto por WhatsApp. La activación es manual. */
export function PlanExpiredScreen({ user, checking, onRefresh, onLogout }: ExpiredProps) {
  const wasTrial = (user.plan_name || 'free') === 'free';
  const isCashier = user.role === 'cashier';
  const message = (planName?: string) =>
    `Hola, soy de "${user.business_name}" (${user.email}). ${wasTrial ? 'Terminó mi prueba gratis' : 'Se venció mi plan'} de V1TR0 POS y quiero ${planName ? `el plan ${planName}` : 'activar un plan'}.`;
  const paidPlans = PUBLIC_PLANS.filter(p => p.price > 0);

  return (
    <div className="plan-gate">
      <div className="plan-gate-card">
        <BrandLogo size={44} />
        <div className="plan-gate-icon"><Clock size={28} /></div>
        <h1>{wasTrial ? 'Tu prueba gratis terminó' : 'Tu plan se venció'}</h1>
        <p className="plan-gate-lead">
          {isCashier
            ? 'Pídele al administrador del negocio que active un plan para seguir vendiendo.'
            : <>Compra tu plan para seguir usando V1TR0 POS en <strong>{user.business_name}</strong>. Todo lo que registraste está guardado.</>}
        </p>

        <div className="plan-gate-plans">
          {paidPlans.map(plan => (
            <article key={plan.key} className={`plan-gate-plan ${plan.highlight ? 'featured' : ''}`}>
              <div className="plan-gate-plan-head">
                <h2>{plan.name}</h2>
                <div><strong>{formatCOP(plan.price)}</strong> <span>{plan.period}</span></div>
              </div>
              <ul>
                {plan.features.slice(0, 4).map(f => <li key={f}><Check size={15} /> {f}</li>)}
              </ul>
              {!isCashier && (
                <a href={whatsappLink(message(plan.name))} target="_blank" rel="noreferrer" className={`${plan.highlight ? 'btn-primary' : 'btn-secondary'} plan-gate-cta`}>
                  <MessageCircle size={17} /> Quiero el plan {plan.name}
                </a>
              )}
            </article>
          ))}
        </div>

        {!isCashier && (
          <a href={whatsappLink(message())} target="_blank" rel="noreferrer" className="plan-gate-wa">
            <MessageCircle size={20} /> Escríbenos al WhatsApp {SALES_WHATSAPP_DISPLAY}
          </a>
        )}
        <p className="plan-gate-note">Cuando confirmemos tu pago activamos tu plan y la app se desbloquea sola.</p>

        <div className="plan-gate-actions">
          <button type="button" className="btn-secondary" onClick={onRefresh} disabled={checking}>
            <RefreshCw size={16} className={checking ? 'spin' : ''} /> {checking ? 'Revisando…' : 'Ya pagué, revisar'}
          </button>
          <button type="button" className="btn-ghost-danger" onClick={onLogout}>
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

/** Aviso fino arriba de la app cuando quedan pocos días de prueba o de plan. */
export function PlanReminder({ user }: { user: AuthUser | null }) {
  const left = daysLeft(user);
  if (!user || user.is_superadmin || user.role === 'cashier' || left === null || left > 7 || left <= 0) return null;
  const trial = (user.plan_name || 'free') === 'free';
  const text = trial
    ? `Te ${left === 1 ? 'queda 1 día' : `quedan ${left} días`} de prueba gratis`
    : `Tu plan vence en ${left === 1 ? '1 día' : `${left} días`}`;
  return (
    <div className="plan-reminder" role="status">
      <Clock size={16} />
      <span>{text}</span>
      <a href={whatsappLink(`Hola, soy de "${user.business_name}" (${user.email}) y quiero ${trial ? 'activar' : 'renovar'} mi plan de V1TR0 POS.`)} target="_blank" rel="noreferrer">
        {trial ? 'Comprar plan' : 'Renovar'}
      </a>
    </div>
  );
}
