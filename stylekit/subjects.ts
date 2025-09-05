export type Subject = "faces" | "animals" | "structures" | "abstract" | "landscape";

export const SUBJECT_QUERIES: Record<Subject, string[]> = {
  faces: [
    "black and white portrait shadow play",
    "monochrome wrinkled hands chiaroscuro",
    "street portrait grainy film"
  ],
  animals: [
    "black and white horse silhouette",
    "monochrome raven crow perched",
    "dog street photography bokeh"
  ],
  structures: [
    "brutalist architecture monochrome geometry",
    "industrial ruin black and white",
    "minimalist stairwell shadow pattern"
  ],
  abstract: [
    "abstract shadows wall monochrome",
    "smoke swirl black and white",
    "long exposure motion blur monochrome"
  ],
  landscape: [
    "desert dunes monochrome contrast",
    "volcanic rock black and white minimal",
    "coastline cliffs long exposure"
  ],
};

// Rotation controls variety across runs
export const ROTATION: Subject[] = ["faces", "animals", "structures", "abstract", "landscape"];

// Max share from any single subject in one pick set (e.g., 40%)
export const SUBJECT_CAP = 0.4;