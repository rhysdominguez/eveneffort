// Typed registry exporting all 7 World Marathon Majors with metadata (display name, city).
import type { Course, CourseId } from "@/types";
import berlinElev from "./courses/berlin.json";
import chicagoElev from "./courses/chicago.json";
import londonElev from "./courses/london.json";
import tokyoElev from "./courses/tokyo.json";
import sydneyElev from "./courses/sydney.json";
import newyorkElev from "./courses/newyork.json";
import bostonElev from "./courses/boston.json";
import berlinProfile from "./courses/berlin.profile.json";
import chicagoProfile from "./courses/chicago.profile.json";
import londonProfile from "./courses/london.profile.json";
import tokyoProfile from "./courses/tokyo.profile.json";
import sydneyProfile from "./courses/sydney.profile.json";
import newyorkProfile from "./courses/newyork.profile.json";
import bostonProfile from "./courses/boston.profile.json";
import berlinCoords from "./courses/berlin.coords.json";
import chicagoCoords from "./courses/chicago.coords.json";
import londonCoords from "./courses/london.coords.json";
import tokyoCoords from "./courses/tokyo.coords.json";
import sydneyCoords from "./courses/sydney.coords.json";
import newyorkCoords from "./courses/newyork.coords.json";
import bostonCoords from "./courses/boston.coords.json";

type Profile = [number, number][];
type Coords = [number, number][];

/** Assemble a Course, deriving the start line from the first coordinate. */
function makeCourse(
  id: CourseId,
  displayName: string,
  city: string,
  elevations: number[],
  profile: Profile,
  coords: Coords,
  timezone: string,
): Course {
  return {
    id,
    displayName,
    city,
    elevations,
    profile,
    coords,
    start: { lat: coords[0][0], lon: coords[0][1] },
    timezone,
  };
}

export const COURSES: Record<CourseId, Course> = {
  berlin: makeCourse("berlin", "Berlin Marathon", "Berlin", berlinElev, berlinProfile as Profile, berlinCoords as Coords, "Europe/Berlin"),
  chicago: makeCourse("chicago", "Chicago Marathon", "Chicago", chicagoElev, chicagoProfile as Profile, chicagoCoords as Coords, "America/Chicago"),
  london: makeCourse("london", "London Marathon", "London", londonElev, londonProfile as Profile, londonCoords as Coords, "Europe/London"),
  tokyo: makeCourse("tokyo", "Tokyo Marathon", "Tokyo", tokyoElev, tokyoProfile as Profile, tokyoCoords as Coords, "Asia/Tokyo"),
  sydney: makeCourse("sydney", "Sydney Marathon", "Sydney", sydneyElev, sydneyProfile as Profile, sydneyCoords as Coords, "Australia/Sydney"),
  newyork: makeCourse("newyork", "New York City Marathon", "New York", newyorkElev, newyorkProfile as Profile, newyorkCoords as Coords, "America/New_York"),
  boston: makeCourse("boston", "Boston Marathon", "Boston", bostonElev, bostonProfile as Profile, bostonCoords as Coords, "America/New_York"),
};

export function getCourse(id: CourseId): Course {
  const course = COURSES[id];
  if (!course) throw new Error(`Unknown courseId: ${id}`);
  return course;
}

export const COURSE_LIST: Course[] = Object.values(COURSES);
