// Single source of truth for category ids, labels and colors —
// imported by both the UI and the API/cron code.
export const CATEGORIES = [
  { id: "food", name: "Food", color: "#d98a3d" },
  { id: "transport", name: "Transport", color: "#3d7fd9" },
  { id: "shopping", name: "Shopping", color: "#c25a9e" },
  { id: "bills", name: "Bills", color: "#4a9b6e" },
  { id: "health", name: "Health", color: "#d9483d" },
  { id: "fun", name: "Fun", color: "#a67ce0" },
  { id: "other", name: "Other", color: "#8a8072" }
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export function categoryName(id) {
  return CATEGORY_BY_ID[id]?.name || "Other";
}
