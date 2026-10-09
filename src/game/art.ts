export type Spot = { x: number; y: number };

export type RoomKey = "start" | "desk";

export const ROOM_URL = {
  start: "/office/room-start.jpg",
  desk: "/office/room-desk.jpg",
} as const;

export const SHEET_URL = {
  lina: "/office/lina-sheet.png",
  otto: "/office/otto-sheet.png",
  nara: "/office/nara-sheet.png",
  props: "/office/props-sheet.png",
} as const;

export const LAYOUT: Record<
  RoomKey,
  {
    lina: Spot;
    otto: Spot;
    nara: Spot;
    door: Spot;
    coffee: Spot;
    plant: Spot;
    lamp: Spot;
  }
> = {
  start: {
    lina: { x: 0.4, y: 0.61 },
    otto: { x: 0.385, y: 0.79 },
    nara: { x: 0.64, y: 0.86 },
    door: { x: 0.08, y: 0.74 },
    coffee: { x: 0.2, y: 0.84 },
    plant: { x: 0.16, y: 0.62 },
    lamp: { x: 0.84, y: 0.4 },
  },
  desk: {
    lina: { x: 0.4, y: 0.6 },
    otto: { x: 0.39, y: 0.78 },
    nara: { x: 0.62, y: 0.84 },
    door: { x: 0.07, y: 0.78 },
    coffee: { x: 0.14, y: 0.66 },
    plant: { x: 0.16, y: 0.6 },
    lamp: { x: 0.9, y: 0.32 },
  },
};

export const PX = {
  floor: "#2a2118",
  ink: "#1c1612",
  cream: "#f3e6c8",
  brass: "#e2a322",
  teal: "#1f8a7b",
  track: "#3a2e24",
};
