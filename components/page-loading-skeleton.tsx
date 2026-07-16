export default function PageLoadingSkeleton() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="animate-soft-in space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="h-7 w-64 rounded-lg bg-slate-200/80" />
            <div className="mt-2 h-4 w-44 rounded-md bg-slate-200/70" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-36 rounded-lg bg-slate-200/70" />
            <div className="h-10 w-28 rounded-lg bg-slate-200/70" />
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div className="rounded-lg border border-line bg-white p-5" key={item}>
              <div className="h-4 w-32 rounded-md bg-slate-200/70" />
              <div className="mt-4 h-9 w-20 rounded-lg bg-slate-200/80" />
              <div className="mt-2 h-3 w-24 rounded-md bg-slate-200/60" />
            </div>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="rounded-lg border border-line bg-white">
            <div className="border-b border-line px-5 py-4">
              <div className="h-5 w-52 rounded-md bg-slate-200/80" />
            </div>
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3, 4].map((item) => (
                <div className="grid grid-cols-[1fr_90px_70px_70px] gap-4 rounded-lg bg-slate-50 p-3" key={item}>
                  <div>
                    <div className="h-4 w-40 rounded-md bg-slate-200/80" />
                    <div className="mt-2 h-3 w-28 rounded-md bg-slate-200/60" />
                  </div>
                  <div className="h-7 rounded-full bg-slate-200/70" />
                  <div className="h-7 rounded-md bg-slate-200/60" />
                  <div className="h-7 rounded-md bg-slate-200/60" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white">
            <div className="border-b border-line px-5 py-4">
              <div className="h-5 w-44 rounded-md bg-slate-200/80" />
            </div>
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3].map((item) => (
                <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3" key={item}>
                  <div>
                    <div className="h-4 w-36 rounded-md bg-slate-200/80" />
                    <div className="mt-2 h-3 w-28 rounded-md bg-slate-200/60" />
                  </div>
                  <div className="h-7 w-16 rounded-full bg-slate-200/70" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
