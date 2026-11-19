const ITEMS = [
  { name: "Pinch", does: "Draw" },
  { name: "Fist", does: "Erase" },
  { name: "Peace sign", does: "Next ink color" },
  { name: "Thumbs up", does: "Save PNG" },
  { name: "Thumbs down", does: "Undo" },
];

const LABELS: Record<string, string> = {
  None: "no gesture",
  Closed_Fist: "fist",
  Open_Palm: "open palm",
  Pointing_Up: "pointing up",
  Thumb_Down: "thumbs down",
  Thumb_Up: "thumbs up",
  Victory: "peace sign",
  ILoveYou: "rock on",
};

export default function GestureGuide({ seen }: { seen: string }) {
  return (
    <div className="guide">
      <ul className="guide-list">
        {ITEMS.map((item) => (
          <li key={item.name}>
            <span className="guide-name">{item.name}</span>
            <span className="guide-does">{item.does}</span>
          </li>
        ))}
      </ul>
      <p className="guide-seen">Seeing: {LABELS[seen] ?? seen}</p>
    </div>
  );
}
