// Mood -> Steam tag weights for the no-AI picker. Plain data: edit freely.
// Matching is case-insensitive against a game's community tags, genres and store categories.

export const MOODS = {
  cozy: {
    label: "Cozy & relaxing",
    tags: { Relaxing: 3, Cozy: 3, Wholesome: 3, "Farming Sim": 2, "Life Sim": 2, Cute: 1.5, Casual: 1, Building: 1, Crafting: 1, Beautiful: 1, "Hand-drawn": 0.5 },
    avoid: ["Horror", "Difficult", "Souls-like", "Gore", "Competitive", "PvP", "Bullet Hell"],
  },
  challenge: {
    label: "Challenge me",
    tags: { Difficult: 3, "Souls-like": 3, "Precision Platformer": 2.5, "Action Roguelike": 2, "Bullet Hell": 2, Roguelike: 1.5, "Rogue-like": 1.5, Metroidvania: 1, Tactical: 1, "Turn-Based Tactics": 1 },
    avoid: ["Relaxing", "Casual", "Walking Simulator", "Visual Novel"],
  },
  story: {
    label: "Get lost in a story",
    tags: { "Story Rich": 3, "Choices Matter": 2.5, Narrative: 2, "Visual Novel": 2, "Interactive Fiction": 2, Emotional: 2, Mystery: 1.5, Detective: 1.5, Atmospheric: 1, RPG: 1, "Great Soundtrack": 0.5 },
    avoid: ["PvP", "Competitive", "Massively Multiplayer"],
  },
  action: {
    label: "Adrenaline & action",
    tags: { "Fast-Paced": 3, Action: 2, FPS: 2, Shooter: 2, "Hack and Slash": 2, "Bullet Hell": 2, "Action Roguelike": 2, "Character Action Game": 2, "Boomer Shooter": 2, Arcade: 1 },
    avoid: ["Relaxing", "Visual Novel", "Walking Simulator", "Turn-Based"],
  },
  spooky: {
    label: "Something spooky",
    tags: { Horror: 3, "Psychological Horror": 3, "Survival Horror": 3, Thriller: 2, Lovecraftian: 2, Dark: 1, Atmospheric: 1, Mystery: 1 },
    avoid: ["Cute", "Wholesome", "Family Friendly"],
  },
  brainy: {
    label: "Make me think",
    tags: { Puzzle: 3, Logic: 3, Programming: 3, Strategy: 2, "Turn-Based Strategy": 2, Deckbuilding: 2, Automation: 2, "Card Game": 1, Management: 1, Tactical: 1, Detective: 1 },
    avoid: [],
  },
  social: {
    label: "Play with friends",
    tags: { "Co-op": 3, "Online Co-op": 3, "Online Co-Op": 3, "Local Co-Op": 3, "Shared/Split Screen": 3, "Party Game": 3, Multiplayer: 2, "Multi-player": 2, "Local Multiplayer": 2, PvP: 1 },
    avoid: [],
  },
  create: {
    label: "Build & create",
    tags: { Building: 3, Sandbox: 3, "City Builder": 3, "Base Building": 2.5, Crafting: 2, Automation: 2, "Colony Sim": 2, "Open World Survival Craft": 2, "Level Editor": 1, Design: 1 },
    avoid: [],
  },
  explore: {
    label: "Explore & wander",
    tags: { Exploration: 3, "Open World": 2, Atmospheric: 2, "Walking Simulator": 2, Beautiful: 2, Adventure: 1, Metroidvania: 1, "Space": 1, Underwater: 1 },
    avoid: ["Competitive", "PvP"],
  },
  chill: {
    label: "Turn my brain off",
    tags: { Casual: 3, Arcade: 2, Clicker: 2, Idler: 2, Relaxing: 1, "Score Attack": 1, Funny: 1, Physics: 1, "Hack and Slash": 1 },
    avoid: ["Difficult", "Grand Strategy", "Souls-like", "Story Rich"],
  },
  surprise: {
    label: "Surprise me",
    tags: {},
    avoid: [],
  },
};

// Session length hints, since Steam doesn't publish typical play time.
export const SESSION = {
  short: { label: "Under an hour", tags: ["Rogue-lite", "Roguelike", "Rogue-like", "Action Roguelike", "Arcade", "Puzzle", "Casual", "Card Game", "Score Attack", "Short", "Party Game", "Fighting", "Racing", "Roguelite"] },
  long: { label: "A few hours or more", tags: ["RPG", "Open World", "Story Rich", "Strategy", "Grand Strategy", "Simulation", "JRPG", "CRPG", "Survival", "City Builder", "4X", "Colony Sim", "Sandbox", "MMORPG"] },
  any: { label: "Doesn't matter", tags: [] },
};

export const FAMILIARITY = {
  new: { label: "Something I haven't really played" },
  favourite: { label: "An old favourite" },
  any: { label: "Either" },
};
