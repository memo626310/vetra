
import Link from "next/link";
import type { Client, Pet, VisitTranslations } from "./new-visit-types";
import { speciesLabel } from "./new-visit-utils";

type Props = {
  started: boolean;
  darkMode: boolean;
  t: VisitTranslations;
  clientSearch: string;
  setClientSearch: (value: string) => void;
  loadingClients: boolean;
  filteredClients: Client[];
  selectedClientId: string;
  setSelectedClientId: (value: string) => void;
  setSelectedPetId: (value: string) => void;
  setPetSearch: (value: string) => void;
  selectedPetId: string;
  petSearch: string;
  loadingPets: boolean;
  filteredPets: Pet[];
  startExamination: () => void;
  loadingDetails: boolean;
};

export default function NewVisitPatientSelector({
  started, darkMode, t, clientSearch, setClientSearch,
  loadingClients, filteredClients, selectedClientId, setSelectedClientId,
  setSelectedPetId, setPetSearch, selectedPetId, petSearch,
  loadingPets, filteredPets, startExamination, loadingDetails,
}: Props) {
  return (
    <>
        {/* SELECTION */}
        {!started && (
          <section className="grid grid-cols-2 gap-3 sm:gap-4">
            {/* CLIENT */}
            <div
              className={`min-w-0 rounded-2xl border p-3 shadow-sm transition-colors duration-200 sm:p-5 ${
                darkMode
                  ? "border-white/[0.07] bg-[#181B21]"
                  : "border-slate-200 bg-white shadow-sm"
              }`}
            >
              <div className="mb-3 flex min-h-14 flex-col justify-between gap-2 sm:mb-4 sm:min-h-0 sm:flex-row sm:items-start sm:gap-3">
                <div>
                  <h2
                    className={`text-lg font-bold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {t.selectClient}
                  </h2>

                  <p
                    className={`mt-1 text-sm ${
                      darkMode ? "text-slate-400" : "text-slate-500"
                    }`}
                  >
                    {t.selectClientHint}
                  </p>
                </div>

                <Link
                  href="/clients/new"
                  className="max-w-full rounded-lg bg-cyan-600 px-2 py-1.5 text-[10px] font-semibold leading-tight text-white transition-colors hover:bg-cyan-700 sm:px-3 sm:py-2 sm:text-xs"
                >
                  + {t.addClient}
                </Link>
              </div>

              <input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder={t.searchClient}
                className={`mb-3 w-full min-w-0 rounded-lg border px-2 py-2 text-xs outline-none transition-all duration-200 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 sm:mb-4 sm:px-3 sm:py-2.5 sm:text-sm ${
                  darkMode
                    ? "border-white/[0.09] bg-[#111419] text-white placeholder:text-slate-500"
                    : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                }`}
              />

              <div className="max-h-80 space-y-2 overflow-y-auto">
                {loadingClients ? (
                  <div
                    className={`rounded-xl p-4 text-center text-sm ${
                      darkMode
                        ? "bg-slate-800 text-slate-400"
                        : "bg-slate-50 text-slate-500"
                    }`}
                  >
                    Loading...
                  </div>
                ) : filteredClients.length === 0 ? (
                  <div
                    className={`rounded-xl p-4 text-center text-sm ${
                      darkMode
                        ? "bg-slate-800 text-slate-400"
                        : "bg-slate-50 text-slate-500"
                    }`}
                  >
                    {t.noClients}
                  </div>
                ) : (
                  filteredClients.map((client) => {
                    const active =
                      selectedClientId === client.id;

                    return (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => {
                          setSelectedClientId(client.id);
                          setSelectedPetId("");
                          setPetSearch("");
                        }}
                        className={`w-full rounded-2xl border p-4 text-start transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                          active
                            ? darkMode
                              ? "border-cyan-500 bg-cyan-950/40 shadow-md ring-1 ring-cyan-500/30"
                              : "border-cyan-500 bg-cyan-50 shadow-md ring-1 ring-cyan-500/20"
                            : darkMode
                            ? "border-slate-800 bg-slate-950 hover:border-slate-700"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div
                              className={`font-semibold ${
                                active
                                  ? darkMode ? "text-cyan-50" : "text-cyan-950"
                                  : darkMode
                                  ? "text-white"
                                  : "text-slate-900"
                              }`}
                            >
                              {client.name}
                            </div>

                            {client.phone && (
                              <div
                                className={`mt-1 text-xs ${
                                  active
                                    ? darkMode ? "text-cyan-100/80" : "text-cyan-800"
                                    : darkMode
                                    ? "text-slate-500"
                                    : "text-slate-500"
                                }`}
                              >
                                {client.phone}
                              </div>
                            )}
                          </div>

                          {active && (
                            <span className="rounded-full bg-cyan-600 px-2.5 py-1 text-[10px] font-bold text-white">
                              ✓
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* PET */}
            <div
              className={`min-w-0 rounded-2xl border p-3 shadow-sm transition-colors duration-200 sm:p-5 ${
                darkMode
                  ? "border-white/[0.07] bg-[#181B21]"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="mb-3 flex min-h-14 flex-col justify-between gap-2 sm:mb-4 sm:min-h-0 sm:flex-row sm:items-start sm:gap-3">
                <div>
                  <h2
                    className={`text-lg font-bold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {t.selectPet}
                  </h2>

                  <p
                    className={`mt-1 text-sm ${
                      darkMode ? "text-slate-400" : "text-slate-500"
                    }`}
                  >
                    {t.selectPetHint}
                  </p>
                </div>

                <Link
                  href={
                    selectedClientId
                      ? `/clients/${selectedClientId}`
                      : "/clients"
                  }
                  className={`max-w-full rounded-lg px-2 py-1.5 text-[10px] font-semibold leading-tight transition-colors sm:px-3 sm:py-2 sm:text-xs ${
                    darkMode
                      ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  + {t.addPet}
                </Link>
              </div>

              <input
                value={petSearch}
                onChange={(e) => setPetSearch(e.target.value)}
                disabled={!selectedClientId}
                placeholder={t.searchPet}
                className={`mb-3 w-full min-w-0 rounded-lg border px-2 py-2 text-xs outline-none transition-all duration-200 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:mb-4 sm:px-3 sm:py-2.5 sm:text-sm ${
                  darkMode
                    ? "border-white/[0.09] bg-[#111419] text-white placeholder:text-slate-500"
                    : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                }`}
              />

              <div className="max-h-80 space-y-2 overflow-y-auto">
                {!selectedClientId ? (
                  <div
                    className={`rounded-xl p-5 text-center text-sm ${
                      darkMode
                        ? "bg-slate-800 text-slate-500"
                        : "bg-slate-50 text-slate-400"
                    }`}
                  >
                    {t.selectClientHint}
                  </div>
                ) : loadingPets ? (
                  <div
                    className={`rounded-xl p-4 text-center text-sm ${
                      darkMode
                        ? "bg-slate-800 text-slate-400"
                        : "bg-slate-50 text-slate-500"
                    }`}
                  >
                    Loading...
                  </div>
                ) : filteredPets.length === 0 ? (
                  <div
                    className={`rounded-xl p-4 text-center text-sm ${
                      darkMode
                        ? "bg-slate-800 text-slate-400"
                        : "bg-slate-50 text-slate-500"
                    }`}
                  >
                    {t.noPets}
                  </div>
                ) : (
                  filteredPets.map((pet) => {
                    const active = selectedPetId === pet.id;

                    return (
                      <button
                        key={pet.id}
                        type="button"
                        onClick={() => setSelectedPetId(pet.id)}
                        className={`w-full min-w-0 rounded-xl border p-2.5 text-start transition-colors duration-150 sm:p-3 ${
                          active
                            ? darkMode
                              ? "border-emerald-500 bg-emerald-950/40 shadow-md ring-1 ring-emerald-500/30"
                              : "border-emerald-500 bg-emerald-50 shadow-md ring-1 ring-emerald-500/20"
                            : darkMode
                            ? "border-slate-800 bg-slate-950 hover:border-slate-700"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-xs font-bold text-cyan-700 dark:text-cyan-300 sm:h-9 sm:w-9">
                              {pet.species?.slice(0, 1).toUpperCase() || "P"}
                            </div>

                            <div>
                              <div
                                className={`font-semibold ${
                                  active
                                    ? darkMode ? "text-emerald-50" : "text-emerald-950"
                                    : darkMode
                                    ? "text-white"
                                    : "text-slate-900"
                                }`}
                              >
                                {pet.name}
                              </div>

                              <div
                                className={`mt-1 text-xs ${
                                  active
                                    ? darkMode ? "text-emerald-100/80" : "text-emerald-800"
                                    : darkMode
                                    ? "text-slate-500"
                                    : "text-slate-500"
                                }`}
                              >
                                {speciesLabel(pet.species, t)}
                                {pet.breed
                                  ? ` • ${pet.breed}`
                                  : ""}
                              </div>
                            </div>
                          </div>

                          {active && (
                            <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white">
                              ✓
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        )}

        {/* START BUTTON */}
        {!started && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={startExamination}
              disabled={!selectedClientId || !selectedPetId || loadingDetails}
              className="rounded-lg bg-cyan-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40 sm:px-8 sm:py-4"
            >
              {loadingDetails
                ? "Loading..."
                : t.startExam}
            </button>
          </div>
        )}


    </>
  );
}
