/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "vcap-blue": "#0066CC",
        "vcap-teal": "#009999",
        "vcap-green": "#33AA44",
      },
    },
  },
  plugins: [],
};
