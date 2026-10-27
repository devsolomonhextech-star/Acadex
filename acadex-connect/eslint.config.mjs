import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  expoConfig,
  { ignores: ["dist/*", "coverage/*", ".expo/*"] },
  {
    rules: {
      "no-console": "warn",
      "import/no-unresolved": "off",
      "import/namespace": "off",
      "import/no-duplicates": "off",
    },
  },
]);
