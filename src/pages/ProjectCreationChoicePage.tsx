import { FileUp, PenLine } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ProjectCreationChoicePage() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <section className="mx-auto max-w-4xl">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            New Project
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            How would you like to start?
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Start with the existing room-by-room editor or prepare for the future plan import workflow.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <button
            type="button"
            onClick={() => navigate("/project")}
            className="group rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <PenLine size={22} aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-lg font-semibold text-slate-900">Create Manually</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Continue to the existing project editor and enter project and room details yourself.
            </p>
            <span className="mt-5 inline-block text-sm font-semibold text-blue-700 group-hover:text-blue-800">
              Open manual editor
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/project/import")}
            className="group rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <FileUp size={22} aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-lg font-semibold text-slate-900">Upload Plans</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Prepare to upload architectural plans and review AI-assisted draft rooms.
            </p>
            <span className="mt-5 inline-block text-sm font-semibold text-emerald-700 group-hover:text-emerald-800">
              View future import workflow
            </span>
          </button>
        </div>
      </section>
    </main>
  );
}
