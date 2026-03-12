export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  ssr: false,
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || "",
    },
  },
  app: {
    head: {
      title: "Vacancies",
      meta: [{ name: "theme-color", content: "#0f0f12" }],
    },
  },
  css: ["~/assets/main.css"],
});
