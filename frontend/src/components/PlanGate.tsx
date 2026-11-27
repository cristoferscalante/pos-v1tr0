import { Clock, LogOut, RefreshCw, Send } from 'lucide-react';
import { PUBLIC_PLANS, SALES_CONTACT_DISPLAY, formatCOP, contactLink } from '../utils/plans';
import type { AuthUser } from '../types';
import { parseServerDate } from '../utils/dates';

/** Días que le quedan al plan (null = sin vencimiento). */
export function daysLeft(user: AuthUser | null): number | null {
  if (!user?.subscription_ends_at) return null;
  return Math.ceil((parseServerDate(user.subscription_ends_at).getTime() - Date.now()) / 86400000);
}

/**
 * La app se bloquea si el plan venció. subscription_active viene del servidor,
 * pero además se compara la fecha en el equipo: así se bloquea en el momento
 * exacto, aunque la app lleve horas abierta o esté sin internet.
 * El superadmin nunca se bloquea.
 */
export function isPlanExpired(user: AuthUser | null): boolean {
  if (!user || user.is_superadmin) return false;
  if (user.subscription_active === false) return true;
  if (!user.subscription_ends_at) return false;
  return parseServerDate(user.subscription_ends_at).getTime() <= Date.now();
}

interface ExpiredProps {
  user: AuthUser;
  checking: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}

/**
 * Popup que no se puede cerrar: para seguir hay que pedir un plan por Telegram.
 * La activación es manual (superadmin).
 */
export function PlanExpiredModal({ user, checking, onRefresh, onLogout }: ExpiredProps) {
  const wasTrial = (user.plan_name || 'free') === 'free';
  const isCashier = user.role === 'cashier';
  const message = (planName?: string) =>
    `Hola, soy de "${user.business_name}" (${user.email}). ${wasTrial ? 'Terminó mi prueba gratis' : 'Se venció mi plan'} de V1TR0 POS y quiero ${planName ? `el plan ${planName}` : 'activar un plan'}.`;
  const paidPlans = PUBLIC_PLANS.filter(p => p.price > 0);

  return (
    <div className="plan-lock">
      <div className="plan-lock-card" role="alertdialog" aria-modal="true" aria-labelledby="plan-lock-title" aria-describedby="plan-lock-text">
        <div className="plan-lock-icon"><Clock size={28} /></div>
        <h1 id="plan-lock-title">{wasTrial ? 'Tu prueba gratis terminó' : 'Tu plan se venció'}</h1>
        <p id="plan-lock-text" className="plan-lock-lead">
          {isCashier
            ? 'Pídele al administrador del negocio que active un plan para seguir vendiendo.'
            : <>Para seguir usando V1TR0 POS en <strong>{user.business_name}</strong>, pide uno de los planes por Telegram. Tus datos están guardados.</>}
        </p>

        {!isCashier && (
          <>
            <div className="plan-lock-plans">
              {paidPlans.map(plan => (
                <a key={plan.key} href={contactLink(message(plan.name))} target="_blank" rel="noreferrer" className={`plan-lock-plan ${plan.highlight ? 'featured' : ''}`}>
                  <span className="plan-lock-plan-info">
                    <strong>Plan {plan.name}</strong>
                    <span>{plan.monthlyPrice ? `${formatCOP(plan.monthlyPrice)} al mes · ${formatCOP(plan.price)} al año` : `${formatCOP(plan.price)} ${plan.period}`}</span>
                    {plan.key === 'premium' && <span>Incluye facturación electrónica DIAN</span>}
                  </span>
                  <span className="plan-lock-plan-go">Pedir <Send size={15} /></span>
                </a>
              ))}
            </div>
            <a href={contactLink(message())} target="_blank" rel="noreferrer" className="plan-lock-telegram">
              <Send size={20} /> Escribir por Telegram a {SALES_CONTACT_DISPLAY}
            </a>
          </>
        )}

        <p className="plan-lock-note">Cuando confirmemos tu pago activamos tu plan y la app se desbloquea sola.</p>

        <div className="plan-lock-actions">
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
      <a href={contactLink(`Hola, soy de "${user.business_name}" (${user.email}) y quiero ${trial ? 'activar' : 'renovar'} mi plan de V1TR0 POS.`)} target="_blank" rel="noreferrer">
        {trial ? 'Comprar plan' : 'Renovar'}
      </a>
    </div>
  );
}
