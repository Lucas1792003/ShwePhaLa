import { Card } from "../ui/Card";
import { formatMmk } from "../../lib/utils";
import { useTranslation } from "../../hooks/useTranslation";

interface GoalTrackerProps {
  revenueTarget: number;
  profitTarget: number;
  currentRevenue: number;
  currentProfit: number;
}

interface GoalRingProps {
  label: string;
  target: number;
  current: number;
  showProfit?: boolean;
}

const GoalRing = ({ label, target, current, showProfit = false }: GoalRingProps) => {
  const { language } = useTranslation();
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const remaining = Math.max(target - current, 0);

  // Determine color based on percentage
  let colorClass = "text-red-500";
  let bgClass = "stroke-red-500";
  let labelBg = "bg-red-100 text-red-700";

  if (percentage >= 70) {
    colorClass = "text-emerald-500";
    bgClass = "stroke-emerald-500";
    labelBg = "bg-emerald-100 text-emerald-700";
  } else if (percentage >= 40) {
    colorClass = "text-amber-500";
    bgClass = "stroke-amber-500";
    labelBg = "bg-amber-100 text-amber-700";
  }

  // SVG parameters
  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width={size} height={size} className="-rotate-90">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            className={bgClass}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${colorClass}`}>
            {percentage.toFixed(0)}%
          </span>
          <span className="text-xs text-slate-500">
            {language === "my" ? "ပြည့်ပြီး" : "complete"}
          </span>
        </div>
      </div>

      <div className="mt-3 text-center">
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${labelBg}`}>
          {label}
        </span>
        <div className="mt-2 space-y-1">
          <p className="text-sm text-slate-600">
            <span className="font-medium">{language === "my" ? "လက်ရှိ" : "Current"}:</span>{" "}
            <span className={showProfit && current < 0 ? "text-red-600" : "text-slate-800"}>
              {formatMmk(current)}
            </span>
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-medium">{language === "my" ? "ပန်းတိုင်" : "Target"}:</span>{" "}
            {formatMmk(target)}
          </p>
          {remaining > 0 && (
            <p className="text-xs text-slate-500">
              {language === "my" ? "ကျန်" : "Remaining"}: {formatMmk(remaining)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export const GoalTracker = ({
  revenueTarget,
  profitTarget,
  currentRevenue,
  currentProfit,
}: GoalTrackerProps) => {
  const { language } = useTranslation();

  // Calculate days remaining in month
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysRemaining = lastDay.getDate() - today.getDate();
  const totalDays = lastDay.getDate();
  const daysPassed = today.getDate();

  // Calculate required daily to hit target
  const revenueNeededPerDay = daysRemaining > 0 ? (revenueTarget - currentRevenue) / daysRemaining : 0;
  const profitNeededPerDay = daysRemaining > 0 ? (profitTarget - currentProfit) / daysRemaining : 0;

  return (
    <Card className="h-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">
            {language === "my" ? "လစဉ်ပန်းတိုင်များ" : "Monthly Goals"}
          </h3>
          <p className="text-sm text-slate-500">
            {language === "my"
              ? `${daysPassed} ရက်ပြီး • ${daysRemaining} ရက်ကျန်`
              : `Day ${daysPassed} of ${totalDays} • ${daysRemaining} days left`}
          </p>
        </div>
        <span className="material-symbols-rounded text-2xl text-violet-500">flag</span>
      </div>

      <div className="flex items-center justify-around py-4">
        <GoalRing
          label={language === "my" ? "ဝင်ငွေ" : "Revenue"}
          target={revenueTarget}
          current={currentRevenue}
        />
        <div className="h-32 w-px bg-slate-200" />
        <GoalRing
          label={language === "my" ? "အမြတ်" : "Profit"}
          target={profitTarget}
          current={currentProfit}
          showProfit
        />
      </div>

      {/* Daily targets to hit goal */}
      {daysRemaining > 0 && (currentRevenue < revenueTarget || currentProfit < profitTarget) && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-600 uppercase">
            {language === "my" ? "ပန်းတိုင်ရောက်ရန် နေ့စဉ်လိုအပ်သည်" : "Daily target to reach goal"}
          </p>
          <div className="mt-2 flex gap-4">
            {currentRevenue < revenueTarget && (
              <div className="flex-1">
                <p className="text-sm text-slate-500">{language === "my" ? "ဝင်ငွေ" : "Revenue"}</p>
                <p className="text-lg font-semibold text-slate-800">{formatMmk(Math.max(revenueNeededPerDay, 0))}<span className="text-sm font-normal text-slate-500">/{language === "my" ? "ရက်" : "day"}</span></p>
              </div>
            )}
            {currentProfit < profitTarget && (
              <div className="flex-1">
                <p className="text-sm text-slate-500">{language === "my" ? "အမြတ်" : "Profit"}</p>
                <p className="text-lg font-semibold text-slate-800">{formatMmk(Math.max(profitNeededPerDay, 0))}<span className="text-sm font-normal text-slate-500">/{language === "my" ? "ရက်" : "day"}</span></p>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};
