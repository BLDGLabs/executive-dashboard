"use client";

import { useState } from "react";
import { Epic } from "@/app/page";

type Props = {
  inProgress: Epic[];
  toDo: Epic[];
  complete: Epic[];
};

type EpicCardProps = { epic: Epic; statusColor: string; statusBg: string; statusLabel: string };

function EpicCard({ epic, statusColor, statusBg, statusLabel }: EpicCardProps) {
  return (
    <div className={`rounded-lg border ${statusBg} p-4`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-medium text-gray-200 leading-snug">{epic.summary}</h3>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
          {statusLabel}
        </span>
      </div>
      {epic.description && (
        <p className="text-xs text-gray-400 leading-relaxed">{epic.description}</p>
      )}
      {epic.dueDate && (
        <p className="text-xs text-gray-500 mt-2">
          Target: {new Date(epic.dueDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </p>
      )}
    </div>
  );
}

const SECTION_CONFIG = {
  inProgress: { label: "In Progress", statusLabel: "In Progress", color: "text-yellow-400 bg-yellow-400/10", bg: "bg-yellow-400/5 border-yellow-400/20" },
  toDo: { label: "Up Next", statusLabel: "Up Next", color: "text-blue-400 bg-blue-400/10", bg: "bg-blue-400/5 border-blue-400/20" },
  complete: { label: "Completed", statusLabel: "Complete", color: "text-green-400 bg-green-400/10", bg: "bg-green-400/5 border-green-400/20" },
};

export default function EpicList({ inProgress, toDo, complete }: Props) {
  const [showComplete, setShowComplete] = useState(false);

  const sections: { key: "inProgress" | "toDo" | "complete"; epics: Epic[] }[] = [
    { key: "inProgress", epics: inProgress },
    { key: "toDo", epics: toDo },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-200 mb-4">Epics</h2>
      <div className="space-y-8">
        {sections.map(({ key, epics }) => {
          const cfg = SECTION_CONFIG[key];
          if (epics.length === 0) return null;
          return (
            <div key={key}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.color}`}>{cfg.label}</span>
                <span className="text-xs text-gray-500">{epics.length} epic{epics.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {epics.map(epic => (
                  <EpicCard
                    key={epic.key}
                    epic={epic}
                    statusColor={cfg.color}
                    statusBg={cfg.bg}
                    statusLabel={cfg.statusLabel}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Completed — collapsed by default */}
        <div>
          <button
            onClick={() => setShowComplete(!showComplete)}
            className="flex items-center gap-2 mb-3 group"
          >
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${SECTION_CONFIG.complete.color}`}>
              Completed
            </span>
            <span className="text-xs text-gray-500">{complete.length} epic{complete.length !== 1 ? "s" : ""}</span>
            <span className="text-xs text-gray-600 group-hover:text-gray-400 transition-colors">
              {showComplete ? "▲ hide" : "▼ show"}
            </span>
          </button>
          {showComplete && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {complete.map(epic => (
                <EpicCard
                  key={epic.key}
                  epic={epic}
                  statusColor={SECTION_CONFIG.complete.color}
                  statusBg={SECTION_CONFIG.complete.bg}
                  statusLabel="Complete"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
