const { startLauncher } = require('./main');
const { DEVELOPER_VARIANT } = require('./launcherVariant');
const { createDeveloperIntegration } = require('./developer/runtime');

startLauncher({ variant: DEVELOPER_VARIANT, developerIntegration: createDeveloperIntegration() });
