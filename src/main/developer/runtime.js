const { DeveloperService, terminatePublisherProcesses } = require('../services/developerService');
const { registerDeveloperIpc } = require('./developerIpc');

function createDeveloperIntegration() {
  return {
    createService({ userDataDir, scriptRoot, launcherVersion }) {
      return new DeveloperService(userDataDir, scriptRoot, launcherVersion, { variant: 'developer' });
    },
    registerIpc(context) { registerDeveloperIpc(context); },
    cleanup(service) { return service.cleanupStalePublishWorkDir(); },
    terminatePublishers() { terminatePublisherProcesses(); }
  };
}

module.exports = { createDeveloperIntegration };
