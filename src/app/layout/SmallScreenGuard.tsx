export const SmallScreenGuard = () => (
  <div className="fixed inset-0 z-[999] flex min-h-dvh items-center justify-center bg-slate-50 p-6">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-card">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
        <span className="material-symbols-rounded text-3xl">desktop_windows</span>
      </div>
      <h1 className="mt-4 text-lg font-semibold text-slate-900">Tablet or desktop required</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Please use a tablet, laptop, or desktop for the best experience.
      </p>
      <p className="mt-4 text-xs font-medium text-slate-400">Minimum supported width: 768px.</p>
    </div>
  </div>
);
