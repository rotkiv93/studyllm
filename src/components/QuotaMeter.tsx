import { useEffect, useState } from "react";
import { PROVIDER_MANIFEST, type ProviderType } from "../lib/providers";
import { useT } from "../lib/i18n";

/** Today's request counts and the router's active cooldowns, keyed by provider row id. */
export interface QuotaSnapshot {
  requests: Record<string, number>;
  /** Epoch-ms at which each cooling-down provider becomes available again. */
  cooldowns: Record<string, number>;
}

const WARN_AT = 0.8;

/**
 * "N requests today" for one provider, with a soft bar against the manifest's rough daily limit when
 * it has one, a gentle warning from 80%, and a cooldown note while the router has it benched. The
 * limit is an estimate (free tiers change), and the label says so.
 */
export function QuotaMeter({
  type,
  requests,
  cooldownUntil,
}: {
  type: ProviderType;
  requests: number;
  cooldownUntil?: number;
}) {
  const t = useT();
  const limit = PROVIDER_MANIFEST[type]?.dailyRequestLimit;
  const [now, setNow] = useState(() => Date.now());
  const coolingFor = cooldownUntil && cooldownUntil > now ? Math.ceil((cooldownUntil - now) / 1000) : 0;

  useEffect(() => {
    if (!cooldownUntil) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const ratio = limit ? Math.min(requests / limit, 1) : 0;
  const warn = limit ? requests / limit >= WARN_AT : false;

  return (
    <div className="quota-meter">
      <span className="quota-count" title={limit ? t("quota.estimateNote") : undefined}>
        {limit
          ? t("quota.countOfLimit", { count: String(requests), limit: String(limit) })
          : t("quota.count", { count: String(requests) })}
      </span>
      {limit && (
        <div
          className={`quota-bar${warn ? " quota-bar-warn" : ""}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(requests, limit)}
          aria-label={t("quota.estimateNote")}
        >
          <div className="quota-bar-fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
      )}
      {warn && <span className="quota-warn">{t("quota.nearLimit")}</span>}
      {coolingFor > 0 && <span className="quota-cooldown">{t("quota.cooldown", { seconds: String(coolingFor) })}</span>}
    </div>
  );
}
