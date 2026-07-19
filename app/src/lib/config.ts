import globalConfig from "../config/global.json";

// App configuration for the open-source build. Trials, marketing
// announcements, maintenance mode, and analytics belong to the hosted cloud
// edition, which overrides this module (config.cloud.ts) with the full
// configuration. The disabled stubs below keep shared consumers working.

const config = {
  ...globalConfig,
  trial: {
    card_trial: false,
    free_trial: false,
    days: 0,
    label: {} as Record<string, string>,
    label_after_trial: {} as Record<string, string>,
  },
  maintenance: {
    enabled: false,
    message: {} as Record<string, string>,
  },
};

export default config;
