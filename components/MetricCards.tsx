type Props = {
  inProgress: number;
  toDo: number;
  complete: number;
  totalStories: number;
  openBugs: number;
};

export default function MetricCards({ inProgress, toDo, complete, totalStories, openBugs }: Props) {
  const total = inProgress + toDo + complete;
  const pctComplete = total > 0 ? Math.round((complete / total) * 100) : 0;

  const cards = [
    { label: "In Progress", value: inProgress, color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/20" },
    { label: "Up Next", value: toDo, color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20" },
    { label: "Complete", value: complete, color: "text-green-400", bg: "bg-green-400/10 border-green-400/20" },
    { label: "% Complete", value: `${pctComplete}%`, color: "text-indigo-400", bg: "bg-indigo-400/10 border-indigo-400/20" },
    { label: "Total Stories", value: totalStories, color: "text-gray-300", bg: "bg-gray-700/30 border-gray-600/20" },
    { label: "Open Bugs", value: openBugs, color: openBugs > 0 ? "text-red-400" : "text-gray-400", bg: openBugs > 0 ? "bg-red-400/10 border-red-400/20" : "bg-gray-700/30 border-gray-600/20" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
      {cards.map((card) => (
        <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{card.label}</p>
          <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}
