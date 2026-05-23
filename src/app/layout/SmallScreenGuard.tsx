export const SmallScreenGuard = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
    <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-card">
      <span className="material-symbols-rounded text-4xl text-emerald-600">desktop_windows</span>
      <h1 className="mt-3 text-lg font-semibold text-slate-900">Screen too small</h1>
      <p className="mt-2 text-sm text-slate-600">
        This app is optimized for tablet and desktop screens. Please use a wider
        screen for POS operations.
      </p>
      <p className="mt-4 text-xs text-slate-400">Recommended minimum: 1024×768.</p>
    </div>
  </div>
);
