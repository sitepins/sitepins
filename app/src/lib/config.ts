import globalConfig from "../config/global.json";

// App configuration. Maintenance mode is off; the disabled stub below keeps
// shared consumers working.

const config = {
  ...globalConfig,
  maintenance: {
    enabled: false,
    message: {} as Record<string, string>,
  },
};

export default config;
