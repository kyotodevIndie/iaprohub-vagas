import noxPreset from "@noxlabsbr/ui/preset";

/** @type {import('tailwindcss').Config} */
export default {
  presets: [noxPreset],
  content: ["./index.html", "./src/**/*.{vue,ts}"],
};
