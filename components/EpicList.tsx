"use client";

import { useState } from "react";
import { Epic } from "@/app/page";

type Props = {
  inProgress: Epic[];
  toDo: Epic[];
  complete: Epic[];
  showSection: "active" | "historical";
  hoveredKey?: string | null;
  onHover?: (key: string | null) => void;
  // lifted toggle state for dynamic Gantt
  showUpcoming?: boolean;
  showHistorical?: boolean;
  onToggleUpcoming?: () => void;
  onToggleHistorical?: () => void;
};

type EpicCardProps = {
  epic: Epic;
  statusColor: string;
  statusBg: string;
  statusLabel: string;
  titleColor: string;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

function EpicCard({ epic, statusColor, statusBg, statusLabel, titleColor, isHovered, onMouseEnter, onMouseLeave }: EpicCardProps) {
  return (
    <div
      className={`rounded-lg border ${statusBg} p-4 transition-all cursor-default ${isHovered ? "ring-2 ring-indigo-400/60 brightness-110" : ""}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className={`text-sm font-semibold ${titleColor} leading-snug`}>{epic.summary}</h3>
        <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor} opacity-90`}>
          {statusLabel}
        </span>
      </div>
      {epic.description && (
        <p className="text-xs text-gray-300 leading-relaxed">{epic.description}</p>
      )}
      {(epic.startDate || epic.dueDate) && (
        <p className="text-xs text-gray-400 mt-2">
          {epic.startDate && (
            <>
              Start: {new Date(epic.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </>
          )}
          {epic.startDate && epic.dueDate && <span className="mx-1">·</span>}
          {epic.dueDate && (
            <>
              Target: {new Date(epic.dueDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </>
          )}
        </p>
      )}
    </div>
  );
}

const SECTION_CONFIG = {
  inProgress: { label: "In Progress", statusLabel: "In Progress", color: "text-yellow-900 bg-yellow-400/30", bg: "bg-yellow-400/10 border-yellow-400/30", titleColor: "text-gray-900" },
  toDo: { label: "Upcoming", statusLabel: "Upcoming", color: "text-blue-300 bg-blue-400/20", bg: "bg-blue-400/10 border-blue-400/30", titleColor: "text-white" },
  complete: { label: "Historical", statusLabel: "Complete", color: "text-green-300 bg-green-400/20", bg: "bg-green-400/10 border-green-400/30", titleColor: "text-white" },
};

export default function EpicList({ inProgress, toDo, complete, showSection, hoveredKey = null, onHover, showUpcoming = false, showHistorical = false, onToggleUpcoming, onToggleHistorical }: Props) {
  // toggle state is now lifted — use props if provided, else local fallback
  const [localShowUpcoming, setLocalShowUpcoming] = useState(false);
  const [localShowHistorical, setLocalShowHistorical] = useState(false);
  const isUpcoming = onToggleUpcoming ? showUpcoming : localShowUpcoming;
  const isHistorical = onToggleHistorical ? showHistorical : localShowHistorical;
  const toggleUpcoming = onToggleUpcoming ?? (() => setLocalShowUpcoming(v => !v));
  const toggleHistorical = onToggleHistorical ?? (() => setLocalShowHistorical(v => !v));

  if (showSection === "active") {
    return (
      <div className="mb-10">
        <h2 className="text-lg font-semibold text-gray-200 mb-4">In Progress</h2>
        {inProgress.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${SECTION_CONFIG.inProgress.color}`}>
                {SECTION_CONFIG.inProgress.label}
              </span>
              <span className="text-xs text-gray-500">{inProgress.length} epic{inProgress.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {inProgress.map(epic => (
                <EpicCard
                  key={epic.key}
                  epic={epic}
                  statusColor={SECTION_CONFIG.inProgress.color}
                  statusBg={SECTION_CONFIG.inProgress.bg}
                  statusLabel={SECTION_CONFIG.inProgress.statusLabel}
                  titleColor={SECTION_CONFIG.inProgress.titleColor}
                  isHovered={epic.key === hoveredKey}
                  onMouseEnter={() => onHover?.(epic.key)}
                  onMouseLeave={() => onHover?.(null)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // showSection === "historical" — buttons are in the Timeline header now, just render cards
  if (!isUpcoming && !isHistorical) return null;

  return (
    <div className="mt-8">
      <div className="space-y-8">
        {/* Upcoming — toggle */}
        {isUpcoming && toDo.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${SECTION_CONFIG.toDo.color}`}>
                {SECTION_CONFIG.toDo.label}
              </span>
              <span className="text-xs text-gray-500">{toDo.length} epic{toDo.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {toDo.map(epic => (
                <EpicCard
                  key={epic.key}
                  epic={epic}
                  statusColor={SECTION_CONFIG.toDo.color}
                  statusBg={SECTION_CONFIG.toDo.bg}
                  statusLabel={SECTION_CONFIG.toDo.statusLabel}
                  titleColor={SECTION_CONFIG.toDo.titleColor}
                  isHovered={false}
                  onMouseEnter={() => {}}
                  onMouseLeave={() => {}}
                />
              ))}
            </div>
          </div>
        )}

        {/* Historical — toggle */}
        {isHistorical && complete.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${SECTION_CONFIG.complete.color}`}>
                {SECTION_CONFIG.complete.label}
              </span>
              <span className="text-xs text-gray-500">{complete.length} epic{complete.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {complete.map(epic => (
                <EpicCard
                  key={epic.key}
                  epic={epic}
                  statusColor={SECTION_CONFIG.complete.color}
                  statusBg={SECTION_CONFIG.complete.bg}
                  statusLabel={SECTION_CONFIG.complete.statusLabel}
                  titleColor={SECTION_CONFIG.complete.titleColor}
                  isHovered={false}
                  onMouseEnter={() => {}}
                  onMouseLeave={() => {}}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
