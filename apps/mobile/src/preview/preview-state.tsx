import { createContext, use, useState, type PropsWithChildren } from "react";

const initialChores = [
  { id: "laundry", title: "Start a load of laundry", detail: "Shared · Today", done: false },
  { id: "plants", title: "Water the plants", detail: "Your turn · Today", done: false },
  { id: "recycling", title: "Take out the recycling", detail: "Partner · Tomorrow", done: false },
];

const initialGroceries = [
  { id: "tomatoes", title: "Cherry tomatoes", detail: "250 g · Vegetables", done: false },
  { id: "pasta", title: "Pasta", detail: "500 g · Pantry", done: false },
  { id: "yoghurt", title: "Natural yoghurt", detail: "1 tub · Dairy", done: true },
];

function usePreviewState() {
  const [chores, setChores] = useState(initialChores);
  const [groceries, setGroceries] = useState(initialGroceries);
  const [everyone, setEveryone] = useState(false);
  return {
    chores,
    groceries,
    everyone,
    setEveryone,
    completeChore: (id: string) =>
      setChores((items) => items.map((item) => (item.id === id ? { ...item, done: true } : item))),
    checkGrocery: (id: string) =>
      setGroceries((items) =>
        items.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
      ),
    reset: () => {
      setChores(initialChores);
      setGroceries(initialGroceries);
      setEveryone(false);
    },
  };
}

const PreviewContext = createContext<ReturnType<typeof usePreviewState> | null>(null);

export function PreviewProvider({ children }: PropsWithChildren) {
  const state = usePreviewState();
  return <PreviewContext value={state}>{children}</PreviewContext>;
}

export function usePreview() {
  const state = use(PreviewContext);
  if (!state) throw new Error("PreviewProvider is required");
  return state;
}
