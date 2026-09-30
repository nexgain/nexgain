// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions run on Supabase's servers (Deno), not in the app.
    ignores: ["dist/*", "supabase/functions/*"],
  }
]);
