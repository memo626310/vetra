import Link from "next/link";

type Props = {
  title: string;
  subtitle: string;
};

export default function DashboardModulePlaceholder({
  title,
  subtitle,
}: Props) {
  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#f7f9fc] px-5 py-8 text-slate-900"
    >
      <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center">
        <section className="w-full rounded-3xl border border-slate-100 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-3xl">
            ðŸ¾
          </div>

          <h1 className="mt-5 text-3xl font-black">{title}</h1>

          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">
            {subtitle}
          </p>

          <Link
            href="/dashboard"
            className="mt-7 inline-flex rounded-2xl bg-slate-900 px-6 py-3 text-sm font-bold text-white"
          >
            â† Ø§Ù„Ø¹ÙˆØ¯Ø© Ù„Ù„Ù€Dashboard
          </Link>
        </section>
      </div>
    </main>
  );
}
